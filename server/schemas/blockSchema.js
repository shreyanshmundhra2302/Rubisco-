/**
 * RUBISCO — STRUCTURED BLOCK SCHEMA
 * ----------------------------------
 * This is the canonical shape of every block type the AI may produce,
 * and that the editor / IndexedDB / exporter all operate on.
 *
 * A "document" is:
 * {
 *   id, title, referenceBook, generatedAt, mode,
 *   importantTopics: [{ id, text, checked }],
 *   blocks: [ Block, Block, ... ],
 *   settings: { colors, fonts, page }
 * }
 *
 * Every Block has:
 *   id            string (uuid)
 *   type          one of BLOCK_TYPES
 *   sourceRef     optional string, e.g. "PDF p. 17"
 *   ...type-specific fields (see SHAPES below)
 */

const BLOCK_TYPES = [
  "heading",
  "subheading",
  "paragraph",
  "bulletList",
  "numberedList",
  "definition",
  "highYield",
  "examTag",
  "flowchart",
  "table",
  "classification",
  "mnemonic",
  "analogy",
  "clinicalCorrelation",
  "qa",
  "flashcard",
  "mcq",
  "imagePlaceholder",
  "unclear"
];

/**
 * Reference shapes (documentation only — plain JS objects are used at runtime,
 * no runtime validation library is required, but validateBlock() below performs
 * basic structural checks used by the QC pass).
 */
const SHAPES = {
  heading: { type: "heading", content: "string" },
  subheading: { type: "subheading", content: "string" },
  paragraph: { type: "paragraph", content: "string" },
  bulletList: { type: "bulletList", items: ["string"] },
  numberedList: { type: "numberedList", items: ["string"] },
  definition: { type: "definition", title: "string", content: "string" },
  highYield: { type: "highYield", content: "string" },
  examTag: { type: "examTag", tag: "string", content: "string" },
  flowchart: {
    type: "flowchart",
    orientation: "vertical|horizontal",
    nodes: [{ id: "string", label: "string" }],
    connections: [{ from: "string", to: "string", label: "string(optional)" }]
  },
  table: {
    type: "table",
    caption: "string(optional)",
    headers: ["string"],
    rows: [["string"]]
  },
  classification: {
    type: "classification",
    title: "string",
    tree: [{ label: "string", children: [] }]
  },
  mnemonic: { type: "mnemonic", content: "string", explanation: "string(optional)" },
  analogy: { type: "analogy", content: "string" },
  clinicalCorrelation: { type: "clinicalCorrelation", content: "string" },
  qa: { type: "qa", question: "string", answer: "string" },
  flashcard: { type: "flashcard", front: "string", back: "string" },
  mcq: {
    type: "mcq",
    question: "string",
    options: ["string"],
    correctIndex: "number",
    explanation: "string"
  },
  imagePlaceholder: { type: "imagePlaceholder", description: "string" },
  unclear: { type: "unclear", content: "string" }
};

const DEFAULT_COLOR_SETTINGS = {
  body: "#111111",
  chapterTitle: "#7a0019",      // maroon
  definitionHeader: "#7a0019",  // maroon/red
  mechanism: "#1450a3",         // blue
  subheading: "#1c6b3a",        // green
  secondaryFlowchart: "#1c6b3a",// green
  pathogenesis: "#5b2a86",      // purple
  divider: "#000000"
};

const DEFAULT_PAGE_SETTINGS = {
  pageSize: "A4",
  background: "#ffffff",
  columns: 2,
  columnGapMm: 8,
  marginMm: 14,
  dividerThicknessPx: 2,
  dividerColor: "#000000"
};

const DEFAULT_FONT_SETTINGS = {
  headingFont: "Merriweather",
  bodyFont: "Inter",
  tableFont: "Inter",
  flowchartFont: "Inter",
  definitionFont: "Inter",
  bodySizePx: 13,
  headingSizePx: 18,
  lineHeight: 1.45
};

const GENERATION_MODES = [
  "smart",        // default — Smart Study Notes
  "summary",
  "qa",
  "mnemonics",
  "flowcharts",
  "tables",
  "examRevision",
  "mcq",
  "viva",
  "clinicalScenario",
  "flashcards"
];

function validateBlock(block) {
  const errors = [];
  if (!block || typeof block !== "object") {
    return ["Block is not an object"];
  }
  if (!BLOCK_TYPES.includes(block.type)) {
    errors.push(`Unsupported block type: ${block.type}`);
    return errors;
  }
  switch (block.type) {
    case "heading":
    case "subheading":
    case "paragraph":
    case "highYield":
    case "analogy":
    case "clinicalCorrelation":
    case "unclear":
      if (!block.content || !String(block.content).trim()) errors.push(`${block.type} missing content`);
      break;
    case "bulletList":
    case "numberedList":
      if (!Array.isArray(block.items) || block.items.length === 0) errors.push(`${block.type} missing items`);
      break;
    case "definition":
      if (!block.content) errors.push("definition missing content");
      break;
    case "examTag":
      if (!block.tag || !block.content) errors.push("examTag missing tag/content");
      break;
    case "flowchart":
      if (!Array.isArray(block.nodes) || block.nodes.length === 0) errors.push("flowchart missing nodes");
      break;
    case "table":
      if (!Array.isArray(block.headers) || !Array.isArray(block.rows)) errors.push("table missing headers/rows");
      else if (block.rows.some(r => r.length !== block.headers.length)) errors.push("table row/header length mismatch");
      break;
    case "classification":
      if (!Array.isArray(block.tree) || block.tree.length === 0) errors.push("classification missing tree");
      break;
    case "mnemonic":
      if (!block.content) errors.push("mnemonic missing content");
      break;
    case "qa":
      if (!block.question || !block.answer) errors.push("qa missing question/answer");
      break;
    case "flashcard":
      if (!block.front || !block.back) errors.push("flashcard missing front/back");
      break;
    case "mcq":
      if (!block.question || !Array.isArray(block.options) || block.options.length < 2) errors.push("mcq malformed");
      if (typeof block.correctIndex !== "number") errors.push("mcq missing correctIndex");
      break;
    case "imagePlaceholder":
      if (!block.description) errors.push("imagePlaceholder missing description");
      break;
  }
  return errors;
}

function validateDocument(doc) {
  const errors = [];
  if (!doc || !Array.isArray(doc.blocks)) {
    return ["Document missing blocks array"];
  }
  doc.blocks.forEach((b, i) => {
    const berrors = validateBlock(b);
    berrors.forEach(e => errors.push(`Block[${i}] (${b && b.type}): ${e}`));
  });
  return errors;
}

module.exports = {
  BLOCK_TYPES,
  SHAPES,
  DEFAULT_COLOR_SETTINGS,
  DEFAULT_PAGE_SETTINGS,
  DEFAULT_FONT_SETTINGS,
  GENERATION_MODES,
  validateBlock,
  validateDocument
};
