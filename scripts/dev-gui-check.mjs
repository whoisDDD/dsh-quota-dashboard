// dev GUI 验证：headless Chrome + CDP 驱动 dev DSH web (127.0.0.1:3282) 检查 dsh-quota-dashboard 客户端。
// 预置 localStorage 启用 deepseek / kimi-code / opencode-go 三个平台 → 验证触发按钮、面板、设置交互。
// 依赖：系统 Chrome + 全局 dsh node_modules 的 ws。运行：node scripts/dev-gui-check.mjs
import { spawn } from 'node:child_process'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const DEV_URL = 'http://127.0.0.1:3282/'
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const CDP_PORT = 9233
const SHOT_DIR = join(fileURLToPath(new URL('..', import.meta.url)), '.devhome', 'shots')
mkdirSync(SHOT_DIR, { recursive: true })
const userData = join(SHOT_DIR, 'chrome-profile')
rmSync(userData, { recursive: true, force: true }) // 每次全新 profile，避免 localStorage 残留

const { default: WSPkg } = await import('file:///Users/test/.npm-global/lib/node_modules/@deepseek-ai/dsh/node_modules/ws/index.js')
const WS = WSPkg.WebSocket

let pass = 0, fail = 0
function ok(cond, msg) { if (cond) { pass++; console.log('  ✓ ' + msg) } else { fail++; console.log('  ✗ FAIL: ' + msg) } }

// ---- 启动 Chrome ----
const chrome = spawn(CHROME, [
  '--headless=new',
  '--remote-debugging-port=' + CDP_PORT,
  '--user-data-dir=' + userData,
  '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage', '--window-size=420,760',
  'about:blank',
], { stdio: 'ignore' })
console.log('chrome pid', chrome.pid, 'debug port', CDP_PORT)

// ---- 等 debugger 就绪 ----
let pageWsUrl = null
for (let i = 0; i < 40; i++) {
  try {
    const list = await (await fetch('http://127.0.0.1:' + CDP_PORT + '/json/list')).json()
    const page = list.find((t) => t.type === 'page')
    if (page && page.webSocketDebuggerUrl) { pageWsUrl = page.webSocketDebuggerUrl; break }
  } catch (e) { /* retry */ }
  await new Promise((r) => setTimeout(r, 500))
}
if (!pageWsUrl) { console.error('CDP 调试端口未就绪'); chrome.kill(); process.exit(1) }

// ---- CDP 客户端 ----
let seq = 0
const pending = new Map()
const listeners = {}
const ws = new WS(pageWsUrl)
await new Promise((res, rej) => { ws.on('open', res); ws.on('error', rej) })
ws.on('message', (buf) => {
  const msg = JSON.parse(buf.toString())
  if (msg.id) { const p = pending.get(msg.id); if (p) { pending.delete(msg.id); msg.error ? p.rej(new Error(msg.error.message)) : p.res(msg.result) } return }
  if (msg.method) { const l = listeners[msg.method]; if (l) l.forEach((fn) => fn(msg.params)) }
})
function send(method, params = {}) {
  return new Promise((res, rej) => { const id = ++seq; pending.set(id, { res, rej }); ws.send(JSON.stringify({ id, method, params })) })
}
function on(method, fn) { (listeners[method] = listeners[method] || []).push(fn) }

await send('Page.enable')
await send('Runtime.enable')
const exceptions = []
on('Runtime.exceptionThrown', (p) => exceptions.push((p.exceptionDetails && p.exceptionDetails.text) || 'exception'))
on('Runtime.consoleAPICalled', (p) => {
  const txt = (p.args || []).map((a) => a.value || a.description || '').join(' ')
  if (/dsh-quota-dashboard/.test(txt)) console.log('  [client-log] ' + txt)
})

async function evalv(expr) {
  const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })
  if (r.exceptionDetails) throw new Error('eval: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text))
  return r.result.value
}
async function waitFor(expr, timeoutMs = 25000, label = expr) {
  const t0 = Date.now()
  while (Date.now() - t0 < timeoutMs) {
    try { if (await evalv(expr)) return true } catch (e) { /* ignore */ }
    await new Promise((r) => setTimeout(r, 300))
  }
  throw new Error('等待超时: ' + label)
}
async function shot(name) {
  const r = await send('Page.captureScreenshot', { format: 'png' })
  writeFileSync(join(SHOT_DIR, name + '.png'), Buffer.from(r.data, 'base64'))
  console.log('  [shot] ' + name + '.png')
}

