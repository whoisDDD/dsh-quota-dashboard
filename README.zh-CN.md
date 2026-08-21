# dsh-quota-dashboard

English | [中文说明](README.zh-CN.md)

通用多平台 API 额度 / 余额实时监视器 —— [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (DSH) Web GUI 插件。

侧边栏底部一个实时按钮 + 终端风格面板，集中监控你的 **余额**（DeepSeek / Moonshot / OpenRouter…）与 **订阅额度窗口**（OpenCode Go…）。DeepSeek 标题实时显示 **峰/谷时段倒计时**（按官方定价页：高峰 = 北京时间 9:00–12:00 & 14:00–18:00，其余为谷时半价）。面板始终跟随 DSH 明暗主题，每 30 秒 ~ 5 分钟自动刷新，也可手动立即刷新。

## 特性

- 🎛️ **交互设置面板**：选平台 → 填 Base URL / API Key（可将 Key 保存到本机）→ 启用，即点即用；已启用平台随时移除
- 🖥️ **多平台卡片**：余额类显示金额 + 明细（现金/赠金/充值…），额度类显示各窗口已用% 进度条（左→右填充，绿<50%→橙 50–80%→红≥80%）+ 重置时间
- 🔴🟡🟢 **状态圆点**：按钮上每个启用平台一个点，额度紧张发红、偏低发黄、充足发绿；整体取最低
- ⏱️ **实时刷新**：30 秒 / 1 / 2 / 5 分钟可调，手动刷新随时触发
- 🔑 **Key 物理隔离**：面板输入（可存本机 0600）→ DSH 凭据库 → 环境变量；Key 只在 Host 进程使用，**不出现在 URL / 日志 / 浏览器**
- 🌗 **跟随 DSH 明暗主题**：面板颜色随 DSH 全局主题自动翻转，无独立配色选项
- ⏳ **DeepSeek 峰谷倒计时**：标题实时显示当前峰/谷时段 + 距切换倒计时（1s 精度，仅倒计时数字局部更新，不拖累整树渲染）
- 💾 **配置持久化**：启用清单 + 刷新间隔双写 localStorage + 服务端落盘（`~/.dsh/.dsh-quota-dashboard-client.json`），重启 DSH / 清浏览器数据 / 换浏览器均可自动恢复
- 📦 **通用自定义接口**：任意返回余额/额度字段的 API 均可接入（自动递归识别）

## 支持的平台

| 类型 | 平台 | 接口 | Key 环境变量 |
| --- | --- | --- | --- |
| 余额 | DeepSeek | `GET /user/balance` | `DEEPSEEK_API_KEY` |
| 余额 | Moonshot / Kimi 开放平台 | `GET /v1/users/me/balance` | `MOONSHOT_API_KEY` |
| 余额 | OpenRouter | `GET /api/v1/credits` | `OPENROUTER_API_KEY` |
| 额度窗口 | OpenCode Go | `GET /zen/go/v1/usage` | `OPENCODE_GO_API_KEY` |
| 用量(近30天) | OpenAI 组织 | `GET /v1/organization/costs` | 组织 Admin Key（best effort） |
| 用量(近30天) | Anthropic | `GET /v1/organizations/cost_report` | Admin Key（best effort） |
| 用量(近30天) | Together AI | `GET /v1/billing/usage` | `TOGETHER_API_KEY` |
| 自定义 | 任意兼容接口 | 面板填完整 URL + Key | 自动识别 |

> 仅保留有**官方文档确认端点**的平台。以下平台因端点无法通过官方文档验证或仅对特殊订阅用户可用，已移除：硅基流动、MiniMax、阶跃星辰、xAI、Kimi Code 订阅、Command Code、智谱 GLM（仅 Coding Plan）。

## 安装

```bash
dsh plugin --profile web add <path-to-dsh-quota-dashboard>
```

纯 JavaScript，零构建：`index.js`（Host）+ `client.js`（Client）直接运行。重启 `dsh web` 后侧边栏底部出现按钮。

## 使用

1. 点击侧边栏底部按钮展开面板。
2. 「⚙️ 设置」→ 选择平台 → 填 Base URL（留空用默认）/ API Key → 「测试」验证 → 「启用」加入面板。
3. 若 DSH 凭据库或环境变量已有该平台的 Key，「快捷配置」区会显示「一键启用」。
4. 面板顶部即时显示各平台状态；「刷新间隔」可选 30s–5min 或关闭。

### 配置（环境变量，可选）

| 变量 | 默认 | 含义 |
| --- | --- | --- |
| `DSH_QUOTA_STATE_PATH` | `$DSH_HOME/.dsh-quota-dashboard.json` | 本机保存 API Key 的状态文件路径（0600） |

Key 解析顺序：面板输入（可存本机）> 本机状态文件 > DSH 凭据库 > 环境变量。

客户端配置（启用清单 + 刷新间隔）自动落盘于 `$DSH_HOME/.dsh-quota-dashboard-client.json`（0600），无需手动配置。

## 开发 / 自测

```bash
node --check index.js client.js
node scripts/test-parsers.mjs     # fixture 解析单测
node scripts/smoke-live.mjs       # 真实网络 smoke（读取凭据库，输出脱敏）
```

## License

MIT。基于 [InvisibleSirius/dsh-quota-dashboard](https://github.com/InvisibleSirius/dsh-quota-dashboard) 修改。
