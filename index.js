/**
 * Host half of @strepsiades/dsh-remote-ssh.
 *
 * Owns the host registry, parses ~/.ssh/config into selectable aliases, runs
 * SSH local-forward processes, and registers the `remote-dsh-ops` skill so the
 * agent can drive a remote DSH from the command line.
 */
import { spawn } from 'node:child_process'
import { readFile, writeFile, mkdir, chmod } from 'node:fs/promises'
import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, dirname, isAbsolute } from 'node:path'
import net from 'node:net'
import http from 'node:http'

export const inject = ['connection', 'skills']

/**
 * Settings are persisted next to the registry instead of using a schemastery
 * `Config` export: a linked development bundle cannot resolve extra runtime
 * dependencies, and a JSON file keeps this package dependency-free.
 */
let settings = { sshConfigPath: '', defaultRemotePort: 3000, autoStart: false, stopRemoteOnDisconnect: false }

const BASE = '/api/remote-ssh'
const DSH_HOME = process.env.DSH_HOME || join(homedir(), '.dsh')
const CONFIG_PATH = join(DSH_HOME, 'remote-ssh.json')
const DEFAULT_SSH_CONFIG = join(homedir(), '.ssh', 'config')
const IS_WINDOWS = process.platform === 'win32'
const ASKPASS_PATH = join(homedir(), '.dsh', IS_WINDOWS ? 'dsh-askpass.cmd' : 'dsh-askpass.sh')

/**
 * ssh never stores a password we give it; it asks this helper whenever the server
 * wants one. The helper echoes an environment variable, so no secret is written to
 * disk — it lives in the child process environment for one connection attempt.
 */
async function ensureAskpass() {
  // Windows OpenSSH wants an executable it can launch directly; a .cmd batch file works.
  const script = IS_WINDOWS
    ? '@echo off\r\necho %DSH_SSH_PASSWORD%\r\n'
    : '#!/bin/sh\nprintf \'%s\\n\' "$DSH_SSH_PASSWORD"\n'
  try {
    await writeFile(ASKPASS_PATH, script, { mode: 0o700 })
    await chmod(ASKPASS_PATH, 0o700)
  } catch {}
  return ASKPASS_PATH
}

/**
 * Ship a PowerShell script as -EncodedCommand (UTF-16LE base64): the remote shell is
 * cmd.exe or PowerShell depending on the sshd on Windows, and only base64 reaches it.
 */
function powershellCommand(script) {
  return `powershell -NoProfile -EncodedCommand ${Buffer.from(script, 'utf16le').toString('base64')}`
}

/** Last matching token line in the usual Windows log locations. */
function windowsTokenScript(port) {
  return [
    `$needle = '127.0.0.1:${port}/?token='`,
    '$files = @("$env:USERPROFILE\\.dsh-web.log", "$env:USERPROFILE\\.dsh\\logs\\web.log")',
    'foreach ($f in $files) {',
    '  if (Test-Path -LiteralPath $f) {',
    '    $hit = Select-String -Path $f -SimpleMatch $needle | Select-Object -Last 1',
    '    if ($hit) { $hit.Line; break }',
    '  }',
    '}',
  ].join('\r\n')
}

function passwordEnv(password) {
  return {
    SSH_ASKPASS: ASKPASS_PATH,
    SSH_ASKPASS_REQUIRE: 'force',
    DSH_SSH_PASSWORD: password,
  }
}

/** Does this failure mean "we could not authenticate"? */
function isAuthFailure(stderr) {
  return /Permission denied|Too many authentication failures|no matching host key|Host key verification failed/i.test(stderr)
}
const SKILL_PATH = new URL('./skills/remote-dsh-ops/SKILL.md', import.meta.url)

const SAFE_HOST = /^[A-Za-z0-9._-]+$/
const SAFE_TARGET = /^[A-Za-z0-9._@%:/[\]-]+$/

/** Reject a leading dash: ssh would parse it as an option, not a destination. */
function isValidDestination(value) {
  const destination = String(value || '')
  return SAFE_TARGET.test(destination) && !destination.startsWith('-')
}

/** name -> ChildProcess of the running tunnel */
const tunnels = new Map()
const opening = new Set()

const LEGACY_CONFIG_PATH = join(DSH_HOME, 'dsh-hosts.json')

async function loadConfig() {
  try {
    let raw
    try {
      raw = await readFile(CONFIG_PATH, 'utf8')
    } catch {
      // One-time migration from the pre-rename registry file.
      raw = await readFile(LEGACY_CONFIG_PATH, 'utf8')
    }
    const parsed = JSON.parse(raw)
    return {
      sshConfigPath: typeof parsed.sshConfigPath === 'string' ? parsed.sshConfigPath : undefined,
      settings: parsed.settings && typeof parsed.settings === 'object' ? parsed.settings : {},
      hosts: Array.isArray(parsed.hosts) ? parsed.hosts : [],
    }
  } catch {
    return { settings: {}, hosts: [] }
  }
}

