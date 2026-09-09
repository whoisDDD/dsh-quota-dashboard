// dsh-quota-dashboard v1.0.6 — 通用多平台 API 额度/余额实时监视器（Host 半端）
//
// 在 DeepSeek Harness Web GUI 中注册同源 HTTP 路由，供浏览器半端（client.js）轮询：
//   GET  /dsh-quota-dashboard/config   → provider 注册表 + 默认值 + 已保存密钥状态（不含密钥本体）
//   POST /dsh-quota-dashboard/query    → {provider, baseUrl?, apiKey?} → 归一化额度/余额
//   GET  /dsh-quota-dashboard/client-cfg → 客户端启用清单+刷新间隔（脱敏，无密钥）
//   POST /dsh-quota-dashboard/client-cfg → 写回启用清单+刷新间隔
//   GET  /dsh-quota-dashboard/keys     → 本机已保存密钥（脱敏） + 环境变量命中清单
//   POST /dsh-quota-dashboard/keys     → {provider, apiKey?} 保存 / 清空本机密钥
//
// 基于 InvisibleSirius/dsh-quota-dashboard 修改。
// Key 永不出现于 URL 与日志：查询走 POST JSON，本机密钥落盘于 DSH_HOME 下 0600 状态文件。
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

export const name = 'quota-dashboard'

const VERSION = '1.0.7'
const UA = 'DSH-Quota-Dashboard/' + VERSION
const REQUEST_TIMEOUT_MS = 20000
const DEFAULT_INTERVAL_MS = 120000

const STATE_PATH = process.env.DSH_QUOTA_STATE_PATH
  || join(process.env.DSH_HOME || join(homedir(), '.dsh'), '.dsh-quota-dashboard.json')

// 客户端配置（启用清单 + 刷新间隔）落盘，跨浏览器/重启/清数据持久。
// 安全边界：仅存 enabled[]（{id, baseUrl?}）与 intervalMs，永不写入 API Key。
const CLIENT_CFG_PATH = join(process.env.DSH_HOME || join(homedir(), '.dsh'), '.dsh-quota-dashboard-client.json')
const VALID_INTERVALS = [0, 30000, 60000, 120000, 300000]

// ---------------------------------------------------------------------------
// 工具函数
// ---------------------------------------------------------------------------

function toNum(v) {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string') {
    const n = Number(v.trim())
    if (Number.isFinite(n)) return n
  }
  return null
}

function getStr(v) {
  return typeof v === 'string' && v.trim().length > 0 ? v.trim() : null
}

function clamp(p) {
  const n = toNum(p)
  return n === null ? 0 : Math.max(0, Math.min(100, n))
}

// ---------------------------------------------------------------------------
// 通用递归扫描：任意 JSON → 额度窗口行（{label,percent,used,limit,resetAt,status}）
// 参照原插件 extractWindowsGeneric：percent 语义为「已用%」
// ---------------------------------------------------------------------------

const WINDOW_LABEL_MAP = {
  rolling: '近5小时', weekly: '近7天', monthly: '近30天',
  daily: '每日', hourly: '每小时', month: '月度', week: '周度', day: '今日',
}

// 显式时长窗 → 可读标签：部分接口（如 Kimi Code /v1/usages 的 limits[]）把窗口
// 时长放在兄弟对象 { window: { duration, timeUnit }, detail: {...} } 里，数据节点的
// 段名只剩 "detail"/"usage"，标签只能落成「窗口 N」。duration+timeUnit → 标签：
// TIME_UNIT_MINUTE 300 → 近5小时；TIME_UNIT_DAY 7 → 近7天。无法识别 → null。
// 单位 = 精确白名单（无子串匹配）：TIME_UNIT_MICROSECOND/MILLISECOND 等未知单位
// 一律 null——绝不产出「看似可信但错误」的时长标签。
const TIME_UNIT_TO_SECONDS = {
  TIME_UNIT_SECOND: 1,
  TIME_UNIT_MINUTE: 60,
  TIME_UNIT_HOUR: 3600,
  TIME_UNIT_DAY: 86400,
}
function windowLabelOfDuration(duration, timeUnit) {
  const d = toNum(duration)
  if (d === null || d <= 0) return null
  const u = typeof timeUnit === 'string' ? timeUnit.toUpperCase().trim() : ''
  const perUnit = TIME_UNIT_TO_SECONDS[u]
  if (!perUnit) return null
  const s = d * perUnit
  if (!Number.isFinite(s) || s <= 0) return null
  // 格式化边界：<60s → 秒；整数天/小时/分钟 → 对应单位；<1h 非整分钟 → 精确秒
  // （90s = 近90秒，不向上取整误导）；≥1h 非整小时 → 分钟（61min = 近61分钟）。
  if (s < 60) return '近' + Math.max(1, Math.round(s)) + '秒'
  if (s % 86400 === 0) return '近' + (s / 86400) + '天'
  if (s % 3600 === 0) return '近' + (s / 3600) + '小时'
  if (s % 60 === 0) return '近' + (s / 60) + '分钟'
  if (s < 3600) return '近' + Math.round(s) + '秒'
  return '近' + Math.round(s / 60) + '分钟'
}

