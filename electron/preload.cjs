const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("auth", {
  hasAdmin: () => ipcRenderer.invoke("auth-has-admin"),
  createAdmin: (username, password) => ipcRenderer.invoke("auth-create-admin", { username, password }),
  login: (username, password) => ipcRenderer.invoke("auth-login", { username, password }),
  resetWithCode: (code, newPassword) => ipcRenderer.invoke("auth-reset-with-code", { code, newPassword }),
  changePassword: (currentPassword, newPassword) => ipcRenderer.invoke("auth-change-password", { currentPassword, newPassword }),
  newRecoveryCode: (password) => ipcRenderer.invoke("auth-new-recovery-code", { password }),
  logout: () => ipcRenderer.invoke("auth-logout"),
  // The main process ends the session itself, e.g. when the clock is turned back during a trial.
  onSessionEnded: (callback) => {
    const listener = (event, info) => callback(info);
    ipcRenderer.on("session-ended", listener);
    return () => ipcRenderer.removeListener("session-ended", listener);
  },
});

// These answer only while the owner is logged in.
contextBridge.exposeInMainWorld("owner", {
  listUsers: () => ipcRenderer.invoke("owner-list-users"),
  saveUser: (user) => ipcRenderer.invoke("owner-save-user", user),
  deleteUser: (id) => ipcRenderer.invoke("owner-delete-user", id),
  listRoles: () => ipcRenderer.invoke("owner-list-roles"),
  saveRole: (role) => ipcRenderer.invoke("owner-save-role", role),
  deleteRole: (id) => ipcRenderer.invoke("owner-delete-role", id),
  clockLog: () => ipcRenderer.invoke("owner-clock-log"),
  clearClockLock: () => ipcRenderer.invoke("owner-clear-clock-lock"),
});

contextBridge.exposeInMainWorld("license", {
  status: () => ipcRenderer.invoke("license-status"),
  set: (change) => ipcRenderer.invoke("license-set", change), // works only while the owner is logged in
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

  getOrders: () => ipcRenderer.invoke("db-get-orders"),
  upsertOrder: (order, txs) => ipcRenderer.invoke("db-upsert-order", { order, txs }),
  deleteOrder: (id) => ipcRenderer.invoke("db-delete-order", id),

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