async function saveConfig(config) {
  await mkdir(dirname(CONFIG_PATH), { recursive: true })
  await writeFile(CONFIG_PATH, JSON.stringify({
    settings: config.settings || {},
    hosts: config.hosts || [],
  }, null, 2), 'utf8')
  // The registry can hold a manually entered web token, so keep it owner-only.
  try { await chmod(CONFIG_PATH, 0o600) } catch {}
}

/** Minimal OpenSSH client-config reader: enough to list connectable aliases. */
function parseSshConfig(text) {
  const hosts = []
  let current = null
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const parts = line.split(/\s+/)
    const key = parts[0].toLowerCase()
    const value = parts.slice(1).join(' ')
    if (key === 'host') {
      const alias = parts[1]
      if (alias && !/[*?!]/.test(alias)) {
        current = { alias, hostname: alias }
        hosts.push(current)
      } else {
        current = null
      }
      continue
    }
    if (!current) continue
    if (key === 'hostname') current.hostname = value
    else if (key === 'user') current.user = value
    else if (key === 'port') current.port = Number(value)
  }
  return hosts
}

async function listSshAliases(config) {
  const path = settings.sshConfigPath || config.sshConfigPath || DEFAULT_SSH_CONFIG
  try {
    return { path, aliases: parseSshConfig(await readFile(path, 'utf8')) }
  } catch (error) {
    return { path, aliases: [], error: error instanceof Error ? error.message : String(error) }
  }
}

function sendJSON(res, code, body) {
  const text = JSON.stringify(body)
  res.writeHead(code, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(text),
    'cache-control': 'no-store',
  })
  res.end(text)
}

function readJSONBody(req) {
  return new Promise((resolve, reject) => {
    let raw = ''
    req.on('data', (chunk) => {
      raw += chunk
      if (raw.length > 1_000_000) reject(new Error('request body too large'))
    })
    req.on('end', () => {
      try { resolve(raw ? JSON.parse(raw) : {}) } catch (error) { reject(error) }
    })
    req.on('error', reject)
  })
}

function run(command, args, timeoutMs = 20000, extraEnv = null) {
  return new Promise((resolve) => {
    let stdout = ''
    let stderr = ''
    let settled = false
    const finish = (result) => { if (!settled) { settled = true; resolve(result) } }
    const child = spawn(command, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: extraEnv ? { ...process.env, ...extraEnv } : process.env,
    })
    const timer = setTimeout(() => {
      try { child.kill('SIGKILL') } catch {}
      finish({ code: -1, stdout, stderr: stderr + '\n[timeout]' })
    }, timeoutMs)
    child.stdout.on('data', (chunk) => { stdout += chunk })
    child.stderr.on('data', (chunk) => { stderr += chunk })
    child.on('error', (error) => { clearTimeout(timer); finish({ code: -1, stdout, stderr: String(error) }) })
    child.on('close', (code) => { clearTimeout(timer); finish({ code, stdout, stderr }) })
  })
}

/**
 * A local forward listening proves only that ssh bound the port. The remote
 * service may be down, so probe through the tunnel with a real HTTP request.
 */
function probeHttp(port, timeoutMs = 2500, path = '/') {
  return new Promise((resolve) => {
    const request = http.get({ host: '127.0.0.1', port, path, timeout: timeoutMs }, (response) => {
      response.resume()
      resolve({ ok: true, status: response.statusCode })
    })
    request.on('timeout', () => { request.destroy(); resolve({ ok: false, reason: 'timeout' }) })
    request.on('error', (error) => resolve({ ok: false, reason: error.code || error.message }))
  })
}

function probePort(port, timeoutMs = 500) {
  return new Promise((resolve) => {
    const socket = net.connect({ host: '127.0.0.1', port })
    const done = (ok) => { socket.destroy(); resolve(ok) }
    socket.setTimeout(timeoutMs, () => done(false))
    socket.on('connect', () => done(true))
    socket.on('error', () => done(false))
  })
}

/** The ssh destination for a registry row: an alias, or a raw target as fallback. */
function destinationOf(host) {
  return String(host.alias || host.target || '')
}

/** Destination for an ssh spawn, or null when it is not safe to pass to ssh. */
function safeDestination(host) {
  const destination = destinationOf(host)
  return isValidDestination(destination) ? destination : null
}

function baseArgs(host, password) {
  const args = [
    // Without a password we must never block on a prompt; with one, askpass answers it.
    '-o', password ? 'BatchMode=no' : 'BatchMode=yes',
    '-o', 'ConnectTimeout=8',
    '-o', 'StrictHostKeyChecking=accept-new',
    // Reuse the user's own multiplexed session when their ~/.ssh/config defines one:
    // that is how password/MFA hosts work without ever prompting this process.
    '-o', 'ControlMaster=auto',
  ]
  if (password) {
    args.push('-o', 'NumberOfPasswordPrompts=1')
    args.push('-o', 'PreferredAuthentications=publickey,password,keyboard-interactive')
  }
  if (host.sshPort) args.push('-p', String(host.sshPort))
  return args
}

