# Rubisco — Smart Study Notes

A personal, AI-powered MBBS study notes application. Upload textbook pages (PDF/images) or paste text, and get premium, structured, exam-oriented "Smart Study Notes" — two-column A4 pages with a black divider, color-coded hierarchy, flowcharts, tables, definition boxes, and full manual editing. Alternative modes: Summary, Q&A, Mnemonics, Flowcharts, Tables, Exam Revision, MCQs, Viva, Clinical Scenarios, Flashcards.

**Architecture in one line:** AI generation is online (via your chosen provider, proxied through this Express server so your API key never reaches the browser); your generated projects are stored **only** in your device's browser (IndexedDB) and are fully readable/editable offline. This server never stores your study projects.

```
Your device (browser/PWA)
   IndexedDB = your projects (source of truth)
        │  (online only, for AI calls)
        ▼
Render / Node+Express backend  →  AI provider (OpenAI / Gemini / Claude / Ollama / LM Studio)
```

There is no login, no accounts, no cloud database.

---

## Features

- Upload PDF / JPG / JPEG / PNG, or paste text. Multi-page, drag-and-drop, thumbnails.
- Server-side PDF text extraction (pdf.js); client-side OCR (Tesseract.js) for scanned pages/images — reviewable and editable before generation.
- 11 generation modes, "Smart Study Notes" as default.
- AI decides the best representation per fact: paragraph, list, definition box, flowchart, table, classification, mnemonic, analogy, clinical correlation, exam tag, etc.
- Structured JSON block schema — every element stays editable and transformable, not just raw AI text.
- Per-block **Transform** menu (convert to bullets/table/flowchart/Q&A, generate mnemonic/analogy/story, simplify/expand/reorganize/regenerate) — only resends the selected block + minimal context, not the whole chapter.
- Full manual editing: add/delete/edit/move blocks, rich text on headings/paragraphs/tables.
- Color system (maroon titles, blue mechanisms, green subheadings, purple pathogenesis, black body) — fully customizable with reset-to-default.
- Google Fonts search (requires internet to fetch); page/column/margin/divider controls.
- Undo/redo across manual edits and AI transforms.
- IndexedDB local storage; PWA + service worker so the app shell and previously-generated projects work fully offline.
- Export to real PDF (browser print, preserves layout/colors), Markdown, and HTML — all client-side, work offline.
- No analytics, no tracking, no ads.

---

## Requirements

