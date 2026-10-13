// 峰谷逻辑验证：从 client.js 源码中提取 getPeakStatus（保证测的是实际发布的代码），
// 用固定时间点断言 mode 与 countdown。运行：node scripts/test-peak.mjs
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const src = readFileSync(join(import.meta.dirname, '..', 'client.js'), 'utf8')
const start = src.indexOf('const PEAK_WINDOWS')
const end = src.indexOf('function fmtCountdown')
if (start < 0 || end < 0) { console.error('未能在 client.js 中定位 PEAK_WINDOWS/getPeakStatus 代码段'); process.exit(1) }
const code = src.slice(start, end)
const factory = new Function(code + '\nreturn getPeakStatus')
const getPeakStatus = factory()

// 北京时间构造（本地时区无关）：给定 YYYY-MM-DD hh:mm:ss 的北京时间 → UTC ms
function bj(y, mo, d, h, mi, s) {
  // 北京时间 = UTC+8
  return Date.UTC(y, mo - 1, d, h, mi, s) - 8 * 3600 * 1000
}

let pass = 0, fail = 0
function check(desc, when, wantMode, wantCd) {
  const r = getPeakStatus(when)
  const okMode = r.mode === wantMode
  const okCd = r.countdown === wantCd // 固定时间输入必须精确，无执行耗时容差
  if (okMode && okCd) { pass++; console.log('  ✓ ' + desc + ' → ' + r.mode + ' cd=' + fmt(r.countdown)) }
  else { fail++; console.error('  ✗ FAIL ' + desc + ' → got ' + r.mode + ' cd=' + r.countdown + ', want ' + wantMode + ' cd=' + wantCd) }
}
const fmt = (sec) => sec === null ? '日历待更新' : Math.floor(sec / 3600) + 'h' + Math.floor((sec % 3600) / 60) + 'm' + (sec % 60) + 's'

// 2026-08-24 是周一；08-29 周六；08-30 周日；08-28 周五
console.log('== 工作日峰内 ==')
check('周一 10:30 峰内', bj(2026, 8, 24, 10, 30, 0), 'peak', (12 * 3600) - (10.5 * 3600))           // 1.5h 到 12:00
check('周三 15:00 峰内', bj(2026, 8, 26, 15, 0, 0), 'peak', 3 * 3600)                                  // 3h 到 18:00
check('周五 09:00:00 边界=峰', bj(2026, 8, 28, 9, 0, 0), 'peak', 3 * 3600)                              // 整点入峰
console.log('== 工作日谷内 ==')
check('周一 08:00 谷→今日 9:00', bj(2026, 8, 24, 8, 0, 0), 'valley', 3600)
check('周一 12:00:00 边界=谷→14:00', bj(2026, 8, 24, 12, 0, 0), 'valley', 2 * 3600)                    // 12:00 整点出峰
check('周一 18:00:00 边界=谷→次日 9:00', bj(2026, 8, 24, 18, 0, 0), 'valley', 15 * 3600)               // 周二 9:00
check('周五 19:00 谷→周一 9:00', bj(2026, 8, 28, 19, 0, 0), 'valley', 62 * 3600)                       // 周一 9:00
console.log('== 周末全天为谷（官方最新规则关键点）==')
check('周六 10:30 谷（旧逻辑会误判为峰）', bj(2026, 8, 29, 10, 30, 0), 'valley', 46.5 * 3600)          // 周一 9:00
check('周六 15:00 谷（旧逻辑会误判为峰）', bj(2026, 8, 29, 15, 0, 0), 'valley', 42 * 3600)             // 周一 9:00
check('周日 23:00 谷→周一 9:00', bj(2026, 8, 30, 23, 0, 0), 'valley', 10 * 3600)
check('周日 09:30 谷（旧逻辑会误判为峰）', bj(2026, 8, 30, 9, 30, 0), 'valley', 23.5 * 3600)           // 周一 9:00

console.log('== 中国节假日：完整放假区间全天为空闲 ==')
// 独立固定 fixture，来源：国办发明电〔2025〕7号（2026 年放假通知）。
// 包括工作日上的调休假期；不能只排除节日当天。
for (const [month, first, last, nextMonth, nextDay] of [
  [1, 1, 3, 1, 5], [2, 15, 23, 2, 24], [4, 4, 6, 4, 7],
  [5, 1, 5, 5, 6], [6, 19, 21, 6, 22], [9, 25, 27, 9, 28],
  [10, 1, 7, 10, 8],
]) {
  const next = bj(2026, nextMonth, nextDay, 9, 0, 0)
  for (let day = first; day <= last; day++) {
    for (const hour of [0, 10, 15, 23]) {
      const when = bj(2026, month, day, hour, 0, 0)
      check(`放假 ${month}-${day} ${hour}:00`, when, 'valley', (next - when) / 1000)
    }
  }
}
console.log('== 假期前后倒计时与调休上班周末 ==')
check('国庆前夜跳过七天假期', bj(2026, 9, 30, 18, 0, 0), 'valley', 183 * 3600)
check('春节前周五晚跳过九天假期与调休周六', bj(2026, 2, 13, 18, 0, 0), 'valley', 255 * 3600)
check('国庆最后一天 23:59:59', bj(2026, 10, 7, 23, 59, 59), 'valley', 9 * 3600 + 1)
check('国庆后 08:59:59', bj(2026, 10, 8, 8, 59, 59), 'valley', 1)
check('国庆后 09:00 恢复高峰', bj(2026, 10, 8, 9, 0, 0), 'peak', 3 * 3600)
check('上午高峰最后一秒', bj(2026, 10, 8, 11, 59, 59), 'peak', 1)
check('下午高峰前一秒', bj(2026, 10, 8, 13, 59, 59), 'valley', 1)
check('下午 14:00 入峰', bj(2026, 10, 8, 14, 0, 0), 'peak', 4 * 3600)
check('下午高峰最后一秒', bj(2026, 10, 8, 17, 59, 59), 'peak', 1)
check('调休上班周六 10:00 仍为谷', bj(2026, 10, 10, 10, 0, 0), 'valley', 47 * 3600)
check('调休上班周日 15:00 仍为谷', bj(2026, 9, 20, 15, 0, 0), 'valley', 18 * 3600)
// Date 与毫秒输入一致；北京日期跨日不可按 UTC 的星期判定。
check('Date 输入：北京周一凌晨（UTC 周日）', new Date(bj(2026, 8, 24, 0, 0, 0)), 'valley', 9 * 3600)
console.log('== 未收录年份与跨年不能猜测节假日 ==')
check('跨年倒计时待更新', bj(2026, 12, 31, 18, 0, 0), 'valley', null)
check('未知年份周五峰窗口待确认', bj(2027, 1, 1, 10, 0, 0), 'unknown', null)
check('未知年份周末仍可确认空闲', bj(2027, 1, 2, 10, 0, 0), 'valley', null)
check('未知年份峰窗口以外仍为空闲', bj(2027, 1, 4, 12, 0, 0), 'valley', null)
const formatFactory = new Function(src.slice(end, src.indexOf('// 局部倒计时叶子组件', end)) + '\nreturn fmtCountdown')
if (formatFactory()(null) !== '日历待更新') { fail++; console.error('未知倒计时不能显示 00:00:00') }
else { pass++; console.log('  ✓ 未知倒计时显示日历待更新') }

console.log('\n========== ' + (fail ? '❌ ' + fail + ' 失败' : '✅ 全部通过 (' + pass + ')') + ' ==========')
process.exit(fail ? 1 : 0)

