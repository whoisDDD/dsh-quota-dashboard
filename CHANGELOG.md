# Changelog

本项目遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.0.0/) 风格，版本号遵循[语义化版本](https://semver.org/lang/zh-CN/)。

## [1.0.7] - 2026-09-01

### 修复 — 适配 DeepSeek Harness 0.1.2-alpha.2 客户端契约

- `client.js`：客户端插件对象声明 `inject: ['slots']`。alpha.2 的 loader 以插件对象的 inject 声明驱动 fiber 激活并等待服务就绪；此前未声明时，`apply` 可能在 slots 服务（由 `@deepseek-ai/dsh-client-ui-renderer` 提供）就绪前执行，`ctx.get('slots')` 返回 `undefined` 后旧代码静默 `return`（且 `applied` 已置位），导致额度面板入口永不出现——Host 路由（`/dsh-quota-dashboard/config` 等）不受影响，因此表现为「Host 正常、面板消失」。
- `client.js`：slots 服务暂时不可用时不静默退出，改为定时重试（`ctx.timeout`，随 fiber 卸载自动清理；`window.setTimeout` 兜底路径由 `ctx.effect` 注册清理），直至注册成功或插件卸载。
- `package.json`：`dsh.client.inject` 声明服务提供方包 `@deepseek-ai/dsh-client-ui-renderer`（图级到达顺序，与官方客户端插件声明模式一致）。
- 新增 `scripts/test-contract.mjs` 与 `npm test`：覆盖 dsh.client/`./client` 导出、module id、客户端 inject 声明、`sidebar.footer.action` 注册、Host 路由不泄露 Key、查询请求 Key 不进 URL、插件卸载清理。

## [1.0.6] - 2026-08-23

### 变更 — 峰谷显示对齐 DeepSeek 官方最新峰谷定价

- 峰谷规则改为官方最新峰谷定价：高峰时段 = 北京时间**周一至周五** 9:00–12:00 与 14:00–18:00（官方价格为空闲的 2 倍）；其余时段（**含周末全天**）为空闲谷时（半价）。
  依据：[DeepSeek 官方定价页](https://api-docs.deepseek.com/zh-cn/quick_start/pricing/)（deepseek-v4-flash / deepseek-v4-pro，2026-08-16 起生效）。
- 修正旧规则缺陷：此前无星期判断，周末 9:00–12:00 / 14:00–18:00 被误判为「峰」；现在周末全天为「谷」。
- 倒计时逻辑适配：工作日谷内指向今日稍晚的峰窗口；周五 18:00 后 / 周末全天指向下一个周一 9:00。
- 峰/谷标签新增 tooltip，说明官方峰谷价格倍率与精确时段。

### 移除 — 平台精简（只留两个官方接口）

- 移除内置平台：Moonshot / Kimi 开放平台、OpenRouter、OpenAI 组织用量、Anthropic 组织用量、Together AI。
- 默认只保留 **DeepSeek 官方接口**（余额）与 **OpenCode Go 订阅**（额度窗口）；其余平台一律改用「自定义接口」接入（填完整 URL + Key，自动递归识别余额/额度字段）。
- 删除只服务于被删平台的解析器（moonshot / openrouter / openaiCost / anthropicCost / togetherCost）、`sumCostBuckets` 与 `needsDates` 日期参数逻辑。
- 删除 macOS 专用、且针对旧版 15 平台 UI 编写的 `scripts/dev-gui-check.mjs` 开发脚本。

### 清理 — 冗余 / 死代码

- `client.js`：移除从未使用的 `anyUsage` / `anyBalance` 变量、`providersRef`、无 UI 入口的 `saveKey()`、无 UI 入口的 `rawOpen` 开关与 `disabled: busy && false` 死逻辑。
- `index.js`：移除从未使用的 `hasJson` 变量与无任何平台使用的 `preflight` 前置探测分支。
- 查询失败的卡片现在直接展示原始 JSON（截断 6000 字符），便于核对自定义接口字段名（原来 rawOpen 永远为 false，raw JSON 不可见）。

### 新增

- `scripts/test-peak.mjs`：峰谷逻辑 11 个边界用例（工作日峰/谷边界秒、周末全谷、跨周末倒计时）。
- 本 CHANGELOG。

## [1.0.5] - 2026-08-20

### 变更

- 峰谷时区计算改用 `Intl.DateTimeFormat`（`Asia/Shanghai`），消除「+8 小时」hack，不再依赖系统时区。
- 面板终端风格化（线框、去毛玻璃/阴影/动画），文字色随 DSH 明暗主题别名令牌翻转。
- README 拆分为英文（README.md）+ 中文（README.zh-CN.md），互相链接。

## [1.0.4 及更早]

- 初版多平台额度/余额监视器（Host/Client 双端、Key 物理隔离、配置持久化），基于 [InvisibleSirius/dsh-quota-dashboard](https://github.com/InvisibleSirius/dsh-quota-dashboard) 修改。
