---
name: remote-dsh-ops
description: Use when the user wants to prepare, repair, or operate a remote machine for DeepSeek Harness over SSH — running a task, checking status, installing or removing a plugin, reading the web instance address, or setting up a machine that does not have DSH yet. Covers both "do something on that machine" and "make that machine ready".
---

# Remote DSH operations over SSH

The remote machine runs a **full DSH**. SSH is only the transport; `dsh` on that machine is the entire control surface. There is no second protocol and no server component to install.

## Before you start

1. Resolve the machine to an **SSH alias**, never to a raw user-typed host string. Aliases live in `~/.ssh/config`; this plugin's registry is `~/.dsh/dsh-hosts.json` — read it first (`hosts[].alias`, `hosts[].remotePort`, `hosts[].command`).
2. Probe both a system and a prefix install:

   ```bash
   ssh -o BatchMode=yes <alias> 'bash -lc "command -v dsh; command -v node; node -v; ls -l ~/.local/dsh/node_modules/.bin/dsh ~/.local/opt/current/bin/node 2>/dev/null"'
   ```

3. **A prefix install is not on `PATH`, and its launchers have `#!/usr/bin/env node` shebangs.** Calling `~/.local/dsh/node_modules/.bin/dsh` directly fails with `/usr/bin/env: 'node': No such file or directory`. Every command that runs a prefix install must carry a **per-command** PATH prefix:

   ```bash
   PATH="$HOME/.local/opt/current/bin:$PATH" <command>
   ```

   That prefix is required and allowed. What is forbidden is *persisting* it (rc files, `~/.profile`, launcher symlinks).

## Preparing a machine that is not ready yet

This section **is** the authorised procedure. Run exactly these steps, then stop and report. Do not improve, extend, or "harden" anything on your own initiative.

### Hard constraints — never do these, even if they look helpful

- **Never capture or persist the web token.** No `~/.dsh-web.url`, no URL file, no wrapper script. `dsh web` prints its token URL to its own log; the user retrieves it from there.
- **Never change DSH permission defaults.** Leave the sandbox mode alone and never set `DSH_PERMISSION_MODE`.
- **Never create systemd units**, and never add `NoNewPrivileges=`, `PrivateTmp=`, `ProtectSystem=`, or similar sandbox hardening.
- **Never install third-party plugins**, including remote-access or relay plugins.
- **Never configure model credentials**, and never put an API key on a command line. A `MISSING_CREDENTIAL` result is expected: report it, do not fix it.
- **Never use root for the DSH install.** User-space only, under `~/.local`.
- **Never persist a `PATH` edit or create a launcher symlink.** A per-command `PATH=...` prefix is the only allowed form.

### Steps

1. **Probe the machine.**

   ```bash
   ssh <alias> 'uname -sm; id -un; command -v node; node -v; command -v dsh; ls -d ~/.local/opt/current ~/.local/dsh 2>/dev/null; df -h ~ | tail -1'
   ```

   Map `x86_64` → `linux-x64`, `aarch64` → `linux-arm64`.

2. **Node 22+ if missing.** Pick the newest v22 LTS from `https://nodejs.org/dist/index.json`, then:

   ```bash
   ssh <alias> 'set -e; mkdir -p ~/.local/opt && cd ~/.local/opt \
     && curl -fSL --retry 3 -o node.tar.xz https://nodejs.org/dist/v<ver>/node-v<ver>-linux-<arch>.tar.xz \
     && tar -xJf node.tar.xz && rm node.tar.xz \
     && ln -sfn ~/.local/opt/node-v<ver>-linux-<arch> ~/.local/opt/current \
     && ~/.local/opt/current/bin/node -v'
   ```

   Do not use `apt`, do not use `sudo`. If `nodejs.org` is unreachable, report it rather than inventing a mirror.

3. **DSH if missing.** Always with the PATH prefix, because npm is itself an `#!/usr/bin/env node` script:

   ```bash
   ssh <alias> 'PATH="$HOME/.local/opt/current/bin:$PATH" ~/.local/opt/current/bin/npm i \
     --prefix ~/.local/dsh --registry=https://registry.npmmirror.com @deepseek-ai/dsh'
   ```

   Verify with the same prefix: `PATH=... ~/.local/dsh/node_modules/.bin/dsh --version`.
   Expect a few hundred packages and 1–2 minutes on a small VPS.