// ---- 导航 & 预置配置 ----
console.log('== 导航到 ' + DEV_URL + ' ==')
await send('Page.navigate', { url: DEV_URL })
await waitFor('document.readyState === "complete"', 20000, '页面 complete')
await waitFor('!!window.__DSH_BOOT__', 20000, '__DSH_BOOT__')
await waitFor('!!document.querySelector(".qd-trigger")', 25000, 'qd-trigger 出现')

// 预置 3 个平台并重载（让 Host 凭据自动解析 Key）
await evalv(`(() => { localStorage.setItem('dsh-quota-dashboard-cfg', JSON.stringify({enabled:[{id:'deepseek'},{id:'kimi-code'},{id:'opencode-go'}],intervalMs:60000})); return true })()`)
await send('Page.reload', { ignoreCache: true })
await waitFor('!!document.querySelector(".qd-trigger")', 25000, 'reload 后 qd-trigger')

// 等待异步查询完成（面板数据就绪）
await waitFor(`(() => { const el = document.querySelector('.qd-panel .qd-amount, .qd-panel .qd-amount, .qd-card'); return true })()`, 2000, 'tick')
await new Promise((r) => setTimeout(r, 1800)) // 给查询留时间（真实网络）
console.log('== 截图 1：按钮（面板关闭） ==')
await shot('1-button')

const btnLabel = await evalv(`document.querySelector('.qd-trigger') ? (document.querySelector('.qd-trigger').innerText || '') : ''`)
const dotCount = await evalv(`document.querySelectorAll('.qd-trigger .qd-dot').length`)
console.log('  按钮文本:', JSON.stringify(btnLabel), '| 点数量:', dotCount)
ok(dotCount === 3, '触发按钮显示 3 个点（deepseek/kimi/opencode-go）')

// ---- 点开面板 ----
await evalv(`document.querySelector('.qd-trigger').click()`)
await waitFor('!!document.querySelector(".qd-panel")', 8000, '面板打开')
await new Promise((r) => setTimeout(r, 500))
const panelText = await evalv(`document.querySelector('.qd-panel').innerText`)
console.log('== 面板文本摘录 ==')
console.log(panelText.split('\n').filter((l) => l.trim()).slice(0, 30).map((l) => '    ' + l).join('\n'))
ok(/DeepSeek|¥/.test(panelText), '面板含 DeepSeek 数据（余额）')
ok(/Kimi Code/.test(panelText), '面板含 Kimi Code 卡片')
ok(/OpenCode Go/.test(panelText), '面板含 OpenCode Go 卡片')
ok(/%|窗口|限额/.test(panelText), '面板含额度百分比/窗口信息')
await shot('2-panel')

// ---- 剩余额度条方向：色条宽度应 ≈ 剩余%（越少越短；绿>50% 橙>20% 红≤20%）----
const barDir = await evalv(`(() => {
  const wins = [...document.querySelectorAll('.qd-panel .qd-win')];
  const out = [];
  for (const win of wins) {
    const meta = (win.querySelector('.qd-winMeta')||{}).textContent || '';
    const m = meta.match(/已用 ([\\d.]+)%/);
    if (!m) continue;
    const used = Number(m[1]);
    const rem = 100 - Math.min(100, Math.max(0, used));
    const bar = win.querySelector('.qd-bar');
    const seg = win.querySelector('.qd-segment');
    if (!bar || !seg) continue;
    const frac = bar.getBoundingClientRect().width > 0 ? seg.getBoundingClientRect().width / bar.getBoundingClientRect().width * 100 : 0;
    out.push({ label: (win.querySelector('.qd-winLabel')||{}).textContent || '', used, rem, frac: Math.round(frac), diff: Math.abs(frac - rem) });
  }
  return JSON.stringify(out);
})()`)
console.log('  剩余条方向(窗口: 已用/期望剩余%/实际条宽%):', JSON.parse(barDir).map(w => w.label + ' ' + w.used + '%/' + w.rem + '%/' + w.frac + '%').join(' | '))
const bars = JSON.parse(barDir)
ok(bars.length >= 3, '面板至少 3 个额度窗口条')
ok(bars.every(w => w.diff < 18), '每个色条宽度≈剩余%（越少越短）')
ok(bars.every(w => (w.rem > 50 ? w.frac > 40 : w.rem <= 20 ? w.frac <= 30 : true)), '低额度窗口条明显缩短')

