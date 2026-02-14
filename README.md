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

## Target URL

The upload target is hardcoded in:

- `service_worker.js` -> `TARGET_BASE_URL`

Default value is `https://sap-library.vercel.app`.

For local testing, temporarily change `TARGET_BASE_URL` in `service_worker.js` to `http://localhost:3001`.

## Notes

- The extension keeps an uploaded-ID cache to avoid re-sending old IDs.
- After a failed upload, automatic retries pause until you press `Retry Upload`.
