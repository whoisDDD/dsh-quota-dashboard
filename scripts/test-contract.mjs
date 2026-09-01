// dsh-quota-dashboard 契约测试（针对 DeepSeek Harness 0.1.2-alpha.2 适配）
// 运行：npm test 或 node scripts/test-contract.mjs
//
// 覆盖：
//  1. package.json 的 dsh.client 声明与 exports["./client"] 导出
//  2. 客户端 bundle 的 module id（window.__ModuleLoader__.load id == 包名）
//  3. 客户端插件对象的 inject 声明（'slots'）与 package.json dsh.client.inject
//  4. apply() 注册 sidebar.footer.action（slots.inject / slots.register 的参数与组件）
//  5. Host /config 路由响应不泄露 API Key（脱敏、无 apiKey 字段）
//  6. 查询请求不把 API Key 放进 URL（Host runQuery 走 Authorization 头；client fetch 为相对路径 + JSON body）
//  7. 插件卸载时样式 / 槽位注册 / 重试定时器的清理（ctx.effect 链）
import { readFileSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)))
const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'))
const clientSrc = readFileSync(join(ROOT, 'client.js'), 'utf8')

let failures = 0
function test(name, fn) {
  try {
    fn()
    console.log('  ✓ ' + name)
  } catch (e) {
    failures += 1
    console.error('  ✗ FAIL: ' + name)
    console.error('    ' + String((e && e.message) || e))
  }
}
function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'assertion failed')
}
function eq(a, b, msg) {
  if (a !== b) throw new Error((msg || 'values differ') + ` — expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`)
}

// ---------------------------------------------------------------------------
// 客户端 bundle 加载器：在 vm 沙箱中执行 client.js，捕获 __ModuleLoader__.load
// 注册，并物化 factory 得到插件对象（不依赖真实浏览器）。
// ---------------------------------------------------------------------------
function loadClientBundle() {
  let registration = null
  const styles = []
  const sandbox = {
    console,
    window: {
      __ModuleLoader__: { load: (r) => { registration = r } },
      localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
      setTimeout: () => 1,
      clearTimeout: () => {},
      setInterval: () => 1,
      clearInterval: () => {},
    },
    document: {
      createElement: (tag) => {
        const el = { tagName: tag, textContent: '', appended: false, removed: false, remove() { this.removed = true } }
        styles.push(el)
        return el
      },
      head: { append: (el) => { el.appended = true } },
      querySelectorAll: () => [],
    },
  }
  vm.createContext(sandbox)
  vm.runInContext(clientSrc, sandbox)
  assert(registration, 'client.js 未调用 window.__ModuleLoader__.load')
  const exportsObj = registration.factory((spec) => {
    if (spec === 'react') {
      return { createElement: () => ({}), useState: () => [], useEffect: () => {}, useRef: () => ({ current: null }) }
    }
    throw new Error('client bundle 请求了未提供的模块: ' + spec)
  })
  return { registration, exports: exportsObj, styles, sandbox }
}

function makeSlots() {
  const calls = { inject: [], register: [] }
  const disposed = { inject: false, register: false }
  const service = {
    inject(key, callback) {
      calls.inject.push({ key, callback })
      return () => { disposed.inject = true }
    },
    register(options, component) {
      calls.register.push({ options, component })
      return () => { disposed.register = true }
    },
  }
  return { service, calls, disposed }
}

function makeCtx(slots) {
  const disposers = []
  const ctx = {
    slots,
    get: (name) => (name === 'slots' ? slots : undefined),
    effect: (fn) => { const d = fn(); if (typeof d === 'function') disposers.push(d); return () => {} },
  }
  return { ctx, disposers }
}

console.log('== dsh-quota-dashboard 契约测试（alpha.2）==')

// 1. package.json：dsh.client 与 ./client 导出
test('package.json: dsh.client 声明与 exports["./client"]', () => {
  eq(pkg.dsh.client.platform, 'web', 'dsh.client.platform')
  eq(pkg.exports['./client'], './client.js', 'exports["./client"]')
  eq(pkg.dsh.client.immediately, false, 'dsh.client.immediately')
  assert(Array.isArray(pkg.dsh.client.inject) && pkg.dsh.client.inject.includes('@deepseek-ai/dsh-client-ui-renderer'),
    'dsh.client.inject 声明 slots 服务提供方 @deepseek-ai/dsh-client-ui-renderer')
})

