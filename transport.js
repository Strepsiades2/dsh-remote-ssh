/**
 * SSH transport for @strepsiades/dsh-remote-ssh, implemented with the pure-JS
 * `ssh2` client instead of spawning the system `ssh` binary.
 *
 * Why: one code path for macOS / Linux / Windows, password and keyboard-interactive
 * authentication without askpass helpers, and a tunnel + remote command sharing a
 * single authenticated connection.
 */
import { Client } from 'ssh2'
import SSHConfig from 'ssh-config'
import net from 'node:net'
import { readFileSync, readdirSync, existsSync, writeFileSync, mkdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, dirname, isAbsolute } from 'node:path'

const KNOWN_HOSTS = join(homedir(), '.ssh', 'known_hosts')
const LEARNED_HOSTS = join(process.env.DSH_HOME || join(homedir(), '.dsh'), 'ssh-known-hosts.json')

/** No interactive prompt can be answered here; fail fast with a clear error instead. */
class TransportError extends Error {
  constructor(code, message, hint) {
    super(message)
    this.code = code
    this.hint = hint || null
  }
}

/* ------------------------------------------------------------------ config */

function expandIncludes(text, baseDir, depth = 0) {
  if (depth > 8) return text
  return text.split(/\r?\n/).map((line) => {
    const match = line.match(/^\s*Include\s+(.+?)\s*$/i)
    if (!match) return line
    const patterns = match[1].split(/\s+/)
    const chunks = []
    for (const pattern of patterns) {
      const resolved = pattern.startsWith('~')
        ? join(homedir(), pattern.slice(1))
        : (isAbsolute(pattern) ? pattern : join(baseDir, pattern))
      let files = []
      try {
        files = resolved.includes('*') || resolved.includes('?') ? globSync(resolved) : (existsSync(resolved) ? [resolved] : [])
      } catch {
        files = []
      }
      for (const file of files) {
        try {
          chunks.push(expandIncludes(readFileSync(file, 'utf8'), dirname(file), depth + 1))
        } catch {}
      }
    }
    return chunks.join('\n')
  }).join('\n')
}

/** Minimal glob for Include directives: only `*` and `?` within the file name. */
function globSync(pattern) {
  const dir = dirname(pattern)
  const filePattern = pattern.slice(dir.length + 1)
  const regex = new RegExp('^' + filePattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.') + '$')
  try {
    return readdirSync(dir).filter((name) => regex.test(name)).sort().map((name) => join(dir, name))
  } catch {
    return []
  }
}

/** Parsed ssh config, cached per path. */
const configCache = new Map()
function loadConfigFile(configPath) {
  const real = configPath || join(homedir(), '.ssh', 'config')
  if (configCache.has(real)) return configCache.get(real)
  let parsed = null
  try {
    parsed = SSHConfig.parse(expandIncludes(readFileSync(real, 'utf8'), dirname(real)))
  } catch {
    parsed = SSHConfig.parse('')
  }
  configCache.set(real, parsed)
  return parsed
}

export function clearConfigCache() {
  configCache.clear()
}

function first(value) {
  return Array.isArray(value) ? value[0] : value
}

/**
 * Merge a registry row with its `~/.ssh/config` entry. Registry-level `target`
 * (user@host) wins over the alias, and `sshPort`/`remotePort` stay separate.
 */
/** Resolve a bare destination (`alias`, `user@host`, `host:port`) via ssh config. */
export function resolveDestination(destination, settings) {
  const dest = String(destination || '')
  let entry = {}
  try {
    entry = loadConfigFile(settings && settings.sshConfigPath).compute(dest) || {}
  } catch {
    entry = {}
  }
  let hostname = first(entry.HostName) || dest
  let user = first(entry.User) || ''
  let port = Number(first(entry.Port)) || 22
  let identityFile = first(entry.IdentityFile)

  const match = dest.match(/^(?:([^@]+)@)?(\[[^\]]+\]|[^:@]+)(?::(\d+))?$/)
  if (match) {
    if (match[1]) user = match[1]
    if (!entry.HostName) hostname = match[2].replace(/^\[|\]$/g, '')
    if (match[3]) port = Number(match[3])
  }
  if (identityFile && identityFile.startsWith('~')) identityFile = join(homedir(), identityFile.slice(1))
  return {
    destination: dest,
    hostname,
    user,
    port,
    identityFile: identityFile || null,
    proxyJump: first(entry.ProxyJump) || null,
  }
}

