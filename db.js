/**
 * RUBISCO — INDEXEDDB STORAGE LAYER
 * ----------------------------------
 * The browser/device is the primary source of truth for study projects.
 * The server NEVER stores personal project data.
 *
 * Object stores:
 *  - projects   : { id, title, createdAt, updatedAt, referenceBook, pageInfo, document }
 *  - settings   : { key: "colors"|"fonts"|"page"|"abbreviations"|"aiProvider", value }
 *  - fonts      : { family, source: "google"|"local", dataUrl? } (local font blobs)
 */

const DB_NAME = "rubisco-db";
const DB_VERSION = 1;

let dbPromise = null;

function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains("projects")) {
        const store = db.createObjectStore("projects", { keyPath: "id" });
        store.createIndex("updatedAt", "updatedAt");
      }
      if (!db.objectStoreNames.contains("settings")) {
        db.createObjectStore("settings", { keyPath: "key" });
      }
      if (!db.objectStoreNames.contains("fonts")) {
        db.createObjectStore("fonts", { keyPath: "family" });
      }
    };

    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx(storeName, mode) {
  return openDB().then(db => db.transaction(storeName, mode).objectStore(storeName));
}

function promisifyRequest(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

const RubiscoDB = {
  // ---------------- Projects ----------------
  async saveProject(project) {
    project.updatedAt = new Date().toISOString();
    if (!project.createdAt) project.createdAt = project.updatedAt;
    const store = await tx("projects", "readwrite");
    await promisifyRequest(store.put(project));
    return project;
  },

  async getProject(id) {
    const store = await tx("projects", "readonly");
    return promisifyRequest(store.get(id));
  },

  async listProjects() {
    const store = await tx("projects", "readonly");
    const all = await promisifyRequest(store.getAll());
    return all.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
  },

  async deleteProject(id) {
    const store = await tx("projects", "readwrite");
    return promisifyRequest(store.delete(id));
  },

  async duplicateProject(id) {
    const original = await this.getProject(id);
    if (!original) throw new Error("Project not found.");
    const copy = JSON.parse(JSON.stringify(original));
    copy.id = crypto.randomUUID();
    copy.title = original.title + " (copy)";
    copy.createdAt = new Date().toISOString();
    copy.updatedAt = copy.createdAt;
    await this.saveProject(copy);
    return copy;
  },

  // ---------------- Settings ----------------
  async getSetting(key, fallback) {
    const store = await tx("settings", "readonly");
    const result = await promisifyRequest(store.get(key));
    return result ? result.value : fallback;
  },

  async setSetting(key, value) {
    const store = await tx("settings", "readwrite");
    return promisifyRequest(store.put({ key, value }));
  },

  // ---------------- Fonts (for offline-persisted local fonts) ----------------
  async saveFont(family, dataUrl, source) {
    const store = await tx("fonts", "readwrite");
    return promisifyRequest(store.put({ family, dataUrl, source }));
  },

  async listFonts() {
    const store = await tx("fonts", "readonly");
    return promisifyRequest(store.getAll());
  },

  async deleteFont(family) {
    const store = await tx("fonts", "readwrite");
    return promisifyRequest(store.delete(family));
  }
};

window.RubiscoDB = RubiscoDB;