// 同级「quota 数据候选」判定（轻量）：siblingHint 唯一候选语义用——非数组对象
// 且含至少一个额度类数字标量键。与行产出条件同源（percent / used / limit /
// remaining / input / output 族），只用于「同级唯一候选」计数，不求与行产出逐位一致。
function isQuotaDataCandidate(node) {
  if (node === null || typeof node !== 'object' || Array.isArray(node)) return false
  return Object.keys(node).some((k) => {
    const key = String(k).toLowerCase()
    return /percent|pct|^(used|usage|consumed)$|^(remaining|remain|left)$|^(limit|number|quota|total|cap|max|maximum)$|^(input|output|prompt|completion)$/.test(key)
  })
}

function extractWindowsGeneric(json) {
  const windows = []
  const walk = (node, path, depth, labelHint) => {
    if (node === null || typeof node !== 'object' || depth > 8) return
    const entries = Array.isArray(node)
      ? node.map((v, i) => [String(i), v])
      : Object.keys(node).map((k) => [k, node[k]])
    const scalar = {}
    const sub = []
    for (const pair of entries) {
      const k = String(pair[0]).toLowerCase()
      const v = pair[1]
      if (v !== null && typeof v === 'object') sub.push([k, v])
      else scalar[k] = (typeof v === 'number' && Number.isFinite(v)) ? v : (typeof v === 'string' && /^-?\d+(\.\d+)?$/.test(v.trim()) ? Number(v.trim()) : v)
    }
    const seg = String(path).split('.').pop() || ''
    let percent = null
    let resetAt = null
    let status = null
    for (const k of Object.keys(scalar)) {
      const v = scalar[k]
      if (percent === null && typeof v === 'number' && /percent|pct/i.test(k)) percent = v
      if (resetAt === null && typeof v === 'string' && /reset|expire|end|until|renew/i.test(k) && !Number.isNaN(Date.parse(v))) resetAt = new Date(v)
      if (status === null && typeof v === 'string' && /^status$/i.test(k)) status = v
    }
    if (typeof scalar.remainingpercent === 'number') percent = 100 - scalar.remainingpercent
    if (typeof scalar.percentremaining === 'number') percent = 100 - scalar.percentremaining
    // 时长标签来源：① 自身内联的 duration+timeUnit；② 兄弟 window 对象
    // （{duration,timeUnit} 与数据兄弟如 detail 并列时，给兄弟当标签提示）。
    // 广播修正：仅当同级非 window 对象里恰好存在唯一 quota 数据候选时才把 hint
    // 传给该候选；零候选或多候选（如 detail + metadata 皆含 used/limit）= 保守
    // 不广播，标签回退「窗口 N」——绝不把同一时长标签贴给无法确认关联的兄弟。
    const ownDurationLabel = windowLabelOfDuration(scalar.duration, scalar.timeunit)
    let siblingHint = null
    for (const pair of sub) {
      if (pair[0] === 'window' && pair[1] !== null && typeof pair[1] === 'object' && !Array.isArray(pair[1])) {
        const hint = windowLabelOfDuration(pair[1].duration, pair[1].timeUnit ?? pair[1].timeunit)
        if (hint) siblingHint = hint
      }
    }
    let hintTarget = null
    if (siblingHint) {
      let candidates = 0
      for (const pair of sub) {
        if (pair[0] === 'window') continue
        if (isQuotaDataCandidate(pair[1])) { candidates += 1; hintTarget = pair }
      }
      if (candidates !== 1) hintTarget = null
    }
    const myLabel = ownDurationLabel || labelHint || null
    if (percent !== null) {
      windows.push({ seg, labelHint: myLabel, percent: clamp(percent), resetAt: resetAt ? resetAt.toISOString() : null, status })
    } else {
      let used = null; let limit = null; let remaining = null; let input = null; let output = null; let number = null
      for (const k of Object.keys(scalar)) {
        if (typeof scalar[k] !== 'number') continue
        if (/^(used|usage|consumed)$/.test(k) && used === null) used = scalar[k]
        if (/^(remaining|remain|left|quota_remaining|remaining_quota)$/.test(k) && remaining === null) remaining = scalar[k]
        if (/^(limit|number|quota|total|cap|max|maximum)$/.test(k) && limit === null) { limit = scalar[k]; number = k === 'number' ? scalar[k] : number }
        if (/^(input|prompt|input_tokens)$/.test(k) && input === null) input = scalar[k]
        if (/^(output|completion|output_tokens)$/.test(k) && output === null) output = scalar[k]
      }
      if (used === null && remaining !== null && limit !== null) used = limit - remaining
      if (used === null && !number && limit !== null && remaining !== null) used = limit - remaining
      if (used === null && input !== null && output !== null) used = input + output
      else if (used === null && input !== null) used = input
      if (used !== null && limit !== null && limit > 0 && used >= 0) {
        windows.push({ seg, labelHint: myLabel, used, limit, resetAt: resetAt ? resetAt.toISOString() : null })
      }
    }
    for (const pair of sub) walk(pair[1], path ? path + '.' + pair[0] : String(pair[0]), depth + 1, pair[0] === 'window' ? null : (pair === hintTarget ? siblingHint : null))
  }
  walk(json, '', 0, null)
  const out = []
  const usedLabels = new Set()
  windows.forEach((w, i) => {
    let label = w.seg && WINDOW_LABEL_MAP[w.seg] ? WINDOW_LABEL_MAP[w.seg] : null
    if (!label && w.seg && /h$|d$|day|hour|week|month|min|小时|天|周|月/i.test(w.seg)) label = w.seg
    if (!label && w.labelHint) label = w.labelHint
    if (!label && w.percent !== undefined) label = ['近5小时', '近7天', '近30天'][i] || ('窗口 ' + (i + 1))
    if (!label) label = '窗口 ' + (i + 1)
    if (usedLabels.has(label)) {
      let n = 2; while (usedLabels.has(label + ' #' + n)) n += 1; label = label + ' #' + n
    }
    usedLabels.add(label)
    const item = { label }
    if (w.percent !== undefined) item.percent = w.percent
    if (w.used !== undefined) item.used = w.used
    if (w.limit !== undefined) item.limit = w.limit
    if (w.resetAt !== null) item.resetAt = w.resetAt
    if (w.status !== null && w.status !== undefined) item.status = w.status
    out.push(item)
  })
  return out
}