/**
 * Merge a registry row with its `~/.ssh/config` entry. Registry-level `target`
 * (user@host) wins over the alias, and `sshPort` overrides the config port.
 */
export function resolveHost(host, settings) {
  const destination = String(host.alias || host.target || '')
  const info = resolveDestination(destination, settings)
  if (host.sshPort) info.port = Number(host.sshPort)
  if (!info.user) info.user = process.env.USER || process.env.USERNAME || ''
  return info
}

/** ProxyJump value -> hop list ("none" and empty mean direct). */
function proxyHops(info) {
  const raw = info.proxyJump ? String(info.proxyJump).trim() : ''
  if (!raw || raw.toLowerCase() === 'none') return []
  return raw.split(',').map((part) => part.trim()).filter(Boolean)
}

/* ------------------------------------------------------------ host keys */

const learnedKeys = (() => {
  try {
    return JSON.parse(readFileSync(LEARNED_HOSTS, 'utf8'))
  } catch {
    return {}
  }
})()

function persistLearnedKeys() {
  try {
    mkdirSync(dirname(LEARNED_HOSTS), { recursive: true })
    writeFileSync(LEARNED_HOSTS, JSON.stringify(learnedKeys, null, 2), { mode: 0o600 })
  } catch {}
}

/** Parse known_hosts into `authority -> Set(base64 key)`; hashed entries are skipped. */
function knownKeysFor(authority) {
  const keys = new Set()
  for (const value of Object.values(learnedKeys)) {
    if (value && value.authority === authority) keys.add(value.key)
  }
  try {
    for (const line of readFileSync(KNOWN_HOSTS, 'utf8').split(/\r?\n/)) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const parts = trimmed.split(/\s+/)
      if (parts.length < 3) continue
      const [hosts, , key] = parts
      if (hosts.startsWith('|1|')) continue // hashed host names are not matchable here
      for (const candidate of hosts.split(',')) {
        if (candidate === authority) keys.add(key)
      }
    }
  } catch {}
  return keys
}

function rememberKey(authority, key) {
  learnedKeys[authority] = { authority, key, learnedAt: new Date().toISOString() }
  persistLearnedKeys()
}

function hostVerifierFor(info, state) {
  const authority = info.port === 22 ? info.hostname : `[${info.hostname}]:${info.port}`
  const known = knownKeysFor(authority)
  return (key) => {
    const base64 = key.toString('base64')
    if (known.size > 0) {
      if (known.has(base64)) return true
      // ssh2 turns `false` into "Host denied (verification failed)"; flag the reason.
      state.hostKeyMismatch = true
      return false
    }
    rememberKey(authority, base64)
    return true
  }
}

/* ---------------------------------------------------------- connections */

const connections = new Map()

function authOptions(info, password, state) {
  const options = {
    host: info.hostname,
    port: info.port,
    username: info.user,
    readyTimeout: 15000,
    keepaliveInterval: 20000,
    keepaliveCountMax: 3,
    hostVerifier: hostVerifierFor(info, state),
  }
  if (password) {
    options.password = password
    options.tryKeyboard = true
    return options
  }
  if (info.identityFile && existsSync(info.identityFile)) {
    options.privateKey = readFileSync(info.identityFile)
  }
  const agent = process.env.SSH_AUTH_SOCK
  if (agent) options.agent = agent
  else if (process.platform === 'win32') options.agent = 'pageant'
  return options
}

