/**
 * RUBISCO — PDF EXTRACTION SERVICE
 * ----------------------------------
 * Extracts embedded text per page using pdfjs-dist. Pages with negligible
 * extractable text are flagged as "needsOCR" so the frontend can rasterize
 * them and run Tesseract.js client-side (OCR runs in-browser — see
 * public/js/ocr.js — since Tesseract.js works well client-side and keeps
 * the server stateless/lightweight).
 */

const pdfjsLib = require("pdfjs-dist/legacy/build/pdf.js");

const MIN_CHARS_FOR_TEXT_PAGE = 20;

async function extractPdfPages(buffer) {
  const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(buffer) });
  const pdf = await loadingTask.promise;
  const pages = [];

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const content = await page.getTextContent();
    const text = content.items.map(item => item.str).join(" ").replace(/\s+/g, " ").trim();

    pages.push({
      pageNumber: pageNum,
      text,
      needsOCR: text.length < MIN_CHARS_FOR_TEXT_PAGE
    });
  }

  return { totalPages: pdf.numPages, pages };
}

module.exports = { extractPdfPages };
