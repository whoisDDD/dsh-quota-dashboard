# dsh-quota-dashboard

[中文说明](README.zh-CN.md) | English

A universal **AI API quota / balance live monitor** plugin for the [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (DSH) Web GUI.

A realtime button + terminal-style panel at the bottom of the sidebar aggregates your **balances** (DeepSeek official API…) and **subscription quota windows** (OpenCode Go…), with all other platforms attached via the **custom endpoint**. The DeepSeek title shows a live **peak/valley countdown** (per the latest official peak/valley pricing: peak = Beijing time Mon–Fri (excluding Chinese public holidays) 9:00–12:00 & 14:00–18:00, 2× the off-peak price; all other hours, including all of the weekend, are valley at half price). The panel always follows the DSH light/dark theme. Auto-refresh every 30s–5min, or manual refresh.

## Highlights

- 🎛️ **Interactive settings UI** – pick a platform → paste Base URL / API Key (optionally persist locally) → enable; remove anytime
- 🖥️ **Per-provider cards** – balance cards show amount + breakdown; quota cards show per-window used% bars (left→right fill, green <50% → orange 50–80% → red ≥80%) + reset time
- 🔴🟡🟢 **Status dots** – one dot per enabled provider on the sidebar button, colored by severity; overall shows the worst
- ⏱️ **Realtime refresh** – 30s / 1 / 2 / 5 min, plus manual refresh
- 🔑 **Key physical isolation** – panel input (persisted locally, 0600) → DSH credentials vault → environment variable; the key stays in the host process, **never in URLs / logs / browser**
- 🌗 **Theme-aware** – follows DSH light/dark automatically; no independent color options
- ⏳ **DeepSeek peak/valley countdown** – live peak/valley indicator + countdown in the title (1s precision; only the countdown digit re-renders, not the whole tree). Per the latest official peak/valley pricing: peak = Beijing time Mon–Fri (excluding Chinese public holidays) 9:00–12:00 & 14:00–18:00 (2× price); all other hours, including the entire weekend, are off-peak valley (half price)
- 💾 **Config persistence** – enabled list + refresh interval dual-written to localStorage + host-side file (`~/.dsh/.dsh-quota-dashboard-client.json`); survives DSH restarts, browser data clearing, and browser switches
- 📦 **Custom endpoint** – any API returning balance/quota fields can be attached (auto recursive detection)

## Supported platforms

| Type | Platform | Endpoint | Key env var |
| --- | --- | --- | --- |
| Balance | DeepSeek (official) | `GET /user/balance` | `DEEPSEEK_API_KEY` |
| Quota windows | OpenCode Go (subscription) | `GET /zen/go/v1/usage` | `OPENCODE_GO_API_KEY` |
| Custom | any compatible API (incl. Moonshot / OpenRouter / OpenAI / Anthropic / Together…) | full URL + key in panel | auto-detect |

> Only the DeepSeek official API and the OpenCode Go subscription are built in by default; every other platform is attached through the **custom endpoint** (full API URL + key, with automatic recursive detection of balance/quota fields).

## DSH compatibility

Version 1.0.8 targets **DSH 0.2.0-rc.2**, the npm `latest` release checked on 2026-10-12, with Cordis 4.0.4. The separate `alpha` channel is not the compatibility target. The module-loader, `slots.inject/register`, `sidebar.footer.action`, credentials resolution, and WebServer route contracts are retained. Plugin and sidebar reloads now restore the button, and separate client contexts can each register it.

Update DSH and reinstall the plugin in the Web profile:

```bash
npm install -g @deepseek-ai/dsh@0.2.0-rc.2
dsh plugin --profile web add <absolute-path-to-dsh-quota-dashboard>
```

Stop the running Web process and start `dsh web` again. Existing saved keys and client settings keep their paths and formats. `dsh.client.inject` is informational package metadata; the exported plugin's `inject: ['slots']` controls service readiness.

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
node --check index.js
node --check client.js
npm ci                     # development/test dependencies only
npm test                   # contract + parser + countdown tests
npm run test:runtime       # published DSH slots/WebServer lifecycle tests
node scripts/test-parsers.mjs   # fixture parser unit tests
node scripts/test-peak.mjs      # peak/valley window + countdown boundary tests
node scripts/smoke-live.mjs     # live smoke (reads credentials, redacted output)
```

## Changelog

See [CHANGELOG.md](CHANGELOG.md).

## License

MIT. Based on [InvisibleSirius/dsh-quota-dashboard](https://github.com/InvisibleSirius/dsh-quota-dashboard).


### DeepSeek holiday calendar

Peak hours are 09:00–12:00 and 14:00–18:00 Beijing time, Monday through Friday excluding Chinese public holidays. All other hours, weekends (including makeup workdays), and Chinese public holidays are off-peak at half the peak price. The bundled calendar covers the full official 2026 holiday breaks. Update `HOLIDAY_RANGES` in `client.js` when a new annual notice is published. For unlisted years, possible peak windows show an unconfirmed status and unavailable countdowns show a calendar update notice. Account balances come from the official API; this plugin does not calculate charges.
