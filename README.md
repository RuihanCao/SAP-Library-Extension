# SAP Library Extension

Chrome extension that captures finished Super Auto Pets participation IDs and uploads them to a SAP Library API.

## What it does

- Hooks SAP network calls on page load.
- Captures `ParticipationId` from:
  - `POST /api/arena/watch`
  - `POST /api/versus/watch`
  - `POST /api/history/fetch`
- Only queues IDs for finished games (watch outcome win/loss and finished history entries).
- Uploads queued IDs automatically using `POST /api/replays` (one replay per request).
- Captures your player ID from game/history JSON and enables an "Open My Profile" shortcut.

## Install (Chrome)

1. Open `chrome://extensions`.
2. Enable `Developer mode`.
3. Click `Load unpacked`.
4. Select this folder: `SAP-Library-Extension`.

## Usage

1. Open SAP and play/watch games or load history.
2. Open the extension popup to view sync status.
3. If an upload fails, press `Retry Upload` to try again.
4. Click `Open My Profile` after your player ID is detected.
5. Use `Replay Injection` in the popup to paste/save a battle JSON and toggle injection without editing files.

## Replay Injection (No Proxy)

The extension can override `GET /api/battle/get/{battleId}` directly in-page.

1. Open the extension popup.
2. In `Replay Injection`, paste a full battle JSON (for example from your own replay capture or calculator export).
3. Turn on `Enable Injection`.
4. Click `Save Override`.
5. In SAP, trigger replay/watch via the swords flow (this path calls `/api/battle/get/...`).

The hook rewrites `battle.Id` to the requested battle ID automatically.
Updates from the popup are pushed to open SAP tabs (no extension reload required).

### SAP Calculator workflow

You can now export directly from [SAP Calculator](https://www.sap-calculator.com/) without manually editing battle JSON.

1. Open `https://www.sap-calculator.com/` with the extension enabled.
2. Click the floating `Send To SAP Replay` button.
3. Paste one of:
   - SAP Calculator export code (including `SAPC1:...`)
   - SAP Calculator share URL
   - Raw calculator JSON
4. The extension converts it to replay battle JSON, enables injection, and copies JSON to clipboard.
5. Open SAP and trigger replay/watch via swords flow.

Notes:
- Unknown pet names are skipped.
- If a pet has no known ability mapping in `calculator_maps.js`, it is still added but without explicit ability enums.

## Target URL

The upload target is hardcoded in:

- `service_worker.js` -> `TARGET_BASE_URL`

Default value is `https://sap-library.vercel.app`.

For local testing, temporarily change `TARGET_BASE_URL` in `service_worker.js` to `http://localhost:3001`.

## Notes

- The extension keeps an uploaded-ID cache to avoid re-sending old IDs.
- After a failed upload, automatic retries pause until you press `Retry Upload`.
