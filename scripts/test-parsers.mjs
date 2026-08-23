// 解析器单测：用真实响应形状验证各平台 parse 输出归一化。
// 当前内置平台仅 deepseek / opencode-go / custom（其余平台一律走自定义接口）。
// 运行：node scripts/test-parsers.mjs
import { getProvider, PROVIDERS } from '../index.js'

function ok(cond, msg) {
  if (!cond) { console.error('  ✗ FAIL: ' + msg); process.exitCode = 1 }
  else console.log('  ✓ ' + msg)
}
function run(id, fixture) {
  const p = getProvider(id)
  if (!p) { console.error('  ✗ 未知 provider ' + id); process.exitCode = 1; return null }
  try { return p.parse(fixture) }
  catch (e) { console.error('  ✗ throws for ' + id + ': ' + e.message); process.exitCode = 1; return null }
}

console.log('== provider 清单 ==')
console.log('  ' + PROVIDERS.map((p) => p.id + '(' + p.kind + ')').join(', '))
ok(PROVIDERS.length === 3, '内置平台仅 3 个（deepseek/opencode-go/custom）')
ok(!PROVIDERS.some((p) => ['moonshot', 'openrouter', 'openai', 'anthropic', 'together'].includes(p.id)), '已移除 moonshot/openrouter/openai/anthropic/together')

console.log('\n== deepseek 余额 ==')
{
  const r = run('deepseek', {
    is_available: true,
    balance_infos: [
      { currency: 'CNY', total_balance: '12.34', granted_balance: '2.00', topped_up_balance: '10.34' },
      { currency: 'USD', total_balance: '1.00', granted_balance: '0', topped_up_balance: '1.00' },
    ],
  })
  if (r) {
    ok(r.kind === 'balance', 'kind=balance')
    ok(r.amount === 12.34, 'amount=12.34 got ' + r.amount)
    ok(r.currency === 'CNY', 'currency=CNY')
    ok(r.balanceRows.length === 6, '6 rows got ' + r.balanceRows.length)
    ok(r.balanceRows[0].label === '总余额' && r.balanceRows[0].value === 12.34, '首行总余额=12.34')
  }
}

console.log('\n== opencode-go (percent=已用%) ==')
{
  const r = run('opencode-go', {
    usage: {
      rolling: { percent: 30, resetsAt: '2026-08-21T01:00:00+08:00' },
      weekly: { percent: 60, resetsAt: '2026-08-23T00:00:00+08:00' },
      monthly: { percent: 15, resetsAt: '2026-09-01T00:00:00+08:00' },
    },
  })
  if (r) {
    ok(r.kind === 'usage', 'kind=usage')
    ok(r.windows.length === 3, '3 windows')
    const wk = r.windows.find((w) => w.label === '近7天')
    ok(wk && wk.percent === 60, '近7天已用60%')
    ok(!!(wk && wk.resetAt), '带 resetAt')
  }
}

console.log('\n== custom 通用（余额模式）==')
{
  const r = run('custom', { data: { available_balance: '42.00', currency: 'CNY' } })
  if (r) ok(r.kind === 'balance' && r.amount === 42, 'amount=42 balance模式')
}
console.log('== custom 通用（额度模式，percent字段）==')
{
  const rs = [run('custom', { usage: { rolling: { percent: 20 } } }), run('custom', { data: { percent: 80 } })]
  rs[0] && ok(rs[0].kind === 'usage' && rs[0].windows.some((w) => w.percent === 20), 'percent 20 → usage window')
  rs[1] && ok(rs[1].kind === 'usage' && rs[1].windows.some((w) => w.percent === 80), 'percent 80 → usage window')
}

console.log('\n== custom 通用（used+limit）==')
{
  const r = run('custom', { rate_limit: { used: 25, limit: 100 } })
  if (r) {
    ok(r.kind === 'usage', 'kind=usage')
    const w = r.windows.find((x) => x.used === 25 && x.limit === 100)
    ok(!!w, '识别 used=25 limit=100')
  }
}

console.log('\n== custom 通用（Moonshot 形状 → 余额模式）==')
{
  const r = run('custom', { data: { available_balance: '100.00', cash_balance: 60, voucher_balance: 40, currency: 'CNY' } })
  if (r) {
    ok(r.amount === 100, 'amount=100')
    ok(r.balanceRows.some((x) => x.label === '可用余额' && x.value === 100), '识别 available_balance 为可用余额')
    ok(r.currency === 'CNY', 'currency=CNY')
  }
}
console.log('== custom 通用（OpenRouter 形状 → 余额模式）==')
{
  const r = run('custom', { data: { credits: 10, currency: 'USD' } })
  if (r) ok(r.kind === 'balance' && r.amount === 10, 'credits=10 balance模式')
}

console.log('\n' + (process.exitCode ? '❌ 有失败项' : '✅ 全部通过'))