function validateHostEntry(host, index) {
  if (!host || typeof host !== 'object') return `host #${index + 1} is not an object`
  if (!SAFE_HOST.test(String(host.name || ''))) return `host #${index + 1}: invalid name`
  if (!isValidDestination(destinationOf(host))) return `${host.name}: invalid ssh destination`
  const rport = Number(host.remotePort ?? 3000)
  if (!Number.isInteger(rport) || rport < 1 || rport > 65535) return `${host.name}: invalid remote port`
  if (host.localPort !== undefined && host.localPort !== null) {
    const lport = Number(host.localPort)
    if (!Number.isInteger(lport) || lport < 1024 || lport > 65535) return `${host.name}: invalid local port`
  }
  return null
}

function assignLocalPort(config, host, index) {
  if (host.localPort) return host.localPort
  const used = new Set(config.hosts.map((item) => Number(item.localPort)).filter(Boolean))
  let candidate = 3410 + index
  while (used.has(candidate)) candidate += 1
  return candidate
}

function openTunnel(host, localPort, password) {
  const args = baseArgs(host, password).concat(
    ['-N', '-o', 'ExitOnForwardFailure=yes', '-L', `${localPort}:127.0.0.1:${host.remotePort ?? 3000}`],
    [destinationOf(host)],
  )
  const child = spawn('ssh', args, {
    stdio: ['ignore', 'ignore', 'pipe'],
    env: password ? { ...process.env, ...passwordEnv(password) } : process.env,
  })
  let stderr = ''
  child.stderr.on('data', (chunk) => { stderr += chunk })
  child.on('close', () => { if (tunnels.get(host.name)?.child === child) tunnels.delete(host.name) })
  tunnels.set(host.name, { child, remotePort: Number(host.remotePort ?? settings.defaultRemotePort) })
  return { child, getStderr: () => stderr }
}

