// dsh-quota-dashboard v1.0.5 — 通用多平台 API 额度/余额实时监视器（Client 半端）
// Web shell module-loader 形态。侧边栏底部（设置按钮上方 sidebar.footer.action）状态圆点按钮 +
// 多平台额度/余额面板（终端风格，跟随 DSH 明暗主题）+ 可交互设置（Provider / Base URL / API Key / 刷新间隔）。
// DeepSeek 标题实时显示峰/谷时段倒计时。数据通过同源 POST '/dsh-quota-dashboard/query' 从 Host 路由获取（Key 不进 URL、不落浏览器）。
window.__ModuleLoader__.load({
  id: 'dsh-quota-dashboard',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports
    const React = require('react')

    const CSS = `
      @keyframes qd-breathe {
        0%, 100% { opacity: .28; transform: scale(.7); }
        50% { opacity: 1; transform: scale(1); }
      }
      .qd-root { display:inline-flex; position:relative; }
      .qd-trigger { height:32px; cursor:pointer; background:none; border:none; border-radius:8px; flex:none; align-items:center; justify-content:center; display:flex; gap:6px; padding:0 10px; color:var(--dsw-alias-label-secondary, #ccc); }
      .qd-trigger:hover { background:var(--dsw-alias-interactive-bg-hover, rgba(128,128,128,.18)); }
      .qd-trigger-label { font-size:12px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:150px; }
      .qd-dot { width:8px; height:8px; border-radius:50%; animation:qd-breathe 3.6s ease-in-out infinite; box-shadow:0 0 6px currentColor; flex:none; }
      .qd-dot-idle { background:var(--dsw-alias-label-tertiary, #888); color:var(--dsw-alias-label-tertiary, #888); animation:none; opacity:.5; }
      .qd-dot-ok { background:var(--dsw-alias-state-success-primary, #3fb950); color:var(--dsw-alias-state-success-primary, #3fb950); }
      .qd-dot-warn { background:var(--dsw-alias-state-warn-primary, #d29922); color:var(--dsw-alias-state-warn-primary, #d29922); }
      .qd-dot-low { background:var(--dsw-alias-state-error-primary, #f66); color:var(--dsw-alias-state-error-primary, #f66); }
      .qd-dot-err { background:var(--dsw-alias-state-error-primary, #f66); color:var(--dsw-alias-state-error-primary, #f66); animation:none; }
      /* 面板几何与布局。注意：这里不重定义 --dsw-alias-* 令牌（原实现把它们钉成固定浅色，
         导致文字色不随 DSH 明暗翻转）；令牌从 body 继承、随 data-ds-dark-theme 翻转。
         背景/边框/圆角/阴影由 TERMINAL_CSS 的终端风格规则接管（!important）。 */
      .qd-panel {
        z-index:1000; box-sizing:border-box; width:360px; max-width:360px; max-height:760px;
        padding:12px; overflow:hidden;
        font-size:12px; line-height:20px; position:fixed; left:16px; bottom:64px;
        display:flex; flex-direction:column; gap:8px;
        color:var(--dsw-alias-label-primary, #eaeaea);
      }
      .qd-header { display:flex; align-items:center; gap:6px; flex:none; }
      .qd-headline { color:var(--dsw-alias-label-secondary, #c6c6c6); }
      .qd-percent { color:var(--dsw-alias-label-primary, #f2f2f2); font-weight:500; }
      .qd-scroll { overflow-y:auto; flex:1 1 auto; min-height:0; display:flex; flex-direction:column; gap:8px; padding-right:2px; }
      .qd-card { display:flex; flex-direction:column; gap:6px; border:1px solid rgba(255,255,255,.14); border-radius:12px; padding:8px 10px; background:rgba(255,255,255,.05); }
      .qd-cardHead { display:flex; align-items:center; gap:6px; }
      .qd-cardName { font-weight:600; color:var(--dsw-alias-label-primary, #f2f2f2); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
      .qd-badge { font-size:10px; padding:0 6px; border-radius:999px; border:1px solid rgba(255,255,255,.22); color:var(--dsw-alias-label-secondary, #c6c6c6); flex:none; }
      .qd-amount { font-size:16px; font-weight:700; font-variant-numeric:tabular-nums; color:var(--dsw-alias-label-primary, #f2f2f2); }
      .qd-amtCur { font-size:11px; font-weight:500; color:var(--dsw-alias-label-secondary, #c6c6c6); margin-left:2px; }
      .qd-cardErr { color:var(--dsw-alias-state-error-primary, #f66); font-size:11px; word-break:break-all; }
      .qd-rows { display:flex; flex-direction:column; gap:2px; }
      .qd-row { display:flex; align-items:baseline; gap:6px; font-size:11px; }
      .qd-rowLabel { color:var(--dsw-alias-label-secondary, #cfcfcf); min-width:48px; }
      .qd-rowVal { font-variant-numeric:tabular-nums; color:var(--dsw-alias-label-primary, #e6e6e6); }
      .qd-group { display:flex; flex-direction:column; gap:6px; }
      .qd-groupTitle { font-size:11px; font-weight:600; letter-spacing:.4px; text-transform:uppercase; color:var(--dsw-alias-label-secondary, #c6c6c6); border-bottom:1px solid rgba(255,255,255,.14); padding-bottom:3px; }
      .qd-win { display:flex; flex-direction:column; gap:3px; }
      .qd-winTop { display:flex; align-items:baseline; gap:8px; }
      .qd-winLabel { color:var(--dsw-alias-label-primary, #f2f2f2); font-weight:500; min-width:60px; }
      .qd-winMeta { font-variant-numeric:tabular-nums; color:var(--dsw-alias-label-secondary, #cfcfcf); }
      .qd-winReset { color:var(--dsw-alias-label-tertiary, #b0b0b0); font-size:11px; margin-left:auto; }
      .qd-bar { background:rgba(255,255,255,.22); border-radius:999px; height:5px; overflow:hidden; }
      .qd-segment { border-radius:1px; height:100%; }
      .qd-ctrl { display:flex; gap:6px; flex-wrap:wrap; align-items:center; flex:none; }
      .qd-btn { cursor:pointer; background:rgba(255,255,255,.14); border:1px solid rgba(255,255,255,.26); color:var(--dsw-alias-label-primary, #f2f2f2); border-radius:8px; padding:1px 8px; font-size:12px; }
      .qd-btn:hover { border-color:var(--dsw-alias-brand-primary, #5b9dff); background:rgba(255,255,255,.20); }
      .qd-btn:disabled { opacity:.5; cursor:default; }
      .qd-btn-primary { border-color:var(--dsw-alias-brand-primary, #5b9dff); background:rgba(91,157,255,.16); }
      .qd-btn-danger:hover { border-color:var(--dsw-alias-state-error-primary, #f66); background:rgba(255,102,102,.14); }
      .qd-err { color:var(--dsw-alias-state-error-primary, #f66); }
      .qd-meta { opacity:.9; }
      .qd-footer { opacity:.75; font-size:11px; flex:none; }
      .qd-raw { max-height:160px; overflow:auto; font-size:10px; background:rgba(0,0,0,.35); border:1px solid rgba(255,255,255,.16); border-radius:8px; padding:6px; white-space:pre-wrap; word-break:break-all; margin:0; }
      .qd-settings { display:flex; flex-direction:column; gap:7px; border:1px solid rgba(255,255,255,.16); border-radius:12px; padding:8px 10px; }
      .qd-field { display:flex; flex-direction:column; gap:3px; }
      .qd-fieldRow { display:flex; align-items:center; gap:6px; flex-wrap:wrap; }
      .qd-label { color:var(--dsw-alias-label-secondary, #cfcfcf); min-width:64px; font-size:11px; }
      .qd-input { flex:1 1 120px; min-width:0; box-sizing:border-box; background:rgba(0,0,0,.28); border:1px solid rgba(255,255,255,.22); border-radius:8px; color:var(--dsw-alias-label-primary, #f2f2f2); padding:3px 8px; font-size:12px; }
      .qd-input:focus { outline:none; border-color:var(--dsw-alias-brand-primary, #5b9dff); }
      .qd-input::placeholder { color:var(--dsw-alias-label-tertiary, #9a9a9a); }
      .qd-select { box-sizing:border-box; background:rgba(0,0,0,.28); border:1px solid rgba(255,255,255,.22); border-radius:8px; color:var(--dsw-alias-label-primary, #f2f2f2); padding:2px 6px; font-size:12px; max-width:100%; }
      .qd-checkrow { display:flex; align-items:center; gap:5px; font-size:11px; color:var(--dsw-alias-label-secondary, #cfcfcf); }
      .qd-chip { font-size:10px; padding:0 6px; border-radius:999px; border:1px solid rgba(255,255,255,.22); color:var(--dsw-alias-label-secondary, #c6c6c6); display:inline-flex; align-items:center; gap:4px; }
      .qd-chip-ready { border-color:color-mix(in srgb, var(--dsw-alias-brand-primary, #5b9dff) 45%, transparent); background:rgba(91,157,255,.10); }
      .qd-chip .qd-btn { padding:0 4px; font-size:10px; }
      .qd-chipWrap { display:flex; gap:4px; flex-wrap:wrap; }
      .qd-tip { font-size:11px; color:var(--dsw-alias-label-tertiary, #b0b0b0); }
      .qd-spin { display:inline-block; width:10px; height:10px; border-radius:50%; border:2px solid rgba(255,255,255,.3); border-top-color:var(--dsw-alias-brand-primary, #5b9dff); animation:qd-spin .8s linear infinite; }
      @keyframes qd-spin { to { transform:rotate(360deg); } }
    `

    // ---------------------------------------------------------------------------
    // 任务1：CSS 终端化净化 —— 追加到上面 <style> 块，强制抹除毛玻璃/圆角/渐变/过渡，
    // 改为冷峻线框终端风格。选择器改用本插件真实的 .qd-* 命名（原草案里的
    // .dsh-quota-card / .dsh-quota-panel 等在本插件中不存在）。
    // ---------------------------------------------------------------------------
    const TERMINAL_CSS = `
      /* 全局字体：面板内所有文字统一用系统中英文字体（随系统 CJK/Latin 字体），
         不再用等宽或衬线。数字用 tabular-nums 防跳动。 */
      .qd-root, .qd-root * {
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', 'Helvetica Neue', Arial, sans-serif !important;
      }
      /* 终端化：去过渡动画 / 毛玻璃 / 阴影 / 开关闭动画（面板即时出现与消失） */
      .qd-root *, .qd-root *::before, .qd-root *::after {
        transition: none !important;
        animation: none !important;
        backdrop-filter: none !important;
        -webkit-backdrop-filter: none !important;
        box-shadow: none !important;
      }
      /* 面板底色：随 DSH 明暗翻转（镜像 DSH 的 body[data-ds-dark-theme] 写法）。
         关键：不能用 --dsw-static-*（它只在 body 上定义一次、不随明暗翻转），
         否则面板会被锁死在深色。改用「属性条件」：深色=950/900，浅色=白/浅灰。 */
      .qd-panel {
        border-radius: 8px !important;
        background: #ffffff !important;
        background-image: none !important;
        border: 1px solid var(--dsw-alias-border-l2, #d5dae0) !important;
      }
      body[data-ds-dark-theme] .qd-panel { background: #151517 !important; }
      /* 卡片 / 设置 / 卡头：比面板浅一层，形成层次（同样随明暗翻转） */
      .qd-card, .qd-settings, .qd-cardHead {
        border-radius: 6px !important;
        background: #f6f7f9 !important;
        background-image: none !important;
        border: 1px solid var(--dsw-alias-border-l2, #d5dae0) !important;
      }
      body[data-ds-dark-theme] .qd-card,
      body[data-ds-dark-theme] .qd-settings,
      body[data-ds-dark-theme] .qd-cardHead { background: #1b1b1c !important; }
      /* 按钮：随明暗翻转（用 --dsw-alias-interactive-bg 自动跟随） */
      .qd-btn {
        background: var(--dsw-alias-interactive-bg, rgba(0,0,0,.05)) !important;
        background-image: none !important;
        border: 1px solid var(--dsw-alias-border-l2, #d5dae0) !important;
        border-radius: 6px !important;
      }
      .qd-btn:hover { background: var(--dsw-alias-interactive-bg-hover, rgba(0,0,0,.10)) !important; }
      .qd-btn-primary { border-color: var(--dsw-alias-brand-primary, #5b9dff) !important; }
      /* 间距：卡片内控件与边框拉开；按钮内图标与文字间距 */
      .qd-card { padding: 10px 12px !important; gap: 8px !important; }
      .qd-settings { padding: 10px 12px !important; }
      /* 卡头：圆点离左边框远一点（明显拉开），其余（标题/徽标/数值）保持紧凑 */
      .qd-cardHead { gap: 6px !important; }
      .qd-cardHead .qd-dot { margin-left: 8px !important; margin-right: 2px !important; }
      .qd-btn { padding: 4px 12px !important; display: inline-flex !important; align-items: center !important; gap: 6px !important; font-size: 12px !important; }
      .qd-ico { display: inline-flex !important; align-items: center !important; justify-content: center !important; width: 14px !important; flex: none !important; font-size: 13px !important; line-height: 1 !important; }
      .qd-ctrl { gap: 8px !important; }
      /* 输入 / 下拉：随明暗翻转 */
      .qd-input, .qd-select {
        background: #f6f7f9 !important;
        border: 1px solid var(--dsw-alias-border-l2, #d5dae0) !important;
        border-radius: 6px !important;
        color: var(--dsw-alias-label-primary, #1f2328) !important;
      }
      body[data-ds-dark-theme] .qd-input,
      body[data-ds-dark-theme] .qd-select { background: #1b1b1c !important; }
      /* 面板内文字/边框/状态色：强制跟随 DSH 当前别名令牌（随 DSH 明暗切换）。
         关键：用 !important 的 var(别名令牌) 覆盖面板自带的「固定浅色」声明——
         普通 var() 兜底打不过直接声明，所以之前 DSH 切浅色下面板文字不跟着变。
         别名令牌在 body 上随 data-ds-dark-theme 翻转，继承进来即 DSH 当前值。 */
      .qd-panel { color: var(--dsw-alias-label-primary) !important; }
      .qd-panel .qd-headline, .qd-panel .qd-winMeta, .qd-panel .qd-winReset,
      .qd-panel .qd-tip, .qd-panel .qd-badge, .qd-panel .qd-rowLabel,
      .qd-panel .qd-footer, .qd-panel .qd-colorLabel, .qd-panel .qd-label,
      .qd-panel .qd-checkrow, .qd-panel .qd-winLabel { color: var(--dsw-alias-label-secondary) !important; }
      .qd-panel .qd-winReset, .qd-panel .qd-tip, .qd-panel .qd-footer { color: var(--dsw-alias-label-tertiary) !important; }
      .qd-panel .qd-cardName, .qd-panel .qd-amount, .qd-panel .qd-percent,
      .qd-panel .qd-rowVal, .qd-panel .qd-winLabel { color: var(--dsw-alias-label-primary) !important; }
      /* 进度条：轨道用主题边框色 */
      .qd-bar { background: var(--dsw-alias-border-l2) !important; border-radius: 4px !important; }
      .qd-segment { border-radius: 4px !important; }
      /* 状态圆点 / 状态色随主题 */
      .qd-dot-ok { background: var(--dsw-alias-state-success-primary) !important; color: var(--dsw-alias-state-success-primary) !important; }
      .qd-dot-warn { background: var(--dsw-alias-state-warn-primary) !important; color: var(--dsw-alias-state-warn-primary) !important; }
      .qd-dot-low, .qd-dot-err { background: var(--dsw-alias-state-error-primary) !important; color: var(--dsw-alias-state-error-primary) !important; }
      .qd-dot-idle { background: var(--dsw-alias-label-tertiary) !important; color: var(--dsw-alias-label-tertiary) !important; }
      .qd-err, .qd-panel .qd-cardErr { color: var(--dsw-alias-state-error-primary) !important; }
      /* 原始 JSON 块（随明暗翻转） */
      .qd-raw { background: #f6f7f9 !important; color: var(--dsw-alias-label-primary) !important; border-radius: 6px !important; }
      body[data-ds-dark-theme] .qd-raw { background: #1b1b1c !important; }
      /* DeepSeek 峰谷倒计时：与标题同字号/字重（继承 .qd-cardName），数字等宽防跳动。
         颜色：峰=正红，谷=绿。用 .qd-panel .qd-cardName .qd-peak-* 前缀压过
         通用 .qd-panel .qd-cardName 文字色规则（PeakCountdown 是 cardName 的子元素）。 */
      .qd-peak { font-variant-numeric: tabular-nums; letter-spacing: .01em; white-space: nowrap; }
      .qd-panel .qd-cardName .qd-peak-peak { color: #ff2d2d !important; }
      .qd-panel .qd-cardName .qd-peak-valley { color: #3fb950 !important; }
    `

    const CFG_KEY = 'dsh-quota-dashboard-cfg'

    // 配置持久化（不含密钥；密钥保存在 Host 本机状态文件）
    function loadCfg() {
      try {
        const s = JSON.parse(window.localStorage.getItem(CFG_KEY) || '{}')
        return {
          enabled: Array.isArray(s.enabled) ? s.enabled.filter((e) => e && typeof e.id === 'string') : [],
          intervalMs: [0, 30000, 60000, 120000, 300000].indexOf(s.intervalMs) >= 0 ? s.intervalMs : 120000,
        }
      } catch (e) { return { enabled: [], intervalMs: 120000 } }
    }
    function saveCfg(cfg) {
      // 双写：localStorage（快，同浏览器）+ 服务端落盘（跨浏览器/重启/清数据兜底，不含密钥）
      try { window.localStorage.setItem(CFG_KEY, JSON.stringify({ enabled: cfg.enabled, intervalMs: cfg.intervalMs })) } catch (e) { /* ignore */ }
      apiPost('/dsh-quota-dashboard/client-cfg', { enabled: cfg.enabled, intervalMs: cfg.intervalMs }).then((res) => {
        // 服务端回包更权威（校验/裁剪过），回写 localStorage 保持一致
        if (res && res.ok && res.cfg) {
          try { window.localStorage.setItem(CFG_KEY, JSON.stringify(res.cfg)) } catch (e) { /* ignore */ }
        }
      })
    }
    function fetchServerCfg() {
      return apiGet('/dsh-quota-dashboard/client-cfg').then((res) => {
        if (res && res.ok && res.cfg) {
          return {
            enabled: Array.isArray(res.cfg.enabled) ? res.cfg.enabled.filter((e) => e && typeof e.id === 'string') : [],
            intervalMs: [0, 30000, 60000, 120000, 300000].indexOf(res.cfg.intervalMs) >= 0 ? res.cfg.intervalMs : 120000,
          }
        }
        return null
      }).catch(() => null)
    }

    function apiGet(path) {
      return fetch(path, { cache: 'no-store' }).then((r) => {
        const ct = r.headers.get('content-type') || ''
        if (!ct.includes('application/json')) return { ok: false, error: 'Host 路由未加载（' + path + '），请重启 dsh web 进程' }
        return r.json()
      }).catch((e) => ({ ok: false, error: String((e && e.message) || e) }))
    }
    function apiPost(path, body) {
      return fetch(path, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body || {}),
        cache: 'no-store',
      }).then((r) => r.json().catch(() => ({ ok: false, error: '响应不是 JSON' })))
        .catch((e) => ({ ok: false, error: String((e && e.message) || e) }))
    }

    function fmtMoney(v, cur) {
      const n = Number(v)
      if (v === null || v === undefined || !Number.isFinite(n)) return '—'
      const s = n.toFixed(2).replace(/\.?0+$/, '')
      const C = String(cur || '').toUpperCase()
      if (C === 'CNY') return '¥' + s
      if (C === 'USD') return '$' + s
      return s + ' ' + (cur || '')
    }
    function fmtNum(n) {
      if (n === null || n === undefined || Number.isNaN(Number(n))) return '—'
      const v = Number(n)
      if (Math.abs(v) >= 1000000) return (v / 1000000).toFixed(2) + 'M'
      if (Math.abs(v) >= 1000) return (v / 1000).toFixed(1) + 'k'
      return String(Math.round(v * 100) / 100)
    }
    function fmtReset(iso) {
      if (!iso) return null
      const d = new Date(iso)
      if (Number.isNaN(d.getTime())) return null
      const p = (x) => String(x).padStart(2, '0')
      return p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes())
    }
    function stateOf(remPct) {
      if (remPct === null || remPct === undefined) return 'idle'
      if (remPct > 50) return 'ok'
      if (remPct > 20) return 'warn'
      return 'low'
    }
    // 一组额度窗口的最低剩余百分比（0-100），无数据返回 null
    function worstRem(windows) {
      const list = (windows || [])
        .map((w) => {
          if (w && w.credits) return null // 账户余额(credits 池)不计入用量窗口最低剩余
          if (w && typeof w.percent === 'number') {
            const rem = (w.status && w.status !== 'ok') ? 0 : Math.max(0, Math.min(100, 100 - w.percent))
            return { pct: rem }
          }
          if (w && typeof w.limit === 'number' && w.limit > 0 && typeof w.used === 'number') {
            return { pct: Math.max(0, Math.min(100, ((w.limit - Math.max(0, w.used)) / w.limit) * 100)) }
          }
          return null
        })
        .filter((x) => x !== null)
      if (!list.length) return null
      return list.reduce((a, b) => (b.pct < a.pct ? b : a)).pct
    }
    // 余额是否有可用数据
    function hasAmount(card) {
      return card && card.amount !== null && card.amount !== undefined && Number.isFinite(Number(card.amount))
    }

    function Ring({ pct, state, title }) {
      const R = 7, C = 2 * Math.PI * R
      const color = state === 'ok' ? 'var(--dsw-alias-state-success-primary, #3fb950)'
        : state === 'warn' ? 'var(--dsw-alias-state-warn-primary, #d29922)'
        : state === 'low' || state === 'err' ? 'var(--dsw-alias-state-error-primary, #f66)'
        : 'var(--dsw-alias-label-tertiary, #888)'
      const frac = pct === null ? 0 : Math.max(0, Math.min(100, Number(pct))) / 100
      return React.createElement('svg', { width: 18, height: 18, viewBox: '0 0 18 18', flex: 'none', title, 'aria-hidden': true },
        React.createElement('circle', { cx: 9, cy: 9, r: R, fill: 'none', stroke: 'rgba(128,128,128,.28)', strokeWidth: 2.5 }),
        React.createElement('circle', { cx: 9, cy: 9, r: R, fill: 'none', stroke: color, strokeWidth: 2.5, strokeLinecap: 'round', strokeDasharray: (frac * C).toFixed(2) + ' ' + C.toFixed(2), transform: 'rotate(-90 9 9)' }),
      )
    }

    // 单个额度窗口行（进度条，已用量语义，从左往右填充）；余额不在此渲染（分开用 balanceRows 行展示）
    function renderWinRow(w, keyPrefix) {
      const usedPct = typeof w.percent === 'number' ? Math.min(100, Math.max(0, w.percent)) : (w.limit > 0 ? Math.min(100, Math.max(0, (w.used / w.limit) * 100)) : 0)
      // 颜色按「已用比例」：少=绿(<50%) → 多=橙(50~80%) → 快用完=红(≥80%)
      const wColor = usedPct >= 80 ? 'var(--dsw-alias-state-error-primary, #f66)'
        : usedPct >= 50 ? 'var(--dsw-alias-state-warn-primary, #d29922)'
        : 'var(--dsw-alias-state-success-primary, #3fb950)'
      const reset = fmtReset(w.resetAt)
      const meta = typeof w.percent === 'number'
        ? '已用 ' + Math.round(usedPct) + '% · 剩余 ' + Math.round(100 - Math.min(100, usedPct)) + '%'
        : '已用 ' + fmtNum(w.used) + ' / ' + fmtNum(w.limit) + ' · 剩余 ' + fmtNum(Math.max(0, w.limit - w.used))
      // 进度条从左往右：条长 = 已用%，左侧为已用、右侧为待用（与官方一致）
      const barWidth = Math.max(0, Math.min(100, usedPct))
      return React.createElement('div', { className: 'qd-win', key: keyPrefix + (w.label || '') + (w.resetAt || '') + (w.percent !== undefined ? w.percent : (w.used || '')) },
        React.createElement('div', { className: 'qd-winTop' },
          React.createElement('span', { className: 'qd-winLabel', title: w.label }, w.label),
          React.createElement('span', { className: 'qd-winMeta' }, meta),
          React.createElement('span', { className: 'qd-winReset' }, reset ? '重置 ' + reset : '滚动窗口'),
        ),
        React.createElement('div', { className: 'qd-bar' },
          React.createElement('div', { className: 'qd-segment', style: { width: barWidth + '%', background: wColor } })),
      )
    }

    // 余额明细行
    function renderBalanceRows(card) {
      if (!card || !card.balanceRows || !card.balanceRows.length) return null
      return React.createElement('div', { className: 'qd-rows' },
        card.balanceRows.map((row, i) => React.createElement('div', { className: 'qd-row', key: i },
          React.createElement('span', { className: 'qd-rowLabel' }, row.label),
          React.createElement('span', { className: 'qd-rowVal' }, fmtMoney(row.value, row.currency)),
        )))
    }

    // 单平台卡片
    function renderCard(card, id, providerMeta, rawOpen) {
      const meta = providerMeta || {}
      const name = card && card.name ? card.name : meta.name || id
      const state = cardState(card)
      const dotCls = 'qd-dot qd-dot-' + state
      const badge = card && card.kind === 'balance' ? '余额'
        : card && card.kind === 'usage' ? '额度'
        : meta.kind === 'usage' ? '额度' : '余额'
      // 主标题数值
      let headline = '—'
      if (card && card.ok) {
        if (card.kind === 'balance' && hasAmount(card)) headline = fmtMoney(card.amount, card.currency)
        else if (card.kind === 'usage') {
          const rem = worstRem(card.windows)
          if (rem !== null) headline = '剩 ' + Math.round(rem) + '%'
          else if (hasAmount(card)) headline = '近30天 ' + fmtMoney(card.amount, card.currency)
        } else if (hasAmount(card)) headline = fmtMoney(card.amount, card.currency)
      } else if (card && card.needKey) headline = '未配置 Key'
      const titleHint = (card && card.source) ? card.source : (meta.docsUrl || name)

      return React.createElement('div', { className: 'qd-card', key: id },
        React.createElement('div', { className: 'qd-cardHead' },
          React.createElement('span', { className: dotCls, title: stateToText(state) }),
          id === 'deepseek'
            ? React.createElement('span', { className: 'qd-cardName', title: titleHint }, name, ' ',
                React.createElement(PeakCountdown))
            : React.createElement('span', { className: 'qd-cardName', title: titleHint }, name),
          React.createElement('span', { className: 'qd-badge' }, badge),
          (card && card.ok && card.kind === 'usage' && card.windows && card.windows.length > 0
            ? React.createElement('span', { className: 'qd-amount', style: { fontSize: 13 } }, headline)
            : card && card.ok && (card.kind === 'balance' || hasAmount(card))
              ? React.createElement('span', { className: 'qd-amount' }, headline)
              : React.createElement('span', { className: 'qd-tip' }, headline)),
        ),
        !card || !card.ok
          ? (card && card.error ? React.createElement('div', { className: 'qd-cardErr' }, card.error) : React.createElement('div', { className: 'qd-tip' }, '查询中…'))
          : null,
        card && card.ok && card.balanceRows && card.balanceRows.length ? renderBalanceRows(card) : null,
        card && card.ok && card.kind === 'usage' && card.windows && card.windows.length > 0
          ? React.createElement('div', { className: 'qd-group' }, card.windows.map((w) => renderWinRow(w, id + '-')))
          : null,
        rawOpen && card && card.raw ? React.createElement('pre', { className: 'qd-raw', key: id + '-raw' }, card.raw) : null,
      )
    }

    function stateToText(state) {
      return state === 'ok' ? '额度充足' : state === 'warn' ? '额度偏低' : state === 'low' ? '额度紧张' : state === 'err' ? '查询失败' : '待配置'
    }

    // 卡片状态：未配置/出错 → err；usage → 按最低剩余；balance → ok
    function cardState(card) {
      if (!card) return 'idle'
      if (card.needKey) return 'idle'
      if (!card.ok) return 'err'
      if (card.kind === 'usage') return stateOf(worstRem(card.windows))
      return 'ok'
    }

    // ---------------------------------------------------------------------------
    // 任务2：峰谷状态（纯函数）+ 局部每秒倒计时 Hook
    // 规则以 DeepSeek 官方定价页为准（https://api-docs.deepseek.com/zh-cn/quick_start/pricing/）：
    //   高峰时段 = 北京时间 9:00–12:00 与 14:00–18:00；其余为空闲（谷）时段。
    //   空闲时段价格为高峰时段的一半。
    // ---------------------------------------------------------------------------
    // 峰值时段边界（秒，自北京时间 00:00 起）
    const PEAK_WINDOWS = [
      [9 * 3600, 12 * 3600],   // 9:00 - 12:00
      [14 * 3600, 18 * 3600],  // 14:00 - 18:00
    ]
    const DAY_SECS = 86400
    // 判断某秒是否落在任一峰值窗口内
    function inPeakWindow(secs) {
      for (const [s, e] of PEAK_WINDOWS) if (secs >= s && secs < e) return true
      return false
    }
    // 纯函数：输入当前时间（Date 或 ms），返回 { mode, countdown }
    //   mode: 'peak' | 'valley'
    //   countdown: 距下一次峰/谷切换的秒数（≥0）
    function getPeakStatus(now) {
      const t = (now instanceof Date) ? now.getTime() : now
      const d = new Date(t + 8 * 3600 * 1000) // UTC+8 北京时间的本地时钟
      const secs = d.getUTCHours() * 3600 + d.getUTCMinutes() * 60 + d.getUTCSeconds()
      const isPeak = inPeakWindow(secs)
      // 距下一个切换点的秒数：找所有峰窗口边界中、比当前时间大的最近一个
      const bounds = []
      for (const [s, e] of PEAK_WINDOWS) { bounds.push(s); bounds.push(e) }
      bounds.sort((a, b) => a - b)
      let cd
      if (isPeak) {
        // 当前在峰内 → 下一个切换点是本窗口的 end
        const end = PEAK_WINDOWS.find(([s, e]) => secs >= s && secs < e)[1]
        cd = end - secs
      } else {
        // 当前在谷内 → 下一个切换点是下一个峰窗口的 start（跨日则回到今天 9:00）
        cd = null
        for (const b of bounds) {
          if (b > secs) { if (cd === null || b < cd) cd = b - secs }
        }
        if (cd === null) cd = (DAY_SECS - secs) + bounds[0] // 跨日 → 明天 9:00
      }
      return { mode: isPeak ? 'peak' : 'valley', countdown: cd }
    }
    function fmtCountdown(sec) {
      sec = Math.max(0, sec | 0)
      const h = Math.floor(sec / 3600); const m = Math.floor((sec % 3600) / 60); const s = sec % 60
      const p = (x) => (x < 10 ? '0' + x : '' + x)
      return p(h) + ':' + p(m) + ':' + p(s)
    }
    // 局部倒计时叶子组件：自持每秒 tick，只重渲染这一个 <span>，
    // 不再拖累 QuotaDash 整树（所有卡片）每秒重渲染。父组件只在结果变化时
    // 通过 onModeChange 感知「峰/谷」切换（mode 变化频率极低）。
    // 局部倒计时叶子组件：自持每秒 tick，只重渲染这一个 <span>，
    // 不再拖累 QuotaDash 整树（所有卡片）每秒重渲染。
    function PeakCountdown() {
      const [st, setSt] = React.useState(() => getPeakStatus(new Date()))
      React.useEffect(() => {
        const id = window.setInterval(() => setSt(getPeakStatus(new Date())), 1000)
        return () => window.clearInterval(id)
      }, [])
      return React.createElement('span', { className: 'qd-peak ' + 'qd-peak-' + st.mode },
        '[' + (st.mode === 'valley' ? '谷' : '峰') + '] ' + fmtCountdown(st.countdown))
    }

    function QuotaDash({ wide }) {
      const [open, setOpen] = React.useState(false)
      const [busy, setBusy] = React.useState(false)
      // provider 注册表与密钥状态（来自 /config）
      const [providers, setProviders] = React.useState([])
      const [keysSaved, setKeysSaved] = React.useState({})
      const [envVars, setEnvVars] = React.useState([])
      const [readyProviders, setReadyProviders] = React.useState([])
      const [configError, setConfigError] = React.useState('')
      // 启用清单与刷新间隔（localStorage）
      const [cfg, setCfg] = React.useState(loadCfg)
      // 各 provider 查询结果
      const [results, setResults] = React.useState({})
      const [updatedAt, setUpdatedAt] = React.useState(0)
      // 面板状态
      const [rawOpen, setRawOpen] = React.useState(false)

      const [settingsOpen, setSettingsOpen] = React.useState(false)
      // 设置表单
      const [selProvider, setSelProvider] = React.useState('deepseek')
      const [selBaseUrl, setSelBaseUrl] = React.useState('')
      const [selKey, setSelKey] = React.useState('')
      const [showKey, setShowKey] = React.useState(false)
      const [rememberKey, setRememberKey] = React.useState(true)
      const [testMsg, setTestMsg] = React.useState('')

      const rootRef = React.useRef(null)
      const cfgRef = React.useRef(cfg)
      cfgRef.current = cfg
      const providersRef = React.useRef(providers)
      providersRef.current = providers

      // 同步 documentElement 的 color-scheme 到 DSH 当前明暗——浏览器原生 title 提示框
      // 是 OS 绘制、CSS 改不了，但它跟随 color-scheme，这样提示框底色/文字就跟随明暗统一。
      React.useEffect(() => {
        const syncScheme = () => {
          try {
            const dark = document.body && document.body.hasAttribute('data-ds-dark-theme')
            document.documentElement.style.colorScheme = dark ? 'dark' : 'light'
          } catch (e) { /* ignore */ }
        }
        syncScheme()
        const obs = []
        const cb = () => syncScheme()
        for (const node of [document.body, document.documentElement]) {
          try { const mo = new MutationObserver(cb); mo.observe(node, { attributes: true, attributeFilter: ['data-ds-dark-theme'] }); obs.push(mo) } catch (e) { /* ignore */ }
        }
        return () => { obs.forEach((mo) => mo.disconnect()) }
      }, [])

      // 点击面板外部 / Esc 关闭（即时关闭，无动画）
      React.useEffect(() => {
        if (!open) return
        const close = () => setOpen(false)
        const onDown = (e) => { const el = rootRef.current; if (el && e.target && !el.contains(e.target)) close() }
        const onKey = (e) => { if (e.key === 'Escape') close() }
        document.addEventListener('mousedown', onDown, true)
        document.addEventListener('touchstart', onDown, { capture: true, passive: true })
        document.addEventListener('keydown', onKey, true)
        return () => {
          document.removeEventListener('mousedown', onDown, true)
          document.removeEventListener('touchstart', onDown, true)
          document.removeEventListener('keydown', onKey, true)
        }
      }, [open])

      // 初始化：拉取 provider 注册表 + 密钥状态（/config 成功体无 ok 字段，以 providers 数组判定）
      React.useEffect(() => {
        let cancelled = false
        let timer = null
        const loadConfig = () => {
          apiGet('/dsh-quota-dashboard/config').then((res) => {
            if (cancelled) return
            if (res && Array.isArray(res.providers) && res.providers.length) {
              setProviders(res.providers)
              if (res.keys) { setKeysSaved(res.keys.saved || {}); setEnvVars(res.keys.envVars || []); setReadyProviders(res.keys.ready || []) }
              setConfigError('')
              // 初始平台（若下拉里不存在则跳到第一个）
              setSelProvider((prev) => (res.providers.some((p) => p.id === prev) ? prev : res.providers[0].id))
              setSelBaseUrl((prev) => prev || res.providers[0].defaultBaseUrl || '')
            } else if (!cancelled) {
              setConfigError((res && res.error) ? res.error : 'Host 未加载，请重启 dsh web')
              // 重试直到成功或组件卸载
              timer = setTimeout(loadConfig, 4000)
            }
          })
        }
        loadConfig()
        return () => { cancelled = true; if (timer) clearTimeout(timer) }
      }, [])

      // 刷新全部启用的 provider
      const doCheck = (silent) => {
        const list = cfgRef.current.enabled
        if (!list.length) { setUpdatedAt(Date.now()); return }
        if (!silent) setBusy(true)
        return Promise.all(list.map((c) =>
          apiPost('/dsh-quota-dashboard/query', { provider: c.id, ...(c.baseUrl ? { baseUrl: c.baseUrl } : {}) })
            .then((res) => {
              res.provider = c.id
              return res
            })
        )).then((all) => {
          const next = {}
          all.forEach((res) => { next[res.provider] = res })
          setResults((prev) => Object.assign({}, prev, next))
          if (!silent) setBusy(false)
          setUpdatedAt(Date.now())
        }).finally(() => { if (!silent) setBusy(false) })
      }
      const checkRef = React.useRef(doCheck)
      React.useEffect(() => { checkRef.current = doCheck })

      // 首查（含服务端配置兜底）：localStorage 为空（清数据/换浏览器/重启后 storage 丢失）时，
      // 先 await 从服务端恢复启用清单 + 刷新间隔（无密钥）并回写 localStorage，
      // 再执行首次查询——避免“用空配置先查一次、恢复到的配置来晚”的竞态。
      // 有本地配置或恢复失败时，直接首查，行为与旧版一致。
      React.useEffect(() => {
        let cancelled = false
        const run = async () => {
          let local = {}
          try { local = JSON.parse(window.localStorage.getItem(CFG_KEY) || '{}') || {} } catch (e) { local = {} }
          const hasLocal = Array.isArray(local.enabled) && local.enabled.length > 0
          if (!hasLocal) {
            const server = await fetchServerCfg()
            if (cancelled) return
            if (server && server.enabled.length) {
              setCfg(server)
              try { window.localStorage.setItem(CFG_KEY, JSON.stringify(server)) } catch (e) { /* ignore */ }
            }
          }
          if (!cancelled) checkRef.current(true)
        }
        run()
        return () => { cancelled = true }
      }, [])
      React.useEffect(() => {
        if (cfg.intervalMs <= 0) return undefined
        const id = window.setInterval(() => { if (checkRef.current) checkRef.current(true) }, cfg.intervalMs)
        return () => window.clearInterval(id)
      }, [cfg.intervalMs])

      // ---- 设置动作 ----
      function selectedMeta() {
        return providers.find((p) => p.id === selProvider)
      }
      function onProviderChange(id) {
        setSelProvider(id)
        const meta = providers.find((p) => p.id === id)
        setSelBaseUrl(meta && meta.defaultBaseUrl ? meta.defaultBaseUrl : '')
        setTestMsg('')
      }
      function isEnabled(id) {
        return cfg.enabled.some((e) => e.id === id)
      }
      function enableCurrent() {
        if (!selProvider) return
        const cur = cfg.enabled.slice()
        const baseUrl = selBaseUrl && selBaseUrl !== selectedMeta().defaultBaseUrl ? selBaseUrl : ''
        if (!cur.some((e) => e.id === selProvider)) cur.push({ id: selProvider, baseUrl: baseUrl || undefined })
        else {
          const it = cur.find((e) => e.id === selProvider)
          it.baseUrl = baseUrl || undefined
        }
        const nextCfg = { enabled: cur, intervalMs: cfg.intervalMs }
        setCfg(nextCfg); saveCfg(nextCfg)
        // 记住密钥 → 落 Host 本机状态文件
        if (selKey && rememberKey) {
          apiPost('/dsh-quota-dashboard/keys', { provider: selProvider, apiKey: selKey }).then(() => apiGet('/dsh-quota-dashboard/config'))
            .then((res) => { if (res && res.keys) { setKeysSaved(res.keys.saved || {}); setEnvVars(res.keys.envVars || []); setReadyProviders(res.keys.ready || []) } })
          setSelKey('')
        }
        setTestMsg('已启用 ' + (selectedMeta() ? selectedMeta().name : selProvider))
        setTimeout(() => checkRef.current(false), 50)
      }
      function removeProvider(id) {
        const nextCfg = { enabled: cfg.enabled.filter((e) => e.id !== id), intervalMs: cfg.intervalMs }
        setCfg(nextCfg); saveCfg(nextCfg)
        setResults((prev) => { const n = Object.assign({}, prev); delete n[id]; return n })
      }
      // 快捷配置：一键启用一个或多个「已有 Key 可用」的平台（如 Command Code）
      function quickEnable(idOrIds) {
        const ids = Array.isArray(idOrIds) ? idOrIds : [idOrIds]
        const cur = cfg.enabled.slice()
        const added = []
        for (const id of ids) {
          if (!cur.some((e) => e.id === id)) { cur.push({ id }); added.push(id) }
        }
        const nextCfg = { enabled: cur, intervalMs: cfg.intervalMs }
        setCfg(nextCfg); saveCfg(nextCfg)
        setTestMsg(added.length ? '已一键启用：' + added.map((id) => (providers.find((p) => p.id === id) || {}).name || id).join('、') : '这些平台已在面板中')
        setTimeout(() => checkRef.current(false), 50)
      }
      function testCurrent() {
        if (!selProvider) return
        setTestMsg('测试中…')
        const meta = selectedMeta()
        const baseUrl = selBaseUrl && selBaseUrl !== (meta && meta.defaultBaseUrl) ? selBaseUrl : undefined
        apiPost('/dsh-quota-dashboard/query', {
          provider: selProvider,
          ...(baseUrl ? { baseUrl } : {}),
          ...(selKey ? { apiKey: selKey } : {}),
        }).then((res) => {
          if (res.ok) {
            if (res.kind === 'balance' && hasAmount(res)) setTestMsg('✓ ' + res.name + '：' + fmtMoney(res.amount, res.currency))
            else if (res.kind === 'usage') {
              const rem = worstRem(res.windows)
              setTestMsg(rem !== null ? '✓ ' + res.name + '：剩余 ' + Math.round(rem) + '%' : '✓ ' + res.name + '：查询成功')
            } else setTestMsg('✓ ' + res.name + '：查询成功')
          } else {
            setTestMsg('✗ ' + ((res && res.error) || '查询失败'))
          }
        }).catch((e) => setTestMsg('✗ ' + String((e && e.message) || e)))
      }
      function saveKey() {
        if (!selProvider || !selKey) return
        apiPost('/dsh-quota-dashboard/keys', { provider: selProvider, apiKey: selKey }).then(() => {
          apiGet('/dsh-quota-dashboard/config').then((res) => {
            if (res && res.keys) { setKeysSaved(res.keys.saved || {}); setEnvVars(res.keys.envVars || []); setReadyProviders(res.keys.ready || []) }
          })
          setTestMsg('已保存到本机（Host 状态文件，0600）')
          setSelKey('')
        })
      }
      function forgetKey(id) {
        apiPost('/dsh-quota-dashboard/keys', { provider: id }).then(() => {
          apiGet('/dsh-quota-dashboard/config').then((res) => {
            if (res && res.keys) { setKeysSaved(res.keys.saved || {}); setEnvVars(res.keys.envVars || []); setReadyProviders(res.keys.ready || []) }
          })
        })
      }

      function toggle() {
        if (open) { setOpen(false) }
        else { setOpen(true); if (!providers.length) checkRef.current(true) }
      }
      // ---- 聚合：整体状态 / 触发标签 / 点 ----
      const cards = cfg.enabled.map((e) => ({ id: e.id, card: results[e.id], meta: providers.find((p) => p.id === e.id) }))
      const overallRank = { err: 5, low: 4, warn: 2, ok: 1, idle: 0 }
      let overallState = 'idle'
      let anyUsage = false
      let anyBalance = false
      let worstAll = null
      let firstBalanceText = null
      cards.forEach(({ card }) => {
        if (!card) return
        const st = cardState(card)
        if (overallRank[st] > overallRank[overallState]) overallState = st
        if (card.kind === 'usage') {
          anyUsage = true
          const rem = worstRem(card.windows)
          if (rem !== null) worstAll = worstAll === null ? rem : Math.min(worstAll, rem)
        } else if (card.ok && hasAmount(card)) {
          anyBalance = true
          if (firstBalanceText === null) firstBalanceText = fmtMoney(card.amount, card.currency)
        }
      })
      const dotys = cards.slice(0, 4).map(({ id, card }) => ({ id, state: card ? cardState(card) : 'idle' }))
      let label = '剩余额度'
      if (!cards.length) label = '未启用'
      else if (overallState === 'err') label = '额度异常'
      else if (worstAll !== null) label = '剩余额度 ' + Math.round(worstAll) + '%'
      else if (firstBalanceText !== null) label = '余额 ' + firstBalanceText
      const titleDetail = cards.map(({ id, card, meta }) => {
        const st = cardState(card)
        let txt = st === 'err' ? '失败' : st === 'idle' ? '未配置' : 'OK'
        if (card && card.ok && card.kind === 'usage') { const rem = worstRem(card.windows); if (rem !== null) txt = '剩 ' + Math.round(rem) + '%' }
        if (card && card.ok && card.kind === 'balance' && hasAmount(card)) txt = fmtMoney(card.amount, card.currency)
        return (meta && meta.name || id) + ' ' + txt
      }).join(' · ')
      const time = updatedAt ? new Date(updatedAt).toLocaleTimeString() : ''
      const intervalLabel = cfg.intervalMs >= 300000 ? '5 分钟'
        : cfg.intervalMs === 120000 ? '2 分钟'
        : cfg.intervalMs === 60000 ? '1 分钟'
        : cfg.intervalMs === 30000 ? '30 秒' : ''
      const panelVisible = open

      // 已保存密钥 chips
      const savedKeys = Object.keys(keysSaved)
      const envConfigured = envVars

      return React.createElement('span', { className: 'qd-root', ref: rootRef },
        React.createElement('button', {
          type: 'button', className: 'qd-trigger',
          'aria-label': label + '（' + titleDetail + '）', 'aria-haspopup': 'dialog', 'aria-expanded': open,
          title: label + '（' + titleDetail + '）', onClick: toggle,
        },
          dotys.length === 0
            ? React.createElement(Ring, { pct: null, state: 'idle', title: '未启用任何平台' })
            : dotys.map((d) => React.createElement('span', { key: d.id, className: 'qd-dot qd-dot-' + d.state, title: d.id })),
          wide && React.createElement('span', { className: 'qd-trigger-label' }, label),
        ),
        panelVisible && React.createElement('div', {
          className: 'qd-panel',
          role: 'dialog', 'aria-label': 'AI 额度监控',
        },
          React.createElement('div', { className: 'qd-header' },
            React.createElement('span', { className: 'qd-headline' }, '额度监控'),
            overallState === 'err'
              ? React.createElement('span', { className: 'qd-percent qd-err' }, '存在异常')
              : worstAll !== null
                ? React.createElement('span', { className: 'qd-percent' }, '最低剩余 ' + Math.round(worstAll) + '%')
                : firstBalanceText !== null
                  ? React.createElement('span', { className: 'qd-percent' }, '余额 ' + firstBalanceText)
                  : React.createElement('span', { className: 'qd-headline' }, cards.length ? '查询中…' : '未启用平台'),
          ),
          configError && React.createElement('div', { className: 'qd-cardErr' }, configError),
          React.createElement('div', { className: 'qd-scroll' },
            cards.length === 0 && !configError
              ? React.createElement('div', { className: 'qd-tip' }, '暂无启用的平台 — 打开下方「设置」选择平台、填入 Base URL / API Key 后启用')
              : null,
            cards.map(({ id, card, meta }) => renderCard(card, id, meta, rawOpen)),
          ),
          React.createElement('div', { className: 'qd-ctrl' },
            React.createElement('button', { className: 'qd-btn', onClick: () => doCheck(false), disabled: busy },
              React.createElement('span', { className: 'qd-ico' }, '⟳'),
              busy ? React.createElement('span', { className: 'qd-spin' }) : '刷新'),
            React.createElement('button', { className: 'qd-btn' + (settingsOpen ? ' qd-btn-primary' : ''), onClick: () => setSettingsOpen(!settingsOpen) },
              React.createElement('span', { className: 'qd-ico' }, '⚙'),
              settingsOpen ? '收起设置' : '设置'),
            React.createElement('button', { className: 'qd-btn', onClick: toggle },
              React.createElement('span', { className: 'qd-ico' }, '✕'), '关闭'),
          ),
          settingsOpen && React.createElement('div', { className: 'qd-settings', key: 'settings' },
            React.createElement('div', { className: 'qd-field' },
              React.createElement('span', { className: 'qd-label' }, '平台'),
              React.createElement('select', { className: 'qd-select', value: selProvider, onChange: (e) => onProviderChange(e.target.value) },
                providers.length === 0
                  ? React.createElement('option', { value: selProvider }, '加载中…')
                  : providers.map((p) => React.createElement('option', { key: p.id, value: p.id }, p.name + (p.kind === 'balance' ? ' · 余额' : ' · 额度') + (p.id === 'custom' ? '' : ''))),
              ),
            ),
            providers.map((p) => p.id === selProvider ? React.createElement('div', { className: 'qd-tip', key: 'note-' + p.id },
              '默认地址 ' + (p.defaultBaseUrl || '(自定义需填完整 URL)') + (p.path ? p.path : '') + (p.note ? ' · ' + p.note : '')) : null).filter(Boolean),
            React.createElement('div', { className: 'qd-field' },
              React.createElement('span', { className: 'qd-label' }, 'Base URL'),
              React.createElement('input', {
                className: 'qd-input', type: 'text', spellCheck: false,
                placeholder: selProvider === 'custom' ? 'https://example.com/api/v1/usage' : '留空使用平台默认接口',
                value: selBaseUrl,
                onChange: (e) => setSelBaseUrl(e.target.value),
              }),
            ),
            React.createElement('div', { className: 'qd-field' },
              React.createElement('span', { className: 'qd-label' }, 'API Key'),
              React.createElement('div', { className: 'qd-fieldRow' },
                React.createElement('input', {
                  className: 'qd-input', type: showKey ? 'text' : 'password', autoComplete: 'off', spellCheck: false,
                  placeholder: keysSaved[selProvider] ? '已在本机保存（' + keysSaved[selProvider] + '），可留空' : (envConfigured.indexOf((providers.find((p) => p.id === selProvider) || {}).keyEnv || '') >= 0 ? '已通过环境变量/凭据配置' : '输入 Key 或留空读取本机配置'),
                  value: selKey, onChange: (e) => setSelKey(e.target.value),
                }),
                React.createElement('button', { className: 'qd-btn', title: '显示/隐藏', onClick: () => setShowKey(!showKey) }, showKey ? '隐藏' : '显示'),
              ),
            ),
            React.createElement('div', { className: 'qd-fieldRow' },
              React.createElement('label', { className: 'qd-checkrow' },
                React.createElement('input', { type: 'checkbox', checked: rememberKey, onChange: (e) => setRememberKey(e.target.checked) }),
                '启用时把 Key 保存到本机'),
              keysSaved[selProvider] && React.createElement('button', { className: 'qd-btn qd-btn-danger', onClick: () => { forgetKey(selProvider); setTestMsg('已清除本机 Key') } }, '清除本机 Key'),
            ),
            React.createElement('div', { className: 'qd-fieldRow' },
              React.createElement('button', { className: 'qd-btn', onClick: testCurrent, disabled: busy && false }, '测试'),
              React.createElement('button', { className: 'qd-btn qd-btn-primary', onClick: enableCurrent }, isEnabled(selProvider) ? '更新' : '启用'),
              React.createElement('button', { className: 'qd-btn qd-btn-danger', onClick: () => removeProvider(selProvider) }, '从面板移除'),
              React.createElement('span', { className: 'qd-tip' },
                React.createElement('span', { className: 'qd-label' }, '刷新'),
                React.createElement('select', {
                  className: 'qd-select', value: cfg.intervalMs,
                  onChange: (e) => { const nextCfg = { enabled: cfg.enabled, intervalMs: Number(e.target.value) }; setCfg(nextCfg); saveCfg(nextCfg) },
                },
                  React.createElement('option', { value: 0 }, '关闭'),
                  React.createElement('option', { value: 30000 }, '30 秒'),
                  React.createElement('option', { value: 60000 }, '1 分钟'),
                  React.createElement('option', { value: 120000 }, '2 分钟'),
                  React.createElement('option', { value: 300000 }, '5 分钟'),
                ),
              ),
            ),
            testMsg && React.createElement('div', { className: 'qd-meta ' + (testMsg[0] === '✗' ? 'qd-err' : '') }, testMsg),
            React.createElement('div', { className: 'qd-field' },
              React.createElement('span', { className: 'qd-label' }, '已启用'),
              React.createElement('div', { className: 'qd-chipWrap' },
                cfg.enabled.length === 0 ? React.createElement('span', { className: 'qd-tip' }, '无') :
                cfg.enabled.map((e) => {
                  const meta = providers.find((p) => p.id === e.id)
                  return React.createElement('span', { className: 'qd-chip', key: e.id },
                    React.createElement('span', null, (meta && meta.name) || e.id),
                    React.createElement('button', { className: 'qd-btn', title: '从面板移除', onClick: () => removeProvider(e.id) }, '✕'),
                  )
                }),
              ),
            ),
            (() => {
              const quickReady = readyProviders.filter((id) => !cfg.enabled.some((e) => e.id === id))
              if (!quickReady.length) return null
              const metaOf = (id) => providers.find((p) => p.id === id)
              return React.createElement('div', { className: 'qd-field', key: 'quickcfg' },
                React.createElement('span', { className: 'qd-label' }, '快捷配置'),
                React.createElement('div', { className: 'qd-chipWrap' },
                  quickReady.map((id) => React.createElement('span', { className: 'qd-chip qd-chip-ready', key: 'qr-' + id },
                    React.createElement('span', null, (metaOf(id) && metaOf(id).name) || id, (metaOf(id) && metaOf(id).kind === 'usage' ? ' · 额度' : ' · 余额')),
                    React.createElement('button', { className: 'qd-btn qd-btn-primary', onClick: () => quickEnable(id) }, '一键启用'),
                  )),
                  quickReady.length > 1 && React.createElement('button', { className: 'qd-btn', onClick: () => quickEnable(quickReady) }, '全部启用'),
                ),
                React.createElement('div', { className: 'qd-tip' }, '已检测到这些平台有可用 Key（凭据/环境变量/本机），点击即可加入面板'),
              )
            })(),
            (savedKeys.length > 0 || envConfigured.length > 0) && React.createElement('div', { className: 'qd-field' },
              React.createElement('span', { className: 'qd-label' }, '本机密钥'),
              React.createElement('div', { className: 'qd-chipWrap' },
                savedKeys.map((id) => {
                  const meta = providers.find((p) => p.id === id)
                  return React.createElement('span', { className: 'qd-chip', key: 'k-' + id }, (meta && meta.name) || id, React.createElement('span', { className: 'qd-tip' }, keysSaved[id]))
                }),
                envConfigured.map((v) => React.createElement('span', { className: 'qd-chip', key: 'e-' + v }, 'env: ' + v)),
              ),
            ),
          ),
          React.createElement('div', { className: 'qd-footer' },
            (time ? '更新于 ' + time + ' · ' : '') + (intervalLabel ? '每 ' + intervalLabel + ' 自动刷新' : '自动刷新已关闭') + ' · 点击「刷新」立即更新'),
        ),
      )
    }

    // 防重复注册：客户端模块在某些加载路径下可能触发多次 apply
    let applied = false
    module.exports = {
      apply(ctx) {
        if (applied) return
        applied = true
        console.log('[dsh-quota-dashboard] client bundle 已加载 (v1.0.5)')
        const slots = ctx.get('slots')
        if (slots === undefined) {
          console.warn('[dsh-quota-dashboard] slots 服务不可用，插件未注册')
          return
        }
        const tag = document.createElement('style')
        tag.textContent = CSS + TERMINAL_CSS
        document.head.append(tag)
        ctx.effect(() => () => tag.remove())

        try {
          ctx.effect(() => slots.inject('sidebar.footer.action', () => slots.register(
            { name: 'sidebar.footer.action', id: 'quota-dashboard', order: 10, label: '多平台额度监控' },
            (props) => React.createElement(QuotaDash, { wide: !!(props && props.wide) }),
          )))
          console.log('[dsh-quota-dashboard] 已注册到 sidebar.footer.action（侧边栏底部，设置按钮上方）')
        } catch (e) {
          console.error('[dsh-quota-dashboard] 注册失败:', e)
        }
      },
    }

    return module.exports
  },
})