// ---- 打开设置 ----
await evalv(`[...document.querySelectorAll('.qd-panel .qd-btn')].find(b => b.textContent.includes('设置')).click()`)
await waitFor('!!document.querySelector(".qd-panel .qd-settings")', 5000, '设置面板')
const settingsText = await evalv(`document.querySelector('.qd-panel .qd-settings').innerText`)
console.log('== 设置面板文本摘录 ==')
console.log(settingsText.split('\n').filter((l) => l.trim()).slice(0, 30).map((l) => '    ' + l).join('\n'))
ok(/平台/.test(settingsText) && /API Key/.test(settingsText) && /Base URL/.test(settingsText), '设置含 平台/Base URL/API Key 输入')
ok(/已启用/.test(settingsText), '设置含已启用列表')
await shot('3-settings')

// ---- Command Code 快捷配置（一键启用）----
const hasQuickCfg = await evalv(`[...document.querySelectorAll('.qd-settings .qd-field')].some(f => f.textContent.includes('快捷配置'))`)
ok(hasQuickCfg, '设置含「快捷配置」区')
const readyText = await evalv(`(() => { const f=[...document.querySelectorAll('.qd-settings .qd-field')].find(x=>x.textContent.includes('快捷配置')); return f?f.innerText:'' })()`)
console.log('  [快捷配置] ' + readyText.split('\n').filter(l=>l.trim()).join(' | '))
ok(/Command Code/.test(readyText), '快捷配置含 Command Code（一键启用）')
const cmdClicked = await evalv(`(() => { const f=[...document.querySelectorAll('.qd-settings .qd-field')].find(x=>x.textContent.includes('快捷配置')); const btn=[...f.querySelectorAll('button')].find(b=>b.textContent.includes('一键启用')); if(!btn) return false; btn.click(); return true })()`)
ok(cmdClicked, '点击 Command Code「一键启用」')
await new Promise((r) => setTimeout(r, 2800)) // 等真实查询(含 whoami)
const cmdCard = await evalv(`(() => { const c=[...document.querySelectorAll('.qd-card')].find(x=>x.textContent.includes('Command Code')); return c?c.innerText.split('\\n').filter(l=>l.trim()).slice(0,14).join(' | '):'' })()`)
console.log('  [Command Code 卡片] ' + cmdCard)
ok(/Command Code/.test(cmdCard) && /每周窗口/.test(cmdCard), 'Command Code 卡片已出现（每周窗口）')
ok(/月度额度/.test(cmdCard) && /已购额度/.test(cmdCard) && /免费额度/.test(cmdCard), '余额按套餐分池显示：月度/已购/免费')
ok(!/账户余额/.test(cmdCard), '无合并的「账户余额」行')
const cmdBars = await evalv(`(() => { const c=[...document.querySelectorAll('.qd-card')].find(x=>x.textContent.includes('Command Code')); return c ? c.querySelectorAll('.qd-win .qd-bar').length : 0 })()`)
ok(cmdBars === 2, 'Command Code 仅 2 条进度条（5小时/每周），余额不用进度条')

// ---- 点「测试」（当前选择 deepseek，用传入 Key 的瞬时测试路径）----
const providerCount = await evalv(`document.querySelectorAll('.qd-panel .qd-settings select option').length`)
console.log('  平台下拉选项数:', providerCount)
ok(providerCount >= 20, '平台下拉含 15 平台 + 5 刷新档 (got ' + providerCount + ')')
await shot('4-settings-test')

