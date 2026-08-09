/**
 * RUBISCO — CHUNKING UTILITY
 * ----------------------------------
 * Splits large source text into AI-context-sized chunks while trying to:
 *  - preserve page order
 *  - avoid cutting mid-paragraph where possible
 *  - avoid cutting mid-page where possible
 *
 * Input: array of { pageNumber, text } OR a single big string.
 * Output: array of { text, sourceRefLabel, pageStart, pageEnd }
 */

function chunkPages(pages, charLimit) {
  const limit = charLimit || parseInt(process.env.CHUNK_CHAR_LIMIT || "6000", 10);
  const chunks = [];
  let current = { text: "", pageStart: null, pageEnd: null };

  const flush = () => {
    if (current.text.trim()) {
      chunks.push({
        text: current.text.trim(),
        pageStart: current.pageStart,
        pageEnd: current.pageEnd,
        sourceRefLabel:
          current.pageStart && current.pageEnd
            ? current.pageStart === current.pageEnd
              ? `PDF p. ${current.pageStart}`
              : `PDF p. ${current.pageStart}-${current.pageEnd}`
            : null
      });
    }
    current = { text: "", pageStart: null, pageEnd: null };
  };

  for (const page of pages) {
    const pageText = (page.text || "").trim();
    if (!pageText) continue;

    // If a single page alone exceeds the limit, split it by paragraphs.
    if (pageText.length > limit) {
      const paragraphs = pageText.split(/\n\s*\n/);
      for (const para of paragraphs) {
        if (current.text.length + para.length > limit) flush();
        if (current.pageStart === null) current.pageStart = page.pageNumber;
        current.pageEnd = page.pageNumber;
        current.text += (current.text ? "\n\n" : "") + para;
      }
      continue;
    }

    if (current.text.length + pageText.length > limit) {
      flush();
    }
    if (current.pageStart === null) current.pageStart = page.pageNumber;
    current.pageEnd = page.pageNumber;
    current.text += (current.text ? "\n\n" : "") + pageText;
  }
  flush();

  return chunks;
}

/**
 * Convenience wrapper for plain pasted/typed text with no page metadata.
 */
function chunkPlainText(text, charLimit) {
  return chunkPages([{ pageNumber: null, text }], charLimit);
}

module.exports = { chunkPages, chunkPlainText };
