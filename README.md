# ChatGPT Bulk Export

A minimal Chrome extension to bulk export all your ChatGPT conversations as JSON, Markdown, or plain text.

Works with ChatGPT Business, Plus, and free accounts. No subscription or payment required.

## Features

- Export **all** conversations in one click
- Formats: JSON (full API data), Markdown, or Plain Text
- Content filter: both sides or assistant-only
- Auto-saves every 500 conversations as a separate zip chunk (no data loss if interrupted)
- Silent downloads via `chrome.downloads` API (no repeated "Save As" dialogs)
- Automatic 429 rate limit handling with retry
- Progress bar with cancel support
- Preserves Unicode filenames (Cyrillic, Chinese, etc.)

## Installation

1. Clone this repository:
   ```bash
   git clone git@github.com:vainkop/chatgpt-bulk-export.git
   ```

2. Open Chrome and go to `chrome://extensions/`

3. Enable **Developer mode** (toggle in the top-right corner)

4. Click **Load unpacked** and select the cloned `chatgpt-bulk-export` folder

5. You should see "ChatGPT Bulk Export" in your extensions list

## Usage

1. Open [chatgpt.com](https://chatgpt.com) in a tab and make sure you're logged in. Wait a few seconds for the extension to capture your auth token.

2. Click the **ChatGPT Bulk Export** extension icon in the Chrome toolbar. This opens the export page in a new tab.

3. Choose your export format (JSON / Markdown / Text) and content mode (Both / Assistant only).

4. Click **Export All Conversations**.

5. The extension will:
   - Fetch the full conversation list
   - Download each conversation one by one (500ms delay between requests)
   - Save a zip file every 500 conversations to your Downloads folder
   - Save the remaining conversations in a final zip

6. Files are organized inside each zip by date folders:
   ```
   2025-03-11/
     14-30-22-My Chat Title.json
     15-45-01-Another Chat.json
   2025-03-10/
     09-12-44-Some Topic.json
   ```

## File Structure

```
chatgpt-bulk-export/
  manifest.json    - Chrome extension manifest (V3)
  background.js    - Opens export page on icon click
  content.js       - Captures auth token from chatgpt.com
  export.html      - Export UI page
  export.js        - Export logic, API calls, chunked zip generation
  jszip.min.js     - JSZip v3.10.1 (zip file generation)
```

## Notes

- The extension requires an active ChatGPT session. If you get an auth error, refresh your chatgpt.com tab and try again.
- With large accounts (thousands of chats), the export runs at ~2 conversations/second. A 4000-chat export takes ~33 minutes.
- Each zip chunk is ~50-200MB depending on conversation sizes (JSON format is the largest).
- The auth token is stored only in Chrome's local extension storage and refreshes automatically every 5 minutes.

## License

MIT
