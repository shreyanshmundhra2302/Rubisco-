/**
 * RUBISCO — NEW PROJECT FLOW
 * ----------------------------------
 * Handles: file upload (PDF/images) or pasted text -> extraction -> OCR
 * review -> mode selection -> AI generation -> save new project locally.
 */

const RubiscoNewProject = (() => {
  let stagedPages = []; // [{ pageNumber, text, needsOCR, source: 'pdf'|'image'|'paste', fileRef }]
  let stagedFiles = []; // raw File objects, for images needing OCR / PDFs needing rasterization
  const STAGE_LABELS = [
    "Reading source", "Extracting information", "Identifying topics",
    "Structuring content", "Creating flowcharts", "Creating tables",
    "Applying hierarchy", "Building notes", "Checking completeness", "Finalizing"
  ];

  function reset() {
    stagedPages = [];
    stagedFiles = [];
    document.getElementById("page-thumbs").innerHTML = "";
    document.getElementById("extracted-pages").innerHTML = "";
    document.getElementById("np-step-review").hidden = true;
    document.getElementById("paste-text-area").value = "";
    document.getElementById("reference-book-input").value = "";
    document.getElementById("btn-generate").disabled = true;
    updateGenerateAvailability();
  }

  function updateGenerateAvailability() {
    const hasContent = stagedPages.length > 0 || document.getElementById("paste-text-area").value.trim().length > 0;
    document.getElementById("btn-generate").disabled = !hasContent;
  }

  function addThumb(label, needsOCR) {
    const thumbs = document.getElementById("page-thumbs");
    const t = document.createElement("div");
    t.className = "page-thumb";
    t.textContent = label;
    if (needsOCR) {
      const flag = document.createElement("div");
      flag.className = "uncertain-flag";
      flag.textContent = "OCR";
      t.appendChild(flag);
    }
    thumbs.appendChild(t);
  }

  async function handleFiles(files) {
    for (const file of Array.from(files)) {
      if (file.type === "application/pdf") {
        await handlePdfFile(file);
      } else if (file.type.startsWith("image/")) {
        await handleImageFile(file);
      }
    }
    renderReviewStep();
    updateGenerateAvailability();
  }

  async function handlePdfFile(file) {
    if (!navigator.onLine) {
      RubiscoToast.show("PDF text extraction requires an internet connection.", "error");
      return;
    }
    try {
      RubiscoToast.show(`Extracting text from ${file.name}…`);
      const result = await RubiscoAPI.extractPdf(file);
      const arrayBuffer = await file.arrayBuffer();
      for (const page of result.pages) {
        stagedPages.push({
          pageNumber: page.pageNumber, text: page.text, needsOCR: page.needsOCR,
          source: "pdf", fileRef: { arrayBuffer, fileName: file.name }
        });
        addThumb(`p.${page.pageNumber}`, page.needsOCR);
      }
      RubiscoToast.show(`Extracted ${result.totalPages} page(s) from ${file.name}.`, "success");
    } catch (err) {
      RubiscoToast.show(err.message === "OFFLINE" ? "PDF extraction requires internet." : (err.message || "PDF extraction failed."), "error");
    }
  }

  async function handleImageFile(file) {
    const pageNumber = stagedPages.length + 1;
    stagedPages.push({ pageNumber, text: "", needsOCR: true, source: "image", fileRef: file });
    addThumb(`img ${pageNumber}`, true);
  }

  async function runOCRForPage(pageEntry, onProgress) {
    let source;
    if (pageEntry.source === "image") {
      source = pageEntry.fileRef;
    } else if (pageEntry.source === "pdf") {
      source = await RubiscoOCR.rasterizePdfPage(pageEntry.fileRef.arrayBuffer, pageEntry.pageNumber);
    }
    const { text } = await RubiscoOCR.recognizeImage(source, onProgress);
    pageEntry.text = text;
    pageEntry.needsOCR = false;
  }

  function renderReviewStep() {
    const container = document.getElementById("extracted-pages");
    container.innerHTML = "";
    document.getElementById("np-step-review").hidden = stagedPages.length === 0;

    stagedPages.forEach((page, idx) => {
      const block = document.createElement("div");
      block.className = "extracted-page-block";
      const label = document.createElement("div");
      label.className = "page-label";
      label.textContent = page.pageNumber ? `Page ${page.pageNumber}` : `Item ${idx + 1}`;
      block.appendChild(label);

      if (page.needsOCR && !page.text) {
        const btn = document.createElement("button");
        btn.className = "btn btn-secondary btn-sm";
        btn.textContent = "Run OCR";
        btn.addEventListener("click", async () => {
          btn.disabled = true;
          btn.textContent = "Recognizing…";
          try {
            await runOCRForPage(page, (pct) => { btn.textContent = `Recognizing… ${pct}%`; });
            renderReviewStep();
          } catch (err) {
            RubiscoToast.show(err.message || "OCR failed.", "error");
            btn.disabled = false;
            btn.textContent = "Run OCR";
          }
        });
        block.appendChild(btn);
      }

      const textarea = document.createElement("textarea");
      textarea.rows = 4;
      textarea.value = page.text;
      textarea.placeholder = page.needsOCR ? "Run OCR above, or type/paste text manually." : "";
      textarea.addEventListener("input", () => { page.text = textarea.value; });
      block.appendChild(textarea);

      container.appendChild(block);
    });
  }

  function collectPagesForGeneration() {
    const pasteText = document.getElementById("paste-text-area").value.trim();
    const pages = stagedPages
      .filter(p => p.text && p.text.trim())
      .map(p => ({ pageNumber: p.pageNumber, text: p.text }));
    if (pasteText) {
      pages.push({ pageNumber: null, text: pasteText });
    }
    return pages;
  }

  function cycleProgressStages() {
    const progressEl = document.getElementById("generation-progress");
    const stageText = document.getElementById("progress-stage-text");
    const fill = document.getElementById("progress-bar-fill");
    progressEl.hidden = false;
    let i = 0;
    fill.style.width = "8%";
    const interval = setInterval(() => {
      i = Math.min(i + 1, STAGE_LABELS.length - 1);
      stageText.textContent = STAGE_LABELS[i] + "…";
      fill.style.width = Math.min(95, 8 + i * 10) + "%";
    }, 2200);
    return () => {
      clearInterval(interval);
      stageText.textContent = "Done.";
      fill.style.width = "100%";
      setTimeout(() => { progressEl.hidden = true; fill.style.width = "0%"; }, 600);
    };
  }

  async function generate() {
    const pages = collectPagesForGeneration();
    if (pages.length === 0) {
      RubiscoToast.show("Add a source first (upload, OCR, or paste text).", "error");
      return;
    }
    if (!navigator.onLine) {
      RubiscoToast.show("AI generation requires an internet connection.", "error");
      return;
    }

    const mode = document.getElementById("mode-select").value;
    const referenceBook = document.getElementById("reference-book-input").value.trim();
    const includeSourceRefs = document.getElementById("source-ref-toggle").checked;

    const genBtn = document.getElementById("btn-generate");
    genBtn.disabled = true;
    const stopCycling = cycleProgressStages();

    try {
      const { document: doc, qcErrors, chunkErrors, partial } = await RubiscoAPI.generate({ pages, mode, referenceBook, includeSourceRefs });
      stopCycling();

      if (qcErrors && qcErrors.length) {
        console.warn("QC issues in generated document:", qcErrors);
      }

      const project = {
        id: doc.id, title: doc.title, referenceBook: referenceBook || null,
        pageInfo: `${pages.length} source item(s)`, document: doc
      };
      await RubiscoDB.saveProject(project);

      if (partial && chunkErrors && chunkErrors.length) {
        console.warn("Some chunks failed to generate and were skipped:", chunkErrors);
        RubiscoToast.show(
          `Notes generated, but ${chunkErrors.length} section(s) failed and were skipped. Check console for details.`,
          "error"
        );
      } else {
        RubiscoToast.show("Notes generated.", "success");
      }
      RubiscoApp.openProject(project.id);
    } catch (err) {
      stopCycling();
      RubiscoToast.show(err.message || "Generation failed.", "error");
    } finally {
      genBtn.disabled = false;
    }
  }

  function initDOMBindings() {
    const uploadZone = document.getElementById("upload-zone");
    const fileInput = document.getElementById("file-input");

    document.getElementById("btn-choose-file").addEventListener("click", () => fileInput.click());
    fileInput.addEventListener("change", (e) => handleFiles(e.target.files));

    uploadZone.addEventListener("dragover", (e) => { e.preventDefault(); uploadZone.style.borderColor = "#6d8cff"; });
    uploadZone.addEventListener("dragleave", () => { uploadZone.style.borderColor = ""; });
    uploadZone.addEventListener("drop", (e) => {
      e.preventDefault();
      uploadZone.style.borderColor = "";
      handleFiles(e.dataTransfer.files);
    });

    document.getElementById("paste-text-area").addEventListener("input", updateGenerateAvailability);
    document.getElementById("btn-generate").addEventListener("click", generate);
  }

  return { initDOMBindings, reset };
})();

window.RubiscoNewProject = RubiscoNewProject;
