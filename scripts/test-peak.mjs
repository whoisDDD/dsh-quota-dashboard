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
  const okCd = Math.abs(r.countdown - wantCd) <= 2 // 允许 ±2s（执行耗时）
  if (okMode && okCd) { pass++; console.log('  ✓ ' + desc + ' → ' + r.mode + ' cd=' + fmt(r.countdown)) }
  else { fail++; console.error('  ✗ FAIL ' + desc + ' → got ' + r.mode + ' cd=' + r.countdown + ', want ' + wantMode + ' cd=' + wantCd) }
}
const fmt = (sec) => Math.floor(sec / 3600) + 'h' + Math.floor((sec % 3600) / 60) + 'm' + (sec % 60) + 's'

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

console.log('\n========== ' + (fail ? '❌ ' + fail + ' 失败' : '✅ 全部通过 (' + pass + ')') + ' ==========')
process.exit(fail ? 1 : 0)
