const express = require("express");
const multer = require("multer");
const router = express.Router();

const { extractPdfPages } = require("../services/pdf/extract");
const { generateDocument } = require("../services/ai/generate");
const { transformBlock } = require("../services/ai/transform");
const { GENERATION_MODES } = require("../schemas/blockSchema");

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 40 * 1024 * 1024 } });

// ---------------------------------------------------------
// POST /api/extract/pdf — upload a PDF, get per-page text + needsOCR flags
// ---------------------------------------------------------
router.post("/extract/pdf", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No file uploaded." });
    const result = await extractPdfPages(req.file.buffer);
    res.json(result);
  } catch (err) {
    console.error("PDF extraction error:", err);
    res.status(500).json({ error: err.message || "PDF extraction failed." });
  }
});

// ---------------------------------------------------------
// POST /api/generate — generate a full structured document
// body: { pages: [{pageNumber, text}], mode, referenceBook, includeSourceRefs, provider }
// ---------------------------------------------------------
router.post("/generate", async (req, res) => {
  try {
    const { pages, mode = "smart", referenceBook, includeSourceRefs, provider } = req.body;

    if (!Array.isArray(pages) || pages.length === 0) {
      return res.status(400).json({ error: "No source pages/text supplied." });
    }
    if (!GENERATION_MODES.includes(mode)) {
      return res.status(400).json({ error: `Invalid mode "${mode}".` });
    }

    const { document, qcErrors, chunkErrors, partial } = await generateDocument({
      pages,
      mode,
      referenceBook,
      includeSourceRefs: !!includeSourceRefs,
      providerOverride: provider
    });

    if (partial) {
      console.warn(
        `Generation partially failed: ${chunkErrors.length} chunk(s) could not be parsed and were skipped.`,
        chunkErrors
      );
    }

    res.json({ document, qcErrors, chunkErrors, partial });
  } catch (err) {
    console.error("Generation error:", err);
    res.status(500).json({ error: err.message || "Generation failed." });
  }
});

// ---------------------------------------------------------
// POST /api/transform — transform a single selected block
// body: { block, operation, context, provider }
// ---------------------------------------------------------
router.post("/transform", async (req, res) => {
  try {
    const { block, operation, context, provider } = req.body;
    if (!block || !operation) {
      return res.status(400).json({ error: "block and operation are required." });
    }
    const result = await transformBlock({ block, operation, context, providerOverride: provider });
    res.json(result);
  } catch (err) {
    console.error("Transform error:", err);
    res.status(500).json({ error: err.message || "Transform failed." });
  }
});

// ---------------------------------------------------------
// GET /api/health — simple healthcheck + provider info (no secrets)
// ---------------------------------------------------------
router.get("/health", (req, res) => {
  res.json({
    ok: true,
    provider: process.env.AI_PROVIDER || "gemini",
    modes: GENERATION_MODES
  });
});

module.exports = router;
