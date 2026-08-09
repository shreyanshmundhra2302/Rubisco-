/**
 * RUBISCO — AI PROVIDER ABSTRACTION
 * ----------------------------------
 * Every provider exposes the same function signature:
 *   async callAI({ systemPrompt, userContent }) -> string (raw text response)
 *
 * API keys are read from process.env only. They are never sent to the frontend.
 */

const fetch = require("node-fetch");

const TEMPERATURE = parseFloat(process.env.AI_TEMPERATURE || "0.4");
const MAX_TOKENS = parseInt(process.env.AI_MAX_OUTPUT_TOKENS || "8000", 10);

async function callOpenAI({ systemPrompt, userContent }) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not configured on the server.");
  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      temperature: TEMPERATURE,
      max_tokens: MAX_TOKENS,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userContent }
      ]
    })
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`OpenAI API error (${res.status}): ${text}`);
  }
  const data = await res.json();
  return data.choices?.[0]?.message?.content || "";
}

// Best-effort structured-output schema for the Gemini "responseSchema" field.
// Deliberately permissive on block-specific fields (rather than a strict
// oneOf/discriminated union) because:
//  (a) the Gemini API's supported OpenAPI-schema subset does not reliably
//      support oneOf/anyOf across versions, and
//  (b) over-constraining the schema risks the model dropping content to
//      satisfy it, which would silently reduce note completeness.
// It still forces the model into a JSON object with the right top-level
// envelope and an array of typed block objects, which is what actually
// causes stray prose / code fences / multiple objects in the response.
const GEMINI_BLOCK_SCHEMA = {
  type: "OBJECT",
  properties: {
    type: { type: "STRING" },
    content: { type: "STRING" },
    title: { type: "STRING" },
    tag: { type: "STRING" },
    explanation: { type: "STRING" },
    question: { type: "STRING" },
    answer: { type: "STRING" },
    front: { type: "STRING" },
    back: { type: "STRING" },
    description: { type: "STRING" },
    orientation: { type: "STRING" },
    items: { type: "ARRAY", items: { type: "STRING" } },
    options: { type: "ARRAY", items: { type: "STRING" } },
    correctIndex: { type: "INTEGER" },
    caption: { type: "STRING" },
    headers: { type: "ARRAY", items: { type: "STRING" } },
    rows: { type: "ARRAY", items: { type: "ARRAY", items: { type: "STRING" } } },
    nodes: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: { id: { type: "STRING" }, label: { type: "STRING" } }
      }
    },
    connections: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: { from: { type: "STRING" }, to: { type: "STRING" }, label: { type: "STRING" } }
      }
    },
    tree: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: { label: { type: "STRING" }, children: { type: "ARRAY", items: { type: "OBJECT" } } }
      }
    }
  },
  required: ["type"]
};

const GEMINI_DOCUMENT_SCHEMA = {
  type: "OBJECT",
  properties: {
    title: { type: "STRING" },
    importantTopics: { type: "ARRAY", items: { type: "STRING" } },
    blocks: { type: "ARRAY", items: GEMINI_BLOCK_SCHEMA }
  },
  required: ["blocks"]
};

