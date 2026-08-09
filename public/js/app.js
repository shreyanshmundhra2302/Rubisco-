/**
 * RUBISCO — APP CONTROLLER
 * ----------------------------------
 * View routing between Dashboard / New Project / Editor, project dashboard
 * rendering, toast notifications, online/offline indicator, PWA registration.
 */

const RubiscoToast = {
  show(message, type = "") {
    const container = document.getElementById("toast-container");
    const t = document.createElement("div");
    t.className = `toast${type ? " " + type : ""}`;
    t.textContent = message;
    container.appendChild(t);
    setTimeout(() => t.remove(), 3200);
  }
};

const RubiscoApp = (() => {
  function showView(name) {
    document.querySelectorAll(".view").forEach(v => v.classList.remove("active"));
    document.getElementById(`view-${name}`).classList.add("active");
  }

  async function renderDashboard() {
    const projects = await RubiscoDB.listProjects();
    const list = document.getElementById("project-list");
    const empty = document.getElementById("empty-state");
    list.innerHTML = "";
    empty.hidden = projects.length > 0;

    projects.forEach(p => {
      const card = document.createElement("div");
      card.className = "project-card";
      const modified = new Date(p.updatedAt).toLocaleString();
      card.innerHTML = `
        <h3>${escapeHtml(p.title || "Untitled")}</h3>
        <div class="meta">${escapeHtml(p.pageInfo || "")} · Modified ${modified}</div>
        <div class="card-actions">
          <button class="btn btn-secondary btn-sm" data-action="open">Open</button>
          <button class="btn btn-ghost btn-sm" data-action="rename">Rename</button>
          <button class="btn btn-ghost btn-sm" data-action="duplicate">Duplicate</button>
          <button class="btn btn-ghost btn-sm" data-action="delete" style="color:#ff6b6b">Delete</button>
        </div>
      `;
      card.addEventListener("click", (e) => {
        const action = e.target.dataset.action;
        if (!action || action === "open") { openProject(p.id); return; }
        e.stopPropagation();
        if (action === "rename") return renameProject(p.id);
        if (action === "duplicate") return duplicateProject(p.id);
        if (action === "delete") return deleteProject(p.id);
      });
      list.appendChild(card);
    });
  }

  function escapeHtml(s) {
    return (s || "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  async function renameProject(id) {
    const project = await RubiscoDB.getProject(id);
    const newTitle = prompt("Rename project:", project.title);
    if (newTitle && newTitle.trim()) {
      project.title = newTitle.trim();
      project.document.title = newTitle.trim();
      await RubiscoDB.saveProject(project);
      renderDashboard();
    }
  }

  async function duplicateProject(id) {
    await RubiscoDB.duplicateProject(id);
    RubiscoToast.show("Project duplicated.", "success");
    renderDashboard();
  }

  async function deleteProject(id) {
    if (!confirm("Delete this project permanently? This cannot be undone.")) return;
    await RubiscoDB.deleteProject(id);
    RubiscoToast.show("Project deleted.", "success");
    renderDashboard();
  }

  async function openProject(id) {
    const project = await RubiscoDB.getProject(id);
    if (!project) { RubiscoToast.show("Project not found.", "error"); return; }
    try {
      RubiscoEditor.open(project);
      showView("editor");
    } catch (err) {
      console.error("Failed to open project:", err);
      RubiscoToast.show(err.message || "Failed to open this project — see console for details.", "error");
    }
  }

  function updateOnlineIndicator() {
    const el = document.getElementById("online-indicator");
    const online = navigator.onLine;
    el.textContent = online ? "Online" : "Offline";
    el.className = `online-indicator ${online ? "online" : "offline"}`;
  }

  function initNav() {
    document.querySelectorAll("[data-nav]").forEach(btn => {
      btn.addEventListener("click", () => {
        const target = btn.dataset.nav;
        if (target === "dashboard") { renderDashboard(); showView("dashboard"); }
      });
    });

    document.getElementById("btn-new-project").addEventListener("click", () => {
      RubiscoNewProject.reset();
      showView("newproject");
    });

    document.getElementById("btn-export").addEventListener("click", () => {
      const project = RubiscoEditor.getCurrent();
      if (!project) return;
      const choice = prompt("Export as: pdf, markdown, or html?", "pdf");
      if (!choice) return;
      if (choice.toLowerCase().startsWith("pdf")) RubiscoExport.exportPDF();
      else if (choice.toLowerCase().startsWith("md") || choice.toLowerCase().startsWith("mark")) RubiscoExport.exportMarkdown(project.document);
      else if (choice.toLowerCase().startsWith("html")) RubiscoExport.exportHTML(project.document);
    });
  }

  async function init() {
    initNav();
    RubiscoEditor.initDOMBindings();
    RubiscoNewProject.initDOMBindings();
    updateOnlineIndicator();
    window.addEventListener("online", updateOnlineIndicator);
    window.addEventListener("offline", updateOnlineIndicator);

    RubiscoEditor.restoreSavedFontsOffline();

    if ("serviceWorker" in navigator) {
      try { await navigator.serviceWorker.register("/service-worker.js"); }
      catch (err) { console.warn("Service worker registration failed:", err); }
    }

    await renderDashboard();
    showView("dashboard");
  }

  return { init, openProject, renderDashboard };
})();

document.addEventListener("DOMContentLoaded", RubiscoApp.init);
