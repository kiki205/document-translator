# Document Translator (DeepL API)

A small local web app for translating one document at a time with the official DeepL Node.js SDK.

## Requirements

- Windows 10/11, macOS, or Linux
- Node.js 20 or newer
- A DeepL API authentication key (API Free or API Pro)

## Windows setup

1. Install Node.js LTS from https://nodejs.org/ and restart the terminal.
2. Create a DeepL API account and copy the API authentication key from the API account page: https://www.deepl.com/pro-api
3. Extract `document-translator-project.zip`.
4. Open PowerShell in the extracted `document-translator` folder.
5. Run:

   ```powershell
   Copy-Item .env.example .env
   notepad .env
   ```

6. In Notepad, replace `PASTE_YOUR_DEEPL_API_KEY_HERE` with your key, save, and close.
7. In PowerShell, install dependencies and start the server:

   ```powershell
   npm install
   npm start
   ```

8. Open http://127.0.0.1:3000 in your browser.

To stop the server, return to PowerShell and press `Ctrl+C`.

## Configuration

Edit `.env`:

- `DEEPL_API_KEY`: your secret API key.
- `PORT`: local web port (default `3000`).
- `HOST`: defaults to `127.0.0.1`, so the app is only reachable from this computer.
- `MAX_FILE_SIZE_MB`: upload size limit enforced by this local app (default `30`).

Do not share `.env`, publish it, or commit it to Git. The `.gitignore` already excludes it.

## Included formats

The interface accepts PDF, DOCX, PPTX, XLSX, TXT, HTML, XLIFF, SRT, VTT, JPG, and PNG. DeepL's current plan, file type, file size, and document-specific limits still apply. The app keeps the input extension and requests the same output format.

## Notes

- Leave source language at **Detect automatically** to let DeepL detect it.
- The browser sends the document only to this local backend. The backend sends it to DeepL; the API key is never sent to browser JavaScript.
- A document translation is a paid/limited API operation according to your DeepL API plan. Check your account's current quota and billing before translating large or important documents.
- Original layout is handled by DeepL. Exact layout preservation is not guaranteed for every file.
- The server uses a temporary directory and removes it after the download stream closes or when translation fails.
- This is a local starter project, not a hardened public multi-user service. Do not expose it to the internet without adding authentication, HTTPS, rate limits, and stronger operational controls.

## Troubleshooting

- **Missing API key:** make sure `.env` exists beside `server.js` and `DEEPL_API_KEY` is filled in.
- **401/403:** check that the key is an API key (not a normal DeepL web subscription password/key) and that it is active.
- **456:** the API quota/limit has been reached.
- **Cannot load languages:** check internet access and the API key.
- **Unsupported document:** confirm the extension and file are supported by your DeepL API plan.
