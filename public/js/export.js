/**
 * RUBISCO — EXPORT MODULE
 * ----------------------------------
 * All export paths run entirely client-side so they work offline:
 *  - PDF: uses the browser's native print-to-PDF against a print stylesheet
 *         that preserves the two-column layout, black divider, and colors.
 *  - Markdown / HTML: generated directly from the structured block document.
 */

const RubiscoExport = {
  exportPDF() {
    window.print();
  },

  blockToMarkdown(b) {
    switch (b.type) {
      case "heading": return `## ${b.content}\n`;
      case "subheading": return `### ${b.content}\n`;
      case "paragraph": return `${b.content}\n`;
      case "bulletList": return b.items.map(i => `- ${i}`).join("\n") + "\n";
      case "numberedList": return b.items.map((i, idx) => `${idx + 1}. ${i}`).join("\n") + "\n";
      case "definition": return `> **${b.title || "Definition"}**: ${b.content}\n`;
      case "highYield": return `> 🔶 **High-Yield:** ${b.content}\n`;
      case "examTag": return `> ${b.tag} ${b.content}\n`;
      case "flowchart": return b.nodes.map(n => n.label).join(" → ") + "\n";
      case "table": {
        let md = `| ${b.headers.join(" | ")} |\n`;
        md += `| ${b.headers.map(() => "---").join(" | ")} |\n`;
        b.rows.forEach(r => { md += `| ${r.join(" | ")} |\n`; });
        return md;
      }
      case "classification": {
        const walk = (nodes, depth) => nodes.map(n => `${"  ".repeat(depth)}- ${n.label}\n${n.children ? walk(n.children, depth + 1) : ""}`).join("");
        return `**${b.title || ""}**\n` + walk(b.tree, 0);
      }
      case "mnemonic": return `> 🧠 **Mnemonic:** ${b.content}${b.explanation ? " — " + b.explanation : ""}\n`;
      case "analogy": return `> 💡 ${b.content}\n`;
      case "clinicalCorrelation": return `> 🩺 **Clinical Correlation:** ${b.content}\n`;
      case "qa": return `**Q:** ${b.question}\n**A:** ${b.answer}\n`;
      case "flashcard": return `**Front:** ${b.front}\n**Back:** ${b.back}\n`;
      case "mcq": {
        let md = `**${b.question}**\n`;
        b.options.forEach((o, i) => { md += `${String.fromCharCode(65 + i)}. ${o}${i === b.correctIndex ? " ✅" : ""}\n`; });
        if (b.explanation) md += `_${b.explanation}_\n`;
        return md;
      }
      case "imagePlaceholder": return `[INSERT IMAGE: ${b.description}]\n`;
      case "unclear": return `> ⚠️ ${b.content}\n`;
      default: return "";
    }
  },

  exportMarkdown(document_) {
    let md = `# ${document_.title}\n\n`;
    if (document_.importantTopics && document_.importantTopics.length) {
      md += `## Important Topics\n\n`;
      document_.importantTopics.forEach(t => { md += `- [${t.checked ? "x" : " "}] ${t.text}\n`; });
      md += "\n";
    }
    document_.blocks.forEach(b => { md += this.blockToMarkdown(b) + "\n"; });
    this._download(md, `${this._slug(document_.title)}.md`, "text/markdown");
  },

  exportHTML(document_) {
    const notesPage = document.getElementById("notes-page");
    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${document_.title}</title>
<style>${document.querySelector('link[href="/css/style.css"]') ? "" : ""}
body{font-family:Inter,sans-serif;background:#fff;color:#111;padding:20px;}
${document.getElementById("notes-page") ? document.querySelector("style") : ""}
</style></head><body>${notesPage.outerHTML}</body></html>`;
    this._download(html, `${this._slug(document_.title)}.html`, "text/html");
  },

  _slug(title) {
    return (title || "notes").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "notes";
  },

  _download(content, filename, mime) {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
};

window.RubiscoExport = RubiscoExport;
