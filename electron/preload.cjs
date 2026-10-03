const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("auth", {
  hasAdmin: () => ipcRenderer.invoke("auth-has-admin"),
  createAdmin: (username, password) => ipcRenderer.invoke("auth-create-admin", { username, password }),
  login: (username, password) => ipcRenderer.invoke("auth-login", { username, password }),
  resetWithCode: (code, newPassword) => ipcRenderer.invoke("auth-reset-with-code", { code, newPassword }),
  changePassword: (currentPassword, newPassword) => ipcRenderer.invoke("auth-change-password", { currentPassword, newPassword }),
  newRecoveryCode: (password) => ipcRenderer.invoke("auth-new-recovery-code", { password }),
});

contextBridge.exposeInMainWorld("db", {
  getParties: () => ipcRenderer.invoke("db-get-parties"),
  upsertParty: (party) => ipcRenderer.invoke("db-upsert-party", party),
  deleteParty: (id) => ipcRenderer.invoke("db-delete-party", id),

  getTransactions: () => ipcRenderer.invoke("db-get-transactions"),
  upsertTransaction: (tx) => ipcRenderer.invoke("db-upsert-transaction", tx),
  deleteTransaction: (id) => ipcRenderer.invoke("db-delete-transaction", id),

  getCatalog: () => ipcRenderer.invoke("db-get-catalog"),
  upsertCatalog: (item) => ipcRenderer.invoke("db-upsert-catalog", item),
  deleteCatalog: (id) => ipcRenderer.invoke("db-delete-catalog", id),
  upsertCatalogMany: (items) => ipcRenderer.invoke("db-upsert-catalog-many", items),

  getProductions: () => ipcRenderer.invoke("db-get-productions"),
  upsertProduction: (run) => ipcRenderer.invoke("db-upsert-production", run),
  deleteProduction: (id) => ipcRenderer.invoke("db-delete-production", id),

  getAdjustments: () => ipcRenderer.invoke("db-get-adjustments"),
  upsertAdjustment: (a) => ipcRenderer.invoke("db-upsert-adjustment", a),
  deleteAdjustment: (id) => ipcRenderer.invoke("db-delete-adjustment", id),
});

contextBridge.exposeInMainWorld("settings", {
  get: () => ipcRenderer.invoke("settings-get"),
  save: (values) => ipcRenderer.invoke("settings-save", values),
});

contextBridge.exposeInMainWorld("docs", {
  // params: { partyId, dateFrom, dateTo, mode }
  peek: (params) => ipcRenderer.invoke("doc-peek", params),
  issue: (params) => ipcRenderer.invoke("doc-issue", params),
});

contextBridge.exposeInMainWorld("files", {
  savePdf: (defaultName) => ipcRenderer.invoke("file-save-pdf", { defaultName }),
  save: (defaultName, data, filters) => ipcRenderer.invoke("file-save", { defaultName, data, filters }),
  open: (filePath) => ipcRenderer.invoke("file-open", filePath),
});

contextBridge.exposeInMainWorld("appInfo", {
  get: () => ipcRenderer.invoke("app-info"),
  showDataFolder: () => ipcRenderer.invoke("app-show-data-folder"),
});

contextBridge.exposeInMainWorld("updates", {
  getStatus: () => ipcRenderer.invoke("update-get-status"),
  check: () => ipcRenderer.invoke("update-check"),
  install: () => ipcRenderer.invoke("update-install"),
  onStatus: (callback) => {
    const listener = (event, status) => callback(status);
    ipcRenderer.on("update-status", listener);
    return () => ipcRenderer.removeListener("update-status", listener);
  },
});
