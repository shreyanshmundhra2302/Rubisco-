/**
 * RUBISCO — API CLIENT
 * ----------------------------------
 * Talks to the backend ONLY for:
 *   - PDF text extraction
 *   - AI generation
 *   - AI transform
 * Never used to store/retrieve personal projects — that's IndexedDB's job.
 */

const RubiscoAPI = {
  isOnline() {
    return navigator.onLine;
  },

  async health() {
    const res = await fetch("/api/health");
    if (!res.ok) throw new Error("Server unreachable.");
    return res.json();
  },

  async extractPdf(file) {
    if (!this.isOnline()) throw new Error("OFFLINE");
    const form = new FormData();
    form.append("file", file);
    const res = await fetch("/api/extract/pdf", { method: "POST", body: form });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || "PDF extraction failed.");
    }
    return res.json();
  },

  async generate({ pages, mode, referenceBook, includeSourceRefs, provider }) {
    if (!this.isOnline()) throw new Error("OFFLINE");
    const res = await fetch("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pages, mode, referenceBook, includeSourceRefs, provider })
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || "Generation failed.");
    }
    return res.json();
  },

  async transform({ block, operation, context, provider }) {
    if (!this.isOnline()) throw new Error("OFFLINE");
    const res = await fetch("/api/transform", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ block, operation, context, provider })
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || "Transform failed.");
    }
    return res.json();
  }
};

window.RubiscoAPI = RubiscoAPI;
