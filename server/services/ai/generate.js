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

/**
 * Extracts the first valid JSON object from a raw AI text response.
 * Handles cases where the model wraps output in code fences or adds stray text.
 */
function extractJSON(raw) {
  if (!raw) throw new Error("Empty AI response.");
  let text = raw.trim();

  // Strip markdown code fences if present.
  text = text.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();

  // If there's leading/trailing junk, find the outermost braces.
  const firstBrace = text.indexOf("{");
  const lastBrace = text.lastIndexOf("}");
  if (firstBrace === -1 || lastBrace === -1 || lastBrace < firstBrace) {
    throw new Error("No JSON object found in AI response.");
  }
  const candidate = text.slice(firstBrace, lastBrace + 1);

  try {
    return JSON.parse(candidate);
  } catch (err) {
    // Basic repair attempt: remove trailing commas before ] or }
    const repaired = candidate.replace(/,\s*([\]}])/g, "$1");
    try {
      return JSON.parse(repaired);
    } catch (err2) {
      throw new Error(`Failed to parse AI JSON output: ${err2.message}`);
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

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    onProgress({ stage: "Structuring content", chunkIndex: i + 1, totalChunks: chunks.length });

    const systemPrompt =
      i === 0
        ? buildSystemPrompt(mode, referenceBook)
        : buildChunkContinuationPrompt(mode, referenceBook, runningSummary.slice(-2000));

    const userContent = `SOURCE TEXT${chunk.sourceRefLabel ? ` (${chunk.sourceRefLabel})` : ""}:\n\n${chunk.text}`;

    let raw;
    try {
      raw = await callAI({ systemPrompt, userContent, providerOverride });
    } catch (err) {
      throw new Error(`AI generation failed on chunk ${i + 1}/${chunks.length}: ${err.message}`);
    }

    let parsed;
    try {
      parsed = extractJSON(raw);
    } catch (err) {
      throw new Error(`AI returned malformed output on chunk ${i + 1}/${chunks.length}: ${err.message}`);
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

  const qcErrors = validateDocument(doc);

  onProgress({ stage: "Finalizing" });

  return { document: doc, qcErrors };
}

module.exports = { generateDocument, extractJSON, normalizeBlocks };