async function readRemoteUrl(host, password) {
  // ssh [options] destination command...  — the destination must come first.
  const destination = safeDestination(host)
  if (!destination) return null
  const result = await run('ssh', baseArgs(host, password).concat([destination, 'cat', '~/.dsh-web.url']), 20000, password ? passwordEnv(password) : null)
  const match = result.stdout.match(/https?:\/\/[^\s"']+/)
  return match ? match[0] : null
}

function tokenFrom(text) {
  const match = String(text || '').match(/[?&]token=([A-Za-z0-9_-]+)/)
  return match ? match[1] : null
}

/**
 * Resolve the per-process web token for a host, in order:
 *   1. the row's manually entered token
 *   2. a `~/.dsh-web.url` the remote happens to keep
 *   3. the `dsh web:` line in its log (the only place DSH itself publishes it)
 * The login command is retried against both log locations DSH builds use.
 */
async function resolveToken(host, password) {
  if (host.token) return String(host.token)

  const viaFile = await readRemoteUrl(host, password)
  const fromFile = tokenFrom(viaFile)
  if (fromFile) return fromFile

  // Match this host's port and take the LAST line: a log that is appended to
  // across restarts still has older, now-invalid tokens at the top.
  const port = Number(host.remotePort ?? settings.defaultRemotePort)
  const pattern = `127.0.0.1:${port}/?token=`
  const grep = `for f in ~/.dsh-web.log ~/.dsh/logs/web.log; do `
    + `[ -f "$f" ] && grep ${JSON.stringify(pattern)} "$f" | tail -1 && break; `
    + 'done'
  const destination = safeDestination(host)
  if (!destination) return null
  const env = password ? passwordEnv(password) : null

  const posix = await run('ssh', baseArgs(host, password).concat([destination, grep]), 20000, env)
  const fromPosix = tokenFrom(posix.stdout)
  if (fromPosix) return fromPosix

  // Windows remotes have no sh: retry with PowerShell before giving up.
  const windows = await run(
    'ssh',
    baseArgs(host, password).concat([destination, powershellCommand(windowsTokenScript(port))]),
    25000,
    env,
  )
  return tokenFrom(windows.stdout)
}

function localUrl(localPort, token) {
  return `http://127.0.0.1:${localPort}/${token ? `?token=${token}` : ''}`
}

/** Rewrite a remote loopback URL so it points at the local forward port. */
function rewriteToLocal(remoteUrl, localPort) {
  try {
    const url = new URL(remoteUrl)
    url.hostname = '127.0.0.1'
    url.port = String(localPort)
    return url.toString()
  } catch {
    return null
  }
}

/** `exit` fires before stdio drains; wait for `close` so stderr is complete. */
function waitForClose(child, timeoutMs = 1500) {
  return new Promise((resolve) => {
    if (child.exitCode !== null) { setTimeout(resolve, 120); return }
    const timer = setTimeout(resolve, timeoutMs)
    child.once('close', () => { clearTimeout(timer); setTimeout(resolve, 20) })
  })
}

/**
 * Fixed launch script used when the host has no custom start command. It resolves
 * whichever install exists instead of assuming one path, and detaches so the
 * process survives the SSH session.
 */
function defaultStartScript(port) {
  return [
    'PATH="$HOME/.local/opt/current/bin:$PATH";',
    'if command -v dsh >/dev/null 2>&1; then BIN=dsh;',
    'elif [ -x "$HOME/.local/dsh/node_modules/.bin/dsh" ]; then BIN="$HOME/.local/dsh/node_modules/.bin/dsh";',
    'else echo NO_DSH; exit 127; fi;',
    `if command -v setsid >/dev/null 2>&1; then nohup setsid "$BIN" web --host 127.0.0.1 --port ${port} --no-open </dev/null > ~/.dsh-web.log 2>&1 &`,
    'else nohup "$BIN" web --host 127.0.0.1 --port ' + port + ' --no-open </dev/null > ~/.dsh-web.log 2>&1 & fi;',
    'echo STARTED',
  ].join(' ')
}

/** The command to run for this host: its own template, or the built-in script. */
function startCommandFor(host) {
  const port = String(Number(host.remotePort ?? settings.defaultRemotePort))
  if (host.startCommand) return String(host.startCommand).replace(/\{port\}/g, port)
  return defaultStartScript(port)
}

/** Ask the remote to launch dsh web; resolves with what ssh reported. */
async function startRemote(host, password) {
  const destination = safeDestination(host)
  if (!destination) return { ok: false, reason: 'invalid ssh destination' }
  const result = await run(
    'ssh',
    baseArgs(host, password).concat([destination, startCommandFor(host)]),
    25000,
    password ? passwordEnv(password) : null,
  )
  const out = `${result.stdout}\n${result.stderr}`
  if (/NO_DSH/.test(out)) return { ok: false, reason: 'no-dsh' }
  if (result.code !== 0) return { ok: false, reason: out.trim().slice(-400) || `ssh exit ${result.code}` }
  return { ok: true }
}

/**
 * A DSH web answers `/` with 401 when the request carries no session. Any other
 * status means something else owns that port (a dev server, Gitea, a proxy…).
 */
function isDsh(health) {
  return Boolean(health && health.ok && health.status === 401)
}

/**
 * Stop the remote dsh web listening on this host's DSH port. Only the listener on
 * that port is signalled; nothing else on the machine is touched.
 */
async function stopRemote(host) {
  const destination = safeDestination(host)
  if (!destination) return { ok: false, reason: 'invalid destination' }
  const port = Number(host.remotePort ?? settings.defaultRemotePort)
  const script = [
    `PIDS=$(ss -ltnp 2>/dev/null | grep -E ":${port}\\b" | grep -oE "pid=[0-9]+" | cut -d= -f2 | sort -u);`,
    '[ -z "$PIDS" ] && { echo NOT_RUNNING; exit 0; };',
    'kill -TERM $PIDS 2>/dev/null; sleep 1;',
    `if ss -ltn 2>/dev/null | grep -qE ":${port}\\b"; then kill -KILL $PIDS 2>/dev/null; echo KILLED; else echo STOPPED; fi`,
  ].join(' ')
  const result = await run('ssh', baseArgs(host).concat([destination, script]), 20000)
  const out = `${result.stdout} ${result.stderr}`.trim()
  if (result.code !== 0) return { ok: false, reason: out.slice(-300) || `ssh exit ${result.code}` }
  if (/NOT_RUNNING/.test(out)) return { ok: true, state: 'not-running' }
  if (/KILLED/.test(out)) return { ok: true, state: 'killed' }
  return { ok: true, state: 'stopped' }
}

/**
 * Kill leftover ssh processes forwarding this exact local port. Matched narrowly
 * (ssh + our -L form + ExitOnForwardFailure) so no other tool's session is hit.
 */
async function cleanupLocalPort(localPort, remotePort) {
  const result = await run('ps', ['-eo', 'pid=,comm=,args='], 8000)
  // Match the local port only: a tunnel may have been left over after the remote
  // port was changed, and it still occupies this local port.
  const needle = `-L ${localPort}:127.0.0.1:`
  const pids = []
  for (const line of result.stdout.split('\n')) {
    const columns = line.trim().split(/\s+/)
    // Require comm=ssh: a shell whose command line merely mentions the same string
    // (a wrapper, or our own invocation) must never be signalled.
    if (columns[1] !== 'ssh') continue
    if (!line.includes(needle) || !line.includes('ExitOnForwardFailure=yes')) continue
    const pid = Number(columns[0])
    if (Number.isInteger(pid) && pid > 0) pids.push(pid)
  }
  for (const pid of pids) { try { process.kill(pid, 'SIGTERM') } catch {} }
  await new Promise((resolve) => setTimeout(resolve, 600))
  for (const pid of pids) {
    try { process.kill(pid, 0); process.kill(pid, 'SIGKILL') } catch {}
  }
  return { killed: pids, listening: await probePort(localPort) }
}

/**
 * Turn ssh's own words into the next action: the three failure classes look alike
 * in the UI but need completely different fixes.
 */
function sshFailureHint(stderr, destination, localPort) {
  if (/Address already in use/i.test(stderr)) {
    return `本地端口 ${localPort} 已被占用。若这是上次 DSH 运行遗留的隧道，先清理它：lsof -ti tcp:${localPort} | xargs kill；否则在编辑里换一个本地端口。`
  }
  if (/Too many authentication failures/i.test(stderr)) {
    return '认证失败次数过多：ssh-agent 里加载的密钥太多，服务器先拒绝完了。用 ssh-add -D 清空后只加载这一台需要的密钥，或在 ~/.ssh/config 里给该主机加 IdentitiesOnly yes。'
  }
  if (/no matching host key|Host key verification failed/i.test(stderr)) {
    return '主机密钥不匹配：服务器换了密钥，或 known_hosts 里存了旧记录。确认服务器可信后，用它新的指纹更新 known_hosts。'
  }
  if (/Permission denied/i.test(stderr)) {
    // The offered-auth list in ssh's own message tells the two cases apart.
    if (/publickey,password|password,publickey|keyboard-interactive/i.test(stderr)) {
      return `服务器允许密码（或 MFA）登录，但本插件不弹任何提示。先把这条已有的写法加到 ~/.ssh/config —— ControlMaster auto / ControlPath ~/.ssh/cm-%C / ControlPersist 10m —— 然后在终端执行一次 ssh ${destination} 完成认证，插件随后会复用那条连接。`
    }
    return '服务器只接受公钥，但当前密钥未被接受：确认 ~/.ssh/config 里该主机的 IdentityFile 指向正确密钥，且 ssh-agent 已加载它（ssh-add -l 查看）。'
  }
  if (/Connection refused/i.test(stderr)) {
    return '主机可达但端口没人监听：确认 SSH 端口是否正确、sshd 是否在运行。'
  }
  if (/Operation timed out|Connection timed out|No route to host|Network is unreachable/i.test(stderr)) {
    return `网络不通（${stderr.split('\n')[0]}）：确认主机在线、地址正确，或是否需要先连 VPN。`
  }
  return `先确认 SSH 能连通：ssh ${destination} true；失败原因：${stderr || '端口未监听'}`
}

/** One exact Fetch route per operation; the shared /api channel supplies trust and auth. */
const ROUTES = [
  ['/api/remote-ssh/hosts', ['GET', 'POST']],
  ['/api/remote-ssh/ssh-hosts', ['GET']],
  ['/api/remote-ssh/status', ['GET']],
  ['/api/remote-ssh/open', ['POST']],
  ['/api/remote-ssh/close', ['POST']],
  ['/api/remote-ssh/settings', ['GET', 'POST']],
  ['/api/remote-ssh/reveal-config', ['POST']],
  ['/api/remote-ssh/cleanup-port', ['POST']],
]

function jsonResponse(status, payload) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  })
}

