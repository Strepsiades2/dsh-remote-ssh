/**
 * Client half of @strepsiades/dsh-remote-ssh.
 *
 * Two surfaces:
 *  - a main panel listing remote hosts (SSH config stays the source of truth)
 *  - a page inside Settings → Plugins for the plugin's own preferences
 */
window.__ModuleLoader__.load({
  id: '@strepsiades/dsh-remote-ssh',
  factory(require) {
   try {
    const React = require('react')
    const h = React.createElement
    const API = '/api/remote-ssh'

    const DICT = {
      en: {
        'panel.title': 'Remote SSH',
        'panel.subtitle': 'Run the remote DSH in your browser over SSH',
        'panel.empty': 'No hosts yet.',
        'panel.emptyHint': 'Pick a machine from your SSH config and this panel keeps the forward ready.',
        'action.add': 'Add host',
        'action.refresh': 'Refresh',
        'action.settings': 'Settings',
        'action.open': 'Connect',
        'action.opening': 'Connecting…',
        'action.disconnect': 'Disconnect',
        'action.browser': 'Open in browser',
        'action.openConfig': 'Show in folder',
        'action.edit': 'Edit',
        'action.editHost': 'Edit host',
        'action.enterPassword': 'Enter password',
        'action.startRemote': 'Start remotely',
        'action.cleanupPort': 'Clean up port',
        'action.restartRemote': 'Restart remote DSH',
        'state.ready': 'Ready',
        'state.degraded': 'Service not responding',
        'state.idle': 'Idle',
        'state.checking': 'Checking…',
        'notice.portCleaned': 'Occupied port cleaned',
        'notice.portStillBusy': 'Port is still in use by another program',
        'notice.stoppedRemote': 'Forward closed and remote DSH stopped',
        'settings.stopRemote': 'Stop the remote DSH when disconnecting',
        'settings.stopRemoteHint': 'Off by default: disconnecting only closes the local forward.',
        'action.connect': 'Connect',
        'password.title': 'Password required',
        'password.hint': 'used for this connection only, never saved',
        'password.placeholder': 'SSH password',
        'password.rejected': 'Wrong password — try again',
        'action.remove': 'Remove',
        'action.save': 'Save',
        'action.cancel': 'Cancel',
        'action.ai': 'Let AI configure',
        'action.aiCopied': 'Copied ✓',
        'state.loading': 'Loading…',
        'modal.addTitle': 'Add a host',
        'modal.addHint': 'Hosts come from your SSH config. Edit that file for user, port or keys.',
        'modal.search': 'Filter',
        'modal.notFound': 'Not in the list?',
        'modal.aiAdd': 'Let AI add it to SSH config',
        'modal.aiAddPrompt': 'Add a new machine to my SSH config and prepare it as a remote DSH host:\n1. Ask me for the SSH target (user@host[:port]) and the alias I want\n2. Back up ~/.ssh/config, append a Host block, then verify with ssh -G\n3. Follow the remote-dsh-ops skill to install and start the remote DSH\n4. Finish by giving me the token URL',
        'modal.noAliases': 'No Host entries in this file',
        'modal.readFailed': 'Could not read the SSH config',
        'modal.needAlias': 'Type an alias first',
        'modal.badAlias': 'Only letters, digits and . _ @ : - are allowed',
        'modal.duplicate': 'already listed',
        'notice.configOpened': 'Opened',
        'notice.copied': 'Copied. Close this dialog, then paste it into the conversation on the left.',
        'notice.copyFailed': 'Automatic copy is unavailable — select the text below and copy it.',
        'notice.starting': 'Starting the remote DSH…',
        'notice.restarting': 'Restarting the remote DSH…',
        'notice.noToken': 'Forward is up but no token file was found on the remote',
        'notice.opened': 'Connected',
        'edit.hint': 'Everything here is stored per host. Connection details stay in your SSH config.',
        'edit.remotePort': 'Remote DSH port',
        'edit.localPort': 'Local port',
        'edit.localPortPlaceholder': 'auto',
        'edit.badPort': 'Remote port must be an integer between 1 and 65535',
        'edit.badLocalPort': 'Local port must be an integer between 1024 and 65535',
        'edit.token': 'Web token (optional)',
        'edit.tokenPlaceholder': 'Leave empty — read automatically',
        'edit.tokenHint': 'Read from the remote log on every connect. Fill it only to pin a specific value.',
        'edit.startCommand': 'Start command (optional)',
        'edit.startCommandPlaceholder': 'empty = auto-detect dsh',
        'edit.startCommandHint': 'Runs on the remote when starting it; {port} is replaced with the remote DSH port.',
        'settings.path': 'SSH config file',
        'settings.pathHint': 'Empty means ~/.ssh/config',
        'settings.port': 'Default remote port',
        'settings.autoStart': 'Start the remote DSH automatically when it is not running',
        'settings.autoStartHint': 'Off by default: connecting never launches anything on the remote unless you ask.',
        'settings.hint': 'Defaults apply to hosts that do not override them.',
      },
      zh: {
        'panel.title': '远程 SSH',
        'panel.subtitle': '通过 SSH 隧道，在浏览器里打开远端 DSH',
        'panel.empty': '还没有主机。',
        'panel.emptyHint': '从 SSH 配置里选一台机器，这个面板会替你保持转发。',
        'action.add': '添加主机',
        'action.refresh': '刷新',
        'action.settings': '设置',
        'action.open': '连接',
        'action.opening': '正在连接…',
        'action.disconnect': '断开',
        'action.browser': '在浏览器打开',
        'action.openConfig': '打开所在文件夹',
        'action.edit': '编辑',
        'action.editHost': '去编辑',
        'action.enterPassword': '输入密码',
        'action.startRemote': '启动远端',
        'action.cleanupPort': '清理端口',
        'action.restartRemote': '重启远端 DSH',
        'state.ready': '已就绪',
        'state.degraded': '服务未响应',
        'state.idle': '未连接',
        'state.checking': '检测中',
        'notice.portCleaned': '已清理被占用的端口',
        'notice.portStillBusy': '端口仍被其它程序占用',
        'notice.stoppedRemote': '已断开转发，并停止远端 DSH',
        'settings.stopRemote': '断开时同时停止远端 DSH',
        'settings.stopRemoteHint': '默认关闭：断开只关闭本地转发，不影响远端进程。',
        'action.connect': '连接',
        'password.title': '需要密码',
        'password.hint': '仅用于本次连接，不会保存',
        'password.placeholder': 'SSH 密码',
        'password.rejected': '密码不正确，请重试',
        'action.remove': '删除',
        'action.save': '保存',
        'action.cancel': '取消',
        'action.ai': 'AI 帮我配',
        'action.aiCopied': '已复制 ✓',
        'state.loading': '加载中…',
        'modal.addTitle': '添加主机',
        'modal.addHint': '主机来自 SSH 配置。用户、端口、密钥请直接改那个文件。',
        'modal.search': '筛选',
        'modal.notFound': '没找到？',
        'modal.aiAdd': '让 AI 帮我加进 SSH 配置',
        'modal.aiAddPrompt': '帮我把一台新机器加进 SSH 配置，并准备成远程 DSH 主机：\n1. 先问我 SSH 目标和想要的别名\n2. 备份 ~/.ssh/config 后追加 Host 块，并用 ssh -G 验证\n3. 按 remote-dsh-ops skill 安装并启动远端 DSH\n4. 最后把带 token 的 URL 给我',
        'modal.noAliases': '这个文件里没有 Host 条目',
        'modal.readFailed': '读取 SSH 配置失败',
        'modal.needAlias': '请先输入别名',
        'modal.badAlias': '别名只允许字母、数字和 . _ @ : -',
        'modal.duplicate': '已在列表中',
        'notice.configOpened': '已打开',
        'notice.copied': '已复制。关闭此对话框，粘贴到左侧对话里即可。',
        'notice.copyFailed': '无法自动复制，请手动选中下面的文本复制。',
        'notice.starting': '正在启动远端 DSH…',
        'notice.restarting': '正在重启远端 DSH…',
        'notice.noToken': '转发已建立，但远端没有 token 文件',
        'notice.opened': '已连接',
        'edit.hint': '这里只保存每台主机自己的信息；连接参数仍在 SSH 配置里。',
        'edit.remotePort': '远端 DSH 端口',
        'edit.localPort': '本地端口',
        'edit.localPortPlaceholder': '自动',
        'edit.badPort': '远端端口必须是 1–65535 之间的整数',
        'edit.badLocalPort': '本地端口必须是 1024–65535 之间的整数',
        'edit.token': 'Web token（可选）',
        'edit.tokenPlaceholder': '留空即可，自动读取',
        'edit.tokenHint': '每次连接自动从远端日志读取；只有想固定某个值时才填。',
        'edit.startCommand': '启动命令（可选）',
        'edit.startCommandPlaceholder': '留空 = 自动探测 dsh',
        'edit.startCommandHint': '需要启动时在远端执行；{port} 会替换为远端 DSH 端口。',
        'settings.path': 'SSH 配置文件',
        'settings.pathHint': '留空 = ~/.ssh/config',
        'settings.port': '默认远端端口',
        'settings.autoStart': '远端未运行时自动启动',
        'settings.autoStartHint': '默认关闭：除非你打开这个开关，连接不会在远端启动任何东西。',
        'settings.hint': '默认值只作用于没有单独设置的主机。',
      },
    }

    const SURFACE = {
      gap: '1.618em',
      border: '1px solid rgba(127,127,127,0.20)',
      dim: { opacity: 0.55 },
      radius: 10,
    }

    function api(path, init) {
      return fetch(API + path, Object.assign({ headers: { 'content-type': 'application/json' } }, init))
        .then(async (response) => {
          const data = await response.json().catch(() => ({}))
          if (!response.ok) {
            const failure = new Error(data.error || `${response.status} ${response.statusText}`)
            failure.payload = data
            throw failure
          }
          return data
        })
    }

    /**
     * Every failure the panel shows carries the same three parts: what happened,
     * what the user can do next, and — when we know — the one control that fixes it.
     * A bare message stranded inside a modal is what confused the add-host flow.
     */
    function failureOf(problem, prefix) {
      const payload = (problem && problem.payload) || {}
      const message = problem && problem.message ? problem.message : String(problem)
      return {
        text: prefix ? `${prefix}: ${message}` : message,
        hint: payload.hint || null,
        action: payload.action || null,
        actions: payload.actions || null,
      }
    }

    /* Render guard: a throw inside a panel must not blank the whole app. */
    class HostsBoundary extends React.Component {
      constructor(props) { super(props); this.state = { failed: false, detail: '' } }
      static getDerivedStateFromError(error) {
        const detail = String((error && (error.stack || error.message)) || error)
        return { failed: true, detail: detail.split('\n').slice(0, 4).join('\n') }
      }
      componentDidCatch(error) { try { console.error('[remote-ssh] render failed:', error) } catch {} }
      render() {
        if (this.state.failed) {
          return React.createElement('div', {
            style: { padding: '1.4em', fontSize: '0.82em', lineHeight: 1.5 },
          },
            React.createElement('div', { style: { fontWeight: 600, marginBottom: '0.5em' } }, 'Remote Hosts failed to render'),
            React.createElement('pre', {
              style: { whiteSpace: 'pre-wrap', opacity: 0.72, margin: 0, fontFamily: 'ui-monospace, monospace', fontSize: '0.95em' },
            }, this.state.detail || 'no detail'),
          )
        }
        return this.props.children
      }
    }
    function wrap(Component) {
      return function Guarded(props) {
        return React.createElement(HostsBoundary, null, React.createElement(Component, props))
      }
    }

    const iconProps = { viewBox: '0 0 24 24', width: 16, height: 16, fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true }
    const icons = {
      add: () => h('svg', iconProps, h('path', { d: 'M12 5v14M5 12h14' })),
      refresh: () => h('svg', iconProps, h('path', { d: 'M20 11a8 8 0 1 0-2.3 5.7M20 5v6h-6' })),
      gear: () => h('svg', iconProps,
        h('circle', { cx: 12, cy: 12, r: 3 }),
        h('path', { d: 'M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2V21a2 2 0 1 1-4 0v-.1A1.7 1.7 0 0 0 7 19.4l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.7 1.7 0 0 0 3 13.7H3a2 2 0 1 1 0-4h.1A1.7 1.7 0 0 0 4.6 7L4.5 7a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H10a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 2.9 1.2l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9v.1a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z' })),
      trash: () => h('svg', iconProps, h('path', { d: 'M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13' })),
      external: () => h('svg', iconProps, h('path', { d: 'M14 4h6v6M20 4l-8.5 8.5M18 14v5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h5' })),
      pencil: () => h('svg', iconProps, h('path', { d: 'M4 20h4L20 8l-4-4L4 16v4z' })),
      plug: () => h('svg', iconProps, h('path', { d: 'M9 3v6M15 3v6M7 9h10v3a5 5 0 0 1-10 0zM12 17v4' })),
      power: () => h('svg', iconProps,
        h('path', { d: 'M12 3v9' }),
        h('path', { d: 'M6.3 6.3a8 8 0 1 0 11.4 0' })),
    }

    function iconButton(kind, title, onClick, opts) {
      const disabled = Boolean(opts && opts.disabled)
      return h('button', {
        type: 'button', title, 'aria-label': title, onClick, disabled,
        style: Object.assign({
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          width: '2em', height: '2em', padding: 0, borderRadius: 8,
          border: SURFACE.border, background: 'transparent', color: 'inherit',
          cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.45 : 1, flex: 'none',
        }, (opts && opts.style) || {}),
      }, h(icons[kind]))
    }

    function textButton(label, onClick, opts) {
      return h('button', {
        type: 'button', onClick, disabled: opts && opts.disabled,
        style: Object.assign({
          font: 'inherit', fontSize: '0.82em', cursor: 'pointer', padding: '0.32em 0.7em',
          borderRadius: 8, border: SURFACE.border, background: 'transparent', color: 'inherit',
        }, (opts && opts.style) || {}),
      }, label)
    }

    const inputStyle = {
      font: 'inherit', fontSize: '0.86em', padding: '0.4em 0.55em', borderRadius: 8,
      border: SURFACE.border, background: 'transparent', color: 'inherit', width: '100%', boxSizing: 'border-box',
    }

    function useLocale(ctx, t) {
      const [, bump] = React.useState(0)
      React.useEffect(() => {
        if (!ctx || !ctx.locale || typeof ctx.locale.subscribe !== 'function') return undefined
        return ctx.locale.subscribe(() => bump((value) => value + 1))
      }, [ctx])
      return t
    }

    /**
     * Deliberately minimal: the how-to lives in the `remote-dsh-ops` skill, so the
     * copied text carries only the intent and the host alias. Keep it this short —
     * a pasted wall of commands both leaks implementation detail and rots as the
     * skill evolves.
     */
    function prepPrompt(alias) {
      return `用 remote-dsh-ops skill，把 SSH 别名 ${alias} 这台机器准备成一台远程 DSH 主机。`
    }

    /* ---------------------------------------------------------------- panel */

    function createPanel(ctx, t, SettingsComponent) {
      function Panel() {
        const tt = useLocale(ctx, t)
        const [hosts, setHosts] = React.useState([])
        const [status, setStatus] = React.useState({})
        const [error, setError] = React.useState(null)
        const [notice, setNotice] = React.useState(null)
        const [busy, setBusy] = React.useState(null)
        const [adding, setAdding] = React.useState(null)
        const [editing, setEditing] = React.useState(null)
        const [aiHint, setAiHint] = React.useState(null)
        const [editError, setEditError] = React.useState(null)
        const [authPrompt, setAuthPrompt] = React.useState(null)
        const [showSettings, setShowSettings] = React.useState(false)

        const refresh = React.useCallback(() => {
          api('/hosts').then((data) => { setHosts(data.hosts || []); setError(null) })
            .catch((problem) => setError(failureOf(problem)))
          api('/status').then((data) => {
            const next = {}
            for (const item of data.status || []) next[item.name] = item
            setStatus(next)
          }).catch(() => {})
        }, [])

        React.useEffect(() => { refresh() }, [refresh])

        const save = (list) => api('/hosts', { method: 'POST', body: JSON.stringify({ hosts: list }) })
          .then(() => { setError(null); refresh() })
          .catch((problem) => setError(failureOf(problem)))

        /** POST /open is idempotent: it reuses a live tunnel and returns its token URL. */
        const requestUrl = (name, password, options) => api('/open', {
          method: 'POST',
          body: JSON.stringify(Object.assign({ name }, password ? { password } : {}, options || {})),
        })


        /** Open the add dialog and load SSH aliases for it. */
        const openAdd = () => {
          setAdding({ filter: '', manual: '', loading: true, aliases: [] })
          api('/ssh-hosts')
            .then((data) => setAdding({ filter: '', manual: '', loading: false, aliases: data.aliases || [], error: data.error, path: data.path || data.defaultPath }))
            .catch((problem) => setAdding({ filter: '', manual: '', loading: false, aliases: [], error: problem.message }))
        }

        /**
         * Auth failures are not errors to report — they are a missing input.
         * Open the password dialog straight away instead of a banner the user
         * has to read and then act on.
         */
        const openFailure = (problem, name, viaBrowser) => {
          const payload = (problem && problem.payload) || {}
          if (payload.code === 'AUTH_REQUIRED') {
            setAuthPrompt({ name, value: '', error: null, viaBrowser })
            return
          }
          if (payload.code === 'AUTH_REJECTED') {
            setAuthPrompt({ name, value: '', error: payload.error || tt('password.rejected'), viaBrowser })
            return
          }
          setError(failureOf(problem, name))
        }

        const open = (name, password, options) => {
          setBusy(name); setNotice(null); setError(null)
          if (options && options.start) setNotice(tt('notice.starting'))
          if (options && options.restart) setNotice(tt('notice.restarting'))
          requestUrl(name, password, options)
            .then((result) => {
              if (result.url) setNotice(`${tt('notice.opened')} · 127.0.0.1:${result.localPort}`)
              else setError({ text: tt('notice.noToken'), hint: result.hint || null, action: { kind: 'edit', name } })
              refresh()
            })
            .catch((problem) => openFailure(problem, name, false))
            .finally(() => setBusy(null))
        }

        /** Establish (or reuse) the forward, then hand the token URL to the browser. */
        const openBrowser = (name, password, options) => {
          setBusy(name); setError(null)
          if (options && options.start) setNotice(tt('notice.starting'))
          if (options && options.restart) setNotice(tt('notice.restarting'))
          requestUrl(name, password, options)
            .then((result) => {
              if (result.url) window.open(result.url, '_blank', 'noopener')
              else setError({ text: tt('notice.noToken'), hint: result.hint || null, action: { kind: 'edit', name } })
              refresh()
            })
            .catch((problem) => openFailure(problem, name, true))
            .finally(() => setBusy(null))
        }

        const disconnect = (name) => api('/close', { method: 'POST', body: JSON.stringify({ name }) })
          .then((result) => {
            setNotice(result && result.stopped && result.stopped.ok ? tt('notice.stoppedRemote') : null)
            refresh()
          })
          .catch((problem) => setError(failureOf(problem, name)))

        const header = h('div', { style: { display: 'flex', alignItems: 'flex-end', gap: '0.8em', marginBottom: '1.618em' } },
          h('div', null,
            h('div', { style: { fontSize: '1.16em', fontWeight: 600, letterSpacing: '0.01em' } }, tt('panel.title')),
            h('div', { style: Object.assign({ fontSize: '0.78em', marginTop: '0.2em' }, SURFACE.dim) }, tt('panel.subtitle')),
          ),
          h('div', { style: { flex: 1 } }),
          iconButton('gear', tt('action.settings'), () => setShowSettings((value) => !value)),
          iconButton('refresh', tt('action.refresh'), refresh),
          iconButton('add', tt('action.add'), openAdd, { style: { borderColor: 'var(--dsh-accent, #4c8dff)', color: 'var(--dsh-accent, #4c8dff)' } }),
        )

        const banner = (payload, tone) => {
          if (!payload) return null
          const text = typeof payload === 'string' ? payload : payload.text
          const hint = typeof payload === 'string' ? null : payload.hint
          const actions = typeof payload === 'string'
            ? []
            : (payload.actions || (payload.action ? [payload.action] : []))
          return h('div', {
            style: {
              border: '1px solid ' + tone, color: tone, borderRadius: SURFACE.radius,
              padding: '0.5em 0.7em', marginBottom: '0.8em', fontSize: '0.8em', lineHeight: 1.5,
            },
          },
            h('div', null, text),
            hint ? h('div', { style: { marginTop: '0.2em', opacity: 0.85, fontSize: '0.95em' } }, hint) : null,
            actions.length
              ? h('div', { style: { marginTop: '0.4em', display: 'flex', gap: '0.4em', flexWrap: 'wrap' } },
                  ...actions.map((action) => textButton(
                    action.kind === 'ai' ? tt('action.ai')
                      : action.kind === 'password' ? tt('action.enterPassword')
                        : action.kind === 'start' ? tt('action.startRemote')
                          : action.kind === 'restart' ? tt('action.restartRemote')
                            : action.kind === 'cleanup' ? tt('action.cleanupPort')
                              : tt('action.editHost'),
                    () => runErrorAction(action),
                    { style: { borderColor: tone, color: tone } },
                  )))
              : null,
          )
        }

        const runErrorAction = (action) => {
          const host = hosts.find((item) => item.name === action.name)
          if (action.kind === 'ai') { copyText(action.prompt || prepPrompt(action.name || '')); return }
          if (action.kind === 'password') { setError(null); setAuthPrompt({ name: action.name, value: '', viaBrowser: Boolean(action.viaBrowser) }); return }
          if (action.kind === 'start') { setError(null); open(action.name, null, { start: true }); return }
          if (action.kind === 'restart') { setError(null); open(action.name, null, { restart: true }); return }
          if (action.kind === 'cleanup') {
            setError(null)
            setBusy(action.name)
            api('/cleanup-port', { method: 'POST', body: JSON.stringify({ name: action.name }) })
              .then((result) => {
                if (result.listening) setError({ text: result.hint || tt('notice.portStillBusy') })
                else setNotice(tt('notice.portCleaned'))
              })
              .catch((problem) => setError(failureOf(problem, action.name)))
              .finally(() => setBusy(null))
            return
          }
          if (host) { setError(null); setAiHint(null); setEditError(null); setEditing(Object.assign({}, host)) }
        }

        const copyText = (text) => {
          const ok = () => setNotice(tt('notice.copied'))
          const fail = () => setNotice(tt('notice.copyFailed'))
          try {
            if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(ok, fail)
            else fail()
          } catch { fail() }
        }

        const rows = hosts.map((host) => {
          const target = host.alias || host.target
          const live = status[host.name] || {}
          // Only our own tunnel counts. A listener we did not create (a leftover
          // ssh from an earlier DSH run) must not look connected — it cannot be closed.
          const connected = live.connected || host.connected
          const phase = connected
            ? (live.service === true ? 'ready' : live.service === false ? 'degraded' : 'checking')
            : 'idle'
          const phaseText = {
            idle: tt('state.idle'),
            checking: tt('state.checking'),
            degraded: tt('state.degraded'),
            ready: tt('state.ready'),
          }[phase]
          return h('div', {
            key: host.name,
            style: {
              display: 'flex', alignItems: 'center', gap: '0.55em',
              padding: '0.85em 1.15em', border: SURFACE.border, borderRadius: SURFACE.radius,
            },
          },
            h('span', {
              title: phaseText,
              style: {
                width: '0.5em', height: '0.5em', borderRadius: 999, flex: 'none',
                background: phase === 'ready' ? '#30a46c'
                  : phase === 'degraded' ? '#f5a524'
                    : phase === 'checking' ? '#9aa4b2'
                      : 'rgba(127,127,127,0.32)',
              },
            }),
            h('div', { style: { minWidth: 0, flex: 1 } },
              h('div', {
                style: { fontSize: '0.98em', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
              }, target),
              h('div', { style: Object.assign({ fontSize: '0.76em', marginTop: '0.25em' }, SURFACE.dim) },
                `127.0.0.1:${host.localPort} → :${host.remotePort}`,
                phase === 'degraded' || phase === 'checking' ? ` · ${phaseText}` : null,
              ),
            ),
            iconButton(
              connected ? 'power' : 'plug',
              connected ? tt('action.disconnect') : busy === host.name ? tt('action.opening') : tt('action.open'),
              () => (connected ? disconnect(host.name) : open(host.name)),
              {
                disabled: busy === host.name,
                style: connected
                  ? { color: '#e5484d', borderColor: '#e5484d' }
                  : { borderColor: 'var(--dsh-accent, #4c8dff)', color: 'var(--dsh-accent, #4c8dff)' },
              },
            ),
            iconButton('external', tt('action.browser'), () => openBrowser(host.name)),
            iconButton('pencil', tt('action.edit'), () => { setAiHint(null); setEditError(null); setEditing(Object.assign({}, host)) }),
            iconButton('trash', tt('action.remove'), () => save(hosts.filter((item) => item.name !== host.name))),
          )
        })

        const body = hosts.length === 0
          ? h('div', {
              style: {
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.6em',
                padding: '4.2em 1em', border: SURFACE.border, borderRadius: SURFACE.radius,
              },
            },
              h('div', { style: Object.assign({ opacity: 0.4 }, {}) }, h(icons.plug)),
              h('div', { style: { fontSize: '0.95em' } }, tt('panel.empty')),
              h('div', { style: Object.assign({ fontSize: '0.8em', textAlign: 'center', maxWidth: '22em' }, SURFACE.dim) }, tt('panel.emptyHint')),
              textButton(tt('action.add'), openAdd, {
                style: { marginTop: '0.6em', borderColor: 'var(--dsh-accent, #4c8dff)', color: 'var(--dsh-accent, #4c8dff)' },
              }),
            )
          : h('div', { style: { display: 'flex', flexDirection: 'column', gap: '0.5em' } }, rows)

        return h('div', {
          style: {
            padding: '2.618em 1.9em 2em', width: '100%', maxWidth: '46em', margin: '0 auto',
            height: '100%', overflow: 'auto', boxSizing: 'border-box', lineHeight: 1.55,
          },
        },
          header,
          error ? banner(error, '#e5484d') : null,
          notice ? banner(notice, 'var(--dsh-accent, #4c8dff)') : null,
          showSettings && SettingsComponent ? settingsModal() : null,
          body,
          h('div', { style: Object.assign({ fontSize: '0.7em', marginTop: '1.618em', opacity: 0.6 }, SURFACE.dim) }, 'build 0.8.1'),
          adding ? addModal() : null,
          editing ? editModal() : null,
          authPrompt ? passwordModal() : null,
        )

        function passwordModal() {
          const submit = () => {
            const name = authPrompt.name
            const value = authPrompt.value
            const viaBrowser = authPrompt.viaBrowser
            setAuthPrompt(null)
            if (viaBrowser) openBrowser(name, value)
            else open(name, value)
          }
          return h('div', {
            style: {
              position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.34)', backdropFilter: 'blur(2px)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 40,
            },
            onClick: () => setAuthPrompt(null),
          },
            h('div', {
              onClick: (event) => event.stopPropagation(),
              style: {
                width: 'min(26em, 88vw)', background: 'Canvas', color: 'CanvasText', borderRadius: 14,
                padding: '1.3em 1.4em', boxShadow: '0 18px 48px rgba(0,0,0,0.28)', border: SURFACE.border,
              },
            },
              h('div', { style: { fontSize: '1.05em', fontWeight: 600 } }, tt('password.title')),
              h('div', { style: Object.assign({ fontSize: '0.78em', margin: '0.25em 0 0.9em' }, SURFACE.dim) },
                authPrompt.name, ' · ', tt('password.hint')),
              h('input', {
                type: 'password', autoFocus: true, autoComplete: 'off', style: inputStyle,
                value: authPrompt.value,
                placeholder: tt('password.placeholder'),
                onChange: (event) => setAuthPrompt(Object.assign({}, authPrompt, { value: event.target.value })),
                onKeyDown: (event) => { if (event.key === 'Enter') submit() },
              }),
              authPrompt.error ? h('div', { style: { fontSize: '0.78em', color: '#e5484d', marginTop: '0.6em' } }, authPrompt.error) : null,
              h('div', { style: { display: 'flex', gap: '0.5em', marginTop: '1em' } },
                textButton(tt('action.connect'), submit, { style: { borderColor: 'var(--dsh-accent, #4c8dff)', color: '#4c8dff' } }),
                textButton(tt('action.cancel'), () => setAuthPrompt(null)),
              ),
            ),
          )
        }

        function settingsModal() {
          return h('div', {
            style: {
              position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.34)', backdropFilter: 'blur(2px)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 40,
            },
            onClick: () => setShowSettings(false),
          },
            h('div', {
              onClick: (event) => event.stopPropagation(),
              style: {
                width: 'min(32em, 88vw)', maxHeight: '80vh', overflow: 'auto',
                background: 'Canvas', color: 'CanvasText', borderRadius: 14, padding: '1.2em 1.4em',
                boxShadow: '0 18px 48px rgba(0,0,0,0.28)', border: SURFACE.border,
              },
            },
              h(SettingsComponent),
            ),
          )
        }

        function addModal() {
          const aliases = adding.aliases || []
          const filter = adding.filter.trim().toLowerCase()
          const shown = filter
            ? aliases.filter((item) => `${item.alias} ${item.hostname} ${item.user || ''}`.toLowerCase().includes(filter))
            : aliases
          return h('div', {
            style: {
              position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.34)', backdropFilter: 'blur(2px)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 40,
            },
            onClick: () => setAdding(null),
          },
            h('div', {
              onClick: (event) => event.stopPropagation(),
              style: {
                width: 'min(34em, 88vw)', maxHeight: '76vh', display: 'flex', flexDirection: 'column',
                background: 'Canvas', color: 'CanvasText', borderRadius: 14, padding: '1.3em 1.4em',
                boxShadow: '0 18px 48px rgba(0,0,0,0.28)', border: SURFACE.border,
              },
            },
              h('div', { style: { fontSize: '1.05em', fontWeight: 600 } }, tt('modal.addTitle')),
              h('div', { style: Object.assign({ fontSize: '0.78em', margin: '0.3em 0 0.9em' }, SURFACE.dim) }, tt('modal.addHint')),
              h('div', { style: { display: 'flex', alignItems: 'center', gap: '0.5em', marginBottom: '0.6em' } },
                h('code', { style: Object.assign({ fontSize: '0.76em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }, SURFACE.dim) }, adding.path || '~/.ssh/config'),
                h('div', { style: { flex: 1 } }),
                textButton(tt('action.openConfig'), () => {
                  api('/reveal-config', { method: 'POST', body: JSON.stringify({ path: adding.path }) })
                    .then((result) => setAdding(Object.assign({}, adding, { formError: null, formNotice: `${tt('notice.configOpened')} ${result.path}` })))
                    .catch((problem) => setAdding(Object.assign({}, adding, { formError: problem.message })))
                }),
              ),
              h('input', {
                autoFocus: true, style: inputStyle, placeholder: tt('modal.search'), value: adding.filter,
                onChange: (event) => setAdding(Object.assign({}, adding, { filter: event.target.value })),
              }),
              h('div', { style: { marginTop: '0.7em', overflow: 'auto', flex: 1 } },
                adding.loading ? h('div', { style: Object.assign({ fontSize: '0.82em', padding: '0.8em 0' }, SURFACE.dim) }, tt('state.loading'))
                  : adding.error ? h('div', { style: Object.assign({ fontSize: '0.82em', padding: '0.8em 0' }, SURFACE.dim) }, `${tt('modal.readFailed')}: ${adding.error}`)
                  : shown.length === 0 ? h('div', { style: Object.assign({ fontSize: '0.82em', padding: '0.8em 0' }, SURFACE.dim) }, tt('modal.noAliases'))
                  : shown.map((entry) => h('button', {
                      key: entry.alias, type: 'button',
                      onClick: () => add(entry.alias),
                      style: {
                        display: 'block', width: '100%', textAlign: 'left', font: 'inherit', cursor: 'pointer',
                        padding: '0.55em 0.65em', marginBottom: '0.25em', borderRadius: 8,
                        border: '1px solid transparent', background: 'transparent', color: 'inherit',
                      },
                      onMouseEnter: (event) => { event.currentTarget.style.borderColor = 'rgba(127,127,127,0.28)' },
                      onMouseLeave: (event) => { event.currentTarget.style.borderColor = 'transparent' },
                    },
                      h('div', { style: { fontSize: '0.92em' } }, entry.alias),
                      h('div', { style: Object.assign({ fontSize: '0.76em' }, SURFACE.dim) },
                        [entry.hostname !== entry.alias ? entry.hostname : null, entry.user, entry.port ? `:${entry.port}` : null].filter(Boolean).join(' · ')),
                    )),
              ),
              adding.formNotice ? h('div', { style: { fontSize: '0.78em', color: '#30a46c', marginTop: '0.6em' } }, adding.formNotice) : null,
              adding.formError ? h('div', { style: { fontSize: '0.78em', color: '#e5484d', marginTop: '0.6em' } }, adding.formError) : null,
              h('div', { style: { display: 'flex', alignItems: 'center', gap: '0.5em', marginTop: '0.9em', flexWrap: 'wrap' } },
                h('div', { style: Object.assign({ fontSize: '0.8em' }, SURFACE.dim) }, tt('modal.notFound')),
                textButton(tt('modal.aiAdd'), () => {
                  copyText(tt('modal.aiAddPrompt'))
                  setAdding(Object.assign({}, adding, { formError: null, formNotice: tt('notice.copied') }))
                }, { style: { borderColor: 'var(--dsh-accent, #4c8dff)', color: '#4c8dff' } }),
                h('div', { style: { flex: 1 } }),
                textButton(tt('action.cancel'), () => setAdding(null)),
              ),
            ),
          )
        }

        function editModal() {
          const target = editing.alias || editing.target
          return h('div', {
            style: {
              position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.34)', backdropFilter: 'blur(2px)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 40,
            },
            onClick: () => setEditing(null),
          },
            h('div', {
              onClick: (event) => event.stopPropagation(),
              style: {
                width: 'min(32em, 88vw)', background: 'Canvas', color: 'CanvasText', borderRadius: 14,
                padding: '1.3em 1.4em', boxShadow: '0 18px 48px rgba(0,0,0,0.28)', border: SURFACE.border,
              },
            },
              h('div', { style: { fontSize: '1.05em', fontWeight: 600 } }, target),
              h('div', { style: Object.assign({ fontSize: '0.78em', margin: '0.25em 0 1em' }, SURFACE.dim) }, tt('edit.hint')),
              h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6em' } },
                h('label', { style: { display: 'block' } },
                  h('div', { style: Object.assign({ fontSize: '0.78em', marginBottom: '0.25em' }, SURFACE.dim) }, tt('edit.remotePort')),
                  h('input', {
                    style: inputStyle, inputMode: 'numeric', value: editing.remotePort ?? '',
                    placeholder: '3000',
                    onChange: (event) => setEditing(Object.assign({}, editing, { remotePort: event.target.value })),
                  }),
                ),
                h('label', { style: { display: 'block' } },
                  h('div', { style: Object.assign({ fontSize: '0.78em', marginBottom: '0.25em' }, SURFACE.dim) }, tt('edit.localPort')),
                  h('input', {
                    style: inputStyle, inputMode: 'numeric', value: editing.localPort ?? '',
                    placeholder: tt('edit.localPortPlaceholder'),
                    onChange: (event) => setEditing(Object.assign({}, editing, { localPort: event.target.value })),
                  }),
                ),
              ),
              h('div', { style: { marginTop: '0.7em' } },
                h('div', {
                  title: tt('edit.tokenHint'),
                  style: Object.assign({ fontSize: '0.78em', marginBottom: '0.25em', cursor: 'help' }, SURFACE.dim),
                }, tt('edit.token')),
                h('input', {
                  style: inputStyle, value: editing.token || '', placeholder: tt('edit.tokenPlaceholder'),
                  onChange: (event) => setEditing(Object.assign({}, editing, { token: event.target.value })),
                }),
              ),
              h('div', { style: { marginTop: '0.7em' } },
                h('div', { style: Object.assign({ fontSize: '0.78em', marginBottom: '0.25em' }, SURFACE.dim) }, tt('edit.startCommand')),
                h('input', {
                  style: inputStyle, value: editing.startCommand || '', placeholder: tt('edit.startCommandPlaceholder'),
                  onChange: (event) => setEditing(Object.assign({}, editing, { startCommand: event.target.value })),
                }),
                h('div', { style: Object.assign({ fontSize: '0.74em', marginTop: '0.25em' }, SURFACE.dim) }, tt('edit.startCommandHint')),
              ),
              editError ? h('div', { style: { fontSize: '0.78em', color: '#e5484d', marginTop: '0.7em' } }, editError) : null,
              h('div', { style: { display: 'flex', alignItems: 'center', gap: '0.5em', marginTop: '1.1em' } },
                textButton(tt('action.save'), () => {
                  const remotePort = Number(editing.remotePort || 3000)
                  if (!Number.isInteger(remotePort) || remotePort < 1 || remotePort > 65535) {
                    setEditError(tt('edit.badPort')); return
                  }
                  const localPort = editing.localPort ? Number(editing.localPort) : undefined
                  if (localPort !== undefined && (!Number.isInteger(localPort) || localPort < 1024 || localPort > 65535)) {
                    setEditError(tt('edit.badLocalPort')); return
                  }
                  setEditError(null)
                  const entry = Object.assign({}, editing, {
                    command: undefined,
                    remotePort,
                    localPort,
                    token: editing.token || undefined,
                    startCommand: editing.startCommand ? String(editing.startCommand).trim() : undefined,
                  })
                  save(hosts.map((item) => (item.name === entry.name ? entry : item))).then(() => setEditing(null))
                }, { style: { borderColor: 'var(--dsh-accent, #4c8dff)', color: 'var(--dsh-accent, #4c8dff)' } }),
                textButton(
                  aiHint && aiHint.kind === 'copied' ? tt('action.aiCopied') : tt('action.ai'),
                  () => {
                    const text = prepPrompt(target)
                    const ok = () => setAiHint({ kind: 'copied', text })
                    const fail = () => setAiHint({ kind: 'manual', text })
                    try {
                      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(ok, fail)
                      else fail()
                    } catch { fail() }
                  },
                ),
                h('div', { style: { flex: 1 } }),
                textButton(tt('action.cancel'), () => { setEditing(null); setAiHint(null) }),
              ),
              aiHint ? h('div', { style: { marginTop: '0.8em', fontSize: '0.8em' } },
                aiHint.kind === 'copied'
                  ? h('div', { style: { color: '#30a46c', lineHeight: 1.5 } }, tt('notice.copied'))
                  : h('div', null,
                      h('div', { style: { color: '#e5484d', marginBottom: '0.4em' } }, tt('notice.copyFailed')),
                      h('textarea', {
                        readOnly: true, value: aiHint.text, rows: 6,
                        onFocus: (event) => event.target.select(),
                        style: Object.assign({}, inputStyle, { resize: 'vertical', fontFamily: 'ui-monospace, monospace', fontSize: '0.78em' }),
                      }),
                    ),
              ) : null,
            ),
          )
        }

        function add(alias) {
          const problem = (message) => setAdding(Object.assign({}, adding, { formError: message, formNotice: null }))
          if (!alias) { problem(tt('modal.needAlias')); return }
          if (!/^[A-Za-z0-9._@:-]+$/.test(alias)) { problem(tt('modal.badAlias')); return }
          setAdding(null)
          if (hosts.some((item) => (item.alias || item.target || item.name) === alias)) {
            setError(`${alias} · ${tt('modal.duplicate')}`)
            return
          }
          save(hosts.concat({ name: alias, alias }))
        }
      }

      return Panel
    }

    /* ------------------------------------------------------------- settings */

    function createSettings(ctx, t) {
      function SettingsPage(props) {
        const tt = useLocale(ctx, t)
        const [draft, setDraft] = React.useState(null)
        const [saved, setSaved] = React.useState(false)
        const [error, setError] = React.useState(null)

        React.useEffect(() => {
          api('/settings').then((data) => setDraft(data.settings || {})).catch((problem) => setError(problem.message))
        }, [])

        if (error) return h('div', { style: { padding: '1.2em', color: '#e5484d', fontSize: '0.86em' } }, error)
        if (!draft) return h('div', { style: { padding: '1.2em', fontSize: '0.86em', opacity: 0.55 } }, tt('state.loading'))

        const field = (label, control, hint) => h('label', { style: { display: 'block', marginBottom: '1em' } },
          h('div', { style: { fontSize: '0.82em', marginBottom: '0.3em' } }, label),
          control,
          hint ? h('div', { style: Object.assign({ fontSize: '0.74em', marginTop: '0.25em' }, SURFACE.dim) }, hint) : null,
        )

        return h('div', { style: { padding: (props && props.inline) ? '1em 1.2em' : '1.618em 1.8em', maxWidth: (props && props.inline) ? 'none' : '40em', lineHeight: 1.55 } },
          field(tt('settings.path'), h('input', {
            style: inputStyle, value: draft.sshConfigPath || '', placeholder: '~/.ssh/config',
            onChange: (event) => { setSaved(false); setDraft(Object.assign({}, draft, { sshConfigPath: event.target.value })) },
          }), tt('settings.pathHint')),
          h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1em' } },
            field(tt('settings.port'), h('input', {
              style: inputStyle, value: draft.defaultRemotePort ?? '', inputMode: 'numeric',
              onChange: (event) => { setSaved(false); setDraft(Object.assign({}, draft, { defaultRemotePort: event.target.value })) },
            })),
          ),
          h('label', { style: { display: 'flex', alignItems: 'center', gap: '0.5em', marginBottom: '0.4em', fontSize: '0.82em' } },
            h('input', {
              type: 'checkbox', checked: draft.autoStart === true,
              onChange: (event) => { setSaved(false); setDraft(Object.assign({}, draft, { autoStart: event.target.checked })) },
            }),
            tt('settings.autoStart'),
          ),
          h('div', { style: Object.assign({ fontSize: '0.74em', marginBottom: '1.2em' }, SURFACE.dim) }, tt('settings.autoStartHint')),
          h('label', { style: { display: 'flex', alignItems: 'center', gap: '0.5em', marginBottom: '0.4em', fontSize: '0.82em' } },
            h('input', {
              type: 'checkbox', checked: draft.stopRemoteOnDisconnect === true,
              onChange: (event) => { setSaved(false); setDraft(Object.assign({}, draft, { stopRemoteOnDisconnect: event.target.checked })) },
            }),
            tt('settings.stopRemote'),
          ),
          h('div', { style: Object.assign({ fontSize: '0.74em', marginBottom: '1.2em' }, SURFACE.dim) }, tt('settings.stopRemoteHint')),
          h('div', { style: Object.assign({ fontSize: '0.76em', marginBottom: '1.2em' }, SURFACE.dim) }, tt('settings.hint')),
          h('div', { style: { display: 'flex', gap: '0.5em', alignItems: 'center' } },
            textButton(tt('action.save'), () => api('/settings', { method: 'POST', body: JSON.stringify(draft) })
              .then(() => setSaved(true))
              .catch((problem) => setError(problem.message)), { style: { borderColor: 'var(--dsh-accent, #4c8dff)', color: 'var(--dsh-accent, #4c8dff)' } }),
            saved ? h('span', { style: { fontSize: '0.78em', color: '#30a46c' } }, '✓') : null,
          ),
        )
      }
      return SettingsPage
    }

    return {
      inject: ['slots', 'locale'],
      apply(ctx) {
        // A throw here runs during Client boot and blanks the whole page, so every
        // step is isolated: a rejected locale id or an undeclared slot must degrade
        // this plugin to a no-op instead of taking the app down.
        const safe = (label, fn) => {
          try { return fn() } catch (error) {
            try { console.warn('[remote-ssh] ' + label + ' failed:', error) } catch {}
            return undefined
          }
        }

        // Everything registered below is released on unmount. This matters for the
        // locale dictionaries: a duplicate (namespace, locale) registration is
        // rejected, so a leaked registration would keep serving the previous
        // build's strings while the components themselves were already updated.
        ctx.effect(() => {
          const disposers = []
          const track = (label, fn) => {
            const disposer = safe(label, fn)
            if (typeof disposer === 'function') disposers.push(disposer)
            return disposer
          }

          track('locale:en', () => ctx.locale.register('remote-ssh', 'en', DICT.en))
          track('locale:zh', () => ctx.locale.register('remote-ssh', 'zh', DICT.zh))
          const bound = safe('locale:bind', () => ctx.locale.bind('remote-ssh'))
          const t = typeof bound === 'function'
            ? bound
            : (key) => DICT.zh[key] || DICT.en[key] || key

          const SettingsPage = createSettings(ctx, t)
          const Panel = createPanel(ctx, t, SettingsPage)

          track('slot:sidebar.panellist', () => ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
            name: 'sidebar.panellist', id: 'remote-ssh', order: 20,
            label: () => t('panel.title'),
          }, function HostsIcon() {
            return h('svg', { viewBox: '0 0 24 24', width: 18, height: 18, fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, 'aria-hidden': true, style: { display: 'block' } },
              h('rect', { x: 3, y: 8, width: 18, height: 11, rx: 2.5 }),
              h('path', { d: 'M8 15a4 4 0 0 1 8 0' }),
              h('circle', { cx: 12, cy: 17.4, r: 0.8, fill: 'currentColor', stroke: 'none' }),
            )
          })))

          track('slot:main', () => ctx.slots.inject('main', () => ctx.slots.register({ name: 'main', key: 'remote-ssh' }, wrap(Panel))))

          track('slot:settings.plugins.tab', () => ctx.slots.inject('settings.plugins.tab', () => ctx.slots.register({
            name: 'settings.plugins.tab', id: 'remote-ssh-settings', order: 30,
            label: () => t('action.settings'),
          }, wrap(SettingsPage))))

          return () => {
            for (const dispose of disposers.splice(0)) safe('dispose', () => dispose())
          }
        })
      },
    }
   } catch (error) {
    try { console.warn('[remote-ssh] factory failed, plugin inert:', error) } catch {}
    return { inject: [], apply() {} }
   }
  },
})