async function callGemini({ systemPrompt, userContent }) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not configured on the server.");
  const model = process.env.GEMINI_MODEL || "gemini-2.0-flash";

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const strictJsonPrefix =
    "CRITICAL OUTPUT RULE: Respond with ONLY the raw JSON object requested below. " +
    "Do not include Markdown code fences (no ``` of any kind), no preamble, no explanation, " +
    "no comments, and no text of any kind before or after the JSON. The response body must " +
    "start with '{' and end with '}' and contain nothing else.\n\n";

  const buildBody = (useSchema) => ({
    system_instruction: { parts: [{ text: strictJsonPrefix + systemPrompt }] },
    contents: [{ role: "user", parts: [{ text: userContent }] }],
    generationConfig: {
      temperature: TEMPERATURE,
      maxOutputTokens: MAX_TOKENS,
      responseMimeType: "application/json",
      ...(useSchema ? { responseSchema: GEMINI_DOCUMENT_SCHEMA } : {})
    }
  });

  const doCall = async (useSchema) => {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildBody(useSchema))
    });
    if (!res.ok) {
      const text = await res.text();
      const err = new Error(`Gemini API error (${res.status}): ${text}`);
      err.status = res.status;
      err.body = text;
      throw err;
    }
    const data = await res.json();
    const parts = data.candidates?.[0]?.content?.parts || [];
    return parts.map(p => p.text || "").join("");
  };

  try {
    return await doCall(true);
  } catch (err) {
    // If the schema itself was rejected as invalid (e.g. an unsupported
    // keyword on the currently deployed model version), fall back to plain
    // responseMimeType:"application/json" mode rather than failing the
    // whole request — the strict prompt + JSON mime type still do most of
    // the work, and generate.js's parser/retry handle the rest.
    const looksLikeSchemaRejection =
      err.status === 400 && /schema/i.test(err.body || "");
    if (!looksLikeSchemaRejection) throw err;
    return doCall(false);
  }
}

async function callClaude({ systemPrompt, userContent }) {
  const apiKey = process.env.CLAUDE_API_KEY;
  if (!apiKey) throw new Error("CLAUDE_API_KEY is not configured on the server.");
  const model = process.env.CLAUDE_MODEL || "claude-sonnet-4-6";

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify({
      model,
      max_tokens: MAX_TOKENS,
      temperature: TEMPERATURE,
      system: systemPrompt,
      messages: [{ role: "user", content: userContent }]
    })
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Claude API error (${res.status}): ${text}`);
  }
  const data = await res.json();
  return (data.content || []).map(b => b.text || "").join("");
}

async function callOllama({ systemPrompt, userContent }) {
  const baseUrl = process.env.OLLAMA_BASE_URL || "http://localhost:11434";
  const model = process.env.OLLAMA_MODEL || "llama3";

  const res = await fetch(`${baseUrl}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      stream: false,
      options: { temperature: TEMPERATURE },
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userContent }
      ]
    })
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Ollama error (${res.status}): ${text}`);
  }
  const data = await res.json();
  return data.message?.content || "";
}

async function callOpenAICompatible({ systemPrompt, userContent }, baseUrl, apiKey, model) {
  if (!baseUrl) throw new Error("Base URL is not configured for this provider.");
  const res = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {})
    },
    body: JSON.stringify({
      model: model || "local-model",
      temperature: TEMPERATURE,
      max_tokens: MAX_TOKENS,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userContent }
      ]
    })
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`OpenAI-compatible API error (${res.status}): ${text}`);
  }
  const data = await res.json();
  return data.choices?.[0]?.message?.content || "";
}

async function callLMStudio(args) {
  return callOpenAICompatible(
    args,
    process.env.LMSTUDIO_BASE_URL || "http://localhost:1234/v1",
    null,
    process.env.LMSTUDIO_MODEL || "local-model"
  );
}

async function callGeneric(args) {
  return callOpenAICompatible(
    args,
    process.env.GENERIC_BASE_URL,
    process.env.GENERIC_API_KEY,
    process.env.GENERIC_MODEL
  );
}

const PROVIDERS = {
  openai: callOpenAI,
  gemini: callGemini,
  claude: callClaude,
  ollama: callOllama,
  lmstudio: callLMStudio,
  generic: callGeneric
};

/**
 * Dispatches to the configured provider (or an explicit override for this call).
 */
async function callAI({ systemPrompt, userContent, providerOverride }) {
  const provider = (providerOverride || process.env.AI_PROVIDER || "gemini").toLowerCase();
  const fn = PROVIDERS[provider];
  if (!fn) {
    throw new Error(`Unknown AI provider "${provider}". Valid options: ${Object.keys(PROVIDERS).join(", ")}`);
  }
  return fn({ systemPrompt, userContent });
}

module.exports = { callAI, PROVIDERS };