/**
 * Request handler behind every registered route. It runs inside the authenticated
 * /api channel, so Host/Origin trust and browser authentication were already
 * enforced by the connection layer before this code sees the request.
 */
/** Ensure the tunnel, make sure the remote DSH answers, and build the token URL. */
async function openHost(body) {
      // Never persisted: the password exists for this request only.
      const password = typeof body.password === 'string' && body.password.length > 0 ? body.password : null
      if (password) await ensureAskpass()
      const config = await loadConfig()
      const index = config.hosts.findIndex((item) => item.name === body.name)
      if (index < 0) {
        return jsonResponse(404, { error: `unknown host: ${body.name}`, hint: '主机已被删除，请重新添加', action: { kind: 'add' } })
      }
      const host = { ...config.hosts[index], remotePort: config.hosts[index].remotePort ?? settings.defaultRemotePort }
      if (!isValidDestination(destinationOf(host))) {
        return jsonResponse(400, { error: 'invalid ssh destination', hint: 'SSH 配置里的主机名不合法', action: { kind: 'edit', name: host.name } })
      }
      const localPort = assignLocalPort(config, host, index)
      if (body.restart === true) {
        // A token that no longer matches the live process cannot be recovered from
        // the log; restarting is the only way to get a token that does match.
        await stopRemote(host)
      }

      let health = { ok: false }
      const existing = tunnels.get(host.name)
      if (existing && existing.remotePort !== Number(host.remotePort ?? settings.defaultRemotePort)) {
        // The registry port changed while a tunnel was up: the old forward points at
        // the previous port, so it must go before the new one can be judged.
        try { existing.child.kill() } catch {}
        tunnels.delete(host.name)
      }
      const reusedTunnel = tunnels.has(host.name) && await probePort(localPort)
      // Reuse only a tunnel that still serves the remote: a live tunnel pointing at a
      // dead dsh web must fall through to the health/start handling below.
      if (reusedTunnel) health = await probeHttp(localPort)

      if (!reusedTunnel) {
        // A listener we do not own (leftover ssh from an earlier DSH run) makes every
        // "is the port up" check lie, so refuse early with the real explanation.
        if (await probePort(localPort)) {
          return jsonResponse(409, {
            error: '本地端口已被其它进程占用',
            code: 'PORT_BUSY',
            detail: `127.0.0.1:${localPort}`,
            hint: '这个端口在监听，但不是本插件建立的隧道（多半是上次 DSH 退出后遗留的 ssh）。可以让插件清理它，或在编辑里换一个本地端口。',
            actions: [
              { kind: 'cleanup', name: host.name },
              { kind: 'edit', name: host.name },
            ],
          })
        }

        const tunnel = openTunnel(host, localPort, password)
        let listening = false
        for (let attempt = 0; attempt < 16; attempt += 1) {
          await new Promise((resolve) => setTimeout(resolve, 250))
          if (tunnel.child.exitCode !== null) break
          if (await probePort(localPort, 300)) { listening = true; break }
        }
        if (listening) {
          // Give ssh a moment: a port that answers for a few hundred ms and then dies
          // is a failed forward, not a working tunnel.
          await new Promise((resolve) => setTimeout(resolve, 300))
          if (tunnel.child.exitCode !== null) listening = false
        }
        if (!listening) {
          await waitForClose(tunnel.child)
          try { tunnel.child.kill() } catch {}
          tunnels.delete(host.name)
          const stderr = tunnel.getStderr().trim()
          if (isAuthFailure(stderr)) {
            return jsonResponse(401, password
              ? {
                  error: '密码认证失败',
                  code: 'AUTH_REJECTED',
                  detail: stderr,
                  hint: '密码可能不正确；也可能这台主机还要求其它因素（如 OTP）。不保存密码，可重试。',
                  action: { kind: 'password', name: host.name },
                }
              : {
                  error: '这台主机需要密码认证',
                  code: 'AUTH_REQUIRED',
                  detail: stderr,
                  hint: '输入密码即可继续：密码只用于本次连接，不会保存到任何文件。',
                  action: { kind: 'password', name: host.name },
                })
          }
          return jsonResponse(502, {
            error: 'SSH 本地转发未能建立',
            code: 'TUNNEL_FAILED',
            detail: stderr || `no listener on 127.0.0.1:${localPort}`,
            hint: sshFailureHint(stderr, destinationOf(host), localPort),
            action: { kind: 'edit', name: host.name },
          })
        }
      }

      if (!reusedTunnel) health = await probeHttp(localPort)
      if (!health.ok) {
        const wanted = body.start === true || body.restart === true || settings.autoStart === true
        if (!wanted) {
          return jsonResponse(502, {
            error: '隧道通了，但远端 dsh web 没有响应',
            code: 'REMOTE_NOT_RUNNING',
            detail: health.reason,
            hint: '可以让插件替你在远端启动它，最多等待 30 秒就绪；失败会给出具体原因。',
            actions: [
              { kind: 'start', name: host.name },
              { kind: 'ai', name: host.name },
            ],
          })
        }

        const started = await startRemote(host, password)
        if (!started.ok) {
          return jsonResponse(502, {
            error: '远端启动失败',
            code: started.reason === 'no-dsh' ? 'NO_DSH' : 'START_FAILED',
            detail: started.reason,
            hint: started.reason === 'no-dsh'
              ? '远端找不到 dsh（PATH 和 ~/.local/dsh 都没有）。先在远端安装，或让 AI 帮你准备。'
              : `启动命令执行失败：${started.reason}`,
            actions: [{ kind: 'ai', name: host.name }],
          })
        }

        for (let attempt = 0; attempt < 30; attempt += 1) {
          await new Promise((resolve) => setTimeout(resolve, 1000))
          health = await probeHttp(localPort, 1500)
          if (health.ok) break
        }
        if (!health.ok) {
          return jsonResponse(504, {
            error: '已启动，但 30 秒内没有就绪',
            code: 'START_TIMEOUT',
            detail: health.reason,
            hint: '可能启动较慢或启动失败。查看远端日志：tail -n 20 ~/.dsh-web.log；或让 AI 介入排查。',
            actions: [{ kind: 'ai', name: host.name }],
          })
        }
      }

      if (health.ok && !isDsh(health)) {
        return jsonResponse(409, {
          error: `端口 ${host.remotePort} 上响应的不是 DSH`,
          code: 'NOT_DSH',
          detail: `HTTP ${health.status}`,
          hint: '这个端口被别的服务占用了（返回的不是 DSH 的 401）。确认 DSH 的端口，或让 AI 检查这台机器是否安装了 DSH。',
          actions: [
            { kind: 'ai', name: host.name },
            { kind: 'edit', name: host.name },
          ],
        })
      }

      const token = await resolveToken(host, password)
      if (token) {
        const check = await probeHttp(localPort, 2500, `/?token=${encodeURIComponent(token)}`)
        const accepted = check.ok && (check.status === 303 || check.status === 200)
        if (!accepted) {
          return jsonResponse(502, {
            error: '取到的 web token 被远端拒绝',
            code: 'TOKEN_REJECTED',
            detail: check.ok ? `HTTP ${check.status}` : check.reason,
            hint: '日志里的 token 和正在运行的进程不匹配（通常是因为启动过不止一次）。重启远端 DSH 会得到一条新 token。',
            actions: [
              { kind: 'restart', name: host.name },
              { kind: 'edit', name: host.name },
            ],
          })
        }
      }
      return jsonResponse(200, {
        url: token ? localUrl(localPort, token) : null,
        hasToken: Boolean(token),
        localPort,
        hint: token
          ? null
          : '转发已建立，但没找到 web token。可在远端执行 grep -m1 "dsh web:" ~/.dsh-web.log，或在本机编辑里手动填入。',
        action: token ? null : { kind: 'ai', name: host.name },
      })
}

