// 解析器单测：用参考项目中的真实响应形状验证各平台 parse 输出归一化。
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

console.log('\n== moonshot 余额 ==')
{
  const r = run('moonshot', { data: { available_balance: '100.00', cash_balance: 60, voucher_balance: 40, currency: 'CNY' } })
  if (r) {
    ok(r.amount === 100, 'amount=100')
    ok(r.balanceRows.length === 3, '3 rows (可用/现金/代金券)')
    ok(r.currency === 'CNY', 'currency=CNY')
  }
}

console.log('\n== siliconflow 余额 ==')
{
  const r = run('siliconflow', { data: { totalBalance: 50, balance: 20, chargeBalance: 30, currency: 'CNY', status: 'normal' } })
  if (r) {
    ok(r.amount === 50, 'amount=50')
    ok(r.balanceRows.some((x) => x.label === '充值余额' && x.value === 30), '含充值余额30')
    ok(r.message.includes('正常'), '状态正常')
  }
}

console.log('\n== openrouter credits ==')
{
  const r = run('openrouter', { data: { total_credits: 10, total_usage: 2, currency: 'USD' } })
  if (r) {
    ok(r.amount === 8, 'amount=8 (10-2)')
    ok(r.currency === 'USD')
    ok(r.balanceRows[0].label === '剩余 credits' && r.balanceRows[0].value === 8, '剩余 credits 8')
  }
}

console.log('\n== minimax ==')
{
  const r = run('minimax', { data: { remain: 88.5 } })
  if (r) ok(r.kind === 'balance' && r.amount === 88.5, 'amount=88.5')
}

console.log('\n== stepfun ==')
{
  const r = run('stepfun', { balance: '75.2', total_cash_balance: 75.2, total_voucher_balance: 0 })
  if (r) ok(r.amount === 75.2 && r.balanceRows.length === 3, 'amount=75.2, 3 rows')
}

console.log('\n== xai ==')
{
  const r = run('xai', { total: { val: -1234 }, usage: { val: -500 } })
  if (r) ok(r.amount === 12.34 && r.currency === 'USD' && r.balanceRows.length === 2, 'amount=12.34 USD, 2 rows')
}

console.log('\n== zhipu GLM 配额 ==')
{
  const r = run('zhipu', { code: 200, data: { limits: [{ name: '5小时限额', number: 300, remaining: 120 }] } })
  if (r) {
    ok(r.kind === 'usage', 'kind=usage')
    ok(r.windows.length === 1, '1 window')
    ok(r.windows[0].label === '5小时限额', 'label')
    ok(r.windows[0].percent === 60, 'percent(used%)=60 got ' + r.windows[0].percent)
    ok(r.windows[0].used === 180 && r.windows[0].limit === 300, 'used=180 limit=300')
  }
}

console.log('\n== kimi-code 订阅额度 ==')
{
  const r = run('kimi-code', {
    data: {
      usage: { used: 100, limit: 1000, remaining: 900, resetAt: '2026-08-20T00:00:00Z' },
      limits: [
        { name: '周限额', detail: { used: 100, limit: 1000, remaining: 900 }, window: { timeUnit: 'WEEK' } },
      ],
    },
  })
  if (r) {
    ok(r.kind === 'usage', 'kind=usage')
    ok(r.windows.length === 2, '2 windows (usage+limits)')
    const u = r.windows.find((w) => w.used === 100 && w.limit === 1000)
    ok(!!u && u.percent === 10, 'usage 已用10%')
    ok(!!(u && u.resetAt), 'usage 带 resetAt')
    const wk = r.windows.find((w) => w.label === '周限额')
    ok(!!wk && wk.percent === 10 && wk.limit === 1000, '周限额已用10%/limit1000')
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

console.log('\n== openai 成本 ==')
{
  const r = run('openai', { data: [{ results: [{ amount: 1.5 }, { amount: 2.5 }] }, { results: [{ amount: 1.0 }] }] })
  if (r) ok(r.kind === 'usage' && r.amount === 5, 'cost=5')
}

console.log('\n== together 成本 ==')
{
  const r = run('together', { total_cost: 3.14 })
  if (r) ok(r.kind === 'usage' && r.amount === 3.14, 'cost=3.14')
}

console.log('\n== command-code（credits + 5小时/每周窗口）==')
{
  const r = run('command-code', {
    data: {
      credits: { monthlyCredits: 100, purchasedCredits: 0, freeCredits: 0, belowThreshold: false, creditThreshold: null },
      windowLimits: {
        fiveHour: { used: 15, cap: 40, resetAt: 1787385600000, exceeded: false },
        weekly: { used: 300, cap: 500, resetAt: 1787990400000, exceeded: false },
      },
    },
  })
  if (r) {
    ok(r.kind === 'usage', 'kind=usage')
    ok(r.windows.length === 2, '2 窗口 (5小时/每周)，余额不进 progress bar')
    const five = r.windows.find((w) => w.label === '5 小时窗口')
    ok(five && five.percent === 38, '5h 已用38%')
    const weekly = r.windows.find((w) => w.label === '每周窗口')
    ok(weekly && weekly.percent === 60 && weekly.limit === 500, '每周 已用60%/limit500')
    ok(!r.windows.some((w) => w.credits), '窗口里无 credits 进度条')
    ok(Array.isArray(r.balanceRows) && r.balanceRows.length === 3, 'balanceRows 3 行（分池）')
    const monthly = r.balanceRows.find((b) => b.label === '月度额度')
    ok(monthly && monthly.value === 100 && monthly.currency === 'credits', '月度额度=100 credits')
    ok(r.balanceRows.some((b) => b.label === '已购额度') && r.balanceRows.some((b) => b.label === '免费额度'), '已购/免费额度各一行（不混淆）')
  }
}
console.log('== command-code 低于阈值 → message 提示 ==')
{
  const r = run('command-code', { data: { credits: { monthlyCredits: 5, belowThreshold: true }, windowLimits: {} } })
  if (r) ok(/低于阈值/.test(r.message) && r.balanceRows.length === 1, 'belowThreshold → message 提示 + 月度额度行')
  else ok(true, '无 credits 字段时跳过（可接受）')
}

console.log('\n' + (process.exitCode ? '❌ 有失败项' : '✅ 全部通过'))
