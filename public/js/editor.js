/**
 * RUBISCO — EDITOR CONTROLLER
 * ----------------------------------
 * Owns the currently open project/document, renders it into #notes-page,
 * and handles editing, undo/redo, transforms, and formatting settings.
 */

const RubiscoEditor = (() => {
  let currentProject = null;   // full project object (as stored in IndexedDB)
  let selectedBlockId = null;
  let undoStack = [];
  let redoStack = [];
  let autosaveTimer = null;

  const DEFAULT_COLORS = {
    body: "#111111", chapterTitle: "#7a0019", definitionHeader: "#7a0019",
    mechanism: "#1450a3", subheading: "#1c6b3a", secondaryFlowchart: "#1c6b3a",
    pathogenesis: "#5b2a86", divider: "#000000"
  };
  const DEFAULT_PAGE = { columns: 2, columnGapMm: 8, marginMm: 14, dividerThicknessPx: 2 };
  const DEFAULT_FONTS = { headingFont: "Merriweather", bodyFont: "Inter", bodySizePx: 13, lineHeight: 1.45 };

  function snapshot() {
    return JSON.parse(JSON.stringify(currentProject.document));
  }

  function pushUndo() {
    undoStack.push(snapshot());
    if (undoStack.length > 50) undoStack.shift();
    redoStack = [];
  }

  function undo() {
    if (undoStack.length === 0) return;
    redoStack.push(snapshot());
    currentProject.document = undoStack.pop();
    renderAll();
    scheduleAutosave();
  }

  function redo() {
    if (redoStack.length === 0) return;
    undoStack.push(snapshot());
    currentProject.document = redoStack.pop();
    renderAll();
    scheduleAutosave();
  }

  function scheduleAutosave() {
    clearTimeout(autosaveTimer);
    autosaveTimer = setTimeout(async () => {
      await RubiscoDB.saveProject(currentProject);
    }, 600);
  }

  function open(project) {
    currentProject = project;
    if (!currentProject.document.settings) {
      currentProject.document.settings = { colors: { ...DEFAULT_COLORS }, page: { ...DEFAULT_PAGE }, fonts: { ...DEFAULT_FONTS } };
    }
    undoStack = [];
    redoStack = [];
    selectedBlockId = null;
    renderAll();
  }

  function getCurrent() {
    return currentProject;
  }

  function applySettingsToDOM() {
    const page = document.getElementById("notes-page");
    const s = currentProject.document.settings;
    const colors = s.colors || DEFAULT_COLORS;
    const pageSettings = s.page || DEFAULT_PAGE;
    const fonts = s.fonts || DEFAULT_FONTS;

    Object.entries(colors).forEach(([key, val]) => {
      page.style.setProperty(`--color-${key}`, val);
    });
    page.style.setProperty("--columns", pageSettings.columns || 2);
    page.style.setProperty("--column-gap", (pageSettings.columnGapMm || 8) + "mm");
    page.style.setProperty("--page-margin", (pageSettings.marginMm || 14) + "mm");
    page.style.setProperty("--divider-thickness", (pageSettings.dividerThicknessPx || 2) + "px");
    page.style.setProperty("--font-heading", `'${fonts.headingFont || "Merriweather"}'`);
    page.style.setProperty("--font-body", `'${fonts.bodyFont || "Inter"}'`);
    page.style.setProperty("--font-body-size", (fonts.bodySizePx || 13) + "px");
    page.style.setProperty("--line-height", fonts.lineHeight || 1.45);
    page.classList.toggle("one-column", (pageSettings.columns || 2) === 1);

    // Sync formatting panel inputs
    document.querySelectorAll(".color-row").forEach(row => {
      const key = row.dataset.colorKey;
      const input = row.querySelector("input[type=color]");
      if (input) input.value = colors[key] || DEFAULT_COLORS[key];
    });
    const gapRange = document.getElementById("column-gap-range");
    if (gapRange) gapRange.value = pageSettings.columnGapMm || 8;
    const sizeRange = document.getElementById("body-size-range");
    if (sizeRange) sizeRange.value = fonts.bodySizePx || 13;
    const colToggle = document.getElementById("two-column-toggle");
    if (colToggle) colToggle.checked = (pageSettings.columns || 2) === 2;
  }

  function renderImportantTopics() {
    const container = document.getElementById("important-topics");
    const topics = currentProject.document.importantTopics || [];
    if (topics.length === 0) { container.innerHTML = ""; return; }
    let html = "<h4>Important Topics</h4>";
    topics.forEach(t => {
      html += `<label><input type="checkbox" data-topic-id="${t.id}" ${t.checked ? "checked" : ""} /> ${escapeHtmlSafe(t.text)}</label>`;
    });
    container.innerHTML = html;
    container.querySelectorAll("input[type=checkbox]").forEach(cb => {
      cb.addEventListener("change", () => {
        const topic = currentProject.document.importantTopics.find(t => t.id === cb.dataset.topicId);
        if (topic) { topic.checked = cb.checked; scheduleAutosave(); }
      });
    });
  }

  function escapeHtmlSafe(s) {
    return (s || "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  function renderBlocks() {
    const page = document.getElementById("notes-page");
    page.innerHTML = "";
    currentProject.document.blocks.forEach(block => {
      let node;
      try {
        node = RubiscoBlocks.render(block);
      } catch (err) {
        console.error("Failed to render block, showing placeholder instead:", block, err);
        node = document.createElement("div");
        node.className = "block b-error";
        node.dataset.blockId = block.id || "";
        node.dataset.blockType = block.type || "unknown";
        node.textContent = `⚠️ This block (${block.type || "unknown type"}) could not be rendered and was skipped.`;
      }
      if (block.id === selectedBlockId) node.classList.add("selected");
      page.appendChild(node);
    });
  }

  function renderAll() {
    document.getElementById("editor-title-input").value = currentProject.document.title || currentProject.title || "Untitled";
    applySettingsToDOM();
    renderImportantTopics();
    renderBlocks();
  }

  function selectBlock(id) {
    selectedBlockId = id;
    document.querySelectorAll(".block").forEach(b => b.classList.toggle("selected", b.dataset.blockId === id));
    const hint = document.getElementById("transform-hint");
    if (hint) hint.textContent = id ? "Block selected. Choose a transform and tap Apply." : "Select a block first by tapping it.";
  }

  function getSelectedBlock() {
    return currentProject.document.blocks.find(b => b.id === selectedBlockId) || null;
  }

  function deleteBlock(id) {
    pushUndo();
    currentProject.document.blocks = currentProject.document.blocks.filter(b => b.id !== id);
    if (selectedBlockId === id) selectedBlockId = null;
    renderBlocks();
    scheduleAutosave();
  }

  function duplicateBlock(id) {
    pushUndo();
    const idx = currentProject.document.blocks.findIndex(b => b.id === id);
    if (idx === -1) return;
    const copy = JSON.parse(JSON.stringify(currentProject.document.blocks[idx]));
    copy.id = uid();
    currentProject.document.blocks.splice(idx + 1, 0, copy);
    renderBlocks();
    scheduleAutosave();
  }

  function addBlock(type) {
    pushUndo();
    const block = RubiscoBlocks.createDefault(type);
    currentProject.document.blocks.push(block);
    renderBlocks();
    scheduleAutosave();
  }

  function readEditedTextIntoBlock(blockNode) {
    const id = blockNode.dataset.blockId;
    const block = currentProject.document.blocks.find(b => b.id === id);
    if (!block) return;
    const editables = blockNode.querySelectorAll(".editable");

    switch (block.type) {
      case "heading": case "subheading": case "paragraph":
      case "highYield": case "analogy": case "clinicalCorrelation": case "unclear":
        if (editables[0]) block.content = editables[0].textContent;
        break;
      case "bulletList": case "numberedList":
        block.items = Array.from(editables).map(e => e.textContent);
        break;
      case "definition": {
        const titleEl = blockNode.querySelector(".def-title");
        if (titleEl) block.title = titleEl.textContent;
        const contentEl = blockNode.querySelector(".block-body > div > .editable");
        if (contentEl) block.content = contentEl.textContent;
        else if (editables[0]) block.content = editables[0].textContent;
        break;
      }
      case "examTag":
        if (editables[0]) block.content = editables[0].textContent;
        break;
      case "flowchart": {
        const nodeEls = blockNode.querySelectorAll(".fc-node");
        block.nodes.forEach((n, i) => { if (nodeEls[i]) n.label = nodeEls[i].textContent; });
        break;
      }
      case "classification": {
        const titleEl = blockNode.querySelector(".def-title");
        if (titleEl) block.title = titleEl.textContent;
        const walkRead = (nodeEls, nodes) => {
          nodeEls.forEach((nodeEl, i) => {
            if (!nodes[i]) return;
            const labelEl = nodeEl.querySelector(":scope > .editable");
            if (labelEl) nodes[i].label = labelEl.textContent;
            const childWrap = nodeEl.querySelector(":scope > div:not(.editable)");
            if (childWrap && nodes[i].children) {
              walkRead(Array.from(childWrap.querySelectorAll(":scope > .tree-node")), nodes[i].children);
            }
          });
        };
        const topLevel = blockNode.querySelectorAll(".block-body > div > .tree-node");
        walkRead(Array.from(topLevel), block.tree);
        break;
      }
      case "mnemonic": {
        if (editables[0]) block.content = editables[0].textContent;
        if (editables[1]) block.explanation = editables[1].textContent;
        break;
      }
      case "mcq": {
        if (editables[0]) block.question = editables[0].textContent;
        break;
      }
      case "imagePlaceholder": {
        if (editables[0]) block.description = editables[0].textContent;
        break;
      }
      case "table": {
        const headerCells = blockNode.querySelectorAll("thead .editable");
        const bodyRows = blockNode.querySelectorAll("tbody tr");
        block.headers = Array.from(headerCells).map(e => e.textContent);
        block.rows = Array.from(bodyRows).map(tr => Array.from(tr.querySelectorAll(".editable")).map(e => e.textContent));
        break;
      }
      case "qa":
        if (editables[0]) block.question = editables[0].textContent.replace(/^Q:\s*/, "");
        if (editables[1]) block.answer = editables[1].textContent.replace(/^A:\s*/, "");
        break;
      case "flashcard":
        if (editables[0]) block.front = editables[0].textContent.replace(/^Front:\s*/, "");
        if (editables[1]) block.back = editables[1].textContent.replace(/^Back:\s*/, "");
        break;
      default:
        break;
    }
  }

  async function applyTransform(operation) {
    const block = getSelectedBlock();
    if (!block) { RubiscoToast.show("Select a block first.", "error"); return; }
    if (!navigator.onLine) { RubiscoToast.show("AI features require an internet connection.", "error"); return; }

    try {
      RubiscoToast.show("Transforming block…");
      const result = await RubiscoAPI.transform({ block, operation });
      pushUndo();
      const idx = currentProject.document.blocks.findIndex(b => b.id === block.id);
      currentProject.document.blocks.splice(idx, 1, ...result.newBlocks);
      selectedBlockId = result.newBlocks[0]?.id || null;
      renderBlocks();
      scheduleAutosave();
      RubiscoToast.show("Transform applied.", "success");
    } catch (err) {
      RubiscoToast.show(err.message || "Transform failed.", "error");
    }
  }

  function updateColor(key, value) {
    pushUndo();
    currentProject.document.settings.colors[key] = value;
    applySettingsToDOM();
    scheduleAutosave();
  }

  function resetColors() {
    pushUndo();
    currentProject.document.settings.colors = { ...DEFAULT_COLORS };
    applySettingsToDOM();
    scheduleAutosave();
  }

  function updatePageSetting(key, value) {
    pushUndo();
    currentProject.document.settings.page[key] = value;
    applySettingsToDOM();
    scheduleAutosave();
  }

  function updateFont(key, value) {
    pushUndo();
    currentProject.document.settings.fonts[key] = value;
    applySettingsToDOM();
    scheduleAutosave();
  }

  function setTitle(title) {
    currentProject.document.title = title;
    currentProject.title = title;
    scheduleAutosave();
  }

  const GOOGLE_FONTS_LIST = [
    "Inter", "Merriweather", "Lora", "Roboto", "Open Sans", "Source Serif Pro",
    "Playfair Display", "PT Serif", "Noto Serif", "Nunito", "Poppins", "Rubik",
    "Crimson Text", "Libre Baskerville", "EB Garamond", "Fira Sans", "Work Sans",
    "IBM Plex Sans", "IBM Plex Serif", "Karla", "Mulish", "Domine", "Vollkorn",
    "Bitter", "Cormorant Garamond", "Spectral", "Zilla Slab", "Josefin Sans",
    "Quicksand", "Raleway", "Alegreya", "Archivo", "Manrope", "DM Sans", "DM Serif Display"
  ];

  function searchGoogleFonts(query) {
    const q = (query || "").toLowerCase().trim();
    const results = q ? GOOGLE_FONTS_LIST.filter(f => f.toLowerCase().includes(q)) : GOOGLE_FONTS_LIST.slice(0, 10);
    const container = document.getElementById("font-search-results");
    container.innerHTML = "";
    results.forEach(family => {
      const item = document.createElement("div");
      item.className = "font-result-item";
      item.style.fontFamily = `'${family}', sans-serif`;
      item.textContent = family;
      item.addEventListener("click", () => applyGoogleFont(family, "bodyFont"));
      container.appendChild(item);
    });
  }

  async function applyGoogleFont(family, target = "bodyFont") {
    // Inject the Google Fonts stylesheet link if not already present.
    const linkId = `gf-${family.replace(/\s+/g, "-")}`;
    if (!document.getElementById(linkId)) {
      const link = document.createElement("link");
      link.id = linkId;
      link.rel = "stylesheet";
      link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family)}:wght@400;700&display=swap`;
      document.head.appendChild(link);
    }
    updateFont(target, family);
    await RubiscoDB.saveFont(family, null, "google");
    RubiscoToast.show(`Applied font: ${family}`, "success");
  }

  async function importLocalFont(file) {
    const family = file.name.replace(/\.(ttf|otf)$/i, "");
    const dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
    const fontFace = new FontFace(family, `url(${dataUrl})`);
    await fontFace.load();
    document.fonts.add(fontFace);
    await RubiscoDB.saveFont(family, dataUrl, "local");
    updateFont("bodyFont", family);
    RubiscoToast.show(`Imported local font: ${family}`, "success");
  }

  async function restoreSavedFontsOffline() {
    const fonts = await RubiscoDB.listFonts();
    for (const f of fonts) {
      if (f.source === "local" && f.dataUrl) {
        try {
          const fontFace = new FontFace(f.family, `url(${f.dataUrl})`);
          await fontFace.load();
          document.fonts.add(fontFace);
        } catch (err) { console.warn("Failed to restore local font", f.family, err); }
      } else if (f.source === "google" && navigator.onLine) {
        const linkId = `gf-${f.family.replace(/\s+/g, "-")}`;
        if (!document.getElementById(linkId)) {
          const link = document.createElement("link");
          link.id = linkId;
          link.rel = "stylesheet";
          link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(f.family)}:wght@400;700&display=swap`;
          document.head.appendChild(link);
        }
      }
    }
  }

  function initDOMBindings() {
    const page = document.getElementById("notes-page");

    page.addEventListener("click", (e) => {
      const blockEl = e.target.closest(".block");
      if (!blockEl) return;
      if (e.target.dataset.action === "delete") { deleteBlock(blockEl.dataset.blockId); return; }
      if (e.target.dataset.action === "dup") { duplicateBlock(blockEl.dataset.blockId); return; }
      selectBlock(blockEl.dataset.blockId);
    });

    page.addEventListener("focusin", (e) => {
      if (e.target.classList.contains("editable")) {
        e.target.setAttribute("contenteditable", "true");
      }
    });

    page.addEventListener("focusout", (e) => {
      if (e.target.classList.contains("editable")) {
        const blockEl = e.target.closest(".block");
        if (blockEl) { pushUndo(); readEditedTextIntoBlock(blockEl); scheduleAutosave(); }
      }
    });

    document.getElementById("editor-title-input").addEventListener("change", (e) => setTitle(e.target.value));
    document.getElementById("btn-undo").addEventListener("click", undo);
    document.getElementById("btn-redo").addEventListener("click", redo);
    document.getElementById("btn-toggle-panel").addEventListener("click", () => {
      const panel = document.getElementById("format-panel");
      panel.hidden = !panel.hidden;
    });

    document.getElementById("btn-apply-transform").addEventListener("click", () => {
      const op = document.getElementById("transform-op-select").value;
      applyTransform(op);
    });

    document.querySelectorAll(".color-row").forEach(row => {
      const input = row.querySelector("input[type=color]");
      input.addEventListener("input", () => updateColor(row.dataset.colorKey, input.value));
    });
    document.getElementById("btn-reset-colors").addEventListener("click", resetColors);

    document.getElementById("column-gap-range").addEventListener("input", (e) => updatePageSetting("columnGapMm", parseInt(e.target.value, 10)));
    document.getElementById("body-size-range").addEventListener("input", (e) => updateFont("bodySizePx", parseInt(e.target.value, 10)));
    document.getElementById("two-column-toggle").addEventListener("change", (e) => updatePageSetting("columns", e.target.checked ? 2 : 1));

    const fontSearchInput = document.getElementById("font-search-input");
    fontSearchInput.addEventListener("input", () => searchGoogleFonts(fontSearchInput.value));
    searchGoogleFonts("");

    const localFontInput = document.getElementById("local-font-input");
    if (localFontInput) {
      localFontInput.addEventListener("change", (e) => {
        if (e.target.files[0]) importLocalFont(e.target.files[0]);
      });
    }
    const btnImportLocalFont = document.getElementById("btn-import-local-font");
    if (btnImportLocalFont) {
      btnImportLocalFont.addEventListener("click", () => localFontInput.click());
    }

    document.getElementById("btn-add-block").addEventListener("click", () => {
      const type = prompt("Block type (heading, subheading, paragraph, bulletList, numberedList, definition, highYield, examTag, flowchart, table, classification, mnemonic, analogy, clinicalCorrelation, qa, flashcard, mcq, imagePlaceholder):", "paragraph");
      if (type) addBlock(type.trim());
    });
  }

  return { open, getCurrent, initDOMBindings, undo, redo, renderAll, restoreSavedFontsOffline };
})();

function uid() {
  return crypto.randomUUID ? crypto.randomUUID() : "id-" + Math.random().toString(36).slice(2);
}

window.RubiscoEditor = RubiscoEditor;
