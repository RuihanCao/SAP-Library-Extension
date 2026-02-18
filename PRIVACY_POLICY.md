# Privacy Policy for SAP Library Uploader

**Last Updated:** February 18, 2026

This Privacy Policy explains how the "SAP Library Uploader" browser extension handles data.

## Data Collection

SAP Library Uploader operates on supported Super Auto Pets web pages, related APIs used for replay synchronization, and supported SAP Calculator pages used for replay conversion.

The extension may process:

- Replay participation IDs from finished games.
- Player ID (UUID) from watch/history responses (used for profile shortcut and sync context).
- SAP login credentials (email and password) only when the user enters them to run History Sync.
- Replay battle JSON entered by the user for replay injection and calculator conversion.
- Clipboard text when the user uses replay conversion tools (for reading calculator export content and copying generated replay JSON).
- Local sync metadata stored in `chrome.storage.local`, including queued IDs, uploaded-ID cache, failed upload state, retry-required flag, and last sync status.
- Saved SAP email/password in `chrome.storage.local` when the user provides them, so the user does not need to re-enter them for each sync.
- Replay injection configuration in `chrome.storage.local` (enabled state and saved battle JSON).

The extension does not request or process payment information, health data, or broad browsing history outside supported Super Auto Pets pages.

## Data Usage

Captured data is used only for replay synchronization, replay injection, and directly related features:

1. Detect finished replay participation IDs from Super Auto Pets watch/history responses.
2. Authenticate to Super Auto Pets API for user-initiated History Sync (email/password login), then fetch the user history list.
3. Upload replay participation IDs to SAP Library (`/api/replays`).
4. Show sync status and retry state in the extension popup.
5. Open the SAP Library profile page using the detected player ID.
6. Convert SAP Calculator export data into replay battle JSON.
7. Apply user-provided replay battle JSON to local replay/watch API responses for replay injection features.
8. Copy generated replay JSON to clipboard when the user triggers replay conversion.

Data stored locally remains on the user's device and is removed when extension storage is cleared or the extension is uninstalled.

## Third-Party Services

The extension communicates with the following services:

- `https://api.teamwood.games` for SAP login and history fetch during user-initiated History Sync.
- `https://sap-library.vercel.app` for replay ID upload and profile page linking.

Replay injection and replay conversion data are handled locally in the browser extension and are not uploaded to SAP Library unless replay ID sync is separately performed.

We do not sell user data and do not share user data for advertising, credit, or lending purposes.

## Storage and Security Notes

- Data is stored using Chrome extension local storage (`chrome.storage.local`).
- Network requests are made over HTTPS.
- Credentials are used only to obtain SAP auth for History Sync and are not shared publicly by the extension UI.
- Replay injection JSON is stored locally for user convenience and is only applied on supported SAP replay/watch requests.

## User Controls

Users can:

- Choose whether to enter credentials for History Sync.
- Edit or replace saved credentials in the extension popup.
- Enable/disable replay injection and replace/clear saved replay JSON.
- Clear extension storage or uninstall the extension at any time.

## Contact

If you have questions about this Privacy Policy, open an issue on the project GitHub repository.
