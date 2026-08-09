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

async function callGemini({ systemPrompt, userContent }) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not configured on the server.");
  const model = process.env.GEMINI_MODEL || "gemini-2.0-flash";

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: systemPrompt }] },
      contents: [{ role: "user", parts: [{ text: userContent }] }],
      generationConfig: {
        temperature: TEMPERATURE,
        maxOutputTokens: MAX_TOKENS,
        responseMimeType: "application/json"
      }
    })
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Gemini API error (${res.status}): ${text}`);
  }
  const data = await res.json();
  const parts = data.candidates?.[0]?.content?.parts || [];
  return parts.map(p => p.text || "").join("");
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
