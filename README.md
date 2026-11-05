# dsh-remote-ssh

SSH remote hosts for [DeepSeek Harness](https://deepseek.com): pick a machine from your existing `~/.ssh/config`, keep an SSH local forward alive, and open that machine's DSH web UI in your browser.

It is the DSH equivalent of VS Code Remote-SSH — same SSH config, same keys, same jump hosts, but the remote side serves DSH instead of a language server.

## Features

- **Hosts come from `~/.ssh/config`** — one source of truth, nothing to retype
- **One click connect / disconnect** — runs `ssh -N -L <local>:127.0.0.1:<remote>`
- **Automatic web token** — reads the last matching line of the remote log (matched by port) and verifies it through the tunnel before you ever see a 401
- **Actionable failures** — port in use, network unreachable, and authentication failure each get their own next step
- **Password / MFA hosts** — a dialog asks for the password when needed; it is used for that connection only and never written to disk
- Works with ProxyJump / ProxyCommand, passphrase keys via `ssh-agent`, and ControlMaster session reuse
- Ships a `remote-dsh-ops` skill so an agent can turn a bare machine into a remote DSH host

## Install

```bash
dsh plugin add @strepsiades/dsh-remote-ssh
```

Reload DSH, then look for **Remote SSH** in the sidebar.

## Usage

1. Sidebar → **Remote SSH** → **+**
2. Pick a host from your SSH config
3. Click **Connect**
4. Click the external-link icon to open the remote DSH UI

## Requirements

| Side | Requirement |
| --- | --- |
| DSH | `0.2.1-rc.5` or newer |
| Local machine | OpenSSH client. macOS / Linux fully supported. Windows: key auth and tunneling work; password auth is untested |
| Remote machine | macOS / Linux. A Windows remote is reached through a PowerShell token lookup that is untested |

**The plugin does not provide reachability.** If the host is not already reachable over SSH (LAN, VPN, Tailscale, jump host), the connection fails — by design.

## Settings

| Setting | Meaning |
| --- | --- |
| SSH config path | Empty means `~/.ssh/config` |
| Default remote port | Fallback for new hosts and when opening (default `3000`) |

## Per-host options

| Option | Meaning |
| --- | --- |
| Remote DSH port | Where `dsh web` listens on the remote |
| Local port | Leave empty to auto-assign; pinning it keeps the browser cookie valid (cookies bind to `hostname:port`) |
| Web token | Usually empty — read from the remote log on every connect. Fill it only to pin a value |

## How it works

- The host half registers `/api/remote-ssh/*` **inside DSH's authenticated `/api` channel**, reads and writes a small registry, spawns `ssh`, and parses the token
- The client half renders the panel and talks to the same-origin API
- Connect flow: open the tunnel → HTTP health probe through the tunnel → read the token → verify the token (expect `303`) → return the URL
- The token lives in memory only; the registry is written with `0600` permissions
- A leftover tunnel from a previous DSH run is reported as a port conflict instead of being mistaken for a live connection

## Security

- Custom routes ride DSH's authenticated `/api` channel: Host / Origin checks and the owner principal are enforced by the connection layer before this plugin runs
- SSH destinations starting with `-` are rejected, so a registry entry cannot smuggle an ssh option
- Passwords reach ssh through `SSH_ASKPASS`: not on the command line, not in logs, not on disk
- The plugin never reads or copies your private keys — which keys are used is up to `~/.ssh/config`
- The browser cookie is issued by the remote `dsh web` and lasts 30 days by default

## Limitations

- No reachability layer: reverse tunnels, Tailscale, frp and friends are out of scope
- No mobile-specific client: you get the remote DSH web UI in a browser
- A Windows remote needs `dsh web` to log its token to `%USERPROFILE%\.dsh-web.log` or `.dsh\logs\web.log`

## Development

| File | Role |
| --- | --- |
| `index.js` | Host half: routes, registry, ssh processes, skill registration |
| `client.js` | Client half: panel and dialogs |
| `skills/remote-dsh-ops/SKILL.md` | Runbook for preparing a machine as a remote DSH host |
| `locale/` | Plugin metadata strings |
| `cordis.patch.yml` | Bundle insert declaration |

Local UI checks live in `scripts/` and are intentionally not tracked.

## License

MIT

---

# 中文说明

从 `~/.ssh/config` 里选一台机器，保持一条 SSH 本地转发，然后在浏览器里打开那台机器上的 DSH Web 界面。

这是 DSH 版的 VS Code Remote-SSH：同一份 SSH 配置、相同的密钥与跳板机，只是远端跑的是 DSH。

## 功能

- **主机列表直接来自 `~/.ssh/config`**，不重复维护连接信息
- **一键连接 / 断开**：`ssh -N -L <本地>:127.0.0.1:<远端>`
- **自动读取 web token**：按端口取远端日志的最后一条匹配行，并通过隧道验证后再交给浏览器
- **错误可操作**：端口占用、网络不通、认证失败分别给出下一步
- **密码 / MFA 主机**：需要时弹窗输入，仅用于本次连接，不落盘
- 支持 ProxyJump / ProxyCommand、`ssh-agent` 中的口令密钥、ControlMaster 会话复用
- 附带 `remote-dsh-ops` skill，可让 agent 把一台空机器准备成远程 DSH 主机

## 安装

```bash
dsh plugin add @strepsiades/dsh-remote-ssh
```

## 使用

侧栏「远程 SSH」→「+」→ 选主机 → 「连接」→ 点外链图标打开远端界面。

## 依赖

- DSH `0.2.1-rc.5` 或更新
- 本机：OpenSSH 客户端（macOS / Linux 完整支持；Windows 的密码认证未验证）
- 远端：macOS / Linux（Windows 远端走 PowerShell 读 token，未验证）

**本插件不提供可达性。** 如果这台机器本来就不能通过 SSH 到达（局域网、VPN、Tailscale、跳板机），连接会失败——这是刻意的边界。

## 设置

| 项 | 说明 |
| --- | --- |
| SSH 配置文件路径 | 留空表示 `~/.ssh/config` |
| 默认远端端口 | 新主机与打开时的兜底值（默认 3000） |

## 每台主机

| 项 | 说明 |
| --- | --- |
| 远端 DSH 端口 | `dsh web` 在远端的监听端口 |
| 本地端口 | 留空自动分配；固定它可让浏览器 cookie 长期有效 |
| Web token | 一般留空，每次连接自动读取 |

## 安全

- 自定义路由挂在 DSH 已鉴权的 `/api` 通道内，Host / Origin 校验与 owner 身份由 Connection 层完成
- 拒绝以 `-` 开头的 SSH 目的地，避免参数注入
- 密码经 `SSH_ASKPASS` 交给 ssh：不进命令行、不进日志、不落盘
- 插件不读取也不复制私钥，使用哪些密钥完全取决于 `~/.ssh/config`
- 浏览器 cookie 由远端 `dsh web` 签发，默认 30 天

## 许可

MIT