async function handleFetch(request) {
  const url = new URL(request.url)
  const route = url.pathname.slice(BASE.length) || '/'
  const method = request.method
  let body = {}
  if (method !== 'GET' && method !== 'HEAD') {
    body = await request.json().catch(() => ({}))
  }

  try {
    if (method === 'GET' && route === '/hosts') {
      const config = await loadConfig()
      const hosts = config.hosts.map((host, index) => ({
        ...host,
        remotePort: host.remotePort ?? settings.defaultRemotePort,
        localPort: assignLocalPort(config, host, index),
        connected: tunnels.has(host.name),
      }))
      return jsonResponse(200, {
        hosts,
        configPath: CONFIG_PATH,
        sshConfigPath: config.sshConfigPath || settings.sshConfigPath || DEFAULT_SSH_CONFIG,
      })
    }

    if (method === 'POST' && route === '/hosts') {
      const hosts = Array.isArray(body.hosts) ? body.hosts : []
      for (let index = 0; index < hosts.length; index += 1) {
        const problem = validateHostEntry(hosts[index], index)
        if (problem) return jsonResponse(400, { error: problem })
      }
      const cleaned = hosts.map((host) => ({
        name: String(host.name || host.alias),
        alias: host.alias ? String(host.alias) : undefined,
        target: host.target ? String(host.target) : undefined,
        sshPort: host.sshPort ? Number(host.sshPort) : undefined,
        remotePort: Number(host.remotePort ?? settings.defaultRemotePort),
        localPort: host.localPort ? Number(host.localPort) : undefined,
        token: host.token ? String(host.token) : undefined,
        startCommand: host.startCommand ? String(host.startCommand) : undefined,
      }))
      const current = await loadConfig()
      await saveConfig({ settings: current.settings, hosts: cleaned })

      // A host removed from the registry must not keep its tunnel alive: otherwise
      // deleting and re-adding the same name still reports "connected".
      const keep = new Set(cleaned.map((host) => host.name))
      for (const [name, child] of Array.from(tunnels)) {
        if (keep.has(name)) continue
        try { child.kill() } catch {}
        tunnels.delete(name)
      }

      return jsonResponse(200, { ok: true, configPath: CONFIG_PATH })
    }

    if (method === 'GET' && route === '/ssh-hosts') {
      const config = await loadConfig()
      const result = await listSshAliases(config)
      return jsonResponse(200, { ...result, defaultPath: DEFAULT_SSH_CONFIG })
    }

    if (method === 'GET' && route === '/status') {
      const config = await loadConfig()
      const status = await Promise.all(config.hosts.map(async (host, index) => {
        const localPort = assignLocalPort(config, host, index)
        const connected = tunnels.has(host.name)
        const listening = await probePort(localPort)
        return {
          name: host.name,
          connected,
          listening,
          // Local HTTP through our own tunnel: cheap, and it separates "tunnel up but
          // the remote service is dead" from a healthy connection.
          service: connected && listening ? isDsh(await probeHttp(localPort, 1200)) : null,
          localPort,
        }
      }))
      return jsonResponse(200, { status })
    }

    if (method === 'POST' && route === '/open') {
      if (opening.has(body.name)) {
        return jsonResponse(409, { error: '这台主机正在连接中', code: 'BUSY', hint: '上一个连接请求还没结束，稍等它完成再试。' })
      }
      opening.add(body.name)
      try {
        return await openHost(body)
      } finally {
        opening.delete(body.name)
      }
    }

    if (method === 'POST' && route === '/close') {
      const config = await loadConfig()
      const host = config.hosts.find((item) => item.name === body.name)
      const entry = tunnels.get(body.name)
      const closed = Boolean(entry)
      if (entry) {
        try { entry.child.kill() } catch {}
        tunnels.delete(body.name)
      }
      // Stopping the remote service is a side effect on the other machine, so it
      // only happens when the user turned that setting on.
      const stop = settings.stopRemoteOnDisconnect === true && host ? await stopRemote(host) : null
      return jsonResponse(200, { ok: true, closed, stopped: stop })
    }

    if (method === 'POST' && route === '/cleanup-port') {
      const config = await loadConfig()
      const index = config.hosts.findIndex((item) => item.name === body.name)
      if (index < 0) return jsonResponse(404, { error: `unknown host: ${body.name}` })
      const host = { ...config.hosts[index], remotePort: config.hosts[index].remotePort ?? settings.defaultRemotePort }
      const localPort = assignLocalPort(config, host, index)
      const result = await cleanupLocalPort(localPort, host.remotePort)
      return jsonResponse(200, {
        ok: true,
        killed: result.killed,
        listening: result.listening,
        hint: result.listening ? '端口仍被占用，可能是别的程序；请在编辑里换一个本地端口。' : null,
      })
    }

    if (method === 'GET' && route === '/settings') {
      return jsonResponse(200, { settings, defaultSshConfig: DEFAULT_SSH_CONFIG, configPath: CONFIG_PATH })
    }

    if (method === 'POST' && route === '/settings') {
      settings = {
        sshConfigPath: String(body.sshConfigPath || '').trim(),
        defaultRemotePort: Number(body.defaultRemotePort || 3000),
        autoStart: body.autoStart === true,
        stopRemoteOnDisconnect: body.stopRemoteOnDisconnect === true,
      }
      const current = await loadConfig()
      await saveConfig({ settings, hosts: current.hosts })
      return jsonResponse(200, { ok: true, settings })
    }

    if (method === 'POST' && route === '/reveal-config') {
      const raw = body.path ? String(body.path) : (settings.sshConfigPath || DEFAULT_SSH_CONFIG)
      const target = raw.startsWith('~') ? join(homedir(), raw.slice(1)) : raw
      if (!isAbsolute(target)) return jsonResponse(400, { error: 'path must be absolute' })
      // Reveal the config in the system file manager rather than launching an editor:
      // it works on a file that does not exist yet, and needs no editor association.
      const [opener, args] = process.platform === 'darwin'
        ? ['open', ['-R', target]]
        : process.platform === 'win32'
          ? ['explorer', [`/select,${target}`]]
          : ['xdg-open', [dirname(target)]]
      try {
        const child = spawn(opener, args, { stdio: 'ignore', detached: true })
        child.unref()
      } catch (error) {
        return jsonResponse(500, { error: error instanceof Error ? error.message : String(error) })
      }
      return jsonResponse(200, { ok: true, path: target })
    }

    return jsonResponse(404, { error: `unknown route: ${method} ${route}` })
  } catch (error) {
    return jsonResponse(500, { error: error instanceof Error ? error.message : String(error) })
  }
}

