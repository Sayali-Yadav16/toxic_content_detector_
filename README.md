# SafeWeb (Local Toxicity Blocker)

This lightweight Chrome/Edge extension blurs toxic words and images on pages using a local list.

Files added in this change:
- `popup.html`, `popup.css`, `popup.js` — the browser action popup UI that lets users enable/disable protection, adjust blur intensity, pick categories, and manage a whitelist.

Logo instructions:
- The attached image in the project (provided by the user) can be used as the popup or icon. Copy the provided image into `icons/logo.png` or replace `icons/icon128.png`.

How to test locally:
1. Open your browser's extensions page (e.g., chrome://extensions).
2. Enable "Developer mode".
3. Click "Load unpacked" and select this folder (`toxic-content-detector`).
4. Click the extension icon to open the popup and toggle settings.

Notes:
- The popup will send settings to all open tabs; the content script listens for settings changes and re-scans the page. Activity count shows the number of blurred text segments detected on the active page.

Chart (activity chart) instructions:
- The popup can render a small 7-day activity chart. The code prefers a local copy of Chart.js at `vendor/chart.min.js` (recommended for offline, privacy, and manifest CSP), and will fall back to the CDN `https://cdn.jsdelivr.net/npm/chart.js` if the local file is missing.
- To include Chart.js locally, create a `vendor` folder in the extension root and download a Chart.js build into `vendor/chart.min.js`.

Example:
1. Create folder `vendor` next to `popup.js`.
2. Download Chart (for example, from https://www.jsdelivr.com/package/npm/chart.js) and save it as `vendor/chart.min.js`.
3. Reload the unpacked extension in your browser.

If Chart.js is not available, the popup will silently skip drawing the chart (no error is thrown).
