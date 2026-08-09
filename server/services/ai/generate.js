/**
 * RUBISCO — GENERATION ORCHESTRATOR
 * ----------------------------------
 * Turns extracted source text into a validated structured document by:
 *  1. Chunking the source (page/topic-aware)
 *  2. Calling the AI per chunk with the right system prompt
 *  3. Parsing + repairing JSON output
 *  4. Merging chunk results into one document
 *  5. Running a structural QC pass
 */

const { callAI } = require("./providers");
const { buildSystemPrompt, buildChunkContinuationPrompt } = require("../../prompts/systemPrompt");
const { chunkPages } = require("../../utils/chunking");
const { validateDocument } = require("../../schemas/blockSchema");
const { v4: uuidv4 } = require("uuid");

const STRICT_JSON_REMINDER = `

REMINDER — YOUR PREVIOUS RESPONSE COULD NOT BE PARSED AS JSON:
Return ONLY a single raw JSON object. Absolutely no Markdown code fences (no \`\`\`), no preamble, no explanation, no commentary, and nothing after the closing brace. The very first character of your response must be "{" and the very last character must be "}".`;

/**
 * Calls the AI for one chunk and parses the result, logging the raw
 * response server-side (truncated) whenever parsing fails so the exact
 * malformed output can be diagnosed later. Retries exactly once with a
 * stricter "JSON only" reminder appended to the system prompt before
 * giving up on this chunk.
 */
async function callAndParseChunk({ systemPrompt, userContent, providerOverride, chunkIndex, totalChunks }) {
  let lastErr;
  for (let attempt = 1; attempt <= 2; attempt++) {
    const promptForAttempt = attempt === 1 ? systemPrompt : systemPrompt + STRICT_JSON_REMINDER;
    let raw;
    try {
      raw = await callAI({ systemPrompt: promptForAttempt, userContent, providerOverride });
    } catch (err) {
      throw new Error(`AI generation failed on chunk ${chunkIndex + 1}/${totalChunks}: ${err.message}`);
    }

    try {
      return extractJSON(raw);
    } catch (err) {
      lastErr = err;
      // Log the raw response server-side (truncated) so the exact malformed
      // output can be inspected without leaking it into the client error.
      console.error(
        `[generate] Chunk ${chunkIndex + 1}/${totalChunks} JSON parse failed on attempt ${attempt}/2: ${err.message}\n` +
          `--- raw AI response (first 4000 chars) ---\n${String(raw).slice(0, 4000)}\n--- end raw response ---`
      );
      if (attempt === 1) {
        continue; // retry once with the stricter prompt
      }
    }
  }
  const finalErr = new Error(
    `AI returned malformed output on chunk ${chunkIndex + 1}/${totalChunks} after retry: ${lastErr.message}`
  );
  finalErr.chunkIndex = chunkIndex;
  throw finalErr;
}

/**
 * Scans `text` starting at `startIdx` (which must point at "{" or "[") and
 * returns the index of the matching closing brace/bracket, correctly
 * skipping over braces/brackets that appear inside string literals
 * (including escaped quotes/backslashes inside those strings).
 * Returns -1 if the structure never balances (truncated output).
 */
function findMatchingClose(text, startIdx) {
  const openChar = text[startIdx];
  const closeChar = openChar === "{" ? "}" : "]";
  let depth = 0;
  let inString = false;
  let escapeNext = false;

  for (let i = startIdx; i < text.length; i++) {
    const ch = text[i];

    if (escapeNext) {
      escapeNext = false;
      continue;
    }
    if (inString) {
      if (ch === "\\") escapeNext = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === "{" || ch === "[") depth++;
    else if (ch === "}" || ch === "]") {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/**
 * Extracts the first complete, balanced JSON object/array from a raw AI
 * text response — robust against:
 *  - markdown code fences (```json ... ```)
 *  - leading/trailing prose or commentary
 *  - multiple JSON objects concatenated in one response
 *  - braces/brackets that appear inside string values (quotes, escapes)
 *
 * This intentionally does NOT use a "greedy" regex like /\{.*\}/ — that
 * approach breaks the moment there's more than one top-level JSON object
 * or any trailing junk, which is exactly the class of bug being fixed here.
 */
function extractJSON(raw) {
  if (!raw) throw new Error("Empty AI response.");
  let text = raw.trim();

  // Strip markdown code fences if present (```json ... ``` or plain ```).
  text = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "").trim();

  // Find the first plausible JSON start.
  let startIdx = -1;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === "{" || text[i] === "[") {
      startIdx = i;
      break;
    }
  }
  if (startIdx === -1) {
    throw new Error("No JSON object found in AI response.");
  }

  const endIdx = findMatchingClose(text, startIdx);
  if (endIdx === -1) {
    throw new Error(
      "Unbalanced JSON in AI response (likely truncated — response may have been cut off before completion)."
    );
  }

  const candidate = text.slice(startIdx, endIdx + 1);

  try {
    return JSON.parse(candidate);
  } catch (err) {
    // Basic repair attempt: remove trailing commas before ] or }
    const repaired = candidate.replace(/,\s*([\]}])/g, "$1");
    try {
      return JSON.parse(repaired);
    } catch (err2) {
      const parseErr = new Error(`Failed to parse AI JSON output: ${err2.message}`);
      parseErr.rawSnippet = candidate.slice(0, 1000);
      throw parseErr;
    }
  }
}