// 通用余额扫描：找带 available_balance / total_balance / balance / credits 等的节点 → balanceRows
function extractBalanceGeneric(json) {
  const rows = []
  const walk = (node, depth) => {
    if (node === null || typeof node !== 'object' || depth > 8) return
    const entries = Array.isArray(node)
      ? node.map((v, i) => [String(i), v])
      : Object.keys(node).map((k) => [k, node[k]])
    const scalar = {}
    const sub = []
    for (const pair of entries) {
      const k = String(pair[0]).toLowerCase()
      const v = pair[1]
      if (v !== null && typeof v === 'object') { sub.push([k, v]) }
      else if (typeof v === 'number' || (typeof v === 'string' && /^-?\d+(\.\d+)?$/.test(v.trim()))) {
        scalar[k] = typeof v === 'number' ? v : Number(v.trim())
      }
    }
    const cur = getStr(scalar.currency) || getStr(scalar.currency_code)
    for (const k of Object.keys(scalar)) {
      if (/^(available_balance|total_balance|balance|account_balance|credit|credits)$/.test(k)) {
        const v = scalar[k]
        if (typeof v === 'number' && Number.isFinite(v)) {
          if (!rows.some((r) => r.source === k && r.value === v)) {
            rows.push({ label: BALANCE_LABELS[k] || k, value: v, currency: cur || 'CNY', source: k })
          }
        }
      }
    }
    if (rows.length >= 8) return
    for (const pair of sub) walk(pair[1], depth + 1)
  }
  walk(json, 0)
  return rows
}
const BALANCE_LABELS = {
  available_balance: '可用余额', total_balance: '总余额', balance: '余额',
  account_balance: '账户余额', credit: '账户余额', credits: '账户余额',
  cash_balance: '现金余额', voucher_balance: '代金券余额', granted_balance: '赠金',
  topped_up_balance: '充值余额',
}