4. **Start it detached, loopback-only, and wait for the token line.** Startup is slow on a small machine — it commonly takes **10–20 s** before it listens, so a fixed short sleep produces false failures. Poll instead:

   ```bash
   ssh <alias> 'umask 077; PATH="$HOME/.local/opt/current/bin:$PATH" \
     nohup setsid ~/.local/dsh/node_modules/.bin/dsh web --host 127.0.0.1 --port 3000 --no-open \
       </dev/null > ~/.dsh-web.log 2>&1 & \
     for i in $(seq 1 60); do sleep 1; grep -q "dsh web:" ~/.dsh-web.log 2>/dev/null && break; done; \
     chmod 600 ~/.dsh-web.log; \
     grep -m1 "dsh web:" ~/.dsh-web.log || echo "TIMEOUT: no token line after 60s"'
   ```

   `setsid` matters: without it the process may stay attached to the SSH session. Use the port the printed URL shows if it differs.

5. **Verify, then stop.**
   - `PATH=... dsh --version` prints the expected version
   - `ss -ltn | grep <port>` shows a listener on `127.0.0.1`
   - `curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:<port>/` returns **401** (normal without a cookie)
   - `curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:<port>/?token=<token>"` returns **303**
   - one `dsh --profile headless "reply OK"` run reports `MISSING_CREDENTIAL` — expected, do not fix

### What to report back

Version, absolute binary path, listening port, **log path**, the `dsh web:` line verbatim, the 401/303 checks, the `MISSING_CREDENTIAL` status, and every ssh command you ran. If reality contradicts this skill, say so explicitly — that is a finding worth reporting, not a workaround to hide.

## Adding a host to `~/.ssh/config`

Only for a machine the user names that the config does not cover yet. The config file stays the single source of truth; you are editing it, not working around it.

1. Ask for the **target** (`user@host[:port]`) and the **alias** the user wants (default: the host name). Do not invent either.
2. **Back up first**, creating the file and directory when missing:

   ```bash
   mkdir -p ~/.ssh && touch ~/.ssh/config && chmod 600 ~/.ssh/config
   cp ~/.ssh/config ~/.ssh/config.bak-$(date +%Y%m%d%H%M%S)
   ```

3. **Append or update one block**, marked so it is recognisable later. Idempotent: if a `Host <alias>` line already exists, update that block's fields instead of adding a second one.

   ```sshconfig
   # added by remote-dsh-ops
   Host <alias>
     HostName <host>
     User <user>
     Port <port>
   ```

   Omit `Port` when it is 22. Never delete, reorder, or rewrite blocks you did not add.

4. **Verify resolution, not just syntax**: `ssh -G <alias> | grep -E '^(hostname|user|port) '` must show the values you wrote.
5. **Verify connectivity**: `ssh -o BatchMode=yes -o ConnectTimeout=8 <alias> true`. A failure here is an auth or network fact to report, not something to paper over.
6. Report the exact block you wrote, the line range, and the backup path.

## Opening the web UI (the per-process token)

`dsh web` generates a random token at every start and prints it once. Where it lands depends on how the process was started:

- a prefix launch like step 4 writes **`~/.dsh-web.log`**
- some older setups write **`~/.dsh/logs/web.log`**

Try both:

```bash
ssh <alias> 'for f in ~/.dsh-web.log ~/.dsh/logs/web.log; do [ -f "$f" ] && grep "127.0.0.1:<port>/?token=" "$f" | tail -1 && break; done'
```

Match **this instance's port** and take the **last** matching line. A log that is appended to across restarts keeps older, already-invalid tokens above the current one, and a first-match grep would hand the user a dead token.

What the token does, and what to tell the user:

- The token is exchanged **once** at `GET /` for a signed cookie bound to `hostname:port`. The cookie lasts **30 days** by default, so a browser needs the token only on its first visit per authority.
- Changing the **local forwarded port** changes the authority and invalidates that cookie. Keep a host's local port stable.
- There is no logout. Clearing the browser cookie ends one browser session; deleting the `client-connection/browser-session` record from `~/.dsh/.credentials.yaml` and restarting `dsh web` revokes every session.
- To hand a machine to another device, give that device the full `?token=` URL once; it then holds its own 30-day cookie.