/** Split `---` frontmatter from a SKILL.md body. */
function readSkill() {
  const raw = readFileSync(SKILL_PATH, 'utf8')
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/)
  if (!match) return { name: 'remote-dsh-ops', description: 'Remote DSH operations over SSH.', content: raw }
  const meta = {}
  for (const line of match[1].split(/\r?\n/)) {
    const at = line.indexOf(':')
    if (at > 0) meta[line.slice(0, at).trim()] = line.slice(at + 1).trim()
  }
  return {
    name: meta.name || 'remote-dsh-ops',
    description: meta.description || 'Remote DSH operations over SSH.',
    content: match[2].trim(),
  }
}

export function apply(ctx, config) {
  settings = {
    sshConfigPath: String(config?.sshConfigPath || ''),
    defaultRemotePort: Number(config?.defaultRemotePort || 3000),
  }
  // Persisted panel settings win over the row's config defaults.
  loadConfig().then((stored) => {
    if (stored.settings && Object.keys(stored.settings).length > 0) {
      settings = {
        sshConfigPath: String(stored.settings.sshConfigPath || ''),
        defaultRemotePort: Number(stored.settings.defaultRemotePort || 3000),
        autoStart: stored.settings.autoStart === true,
        stopRemoteOnDisconnect: stored.settings.stopRemoteOnDisconnect === true,
      }
    }
  }).catch(() => {})
  ctx.effect(() => {
    const skill = readSkill()
    const disposeSkill = ctx.skills.register({
      name: skill.name,
      description: skill.description,
      content: skill.content,
      source: 'runtime',
      resourceBase: { kind: 'directory', path: dirname(SKILL_PATH.pathname) },
    })
    const disposeRoutes = ROUTES.map(([path, methods]) => ctx.connection.fetch.register({
      path,
      methods,
      requestBody: 'buffered',
      fetch: (request) => handleFetch(request),
    }))
    return () => {
      try { disposeSkill() } catch {}
      for (const dispose of disposeRoutes) { try { Promise.resolve(dispose()).catch(() => {}) } catch {} }
      for (const entry of tunnels.values()) { try { entry.child.kill() } catch {} }
      tunnels.clear()
    }
  })
}
