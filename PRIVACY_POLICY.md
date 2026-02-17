# Privacy Policy for SAP Library Uploader

**Last Updated:** February 17, 2026

This Privacy Policy explains how the "SAP Library Uploader" browser extension handles data.

## Data Collection

SAP Library Uploader only operates on supported Super Auto Pets web pages and related APIs used for replay synchronization.

The extension may process:

- Replay participation IDs from finished games.
- Player ID (UUID) from watch/history responses (used for profile shortcut and sync context).
- SAP login credentials (email and password) only when the user enters them to run History Sync.
- Local sync metadata stored in `chrome.storage.local`, including queued IDs, uploaded-ID cache, failed upload state, retry-required flag, and last sync status.
- Saved SAP email/password in `chrome.storage.local` when the user provides them, so the user does not need to re-enter them for each sync.

The extension does not request or process payment information, health data, or broad browsing history outside supported Super Auto Pets pages.

## Data Usage

Captured data is used only for replay synchronization and directly related features:

1. Detect finished replay participation IDs from Super Auto Pets watch/history responses.
2. Authenticate to Super Auto Pets API for user-initiated History Sync (email/password login), then fetch the user history list.
3. Upload replay participation IDs to SAP Library (`/api/replays`).
4. Show sync status and retry state in the extension popup.
5. Open the SAP Library profile page using the detected player ID.

Data stored locally remains on the user's device and is removed when extension storage is cleared or the extension is uninstalled.

## Third-Party Services

The extension communicates with the following services:

- `https://api.teamwood.games` for SAP login and history fetch during user-initiated History Sync.
- `https://sap-library.vercel.app` for replay ID upload and profile page linking.

We do not sell user data and do not share user data for advertising, credit, or lending purposes.

## Storage and Security Notes

- Data is stored using Chrome extension local storage (`chrome.storage.local`).
- Network requests are made over HTTPS.
- Credentials are used only to obtain SAP auth for History Sync and are not shared publicly by the extension UI.

## User Controls

Users can:

- Choose whether to enter credentials for History Sync.
- Edit or replace saved credentials in the extension popup.
- Clear extension storage or uninstall the extension at any time.

## Contact

If you have questions about this Privacy Policy, open an issue on the project GitHub repository.