This token is a DSH web credential, not a model credential. Reading it out of the log is expected; never write it into a file of your own. The log itself must stay `0600` — it holds that token, and an older launch may have left it group-readable.

## Removing or resetting an installation

Also an authorised procedure. Stop, uninstall, verify — do not "improve" the machine.

1. **Stop the process safely.** Never `pkill -f "dsh web"`: that pattern also matches the shell running your command and can kill your own session. Filter `ps` output instead, or feed a heredoc script over stdin so the pattern never appears on the remote command line. Select PIDs whose `comm` is `node` and whose cmdline contains `.local/dsh/node_modules/.bin/dsh`, `SIGTERM`, then poll until `ss` shows the port released.
2. **Remove the user-space installs:** `rm -rf ~/.local/dsh ~/.local/opt`.
3. **Remove a system Node only if this procedure installed it:** `sudo apt-get purge -y nodejs && sudo apt-get autoremove -y`. Check `/usr/lib/node_modules` afterwards — `apt purge` leaves the directory behind, possibly with an empty `@deepseek-ai/` and an old global `pnpm`. Remove only what you can attribute; empty leftovers are safe, but a `pnpm` something else may use is not — report it instead of deleting it.
4. **Remove the log** (`~/.dsh-web.log`) and any token or wrapper artifacts (`~/.dsh-web.url`, `/usr/local/bin/dsh-web-run`, a `dsh-web` unit).
5. **Keep the data** unless the user asked otherwise: `~/.dsh/sessions` and `~/.dsh/.credentials.yaml` are user data, not installation.
6. Verify: `command -v node`, `command -v npm`, `command -v dsh` all empty; no listener on the port; the artifacts above gone.

## Commands

One-shot task — answer on stdout, diagnostics on stderr, then exit:

```bash
ssh <alias> 'PATH="$HOME/.local/opt/current/bin:$PATH" ~/.local/dsh/node_modules/.bin/dsh --profile headless "check disk usage and list failed units"'
```

Machine-readable events (newline-delimited JSON):

```bash
ssh <alias> 'PATH=... ~/.local/dsh/node_modules/.bin/dsh --profile headless --json "..."'
```

Task from stdin to avoid quoting problems:

```bash
printf '%s' "$TASK" | ssh <alias> 'PATH=... ~/.local/dsh/node_modules/.bin/dsh --profile headless'
```

Resume a persisted session:

```bash
ssh <alias> 'PATH=... ~/.local/dsh/node_modules/.bin/dsh --profile headless --session-id <session-id> "continue"'
```

Manage the remote profile's plugins:

```bash
ssh <alias> 'PATH=... ~/.local/dsh/node_modules/.bin/dsh plugin --profile web add -w <package>@<version>'
ssh <alias> 'PATH=... ~/.local/dsh/node_modules/.bin/dsh plugin --profile web remove -w <package>'
```

## Rules and pitfalls

1. **A prefix install needs a PATH prefix on every invocation**, because its launchers are `#!/usr/bin/env node` scripts. A per-command prefix is fine; persisting it is not.
2. **`dsh web` can take 10–20 s to start listening.** Poll for the token line; a "missing" token is usually impatience.
3. **`headless` is a fresh process each run** and shares no context with the web UI unless you pass `--session-id`.
4. **A missing model credential fails the run** with `MISSING_CREDENTIAL: llm-deepseek`. That is a remote-side configuration task for the user, not something to work around.
5. **Argument order**: `ssh [options] destination command...` — the destination comes before the command.
6. **Never interpolate a user-supplied host string into a shell command.** Resolve an alias from `~/.ssh/config` and pass it as its own argument.
7. **Never `pkill -f` a pattern that appears in your own command line** — it can kill the script executing it. Filter `ps` output instead.
8. **Do not restart a remote `dsh web` casually.** It invalidates the logged token and drops open browser sessions.
9. **Keep streams separate.** stdout carries the result; `--json` carries events. Read stderr before concluding anything.

## Verification

Decide success by exit code plus stderr, not by the absence of output. The three common distinct failures are `MISSING_CREDENTIAL` (model key, remote-side), `command not found` or `/usr/bin/env: 'node'` (PATH prefix missing), and `TIMEOUT: no token line` (startup still running, or the process died — check the log).