/**
 * Assigns stable ids to every block and inner node/row where relevant,
 * and attaches sourceRef labels when provided by the chunker.
 */
function normalizeBlocks(rawBlocks, sourceRefLabel, includeSourceRefs) {
  return (rawBlocks || []).map(b => {
    const block = { id: uuidv4(), ...b };
    if (includeSourceRefs && sourceRefLabel && !block.sourceRef) {
      block.sourceRef = sourceRefLabel;
    }
    if (block.type === "flowchart" && Array.isArray(block.nodes)) {
      // ensure node ids are strings (already required by prompt, but be defensive)
      block.nodes = block.nodes.map(n => ({ id: String(n.id), label: n.label }));
    }
    return block;
  });
}

/**
 * Generates a full structured document from pages of extracted text.
 *
 * @param {Object} opts
 * @param {Array<{pageNumber:number|null, text:string}>} opts.pages
 * @param {string} opts.mode - one of GENERATION_MODES
 * @param {string} [opts.referenceBook]
 * @param {boolean} [opts.includeSourceRefs]
 * @param {string} [opts.providerOverride]
 * @param {function} [opts.onProgress] - called with {stage, chunkIndex, totalChunks}
 */
async function generateDocument({
  pages,
  mode = "smart",
  referenceBook,
  includeSourceRefs = false,
  providerOverride,
  onProgress = () => {}
}) {
  onProgress({ stage: "Reading source" });
  const chunks = chunkPages(pages);
  if (chunks.length === 0) {
    throw new Error("No extractable text found in the supplied source.");
  }

  onProgress({ stage: "Identifying topics", totalChunks: chunks.length });

  let title = null;
  const importantTopicsSet = [];
  let mergedBlocks = [];
  let runningSummary = "";
  const chunkErrors = [];

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    onProgress({ stage: "Structuring content", chunkIndex: i + 1, totalChunks: chunks.length });

    const systemPrompt =
      i === 0
        ? buildSystemPrompt(mode, referenceBook)
        : buildChunkContinuationPrompt(mode, referenceBook, runningSummary.slice(-2000));

    const userContent = `SOURCE TEXT${chunk.sourceRefLabel ? ` (${chunk.sourceRefLabel})` : ""}:\n\n${chunk.text}`;

    let parsed;
    try {
      parsed = await callAndParseChunk({
        systemPrompt,
        userContent,
        providerOverride,
        chunkIndex: i,
        totalChunks: chunks.length
      });
    } catch (err) {
      // Don't throw away chunks that already succeeded — record the failure
      // for this chunk and move on so the rest of the document can still
      // be generated and merged.
      chunkErrors.push({
        chunkIndex: i,
        sourceRefLabel: chunk.sourceRefLabel || null,
        message: err.message
      });
      onProgress({
        stage: "Chunk failed — continuing with remaining chunks",
        chunkIndex: i + 1,
        totalChunks: chunks.length
      });
      continue;
    }

    if (i === 0 && parsed.title) title = parsed.title;
    if (Array.isArray(parsed.importantTopics)) {
      for (const t of parsed.importantTopics) {
        if (t && !importantTopicsSet.includes(t)) importantTopicsSet.push(t);
      }
    }

    const normalized = normalizeBlocks(parsed.blocks, chunk.sourceRefLabel, includeSourceRefs);
    mergedBlocks = mergedBlocks.concat(normalized);

    // Keep a lightweight running summary for continuity context in the next chunk.
    const headingsInChunk = normalized
      .filter(b => b.type === "heading" || b.type === "subheading")
      .map(b => b.content)
      .join("; ");
    runningSummary += (headingsInChunk ? headingsInChunk + "; " : "");
  }

  if (mergedBlocks.length === 0) {
    // Every chunk failed — nothing usable was produced, so surface a real error
    // instead of silently returning an empty document.
    const detail = chunkErrors.map(c => `chunk ${c.chunkIndex + 1}: ${c.message}`).join(" | ");
    throw new Error(`AI generation failed on all ${chunks.length} chunk(s). ${detail}`);
  }

  onProgress({ stage: "Checking completeness" });

  const doc = {
    id: uuidv4(),
    title: title || "Untitled Chapter",
    referenceBook: referenceBook || null,
    mode,
    generatedAt: new Date().toISOString(),
    importantTopics: importantTopicsSet.map(text => ({ id: uuidv4(), text, checked: false })),
    blocks: mergedBlocks
  };

  // Ensure what we hand back to the route (and ultimately JSON.stringify to
  // the frontend) is guaranteed valid JSON-serializable data.
  try {
    JSON.parse(JSON.stringify(doc));
  } catch (err) {
    throw new Error(`Merged document failed final JSON validation: ${err.message}`);
  }

  const qcErrors = validateDocument(doc);

  onProgress({ stage: "Finalizing" });

  return { document: doc, qcErrors, chunkErrors, partial: chunkErrors.length > 0 };
}

module.exports = { generateDocument, extractJSON, normalizeBlocks };
