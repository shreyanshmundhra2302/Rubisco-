/**
 * RUBISCO — CLIENT-SIDE OCR
 * ----------------------------------
 * Runs entirely in the browser via Tesseract.js. Used for:
 *  - uploaded images (JPG/JPEG/PNG)
 *  - PDF pages flagged needsOCR by the server's text-extraction pass
 *
 * Requires internet the first time (to fetch the Tesseract worker/lang data
 * from the CDN); after that the browser cache may allow limited offline use,
 * but OCR is fundamentally an "online generation" step per the app's design
 * (only previously-saved projects are guaranteed offline-accessible).
 */

const RubiscoOCR = {
  async recognizeImage(imageSourceOrCanvas, onProgress) {
    const { data } = await Tesseract.recognize(imageSourceOrCanvas, "eng", {
      logger: (m) => {
        if (onProgress && m.status === "recognizing text") {
          onProgress(Math.round(m.progress * 100));
        }
      }
    });
    return { text: (data.text || "").trim(), confidence: data.confidence };
  },

  /**
   * Rasterizes a PDF page to a canvas using pdf.js (loaded globally as pdfjsLib)
   * so it can be OCR'd. Requires the original PDF ArrayBuffer and page number.
   */
  async rasterizePdfPage(arrayBuffer, pageNumber, scale = 2) {
    pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js";
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer.slice(0) }).promise;
    const page = await pdf.getPage(pageNumber);
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext("2d");
    await page.render({ canvasContext: ctx, viewport }).promise;
    return canvas;
  }
};

window.RubiscoOCR = RubiscoOCR;