function classify(error, info, hasPassword) {
  if (error instanceof TransportError) return error
  const level = error && error.level
  const code = error && error.code
  const message = error && error.message ? error.message : String(error)
  if (/Host denied|verification failed/i.test(message)) {
    return new TransportError('HOSTKEY', `主机密钥校验失败：${info.hostname}`, '服务器换了密钥，或本地 known_hosts 记录已过期。确认可信后删除 ~/.ssh/known_hosts 中该主机的旧行再重试。')
  }
  if (level === 'client-authentication' || /authentication methods failed|All configured authentication/i.test(message)) {
    return new TransportError(
      hasPassword ? 'AUTH_REJECTED' : 'AUTH_REQUIRED',
      hasPassword ? '密码认证失败' : `${info.destination} 需要认证`,
      hasPassword
        ? '密码可能不正确；也可能这台主机还要求其它因素（如 OTP）。不保存密码，可重试。'
        : '输入密码即可继续：密码只用于本次连接，不会保存到任何文件。',
    )
  }
  if (code === 'ECONNREFUSED') {
    return new TransportError('NETWORK', `连接被拒绝：${info.hostname}:${info.port}`, '主机可达但端口没人监听：确认 SSH 端口是否正确、sshd 是否在运行。')
  }
  if (code === 'ETIMEDOUT' || code === 'EHOSTUNREACH' || code === 'ENETUNREACH') {
    return new TransportError('NETWORK', `网络不通：${info.hostname}:${info.port}`, '确认主机在线、地址正确，或是否需要先连 VPN。')
  }
  if (code === 'ENOTFOUND') {
    return new TransportError('NETWORK', `无法解析主机名：${info.hostname}`, '检查 ~/.ssh/config 里的 HostName 是否正确。')
  }
  if (/private key|parse key|no passphrase/i.test(message)) {
    return new TransportError('KEY_INVALID', '私钥无法使用', '确认 IdentityFile 指向正确的私钥；带口令的密钥目前需要通过 ssh-agent 加载。')
  }
  return new TransportError('TRANSPORT', message.split('\n')[0], null)
}

function connectOnce(info, password, sock = null, timeoutMs = 20000) {
  return new Promise((resolve, reject) => {
    const client = new Client()
    const state = { hostKeyMismatch: false }
    let settled = false
    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      try { client.end() } catch {}
      reject(new TransportError('NETWORK', `连接超时：${info.hostname}:${info.port}`, '超时不一定代表离线：先确认地址、端口与网络。'))
    }, timeoutMs)
    client.on('ready', () => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve(client)
    })
    client.on('error', (error) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      reject(state.hostKeyMismatch
        ? new TransportError('HOSTKEY', `主机密钥与 known_hosts 不匹配：${info.hostname}`, '服务器换了密钥，或本地记录已过期。确认可信后删除 ~/.ssh/known_hosts 中该主机的旧行再重试。')
        : classify(error, info, Boolean(password)))
    })
    client.on('keyboard-interactive', (name, instructions, lang, prompts, finish) => {
      // Only a plain password prompt can be answered from the modal.
      const answers = prompts.map((prompt) => (/password/i.test(prompt.prompt) ? password : ''))
      finish(answers)
    })
    try {
      const options = authOptions(info, password, state)
      if (sock) options.sock = sock
      client.connect(options)
    } catch (error) {
      if (settled) return
      settled = true
      clearTimeout(timer)
      reject(classify(error, info, Boolean(password)))
    }
  })
}

/** Open a direct-tcpip channel from an established client toward host:port. */
function channelTo(client, hostname, port) {
  return new Promise((resolve, reject) => {
    client.forwardOut('127.0.0.1', 0, hostname, port, (error, stream) => {
      if (error) reject(classify(error, { hostname, port }, false))
      else resolve(stream)
    })
  })
}

/**
 * Connect to a target, crossing ProxyJump hops when configured. Each hop is a full
 * SSH connection made over a channel of the previous one (SSH over SSH), which is
 * what OpenSSH's ProxyJump does as well.
 */
async function connectTarget(info, password, settings) {
  const hops = proxyHops(info)
  if (hops.length === 0) return { client: await connectOnce(info, password), upstream: [] }

  const upstream = []
  let sock = null
  try {
    for (let index = 0; index < hops.length; index += 1) {
      const hopInfo = resolveDestination(hops[index], settings)
      if (proxyHops(hopInfo).length > 0) {
        throw new TransportError('UNSUPPORTED', '跳板机本身的 ProxyJump 暂不支持', '请简化 ~/.ssh/config 里的 ProxyJump 链。')
      }
      // Jump hosts authenticate with their own keys/agent; the password belongs to the target.
      const hopClient = await connectOnce(hopInfo, null, sock)
      upstream.push(hopClient)
      const next = index + 1 < hops.length ? resolveDestination(hops[index + 1], settings) : info
      sock = await channelTo(hopClient, next.hostname, next.port)
    }
    const client = await connectOnce(info, password, sock)
    return { client, upstream }
  } catch (error) {
    for (const client of upstream) { try { client.end() } catch {} }
    throw error
  }
}