// ---------------------------------------------------------------------------
// Provider 注册表：每个 provider 有 parse(body) → 归一化结果
// ---------------------------------------------------------------------------

// OpenCode Go：usage.{rolling,weekly,monthly}.{percent,resetsAt}，percent = 已用%
function opencodeGoParse(json) {
  const u = json.usage || json.data?.usage || json
  const MAP = { rolling: '近5小时', weekly: '近7天', monthly: '近30天' }
  const windows = []
  for (const key of Object.keys(MAP)) {
    const w = u[key]
    if (w === null || typeof w !== 'object') continue
    const percent = toNum(w.percent)
    const resetsAt = getStr(w.resetsAt) || getStr(w.resetAt)
    if (percent === null) continue
    windows.push({
      label: MAP[key],
      percent: clamp(percent),
      ...(resetsAt && Number.isFinite(Date.parse(resetsAt)) ? { resetAt: new Date(Date.parse(resetsAt)).toISOString() } : {}),
      status: 'ok',
    })
  }
  if (windows.length === 0) {
    // 兜底：递归扫描
    const generic = extractWindowsGeneric(json)
    if (generic.length) return { kind: 'usage', windows: generic, message: 'OpenCode Go（通用解析）' }
    throw new Error('OpenCode Go 响应中没有识别到额度窗口')
  }
  return { kind: 'usage', windows, message: 'OpenCode Go' }
}

// 各平台余额/用量解析器
const PARSERS = {
  deepseek(json) {
    const infos = Array.isArray(json.balance_infos) ? json.balance_infos : []
    if (!infos.length) throw new Error('DeepSeek 响应中没有 balance_infos')
    const rows = []
    infos.forEach((info) => {
      const cur = getStr(info.currency) || 'CNY'
      const total = toNum(info.total_balance)
      const granted = toNum(info.granted_balance)
      const topped = toNum(info.topped_up_balance)
      if (total !== null) rows.push({ label: cur === 'CNY' ? '总余额' : `总余额 (${cur})`, value: total, currency: cur })
      if (granted !== null) rows.push({ label: '赠金', value: granted, currency: cur })
      if (topped !== null) rows.push({ label: '充值余额', value: topped, currency: cur })
    })
    const first = rows[0]
    return {
      kind: 'balance',
      amount: first ? first.value : null,
      currency: first ? first.currency : 'CNY',
      balanceRows: rows,
      message: json.is_available ? '账户可正常调用' : '余额不足或暂不可用',
    }
  },
}
function customParse(json) {
  const balanceRows = extractBalanceGeneric(json)
  const windows = extractWindowsGeneric(json)
  if (!balanceRows.length && !windows.length) throw new Error('未在响应中识别到余额/额度字段（可查看原始 JSON 确认字段名）')
  if (balanceRows.length && !windows.length) {
    return { kind: 'balance', amount: balanceRows[0].value, currency: balanceRows[0].currency, balanceRows, windows, message: '自定义接口（余额模式）' }
  }
  return { kind: 'usage', windows, balanceRows, message: '自定义接口（额度模式）' }
}

