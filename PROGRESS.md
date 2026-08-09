# Rubisco Build Progress

## Status: V1 COMPLETE (all 5 phases)

## Phases
- [x] Phase 1: Core skeleton — server, schema, AI provider layer, prompts, project dashboard, IndexedDB storage, basic 2-col A4 block renderer
- [x] Phase 2: Upload/OCR/PDF extraction pipeline, chunking, generation flow w/ staged progress
- [x] Phase 3: Full block editing (transform menu, rich text, tables, flowcharts, undo/redo)
- [x] Phase 4: Font system (Google Fonts search + local .ttf/.otf import persisted offline), color customization, PWA/service worker, offline enforcement
- [x] Phase 5: PDF/Markdown/HTML export, QC validation, README, Render deploy config

## Notes
- Working dir: /home/claude/rubisco
- Deploy target: Render (per spec)
- No login, no cloud DB — IndexedDB is source of truth on device
- AI providers: OpenAI, Gemini, Claude, Ollama, LM Studio, generic OpenAI-compatible
- Default output mode: SMART STUDY NOTES (2-col, A4, black divider, color hierarchy: black body / maroon titles+definitions / blue mechanism / green subheading / purple pathogenesis)
- All backend + frontend JS syntax-checked with `node --check`. No `npm install` was possible in the build sandbox (no network egress), so dependency resolution itself has not been executed — run `npm install` on your first setup as normal.
