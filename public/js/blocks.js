/**
 * RUBISCO — BLOCK RENDERING
 * ----------------------------------
 * Pure functions that turn a block object into a DOM node, and helpers
 * to read edited content back out of the DOM into the block object.
 */

function uid() {
  return crypto.randomUUID ? crypto.randomUUID() : "id-" + Math.random().toString(36).slice(2);
}

function el(tag, cls, html) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  return e;
}

function escapeHtml(s) {
  return (s || "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

const RubiscoBlocks = {
  createDefault(type) {
    const base = { id: uid(), type };
    switch (type) {
      case "heading": return { ...base, content: "New Heading" };
      case "subheading": return { ...base, content: "New Subheading" };
      case "paragraph": return { ...base, content: "New paragraph text..." };
      case "bulletList": return { ...base, items: ["Point one"] };
      case "numberedList": return { ...base, items: ["Step one"] };
      case "definition": return { ...base, title: "Definition", content: "..." };
      case "highYield": return { ...base, content: "High-yield fact..." };
      case "examTag": return { ...base, tag: "[must know]", content: "..." };
      case "flowchart": return { ...base, orientation: "vertical", nodes: [{ id: "n1", label: "Step 1" }, { id: "n2", label: "Step 2" }], connections: [{ from: "n1", to: "n2" }] };
      case "table": return { ...base, headers: ["Column A", "Column B"], rows: [["", ""]] };
      case "classification": return { ...base, title: "Classification", tree: [{ label: "Category", children: [] }] };
      case "mnemonic": return { ...base, content: "MNEMONIC", explanation: "..." };
      case "analogy": return { ...base, content: "..." };
      case "clinicalCorrelation": return { ...base, content: "..." };
      case "qa": return { ...base, question: "Question?", answer: "Answer." };
      case "flashcard": return { ...base, front: "Front", back: "Back" };
      case "mcq": return { ...base, question: "Question?", options: ["A", "B", "C", "D"], correctIndex: 0, explanation: "" };
      case "imagePlaceholder": return { ...base, description: "Description of figure..." };
      default: return { ...base, content: "" };
    }
  },

  render(block) {
    const wrap = el("div", `block b-${block.type}`);
    wrap.dataset.blockId = block.id;
    wrap.dataset.blockType = block.type;

    const controls = el("div", "block-controls");
    controls.innerHTML = `<button data-action="delete">✕</button><button data-action="dup">⧉</button>`;
    wrap.appendChild(controls);

    const body = el("div", "block-body");
    body.appendChild(this._renderInner(block));
    wrap.appendChild(body);

    if (block.sourceRef) {
      wrap.appendChild(el("div", "source-ref", `<small style="opacity:0.5;font-size:0.7em">[Source: ${escapeHtml(block.sourceRef)}]</small>`));
    }
    return wrap;
  },

  _renderInner(b) {
    switch (b.type) {
      case "heading":
        return el("h2", "editable", escapeHtml(b.content));
      case "subheading":
        return el("h3", "editable", escapeHtml(b.content));
      case "paragraph":
        return el("p", "editable", escapeHtml(b.content));
      case "bulletList": {
        const ul = el("ul");
        b.items.forEach(i => ul.appendChild(el("li", "editable", escapeHtml(i))));
        return ul;
      }
      case "numberedList": {
        const ol = el("ol");
        b.items.forEach(i => ol.appendChild(el("li", "editable", escapeHtml(i))));
        return ol;
      }
      case "definition": {
        const d = el("div");
        d.appendChild(el("div", "def-title", escapeHtml(b.title || "Definition")));
        d.appendChild(el("div", "editable", escapeHtml(b.content)));
        return d;
      }
      case "highYield":
        return el("div", "editable", escapeHtml(b.content));
      case "examTag": {
        const d = el("div");
        d.appendChild(el("span", "tag", escapeHtml(b.tag)));
        d.appendChild(el("span", "editable", escapeHtml(b.content)));
        return d;
      }
      case "flowchart": {
        const d = el("div");
        (b.nodes || []).forEach((n, idx) => {
          d.appendChild(el("div", "fc-node editable", escapeHtml(n.label)));
          if (idx < b.nodes.length - 1) d.appendChild(el("div", "fc-arrow", "↓"));
        });
        return d;
      }
      case "table": {
        const d = el("div");
        if (b.caption) d.appendChild(el("div", "caption editable", escapeHtml(b.caption)));
        const table = el("table");
        const thead = el("thead");
        const trh = el("tr");
        (b.headers || []).forEach(h => trh.appendChild(el("th", "editable", escapeHtml(h))));
        thead.appendChild(trh);
        table.appendChild(thead);
        const tbody = el("tbody");
        (b.rows || []).forEach(row => {
          const tr = el("tr");
          row.forEach(cell => tr.appendChild(el("td", "editable", escapeHtml(cell))));
          tbody.appendChild(tr);
        });
        table.appendChild(tbody);
        d.appendChild(table);
        return d;
      }
      case "classification": {
        const d = el("div");
        d.appendChild(el("div", "def-title editable", escapeHtml(b.title || "")));
        const renderTree = (nodes) => {
          const wrap = el("div");
          (nodes || []).forEach(n => {
            const node = el("div", "tree-node");
            node.appendChild(el("div", "editable", escapeHtml(n.label)));
            if (n.children && n.children.length) node.appendChild(renderTree(n.children));
            wrap.appendChild(node);
          });
          return wrap;
        };
        d.appendChild(renderTree(b.tree));
        return d;
      }
      case "mnemonic": {
        const d = el("div");
        d.appendChild(el("div", "editable", escapeHtml(b.content)));
        if (b.explanation) d.appendChild(el("div", "editable", `<small>${escapeHtml(b.explanation)}</small>`));
        return d;
      }
      case "analogy":
      case "clinicalCorrelation":
        return el("div", "editable", escapeHtml(b.content));
      case "qa": {
        const d = el("div");
        d.appendChild(el("div", "q editable", "Q: " + escapeHtml(b.question)));
        d.appendChild(el("div", "a editable", "A: " + escapeHtml(b.answer)));
        return d;
      }
      case "flashcard": {
        const d = el("div");
        d.appendChild(el("div", "editable", "Front: " + escapeHtml(b.front)));
        d.appendChild(el("div", "editable", "Back: " + escapeHtml(b.back)));
        return d;
      }
      case "mcq": {
        const d = el("div");
        d.appendChild(el("div", "q editable", escapeHtml(b.question)));
        (b.options || []).forEach((opt, i) => {
          d.appendChild(el("div", "opt" + (i === b.correctIndex ? " correct" : ""), `${String.fromCharCode(65 + i)}. ${escapeHtml(opt)}`));
        });
        if (b.explanation) d.appendChild(el("div", null, `<small>${escapeHtml(b.explanation)}</small>`));
        return d;
      }
      case "imagePlaceholder":
        return el("div", null, `🖼️ [INSERT IMAGE]<br><span class="editable">${escapeHtml(b.description)}</span>`);
      case "unclear":
        return el("div", "editable", escapeHtml(b.content));
      default:
        return el("div", null, "Unsupported block");
    }
  }
};

window.RubiscoBlocks = RubiscoBlocks;
