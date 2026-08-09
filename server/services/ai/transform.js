/**
 * RUBISCO — SELECTIVE TRANSFORM SERVICE
 * ----------------------------------
 * Transforms ONE block into another representation without regenerating
 * the whole document. Used by the editor's "Transform" menu.
 */

const { callAI } = require("./providers");
const { extractJSON, normalizeBlocks } = require("./generate");
const { v4: uuidv4 } = require("uuid");

const OPERATION_INSTRUCTIONS = {
  toBullets: "Convert this content into a single bulletList block. Preserve all factual content.",
  toNumbered: "Convert this content into a single numberedList block. Preserve all factual content.",
  toQA: "Convert this content into one or more qa blocks covering the same factual content.",
  toFlowchart: "Convert this content into a single flowchart block if it describes a sequence, mechanism, or causal chain. Preserve all factual content as node labels.",
  toTable: "Convert this content into a single table block, choosing sensible columns. Preserve all factual content.",
  toClassification: "Convert this content into a single classification block with a hierarchical tree. Preserve all factual content.",
  generateMnemonic: "Generate a mnemonic block that helps memorize this content. Keep the original content's key facts intact in the explanation field.",
  generateAnalogy: "Generate an analogy block that helps explain this content simply, without losing the precise medical terminology (which should still appear).",
  generateStory: "Generate a short memorable story/narrative (as a paragraph block) that helps recall this content, while preserving the underlying facts.",
  makeHighYield: "Convert this content into a highYield block, tightened to the most exam-relevant facts, but do not invent new facts.",
  addExamTag: "Wrap this content as an examTag block. Choose an appropriate bracketed tag such as [must know], [most imp], or [MCQ point].",
  simplify: "Rewrite this content more simply and concisely while preserving all medical terminology and factual accuracy. Keep it the same block type unless a simpler representation clearly fits better.",
  expand: "Expand this content with more explanatory detail, staying strictly consistent with the facts already present (do not invent new facts not implied by the original). Keep the same block type unless another type fits clearly better.",
  reorganize: "Reorganize this content's internal structure for clarity (e.g. reorder list items or table rows logically) without changing the block type or losing information.",
  regenerate: "Regenerate this block from scratch based on its current content, potentially choosing a different, better-fitting representation. Preserve all underlying facts."
};

function buildTransformPrompt(operation, context) {
  const instruction = OPERATION_INSTRUCTIONS[operation];
  if (!instruction) {
    throw new Error(`Unknown transform operation: ${operation}`);
  }
  return `You are editing ONE block of an MBBS study-notes document. ${instruction}

Preserve standard medical terminology and factual accuracy. Do not invent facts not present in the original block (or in the optional surrounding context provided).

Respond with ONLY a single valid JSON object of this shape:
{ "blocks": [ <Block>, <Block>... ] }

Usually this will be exactly one block, but operations like "toQA" may produce several. Each <Block> must follow the standard Rubisco block schema (type + type-specific fields) exactly as used elsewhere in this application.${context ? `\n\nSurrounding context (for reference only, do not transform this part):\n${context}` : ""}`;
}

async function transformBlock({ block, operation, context, providerOverride }) {
  const systemPrompt = buildTransformPrompt(operation, context);
  const userContent = `BLOCK TO TRANSFORM:\n${JSON.stringify(block, null, 2)}`;

  const raw = await callAI({ systemPrompt, userContent, providerOverride });
  const parsed = extractJSON(raw);

  if (!Array.isArray(parsed.blocks) || parsed.blocks.length === 0) {
    throw new Error("Transform produced no blocks.");
  }

  const newBlocks = normalizeBlocks(parsed.blocks, block.sourceRef, !!block.sourceRef);
  return { previousBlock: block, newBlocks, replacedId: block.id || uuidv4() };
}

module.exports = { transformBlock };