export const PROVIDERS = [
  // ---- 官方内置平台（仅保留两个官方接口）----
  { id: 'deepseek', name: 'DeepSeek', kind: 'balance', defaultBaseUrl: 'https://api.deepseek.com', path: '/user/balance', auth: 'bearer', currency: 'CNY', keyEnv: 'DEEPSEEK_API_KEY', docsUrl: 'https://api-docs.deepseek.com/api/deepseek-api/user-balance', consoleUrl: 'https://platform.deepseek.com/usage', parse: PARSERS.deepseek },
  { id: 'opencode-go', name: 'OpenCode Go', kind: 'usage', defaultBaseUrl: 'https://opencode.ai', path: '/zen/go/v1/usage', auth: 'bearer', keyEnv: 'OPENCODE_GO_API_KEY', docsUrl: 'https://opencode.ai', consoleUrl: 'https://opencode.go', parse: opencodeGoParse },
  // ---- 其余平台（Moonshot / OpenRouter / OpenAI / Anthropic / Together 等）一律改用「自定义接口」接入 ----
  { id: 'custom', name: '自定义接口', kind: 'custom', path: '', auth: 'bearer', docsUrl: '', consoleUrl: '', parse: customParse, note: 'URL 填完整接口地址（含路径），自动识别余额/额度字段' },
]

export function getProvider(id) {
  return PROVIDERS.find((p) => p.id === id) || null
}

// ---------------------------------------------------------------------------
// HTTP / 密钥 / 状态文件
// ---------------------------------------------------------------------------

async function httpFetch(url, headers, timeoutMs) {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs ?? REQUEST_TIMEOUT_MS)
  try {
    const res = await fetch(url, { method: 'GET', headers, signal: ctrl.signal, redirect: 'follow' })
    const text = await res.text()
    return { status: res.status, ok: res.ok, text }
  } catch (e) {
    if (e && e.name === 'AbortError') throw new Error('请求超时')
    throw new Error('请求失败: ' + ((e && e.message) || e))
  } finally {
    clearTimeout(timer)
  }
}

function readState() {
  try {
    if (!existsSync(STATE_PATH)) return {}
    return JSON.parse(readFileSync(STATE_PATH, 'utf8')) || {}
  } catch (e) {
    return {}
  }
}
function writeState(obj) {
  try {
    const dir = dirname(STATE_PATH)
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    writeFileSync(STATE_PATH, JSON.stringify(obj), { encoding: 'utf8', mode: 0o600 })
  } catch (e) { /* ignore */ }
}

// 客户端配置读写（仅 enabled/intervalMs；无密钥）
function loadClientCfg() {
  try {
    if (!existsSync(CLIENT_CFG_PATH)) return { enabled: [], intervalMs: DEFAULT_INTERVAL_MS }
    const s = JSON.parse(readFileSync(CLIENT_CFG_PATH, 'utf8')) || {}
    const enabled = Array.isArray(s.enabled)
      ? s.enabled.filter((e) => e && typeof e.id === 'string')
          .map((e) => ({
            id: e.id,
            baseUrl: typeof e.baseUrl === 'string' && e.baseUrl ? e.baseUrl : undefined,
          }))
      : []
    const intervalMs = VALID_INTERVALS.indexOf(s.intervalMs) >= 0 ? s.intervalMs : DEFAULT_INTERVAL_MS
    return { enabled, intervalMs }
  } catch (e) {
    return { enabled: [], intervalMs: DEFAULT_INTERVAL_MS }
  }
}
function saveClientCfg(cfg) {
  try {
    const dir = dirname(CLIENT_CFG_PATH)
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    const safe = {
      enabled: Array.isArray(cfg.enabled)
        ? cfg.enabled.filter((e) => e && typeof e.id === 'string').map((e) => ({
            id: e.id,
            baseUrl: typeof e.baseUrl === 'string' && e.baseUrl ? e.baseUrl : undefined,
          }))
        : [],
      intervalMs: VALID_INTERVALS.indexOf(cfg.intervalMs) >= 0 ? cfg.intervalMs : DEFAULT_INTERVAL_MS,
      savedAt: new Date().toISOString(),
    }
    writeFileSync(CLIENT_CFG_PATH, JSON.stringify(safe, null, 2), { encoding: 'utf8', mode: 0o600 })
  } catch (e) { /* ignore */ }
}