// ---- 默认配色可读性：面板文字应为浅色(高亮度)，背景为深色玻璃 ----
const contrast = await evalv(`(() => {
  const panel = document.querySelector('.qd-panel');
  const cs = getComputedStyle(panel);
  const fg = cs.color; const bg = cs.backgroundColor || '';
  function lum(rgb){ const m = String(rgb).match(/\\d+(?:\\.\\d+)?/g); if(!m||m.length<3) return 1; const [r,g,b]=m.map(Number); return (0.299*r+0.587*g+0.114*b)/255; }
  return JSON.stringify({ fg, bg, fgLum: lum(fg), bgLum: bg ? lum(bg) : 9 });
})()`)
console.log('  默认面板对比:', contrast)
const c = JSON.parse(contrast)
ok(c.fgLum > 0.6, '默认配色文字为浅色可读 (luminance ' + c.fgLum.toFixed(2) + ')')
ok(c.bgLum !== 9 && c.bgLum < 0.4, '默认配色背景为深色玻璃 (bgLum ' + c.bgLum + ')')

// ---- 衬线字体开关（先开配色区）----
await evalv(`[...document.querySelectorAll('.qd-panel .qd-btn')].find(b => b.textContent.includes('配色')).click()`)
await waitFor('!!document.querySelector(".qd-colors")', 5000, '配色面板')
const hasFontSeg = await evalv(`[...document.querySelectorAll('.qd-colorRow')].some(r => r.textContent.includes('字体') && r.textContent.includes('会话框') && r.textContent.includes('UI 标题'))`)
ok(hasFontSeg, '配色区含「字体」设置（会话框 + UI 标题）')
// 会话框 → 衬线
await evalv(`(() => { const fr=[...document.querySelectorAll('.qd-colorRow')].find(r=>r.textContent.includes('字体')&&r.textContent.includes('会话框')); const sub=[...fr.querySelectorAll('.qd-fieldRow')].find(r=>r.textContent.includes('会话框')); [...sub.querySelectorAll('button')].find(b=>b.textContent.trim()==='衬线').click(); return true })()`)
await new Promise((r) => setTimeout(r, 400))
const f1 = await evalv(`(document.getElementById('qd-font-overrides')||{textContent:''}).textContent`)
ok(/conversation\.session/.test(f1), '会话框→衬线：已注入 conversation.session 规则')
// UI 标题 → 衬线
await evalv(`(() => { const fr=[...document.querySelectorAll('.qd-colorRow')].find(r=>r.textContent.includes('字体')&&r.textContent.includes('会话框')); const sub=[...fr.querySelectorAll('.qd-fieldRow')].find(r=>r.textContent.includes('UI 标题')); [...sub.querySelectorAll('button')].find(b=>b.textContent.trim()==='衬线').click(); return true })()`)
await new Promise((r) => setTimeout(r, 400))
const f2 = await evalv(`(document.getElementById('qd-font-overrides')||{textContent:''}).textContent`)
console.log('  [字体样式] ' + f2.split('\n').filter(l=>l.trim()).slice(0,4).join(' | ').slice(0, 300))
ok(/Charter/.test(f2) && /\.qd-headline/.test(f2), 'UI 标题→衬线：已注入 Charter 标题规则')
// 双无衬线应移除样式
await evalv(`(() => { const fr=[...document.querySelectorAll('.qd-colorRow')].find(r=>r.textContent.includes('字体')&&r.textContent.includes('会话框')); for (const lbl of ['会话框','UI 标题']) { const sub=[...fr.querySelectorAll('.qd-fieldRow')].find(r=>r.textContent.includes(lbl)); [...sub.querySelectorAll('button')].find(b=>b.textContent.trim()==='无衬线').click(); } return true })()`)
await new Promise((r) => setTimeout(r, 400))
const f3 = await evalv(`(document.getElementById('qd-font-overrides')||{textContent:''}).textContent`)
ok(!/Charter/.test(f3), '双无衬线：衬线样式已移除')
await shot('5-fonts')

// ---- 异常捕获 ----
ok(exceptions.length === 0, '无未捕获异常（' + exceptions.length + '）' + (exceptions.length ? ' ' + exceptions.slice(0, 2).join(' | ') : ''))

console.log('\n========== 结果: ' + pass + ' 通过, ' + fail + ' 失败 ==========')
ws.close()
chrome.kill()
process.exit(fail ? 1 : 0)
