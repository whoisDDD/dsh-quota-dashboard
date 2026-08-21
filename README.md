# dsh-quota-dashboard

[中文说明](README.zh-CN.md) | English

A universal **AI API quota / balance live monitor** plugin for the [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (DSH) Web GUI.

A realtime button + terminal-style panel at the bottom of the sidebar aggregates your **balances** (DeepSeek / Moonshot / OpenRouter…) and **subscription quota windows** (OpenCode Go…). The DeepSeek title shows a live **peak/valley countdown** (per official pricing: peak = Beijing 9:00–12:00 & 14:00–18:00, valley = half price). The panel always follows the DSH light/dark theme. Auto-refresh every 30s–5min, or manual refresh.

## Highlights

- 🎛️ **Interactive settings UI** – pick a platform → paste Base URL / API Key (optionally persist locally) → enable; remove anytime
- 🖥️ **Per-provider cards** – balance cards show amount + breakdown; quota cards show per-window used% bars (left→right fill, green <50% → orange 50–80% → red ≥80%) + reset time
- 🔴🟡🟢 **Status dots** – one dot per enabled provider on the sidebar button, colored by severity; overall shows the worst
- ⏱️ **Realtime refresh** – 30s / 1 / 2 / 5 min, plus manual refresh
- 🔑 **Key physical isolation** – panel input (persisted locally, 0600) → DSH credentials vault → environment variable; the key stays in the host process, **never in URLs / logs / browser**
- 🌗 **Theme-aware** – follows DSH light/dark automatically; no independent color options
- ⏳ **DeepSeek peak/valley countdown** – live peak/valley indicator + countdown in the title (1s precision; only the countdown digit re-renders, not the whole tree)
- 💾 **Config persistence** – enabled list + refresh interval dual-written to localStorage + host-side file (`~/.dsh/.dsh-quota-dashboard-client.json`); survives DSH restarts, browser data clearing, and browser switches
- 📦 **Custom endpoint** – any API returning balance/quota fields can be attached (auto recursive detection)

## Supported platforms

| Type | Platform | Endpoint | Key env var |
| --- | --- | --- | --- |
| Balance | DeepSeek | `GET /user/balance` | `DEEPSEEK_API_KEY` |
| Balance | Moonshot / Kimi OpenPlatform | `GET /v1/users/me/balance` | `MOONSHOT_API_KEY` |
| Balance | OpenRouter | `GET /api/v1/credits` | `OPENROUTER_API_KEY` |
| Quota windows | OpenCode Go | `GET /zen/go/v1/usage` | `OPENCODE_GO_API_KEY` |
| Usage (30d) | OpenAI org | `GET /v1/organization/costs` | org Admin key (best effort) |
| Usage (30d) | Anthropic | `GET /v1/organizations/cost_report` | Admin key (best effort) |
| Usage (30d) | Together AI | `GET /v1/billing/usage` | `TOGETHER_API_KEY` |
| Custom | any compatible API | full URL + key in panel | auto-detect |

> Only platforms with **officially documented endpoints** are included. The following were removed because their endpoints could not be verified against official docs or are only available to specific subscription tiers: SiliconFlow, MiniMax, StepFun, xAI, Kimi Code, Command Code, Zhipu GLM (Coding Plan only).

## Install

```bash
dsh plugin --profile web add <path-to-dsh-quota-dashboard>
```

Pure JavaScript, zero build: `index.js` (host) + `client.js` (client) run as-is. Restart `dsh web`; a button appears at the bottom of the sidebar.

## Usage

1. Click the sidebar button to open the panel.
2. `⚙️ Settings` → choose a platform → optionally change Base URL → enter API Key → `Test` → `Enable`.
3. If the DSH credentials vault or environment already has the key for a platform, the "Quick config" section shows a one-click enable button.
4. Cards update live; pick an auto-refresh interval or turn it off.

### Config (optional env var)

| Variable | Default | Meaning |
| --- | --- | --- |
| `DSH_QUOTA_STATE_PATH` | `$DSH_HOME/.dsh-quota-dashboard.json` | host-side persisted API keys (mode 0600) |

Key resolution order: panel input (persisted locally) → host state file → DSH credentials vault → environment variable.

Client config (enabled list + refresh interval) is automatically persisted to `$DSH_HOME/.dsh-quota-dashboard-client.json` (0600); no manual setup needed.

## Develop / test

```bash
node --check index.js client.js
node scripts/test-parsers.mjs   # fixture parser unit tests
node scripts/smoke-live.mjs     # live smoke (reads credentials, redacted output)
```

## License

MIT. Based on [InvisibleSirius/dsh-quota-dashboard](https://github.com/InvisibleSirius/dsh-quota-dashboard).