// Key 解析顺序：显式传入 > 本机状态文件 > DSH 凭据 > 环境变量
async function resolveKey(ctx, explicit, keyEnv, providerId) {
  if (explicit) return explicit
  const state = readState()
  const stored = state[providerId]
  if (stored && typeof stored.apiKey === 'string' && stored.apiKey.trim()) return stored.apiKey.trim()
  if (keyEnv) {
    try {
      const creds = ctx.get('credentials')
      if (creds && typeof creds.resolve === 'function') {
        const hit = await creds.resolve(keyEnv)
        const value = hit && typeof hit.value === 'string' ? hit.value.trim() : ''
        if (value) return value
      }
    } catch (e) { /* ignore */ }
    try {
      const value = process.env[keyEnv]
      if (value && value.trim()) return value.trim()
    } catch (e) { /* ignore */ }
  }
  return null
}

function maskKey(key) {
  if (!key) return ''
  if (key.length <= 8) return '••••'
  return key.slice(0, 4) + '••••' + key.slice(-4)
}

// ---------------------------------------------------------------------------
// 归一化查询
// ---------------------------------------------------------------------------

function buildQueryUrl(def, base) {
  const b = (base || def.defaultBaseUrl || '').replace(/\/+$/, '')
  if (def.id === 'custom') return b // 用户直接填完整 URL
  return b + def.path
}

function buildHeaders(def, key) {
  const headers = { 'user-agent': UA, accept: 'application/json' }
  if (def.auth === 'bearer') headers.authorization = 'Bearer ' + key
  else if (def.auth === 'raw') headers.authorization = key
  else if (def.auth === 'x-api-key') headers['x-api-key'] = key
  Object.assign(headers, def.extraHeaders || {})
  return headers
}

export async function runQuery(ctx, input) {
  const providerId = getStr(input.provider)
  const def = getProvider(providerId)
  if (!def) return { ok: false, error: '未知 provider: ' + providerId }
  const apiKey = await resolveKey(ctx, getStr(input.apiKey), def.keyEnv, providerId)
  if (!apiKey) {
    return { ok: false, provider: def.id, needKey: true, error: '未配置 API Key' + (def.keyEnv ? '（' + def.keyEnv + '）' : '') }
  }
  let url = buildQueryUrl(def, getStr(input.baseUrl))
  let res
  try {
    res = await httpFetch(url, buildHeaders(def, apiKey))
  } catch (e) {
    return { ok: false, provider: def.id, error: e.message, url }
  }
  let json = null
  try { json = JSON.parse(res.text) } catch (e) { json = null }
  const base = { provider: def.id, name: def.name, kind: def.kind, source: url, httpStatus: res.status, refreshedAt: new Date().toISOString() }
  if (!res.ok) {
    return { ok: false, ...base, error: 'HTTP ' + res.status + (json && json.error?.message ? '：' + json.error.message : ''), raw: res.text.slice(0, 6000) }
  }
  if (json === null) {
    return { ok: false, ...base, error: '响应不是 JSON', raw: res.text.slice(0, 6000) }
  }
  try {
    const parsed = def.parse(json)
    const out = { ok: true, ...base, ...parsed }
    if (out.windows) {
      out.windows = out.windows.map((w) => ({ ...w, percent: w.percent !== undefined ? clamp(w.percent) : w.percent }))
    }
    return out
  } catch (err) {
    return { ok: false, ...base, error: (err && err.message) || String(err), raw: JSON.stringify(json).slice(0, 6000) }
  }
}

// ---------------------------------------------------------------------------
// HTTP 路由注册
// ---------------------------------------------------------------------------

function sendJson(res, status, payload) {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  })
  res.end(JSON.stringify(payload))
}

function readJsonBody(req) {
  return new Promise((resolve) => {
    let body = ''
    req.on('data', (chunk) => {
      body += chunk
      if (body.length > 64 * 1024) req.destroy()
    })
    req.on('end', () => {
      try { resolve(JSON.parse(body || '{}')) } catch (e) { resolve({}) }
    })
    req.on('error', () => resolve({}))
  })
}