- Node.js 18+
- An API key for at least one AI provider (Gemini's free tier is the easiest no-cost option)

---

## Installation

```bash
git clone <your-repo-url> rubisco
cd rubisco
npm install
cp .env.example .env
```

Edit `.env`:

```
AI_PROVIDER=gemini
GEMINI_API_KEY=your_key_here
```

Run:

```bash
npm start
```

Open `http://localhost:3000` (or the printed port).

---

## AI Provider Configuration

Set `AI_PROVIDER` in `.env` to one of: `openai`, `gemini`, `claude`, `ollama`, `lmstudio`, `generic`.

| Provider | Required env vars |
|---|---|
| OpenAI | `OPENAI_API_KEY`, `OPENAI_MODEL` |
| Gemini | `GEMINI_API_KEY`, `GEMINI_MODEL` |
| Claude | `CLAUDE_API_KEY`, `CLAUDE_MODEL` |
| Ollama (local) | `OLLAMA_BASE_URL`, `OLLAMA_MODEL` |
| LM Studio (local) | `LMSTUDIO_BASE_URL`, `LMSTUDIO_MODEL` |
| Generic OpenAI-compatible | `GENERIC_BASE_URL`, `GENERIC_API_KEY`, `GENERIC_MODEL` |

API keys are read server-side only (`process.env`) and are never sent to the browser. Gemini's free tier is the recommended default for zero-cost usage.

You can also override the provider per-request from the client by passing `provider` in the request body (used internally; not exposed in the UI by default, but the API supports it if you want to add a switcher later).

---

## OCR

OCR runs **client-side** via Tesseract.js (loaded from CDN). This keeps the server stateless and avoids uploading images through the backend unnecessarily. For scanned PDF pages, the page is rasterized in-browser with pdf.js and then OCR'd. You can review/edit any OCR output before generation.

---

## IndexedDB / Local Storage

All study projects (source text, generated structured notes, edits, formatting, fonts, settings) are stored in the browser's IndexedDB, database `rubisco-db`. This is per-device, per-browser storage — it is **not** synced to any server. Clearing site data/browser storage will delete your projects, so avoid clearing site data for this app, and consider periodically exporting important notes (PDF/Markdown/HTML) as a backup.

---

## Offline Functionality

- AI generation and Transform require internet (calls the backend → AI provider).
- Opening, reading, editing, reformatting, and exporting **previously generated** projects works fully offline — no AI call is made just to open a saved project.
- The PWA service worker caches the app shell (HTML/CSS/JS) so the app can launch with no connection at all.
- If you attempt an AI action while offline, you'll see: "AI features require an internet connection."

## PWA Installation

Visit the app in your mobile browser (Chrome/Vivo browser on Android) and use "Add to Home Screen" / "Install App". Replace the placeholder icons in `public/assets/` with your own 192×192 and 512×512 PNGs for a polished install icon.

---

## Font Import

- Google Fonts: search inside the editor's formatting panel (requires internet to fetch); once loaded, the browser generally keeps it cached for that session/device.
- Local fonts (`.ttf`/`.otf`): once imported, they're stored as data URLs in IndexedDB (`fonts` store) so they continue to work offline after first import.

---

## PDF Export

Export uses the browser's native print-to-PDF against a dedicated print stylesheet that preserves the two-column layout, black divider, colors, tables, and flowcharts. This works fully offline. Tap **Export → pdf**, then choose "Save as PDF" in your device's print dialog.

---

## Render Deployment

1. Push this repo to GitHub.
2. On Render: **New → Web Service**, connect the repo.
3. Build command: `npm install`
4. Start command: `npm start`
5. Add environment variables from `.env.example` (at minimum `AI_PROVIDER` and the matching API key) in Render's dashboard — **never commit `.env`**.
6. Render provides `PORT` automatically; the server already reads `process.env.PORT`.
7. Deploy. Open the Render URL on your phone/tablet and install as a PWA.

Render only hosts the backend/AI-proxy layer and static frontend files — it does not store your personal projects.

---

## Troubleshooting

- **"AI features require an internet connection"** — you're offline; reconnect to generate or transform. Reading/editing saved projects still works.
- **Generation fails with a provider error** — check the matching API key/model in `.env` (or Render env vars); check your provider's quota/rate limits.
- **PDF extraction fails** — very large or corrupted PDFs may fail; try re-exporting the PDF or splitting it into smaller files.
- **OCR is slow/inaccurate** — Tesseract.js runs on-device and is slower on older phones; higher-resolution source images improve accuracy. You can always hand-correct OCR text before generating.
- **Projects disappeared** — check whether browser storage/site data was cleared; IndexedDB is per-browser, per-device. Export important notes as backups.
- **Fonts don't apply in exported PDF** — browser print-to-PDF font support varies by device; the on-screen editor should still reflect the selected font.

---

## Project Structure

```
rubisco/
├── package.json
├── README.md
├── .env.example
├── .gitignore
├── server/
│   ├── server.js
│   ├── routes/api.js
│   ├── services/
│   │   ├── ai/ (providers.js, generate.js, transform.js)
│   │   ├── pdf/extract.js
│   ├── prompts/systemPrompt.js
│   ├── schemas/blockSchema.js
│   └── utils/chunking.js
├── public/
│   ├── index.html
│   ├── manifest.json
│   ├── service-worker.js
│   ├── css/style.css
│   ├── js/ (db.js, api.js, ocr.js, blocks.js, editor.js, newproject.js, export.js, app.js)
│   └── assets/
```

---

## Disclaimer

AI-generated content should be reviewed against the original reference material before academic or clinical use.