// 2. module id == 包名
test('client: module id 与包名一致', () => {
  const m = clientSrc.match(/window\.__ModuleLoader__\.load\(\{\s*id:\s*['"]([^'"]+)['"]/)
  assert(m, 'client.js 顶部存在 __ModuleLoader__.load({ id, factory })')
  eq(m[1], pkg.name, 'load id')
  assert(clientSrc.includes('factory: (require) =>'), 'factory 形态保留')
})

// 3. 客户端插件对象 inject 声明
test('client: 插件对象声明 inject: [\'slots\'] 与 apply', () => {
  const { exports: mod } = loadClientBundle()
  assert(Array.isArray(mod.inject) && mod.inject.includes('slots'), '插件对象 inject 包含 slots')
  eq(typeof mod.apply, 'function', 'apply 存在')
})

// 4. sidebar.footer.action 注册（参数 + 组件 + 清理链）
test('client: apply 注册 sidebar.footer.action 且卸载可清理', () => {
  const { service, calls, disposed } = makeSlots()
  const { ctx, disposers } = makeCtx(service)
  const { exports: mod, styles } = loadClientBundle()

  mod.apply(ctx)

  eq(styles.length, 1, '注入 1 个 <style>')
  assert(styles[0].appended, '样式已挂到 document.head')
  assert(styles[0].textContent.includes('.qd-root'), '样式内容为额度面板 CSS')

  eq(calls.inject.length, 1, 'slots.inject 调用 1 次')
  eq(calls.inject[0].key, 'sidebar.footer.action', '注入到 sidebar.footer.action')

  const registerDisposer = calls.inject[0].callback()
  eq(calls.register.length, 1, 'slots.register 调用 1 次')
  const reg = calls.register[0]
  eq(reg.options.name, 'sidebar.footer.action', 'register name')
  eq(reg.options.id, 'quota-dashboard', 'register id')
  eq(reg.options.order, 10, 'register order')
  assert(typeof reg.options.label === 'string' && reg.options.label.length > 0, 'register label 非空')
  eq(typeof reg.component, 'function', '注册组件为函数（QuotaDash）')

  // 卸载：运行所有 ctx.effect 注册的清理
  for (const d of disposers) d()
  assert(disposed.inject, 'slots.inject 控制器随卸载释放')
  assert(styles[0].removed, '样式标签随卸载移除')
  registerDisposer()
  assert(disposed.register, 'slots.register 条目可释放')
})

// 4b. slots 暂时不可用 → 重试而非静默退出（ctx.timeout 路径）
test('client: slots 未就绪时重试注册，绝不静默退出', () => {
  let current = undefined
  let scheduled = null
  const disposers = []
  const ctx = {
    get: (name) => (name === 'slots' ? current : undefined),
    effect: (fn) => { const d = fn(); if (typeof d === 'function') disposers.push(d); return () => {} },
    timeout: (fn, ms) => { scheduled = { fn, ms }; return () => {} },
  }
  const { exports: mod } = loadClientBundle()
  mod.apply(ctx)
  assert(scheduled !== null, '安排了重试定时器')
  eq(scheduled.ms, 1000, '重试间隔 1000ms')

  // 服务就绪后重试成功
  const slots = makeSlots()
  current = slots.service
  scheduled.fn()
  eq(slots.calls.inject.length, 1, '重试后注入 sidebar.footer.action')
  eq(slots.calls.inject[0].key, 'sidebar.footer.action', '重试注入目标正确')
})

// 4c. 兜底路径：无 ctx.timeout 时用 window.setTimeout，且卸载时清理
test('client: 无 ctx.timeout 时 window.setTimeout 兜底并随卸载清理', () => {
  let scheduled = null
  let cleared = null
  const disposers = []
  const ctx = {
    get: () => undefined,
    effect: (fn) => { const d = fn(); if (typeof d === 'function') disposers.push(d); return () => {} },
  }
  const { exports: mod, sandbox } = loadClientBundle()
  sandbox.window.setTimeout = (fn, ms) => { scheduled = { fn, ms }; return 99 }
  sandbox.window.clearTimeout = (id) => { cleared = id }
  mod.apply(ctx)
  assert(scheduled !== null, '安排了 window.setTimeout 重试')
  for (const d of disposers) d() // 模拟卸载
  eq(cleared, 99, '卸载时清理了重试定时器')
})

// 5. Host /config 路由不泄露 Key
test('Host: /config 路由脱敏，响应不含 API Key', async () => {
  const statePath = join(tmpdir(), 'dsh-quota-contract-state.json')
  writeFileSync(statePath, JSON.stringify({
    deepseek: { apiKey: 'sk-super-secret-abcdefghij123456', savedAt: '2026-09-01T00:00:00.000Z' },
  }))
  process.env.DSH_QUOTA_STATE_PATH = statePath
  process.env.DSH_HOME = tmpdir()
  const host = await import('../index.js')

  const routes = []
  const httpCtx = {
    webServer: { register: (route) => { routes.push(route); return () => {} } },
    effect: (fn) => { fn(); return () => {} },
  }
  const hostCtx = {
    inject: (names, cb) => {
      eq(JSON.stringify(names), JSON.stringify(['webServer']), 'Host 端 inject 声明 webServer')
      cb(httpCtx)
    },
    get: () => undefined,
  }
  host.apply(hostCtx)
  const configRoute = routes.find((r) => r.kind === 'exact' && r.path === '/dsh-quota-dashboard/config')
  assert(configRoute, '/config 路由已注册')

  const res = { code: null, headers: null, body: null, writeHead(c, h) { this.code = c; this.headers = h }, end(b) { this.body = b } }
  await configRoute.handler({}, res)
  eq(res.code, 200, '/config 返回 200')
  const cfg = JSON.parse(res.body)
  const raw = JSON.stringify(cfg)
  assert(!raw.includes('sk-super-secret'), '响应不含明文 Key')
  assert(cfg.keys.saved.deepseek && cfg.keys.saved.deepseek.includes('••••'), '已保存 Key 已脱敏')
  assert(!raw.includes('abcdefghij123456'), '脱敏串不含 Key 片段')
  for (const p of cfg.providers) assert(!('apiKey' in p), `provider ${p.id} 条目不含 apiKey 字段`)

  rmSync(statePath, { force: true })
})

// 6. 查询请求不把 API Key 放进 URL
test('Host: runQuery 的 Key 只走 Authorization 头，不进 URL', async () => {
  const host = await import('../index.js')
  const fetchCalls = []
  const oldFetch = globalThis.fetch
  globalThis.fetch = async (url, opts) => {
    fetchCalls.push({ url, opts })
    return { ok: true, status: 200, text: async () => JSON.stringify({ is_available: true, balance_infos: [{ currency: 'CNY', total_balance: '12.34' }] }) }
  }
  try {
    const r = await host.runQuery({ get: () => undefined }, { provider: 'deepseek', apiKey: 'sk-super-secret-abcdefghij123456' })
    eq(fetchCalls.length, 1, '发起 1 次上游请求')
    eq(fetchCalls[0].url, 'https://api.deepseek.com/user/balance', 'URL 为固定接口地址')
    assert(!fetchCalls[0].url.includes('super-secret'), 'Key 未出现在 URL')
    eq(fetchCalls[0].opts.headers.authorization, 'Bearer sk-super-secret-abcdefghij123456', 'Key 在 Authorization 头')
    assert(r.ok === true && r.kind === 'balance' && r.amount === 12.34, '查询归一化成功')
  } finally {
    globalThis.fetch = oldFetch
  }
})

test('client: fetch 均为同源相对路径，Key 不进 URL（静态契约）', () => {
  // apiGet/apiPost 的调用点全部传字符串字面量路径（fetch 的第一个实参是变量 path）
  const uris = [...clientSrc.matchAll(/(?:apiGet|apiPost)\(\s*([`'"])(.*?)\1/g)].map((m) => m[2])
  assert(uris.length >= 4, 'apiGet/apiPost 存在多处调用（config/query/client-cfg/keys）')
  for (const u of uris) {
    assert(u.startsWith('/'), '请求路径为同源相对路径: ' + u)
    assert(!u.includes('apiKey') && !u.includes('?'), '请求路径不含 apiKey/查询串: ' + u)
  }
  // fetch 直接调用若带字符串实参，也不得包含 Key
  const fetchLits = [...clientSrc.matchAll(/fetch\(\s*([`'"])(.*?)\1/g)].map((m) => m[2])
  for (const u of fetchLits) assert(!u.includes('apiKey'), 'fetch 字面量 URL 不含 apiKey: ' + u)
  assert(!clientSrc.includes('apiKey='), '代码中不存在 apiKey= 的 URL 拼接形态')
})

// 7. 生命周期静态契约：React 定时器 / 观察器 / 监听器都有清理
test('client: 定时器 / MutationObserver / 事件监听器均有清理（静态）', () => {
  assert(clientSrc.includes('return () => window.clearInterval(id)'), '峰谷倒计时每秒 tick 清理')
  assert(clientSrc.includes('clearInterval'), '自动刷新 interval 清理')
  assert(clientSrc.includes('mo.disconnect()'), 'MutationObserver 断开')
  assert(clientSrc.includes('document.removeEventListener'), 'document 事件监听器移除')
})

if (failures > 0) {
  console.error(`\n${failures} 项契约测试失败`)
  process.exit(1)
}
console.log('\n全部契约测试通过')