export function apply(ctx) {
  ctx.inject(['webServer'], (httpCtx) => {
    // config：provider 注册表（脱敏，不含密钥默认值泄露）+ 已保存密钥状态
    httpCtx.effect(() => httpCtx.webServer.register({
      kind: 'exact',
      path: '/dsh-quota-dashboard/config',
      handler: async (req, res) => {
        sendJson(res, 200, {
          version: VERSION,
          defaultIntervalMs: DEFAULT_INTERVAL_MS,
          providers: PROVIDERS.map((p) => ({
            id: p.id, name: p.name, kind: p.kind,
            defaultBaseUrl: p.defaultBaseUrl || '',
            defaultPath: p.path || '',
            currency: p.currency || null,
            keyEnv: p.keyEnv || null,
            docsUrl: p.docsUrl || '', consoleUrl: p.consoleUrl || '',
            note: p.note || null,
          })),
          keys: await listKeysStatus(ctx),
        })
      },
    }))

    // query：POST JSON 查询单个 provider 的额度/余额
    httpCtx.effect(() => httpCtx.webServer.register({
      kind: 'exact',
      path: '/dsh-quota-dashboard/query',
      handler: async (req, res) => {
        if (req.method !== 'POST') { sendJson(res, 405, { ok: false, error: 'method not allowed' }); return }
        const input = await readJsonBody(req)
        const result = await runQuery(ctx, input)
        sendJson(res, 200, result)
      },
    }))

    // keys：GET 列出脱敏状态；POST {provider, apiKey?} 保存/清空
    httpCtx.effect(() => httpCtx.webServer.register({
      kind: 'exact',
      path: '/dsh-quota-dashboard/keys',
      handler: async (req, res) => {
        if (req.method === 'GET') {
          sendJson(res, 200, await listKeysStatus(ctx))
          return
        }
        if (req.method === 'POST' || req.method === 'PUT') {
          const input = await readJsonBody(req)
          const providerId = getStr(input.provider)
          const apiKey = getStr(input.apiKey)
          const state = readState()
          if (apiKey) state[providerId] = { apiKey, savedAt: new Date().toISOString() }
          else delete state[providerId]
          writeState(state)
          sendJson(res, 200, { ok: true, keys: await listKeysStatus(ctx) })
          return
        }
        sendJson(res, 405, { ok: false, error: 'method not allowed' })
      },
    }))

    // client-cfg：GET 读客户端配置（脱敏，无密钥）；POST 写回
    httpCtx.effect(() => httpCtx.webServer.register({
      kind: 'exact',
      path: '/dsh-quota-dashboard/client-cfg',
      handler: async (req, res) => {
        if (req.method === 'POST' || req.method === 'PUT') {
          const input = await readJsonBody(req)
          const cfg = {
            enabled: Array.isArray(input.enabled)
              ? input.enabled.filter((e) => e && typeof e.id === 'string').map((e) => ({
                  id: e.id,
                  baseUrl: typeof e.baseUrl === 'string' && e.baseUrl ? e.baseUrl : undefined,
                }))
              : [],
            intervalMs: VALID_INTERVALS.indexOf(input.intervalMs) >= 0 ? input.intervalMs : DEFAULT_INTERVAL_MS,
          }
          saveClientCfg(cfg)
          sendJson(res, 200, { ok: true, cfg: loadClientCfg() })
          return
        }
        if (req.method === 'GET') {
          sendJson(res, 200, { ok: true, cfg: loadClientCfg() })
          return
        }
        sendJson(res, 405, { ok: false, error: 'method not allowed' })
      },
    }))
  })
}

async function listKeysStatus(ctx) {
  const state = readState()
  const saved = {}
  for (const id of Object.keys(state)) {
    const k = state[id] && state[id].apiKey
    if (typeof k === 'string' && k.trim()) saved[id] = maskKey(k.trim())
  }
  const envVars = []
  const ready = []
  for (const p of PROVIDERS) {
    if (p.keyEnv && process.env[p.keyEnv]) envVars.push(p.keyEnv)
    // ready：平台 Key 当前可解析（本机状态文件 / DSH 凭据 / 环境变量任一路径命中）
    try {
      const k = await resolveKey(ctx, null, p.keyEnv, p.id)
      if (k) ready.push(p.id)
    } catch (e) { /* ignore */ }
  }
  return { saved, envVars, ready }
}
