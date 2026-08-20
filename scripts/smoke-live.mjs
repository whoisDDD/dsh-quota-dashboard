// 真实网络 smoke：对 DeepSeek / Kimi Code / OpenCode Go 做一次真实查询。
// 密钥仅在本机凭据库内解析，绝不输出；只打印归一化数值/错误消息（不含 raw）。
// 运行：node scripts/smoke-live.mjs
import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { runQuery } from '../index.js'

const credPath = process.env.DSH_CRED_PATH || join(homedir(), '.dsh', '.credentials.yaml')
let keyMap = {}
try {
  const raw = readFileSync(credPath, 'utf8')
  for (const line of raw.split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+):\s*(.+?)\s*$/)
    if (m) keyMap[m[1]] = m[2]
  }
} catch (e) { console.error('无法读取凭据库（跳过真实 smoke）: ' + e.message) }

const ctx = {
  get(name) {
    if (name === 'credentials') {
      return { resolve: async (ref) => (keyMap[ref] ? { value: keyMap[ref] } : null) }
    }
    return undefined
  },
}

const TARGETS = ['deepseek', 'kimi-code', 'opencode-go', 'command-code']
for (const id of TARGETS) {
  const ref = { deepseek: 'DEEPSEEK_API_KEY', 'kimi-code': 'KIMI_CODING_API_KEY', 'opencode-go': 'OPENCODE_GO_API_KEY', 'command-code': 'COMMANDCODE_API_KEY' }[id]
  if (!keyMap[ref]) { console.log('\n[' + id + '] 无凭据 ' + ref + '，跳过'); continue }
  console.log('\n===== ' + id + ' =====')
  const r = await runQuery(ctx, { provider: id })
  if (!r.ok) {
    console.log('  状态: 失败 | ' + (r.error || '') + (r.httpStatus ? ' | HTTP ' + r.httpStatus : ''))
    continue
  }
  const lines = []
  lines.push('  状态: ok | kind=' + r.kind + (r.message ? ' | ' + r.message : ''))
  if (r.balanceRows && r.balanceRows.length) {
    for (const row of r.balanceRows) lines.push('    - ' + row.label + ': ' + row.value + ' ' + (row.currency || ''))
  }
  if (r.windows && r.windows.length) {
    for (const w of r.windows) {
      lines.push('    - ' + w.label + ': 已用 ' + (w.percent !== undefined ? w.percent + '%' : '') + (w.used !== undefined && w.limit !== undefined ? ' (' + w.used + '/' + w.limit + ')' : '') + (w.resetAt ? ' | 重置 ' + w.resetAt : ''))
    }
  }
  lines.forEach((l) => console.log(l))
}
console.log('\n(smoke 完成；未输出任何密钥或原始响应)')