/**
 * One authenticated connection per host, reused by the forward and by remote
 * commands. Password-created connections are keyed separately so a later
 * key-based connect does not reuse a session the user did not authorise.
 */
export async function connect(host, settings, { password } = {}) {
  const info = resolveHost(host, settings)
  if (!info.destination) throw new TransportError('INVALID', 'invalid ssh destination')
  const cacheKey = `${host.name}|${info.hostname}|${info.port}|${info.user}|${info.proxyJump || ''}|${password ? 'pw' : 'key'}`
  const existing = connections.get(host.name)
  if (existing && existing.cacheKey === cacheKey && existing.client) return existing

  const { client, upstream } = await connectTarget(info, password, settings)
  const entry = { client, upstream, cacheKey, info, server: null, localPort: null }
  connections.set(host.name, entry)
  client.on('close', () => {
    // The socket died: the forward must die with it, or the port stays bound and the
    // next connect would report a phantom "port in use".
    if (entry.server) { try { entry.server.close() } catch {} ; entry.server = null; entry.localPort = null }
    if (connections.get(host.name) === entry) connections.delete(host.name)
  })
  return entry
}

export function isConnected(name) {
  const entry = connections.get(name)
  return Boolean(entry && entry.client)
}

export function localPortOf(name) {
  const entry = connections.get(name)
  return entry ? entry.localPort : null
}

/** Run one command on the remote over the cached connection. */
export function exec(host, settings, command, { password, timeoutMs = 25000 } = {}) {
  return connect(host, settings, { password }).then((entry) => new Promise((resolve) => {
    let stdout = ''
    let stderr = ''
    let settled = false
    const finish = (result) => { if (!settled) { settled = true; resolve(result) } }
    const timer = setTimeout(() => finish({ code: -1, stdout, stderr: `${stderr}\n[timeout]` }), timeoutMs)
    entry.client.exec(command, (error, stream) => {
      if (error) { clearTimeout(timer); finish({ code: -1, stdout, stderr: String(error) }); return }
      stream.on('data', (chunk) => { stdout += chunk })
      stream.stderr.on('data', (chunk) => { stderr += chunk })
      stream.on('close', (code) => { clearTimeout(timer); finish({ code, stdout, stderr }) })
    })
  }))
}

/** Local listener that forwards every accepted socket through the SSH connection. */
export async function forward(host, settings, localPort, remotePort, { password } = {}) {
  const entry = await connect(host, settings, { password })
  if (entry.server && entry.localPort === localPort) return entry
  if (entry.server) await closeForward(host.name)

  const server = net.createServer((socket) => {
    entry.client.forwardOut('127.0.0.1', socket.remotePort || 0, '127.0.0.1', remotePort, (error, stream) => {
      if (error) { socket.destroy(); return }
      socket.pipe(stream).pipe(socket)
      socket.on('error', () => stream.destroy())
      stream.on('error', () => socket.destroy())
    })
  })
  await new Promise((resolve, reject) => {
    server.once('error', (error) => {
      if (error.code === 'EADDRINUSE') {
        reject(new TransportError('PORT_BUSY', `本地端口 ${localPort} 已被占用`, '这个端口在监听，但不是本插件建立的隧道。可以换一个本地端口。'))
      } else {
        reject(new TransportError('TRANSPORT', `无法监听 127.0.0.1:${localPort}：${error.message}`, null))
      }
    })
    server.listen(localPort, '127.0.0.1', () => resolve())
  })
  entry.server = server
  entry.localPort = localPort
  return entry
}

export async function closeForward(name) {
  const entry = connections.get(name)
  if (!entry || !entry.server) return false
  const server = entry.server
  entry.server = null
  entry.localPort = null
  await new Promise((resolve) => server.close(() => resolve()))
  return true
}

export function close(name) {
  const entry = connections.get(name)
  if (!entry) return false
  if (entry.server) { try { entry.server.close() } catch {} }
  try { entry.client.end() } catch {}
  for (const upstream of entry.upstream || []) { try { upstream.end() } catch {} }
  connections.delete(name)
  return true
}

export function closeAll() {
  for (const name of Array.from(connections.keys())) close(name)
}

export { TransportError }
