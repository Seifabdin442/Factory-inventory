const { app, BrowserWindow, ipcMain, dialog, shell } = require("electron");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const initSqlJs = require("sql.js");
const license = require("./license.cjs");
const owner = require("./owner.cjs");

// electron-updater is optional at runtime: if it is missing (e.g. dev mode) the app still works.
let autoUpdater = null;
try { ({ autoUpdater } = require("electron-updater")); } catch (e) { autoUpdater = null; }

// This app keeps its data in its own folder, so it can be installed next to the older "Factory Ledger"
// app without the two sharing (or overwriting) one database.
const DEFAULT_APP_NAME = "Factory Inventory";
app.setPath("userData", path.join(app.getPath("appData"), "factory-inventory"));

let db = null;
let mainWindow = null;
const SCHEMA_VERSION = 4;

function dbFilePath() {
  return path.join(app.getPath("userData"), "factory-ledger.sqlite");
}

// Write to a temporary file first, then swap it in, so a crash or power cut mid-save
// can never leave a half-written database behind.
function persist() {
  const data = Buffer.from(db.export());
  const file = dbFilePath();
  const tmp = file + ".tmp";
  fs.writeFileSync(tmp, data);
  try {
    fs.renameSync(tmp, file);
  } catch (err) {
    // Windows can briefly lock the file (antivirus, backup tools); fall back to a direct write.
    fs.writeFileSync(file, data);
    try { fs.unlinkSync(tmp); } catch (e) { /* ignore */ }
  }
}

function columnExists(table, column) {
  return rowsFromQuery(`PRAGMA table_info(${table})`).some((r) => r.name === column);
}

// Upgrades an existing database in place. Every step is safe to run more than once.
function migrate() {
  db.run(`
    CREATE TABLE IF NOT EXISTS transaction_items (
      id TEXT PRIMARY KEY,
      txId TEXT NOT NULL,
      position INTEGER NOT NULL DEFAULT 0,
      catalogId TEXT,
      description TEXT,
      quantity REAL,
      unitPrice REAL,
      total REAL
    );
    CREATE INDEX IF NOT EXISTS idx_items_tx ON transaction_items(txId);
    CREATE INDEX IF NOT EXISTS idx_tx_party ON transactions(partyId);
    CREATE TABLE IF NOT EXISTS catalog_items (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      unit TEXT,
      salePrice REAL,
      purchasePrice REAL,
      notes TEXT
    );
  `);
  if (!columnExists("transactions", "category")) db.run("ALTER TABLE transactions ADD COLUMN category TEXT");
  if (!columnExists("users", "recoverySalt")) db.run("ALTER TABLE users ADD COLUMN recoverySalt TEXT");
  if (!columnExists("users", "recoveryHash")) db.run("ALTER TABLE users ADD COLUMN recoveryHash TEXT");

  // v3: inventory. Stock itself is never stored: it is worked out from purchases, production runs,
  // sales and adjustments, so it can't drift out of step with the entries.
  if (!columnExists("catalog_items", "type")) db.run("ALTER TABLE catalog_items ADD COLUMN type TEXT DEFAULT 'material'");
  if (!columnExists("catalog_items", "size")) db.run("ALTER TABLE catalog_items ADD COLUMN size TEXT");
  if (!columnExists("catalog_items", "color")) db.run("ALTER TABLE catalog_items ADD COLUMN color TEXT");
  if (!columnExists("catalog_items", "minStock")) db.run("ALTER TABLE catalog_items ADD COLUMN minStock REAL");
  if (!columnExists("catalog_items", "trackStock")) db.run("ALTER TABLE catalog_items ADD COLUMN trackStock INTEGER DEFAULT 1");
  db.run(`
    CREATE TABLE IF NOT EXISTS productions (
      id TEXT PRIMARY KEY,
      date TEXT NOT NULL,
      notes TEXT,
      laborCost REAL,
      otherCost REAL,
      splitMode TEXT,
      createdAt TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS production_lines (
      id TEXT PRIMARY KEY,
      productionId TEXT NOT NULL,
      role TEXT NOT NULL,
      position INTEGER NOT NULL DEFAULT 0,
      catalogId TEXT,
      description TEXT,
      quantity REAL,
      share REAL,
      salePrice REAL
    );
    CREATE INDEX IF NOT EXISTS idx_prod_lines ON production_lines(productionId);
    CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY,
      date TEXT NOT NULL,
      clientId TEXT NOT NULL,
      title TEXT,
      status TEXT NOT NULL DEFAULT 'open',
      deliveredDate TEXT,
      commissionMode TEXT,
      commissionScope TEXT,
      commissionValue REAL,
      notes TEXT,
      data TEXT,
      createdAt TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS stock_adjustments (
      id TEXT PRIMARY KEY,
      date TEXT NOT NULL,
      catalogId TEXT NOT NULL,
      quantity REAL NOT NULL,
      unitCost REAL,
      reason TEXT,
      notes TEXT,
      createdAt TEXT NOT NULL
    );
  `);
  // v4: client orders (brokering). Every money movement of an order is a normal transaction that carries
  // the order's id, so balances, statements and aging keep working without knowing about orders.
  if (!columnExists("transactions", "orderId")) db.run("ALTER TABLE transactions ADD COLUMN orderId TEXT");
  if (!columnExists("transactions", "commission")) db.run("ALTER TABLE transactions ADD COLUMN commission REAL");
  db.run("CREATE INDEX IF NOT EXISTS idx_tx_order ON transactions(orderId)");
  db.run(`PRAGMA user_version = ${SCHEMA_VERSION}`);
}

async function initDb() {
  const wasmPath = app.isPackaged
    ? path.join(process.resourcesPath, "app.asar.unpacked", "node_modules", "sql.js", "dist", "sql-wasm.wasm")
    : path.join(__dirname, "..", "node_modules", "sql.js", "dist", "sql-wasm.wasm");

  console.log("[factory-ledger] isPackaged =", app.isPackaged, "wasmPath =", wasmPath, "exists =", fs.existsSync(wasmPath));

  const SQL = await initSqlJs({ locateFile: () => wasmPath });

  const file = dbFilePath();
  console.log("[factory-ledger] db file =", file, "exists =", fs.existsSync(file));
  if (fs.existsSync(file)) {
    db = new SQL.Database(fs.readFileSync(file));
    // Keep a one-time copy of the database before upgrading it to a newer structure.
    const version = rowsFromQuery("PRAGMA user_version")[0].user_version || 0;
    if (version < SCHEMA_VERSION) {
      const backup = path.join(path.dirname(file), `factory-ledger.before-v${SCHEMA_VERSION}.sqlite`);
      if (!fs.existsSync(backup)) fs.copyFileSync(file, backup);
    }
  } else {
    db = new SQL.Database();
  }

  db.run(`
    CREATE TABLE IF NOT EXISTS parties (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      phone TEXT
    );
    CREATE TABLE IF NOT EXISTS transactions (
      id TEXT PRIMARY KEY,
      kind TEXT NOT NULL,
      date TEXT NOT NULL,
      partyId TEXT,
      description TEXT,
      quantity REAL,
      unitPrice REAL,
      total REAL,
      paid REAL,
      notes TEXT
    );
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      salt TEXT NOT NULL,
      hash TEXT NOT NULL,
      createdAt TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    );
    CREATE TABLE IF NOT EXISTS issued_documents (
      number TEXT PRIMARY KEY,
      year INTEGER NOT NULL,
      seq INTEGER NOT NULL,
      partyId TEXT,
      dateFrom TEXT,
      dateTo TEXT,
      mode TEXT,
      issuedAt TEXT NOT NULL
    );
  `);
  migrate();
  licenseStatus(); // starts the trial clock on a new install
  persist();
}

function rowsFromQuery(sql, params) {
  const stmt = db.prepare(sql);
  if (params) stmt.bind(params);
  const out = [];
  while (stmt.step()) out.push(stmt.getAsObject());
  stmt.free();
  return out;
}

/* ---- trial period and activation (see license.cjs) ---- */
let ownerKey = null; // signing key; exists only while the hidden owner account is logged in
const LICENSE_KEYS = ["license", "trialStart", "installId", "lastSeen"]; // never sent to or written by the UI

function rawSetting(key) {
  const rows = rowsFromQuery("SELECT value FROM settings WHERE key = ?", [key]);
  return rows.length && rows[0].value != null ? rows[0].value : "";
}
function putSetting(key, value) {
  db.run("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", [key, String(value)]);
}
function licenseContext() {
  const now = license.trustedNow({ get: rawSetting, set: putSetting, now: Date.now() });
  const markerFile = path.join(app.getPath("appData"), ".factory-inventory-install");
  const { start, id } = license.ensureTrialStart({ markerFile, get: rawSetting, set: putSetting, now });
  return { now, start, machine: license.machineId(id) };
}
function licenseStatus() {
  const { now, start, machine } = licenseContext();
  const st = license.status({ owner, licenseJson: rawSetting("license"), trialStart: start, machine, now });
  return { ...st, contact: rawSetting("licenseContact"), defaultTrialDays: owner.defaultTrialDays };
}

ipcMain.handle("license-status", () => {
  const st = licenseStatus();
  persist();
  return st;
});

// Only the owner can change the licence. mode: "full" | "trial" (with days) | "expired" | "default" | "contact"
ipcMain.handle("license-set", (e, { mode, days, contact }) => {
  if (!ownerKey) return { ok: false };
  const { now, machine } = licenseContext();
  if (typeof contact === "string") putSetting("licenseContact", contact.trim().slice(0, 200));
  if (mode === "default") db.run("DELETE FROM settings WHERE key = 'license'");
  else if (mode === "full" || mode === "trial" || mode === "expired") {
    const payload = {
      mode, machine, issuedAt: new Date(now).toISOString(),
      until: mode === "trial" ? license.isoDay(now + (Math.max(Math.round(Number(days) || 0), 0) - 1) * license.DAY) : null,
    };
    putSetting("license", JSON.stringify({ payload, sig: license.sign(ownerKey, payload) }));
  }
  persist();
  return { ok: true, status: licenseStatus() };
});

ipcMain.handle("auth-logout", () => { ownerKey = null; return { ok: true }; });

/* ---- auth ---- */
function hashPassword(password, salt) {
  return crypto.scryptSync(password, salt, 64).toString("hex");
}

/* Recovery codes: 16 characters shown once, stored only as a salted hash (like the password).
   Letters/digits that look alike (O/0, I/1/L) are left out so the code is easy to read back. */
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

function newRecoveryCode() {
  const bytes = crypto.randomBytes(16);
  let raw = "";
  for (let i = 0; i < 16; i++) raw += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  return raw.match(/.{4}/g).join("-");
}

function normalizeCode(code) {
  return String(code || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function storeRecoveryCode(userId) {
  const code = newRecoveryCode();
  const salt = crypto.randomBytes(16).toString("hex");
  db.run("UPDATE users SET recoverySalt = ?, recoveryHash = ? WHERE id = ?", [salt, hashPassword(normalizeCode(code), salt), userId]);
  return code;
}

function safeEqualHex(a, b) {
  const x = Buffer.from(a || "", "hex");
  const y = Buffer.from(b || "", "hex");
  return x.length > 0 && x.length === y.length && crypto.timingSafeEqual(x, y);
}

function checkPassword(user, password) {
  return safeEqualHex(hashPassword(String(password || ""), user.salt), user.hash);
}

function setPassword(userId, password) {
  const salt = crypto.randomBytes(16).toString("hex");
  db.run("UPDATE users SET salt = ?, hash = ? WHERE id = ?", [salt, hashPassword(password, salt), userId]);
}

function adminUser() {
  const rows = rowsFromQuery("SELECT * FROM users ORDER BY createdAt LIMIT 1");
  return rows[0] || null;
}

// Slow down guessing: after 5 wrong attempts, wait before trying again.
const attempts = { login: { fails: 0, until: 0 }, reset: { fails: 0, until: 0 } };
function lockedFor(kind) {
  const left = attempts[kind].until - Date.now();
  return left > 0 ? Math.ceil(left / 1000) : 0;
}
function recordFail(kind) {
  const a = attempts[kind];
  a.fails += 1;
  if (a.fails >= 5) { a.until = Date.now() + 30000 * Math.min(a.fails - 4, 10); }
}
function recordSuccess(kind) { attempts[kind] = { fails: 0, until: 0 }; }

ipcMain.handle("auth-has-admin", () => {
  const rows = rowsFromQuery("SELECT COUNT(*) as c FROM users");
  return rows[0] && rows[0].c > 0;
});

ipcMain.handle("auth-create-admin", (e, { username, password }) => {
  const existing = rowsFromQuery("SELECT COUNT(*) as c FROM users");
  if (existing[0] && existing[0].c > 0) return { ok: false, reason: "exists" };
  // The owner can get in from the first-run screen too, without creating the customer's account.
  const key = license.checkOwner(owner, username, password);
  if (key) { ownerKey = key; return { ok: true, owner: true, username: owner.username }; }
  const id = crypto.randomUUID();
  const salt = crypto.randomBytes(16).toString("hex");
  db.run("INSERT INTO users (id,username,salt,hash,createdAt) VALUES (?,?,?,?,?)", [
    id, username, salt, hashPassword(password, salt), new Date().toISOString(),
  ]);
  const recoveryCode = storeRecoveryCode(id);
  persist();
  return { ok: true, recoveryCode };
});

ipcMain.handle("auth-login", (e, { username, password }) => {
  const wait = lockedFor("login");
  if (wait) return { ok: false, reason: "locked", wait };
  const rows = rowsFromQuery("SELECT * FROM users WHERE username = ?", [username]);
  const user = rows[0];
  if (!user || !checkPassword(user, password)) {
    const key = license.checkOwner(owner, username, password);
    if (key) { ownerKey = key; recordSuccess("login"); return { ok: true, owner: true, username: owner.username }; }
    recordFail("login");
    return { ok: false };
  }
  ownerKey = null;
  recordSuccess("login");
  // Installs from before v1.2 have no recovery code yet: create one now and show it once.
  if (!user.recoveryHash) {
    const recoveryCode = storeRecoveryCode(user.id);
    persist();
    return { ok: true, username: user.username, recoveryCode };
  }
  return { ok: true, username: user.username };
});

ipcMain.handle("auth-reset-with-code", (e, { code, newPassword }) => {
  const wait = lockedFor("reset");
  if (wait) return { ok: false, reason: "locked", wait };
  const user = adminUser();
  if (!user || !user.recoveryHash) return { ok: false, reason: "no-code" };
  const ok = safeEqualHex(hashPassword(normalizeCode(code), user.recoverySalt), user.recoveryHash);
  if (!ok) { recordFail("reset"); return { ok: false }; }
  recordSuccess("reset");
  setPassword(user.id, String(newPassword));
  const recoveryCode = storeRecoveryCode(user.id); // the used code stops working
  persist();
  return { ok: true, username: user.username, recoveryCode };
});

ipcMain.handle("auth-change-password", (e, { currentPassword, newPassword }) => {
  const user = adminUser();
  if (!user || !checkPassword(user, currentPassword)) return { ok: false };
  setPassword(user.id, String(newPassword));
  persist();
  return { ok: true };
});

ipcMain.handle("auth-new-recovery-code", (e, { password }) => {
  const user = adminUser();
  if (!user || !checkPassword(user, password)) return { ok: false };
  const recoveryCode = storeRecoveryCode(user.id);
  persist();
  return { ok: true, recoveryCode };
});

/* ---- parties ---- */
ipcMain.handle("db-get-parties", () => rowsFromQuery("SELECT * FROM parties ORDER BY name"));

ipcMain.handle("db-upsert-party", (e, party) => {
  db.run(
    `INSERT INTO parties (id,name,type,phone) VALUES (?,?,?,?)
     ON CONFLICT(id) DO UPDATE SET name=excluded.name, type=excluded.type, phone=excluded.phone`,
    [party.id, party.name, party.type, party.phone || ""]
  );
  persist();
  return party;
});

ipcMain.handle("db-delete-party", (e, id) => {
  db.run("DELETE FROM transactions WHERE orderId IN (SELECT id FROM orders WHERE clientId = ?)", [id]);
  db.run("DELETE FROM orders WHERE clientId = ?", [id]);
  db.run("DELETE FROM transaction_items WHERE txId IN (SELECT id FROM transactions WHERE partyId = ?)", [id]);
  db.run("DELETE FROM transactions WHERE partyId = ?", [id]);
  db.run("DELETE FROM parties WHERE id = ?", [id]);
  persist();
  return { id };
});

/* ---- transactions ---- */
ipcMain.handle("db-get-transactions", () => {
  const txs = rowsFromQuery("SELECT * FROM transactions ORDER BY date DESC");
  const byTx = new Map();
  for (const it of rowsFromQuery("SELECT * FROM transaction_items ORDER BY txId, position")) {
    if (!byTx.has(it.txId)) byTx.set(it.txId, []);
    byTx.get(it.txId).push(it);
  }
  for (const tx of txs) tx.items = byTx.get(tx.id) || [];
  return txs;
});

ipcMain.handle("db-upsert-transaction", (e, tx) => {
  db.run("BEGIN");
  try {
    db.run(
      `INSERT INTO transactions (id,kind,date,partyId,description,quantity,unitPrice,total,paid,notes,category)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)
       ON CONFLICT(id) DO UPDATE SET
         kind=excluded.kind, date=excluded.date, partyId=excluded.partyId, description=excluded.description,
         quantity=excluded.quantity, unitPrice=excluded.unitPrice, total=excluded.total, paid=excluded.paid,
         notes=excluded.notes, category=excluded.category`,
      [tx.id, tx.kind, tx.date, tx.partyId || null, tx.description || "", tx.quantity || 0, tx.unitPrice || 0,
        tx.total || 0, tx.paid || 0, tx.notes || "", tx.category || null]
    );
    db.run("DELETE FROM transaction_items WHERE txId = ?", [tx.id]);
    (tx.items || []).forEach((it, i) => {
      db.run(
        "INSERT INTO transaction_items (id,txId,position,catalogId,description,quantity,unitPrice,total) VALUES (?,?,?,?,?,?,?,?)",
        [it.id || crypto.randomUUID(), tx.id, i, it.catalogId || null, it.description || "",
          Number(it.quantity) || 0, Number(it.unitPrice) || 0, Number(it.total) || 0]
      );
    });
    db.run("COMMIT");
  } catch (err) {
    db.run("ROLLBACK");
    throw err;
  }
  persist();
  return tx;
});

ipcMain.handle("db-delete-transaction", (e, id) => {
  db.run("DELETE FROM transaction_items WHERE txId = ?", [id]);
  db.run("DELETE FROM transactions WHERE id = ?", [id]);
  persist();
  return { id };
});

/* ---- item / fabric catalog ---- */
ipcMain.handle("db-get-catalog", () => rowsFromQuery("SELECT * FROM catalog_items ORDER BY name"));

const CATALOG_UPSERT = `INSERT INTO catalog_items (id,name,unit,salePrice,purchasePrice,notes,type,size,color,minStock,trackStock)
     VALUES (?,?,?,?,?,?,?,?,?,?,?)
     ON CONFLICT(id) DO UPDATE SET name=excluded.name, unit=excluded.unit, salePrice=excluded.salePrice,
       purchasePrice=excluded.purchasePrice, notes=excluded.notes, type=excluded.type, size=excluded.size,
       color=excluded.color, minStock=excluded.minStock, trackStock=excluded.trackStock`;

function catalogParams(item) {
  const min = item.minStock === "" || item.minStock == null || isNaN(Number(item.minStock)) ? null : Number(item.minStock);
  return [item.id, item.name, item.unit || "", Number(item.salePrice) || 0, Number(item.purchasePrice) || 0, item.notes || "",
    item.type === "product" ? "product" : "material", item.size || "", item.color || "", min,
    item.trackStock === 0 || item.trackStock === false ? 0 : 1];
}

ipcMain.handle("db-upsert-catalog", (e, item) => {
  db.run(CATALOG_UPSERT, catalogParams(item));
  persist();
  return item;
});

// Several items at once (e.g. every size and colour of a product) in one save.
ipcMain.handle("db-upsert-catalog-many", (e, items) => {
  db.run("BEGIN");
  try {
    for (const item of items || []) db.run(CATALOG_UPSERT, catalogParams(item));
    db.run("COMMIT");
  } catch (err) {
    db.run("ROLLBACK");
    throw err;
  }
  persist();
  return { count: (items || []).length };
});

ipcMain.handle("db-delete-catalog", (e, id) => {
  // Past entries keep their own copy of the name and price, so nothing else changes.
  if (rowsFromQuery("SELECT 1 FROM production_lines WHERE catalogId = ? LIMIT 1", [id]).length) {
    throw new Error("This item is used in a production run");
  }
  db.run("UPDATE transaction_items SET catalogId = NULL WHERE catalogId = ?", [id]);
  db.run("DELETE FROM stock_adjustments WHERE catalogId = ?", [id]);
  db.run("DELETE FROM catalog_items WHERE id = ?", [id]);
  persist();
  return { id };
});

/* ---- production runs: materials in, finished products out ---- */
ipcMain.handle("db-get-productions", () => {
  const runs = rowsFromQuery("SELECT * FROM productions ORDER BY date DESC, createdAt DESC");
  const byRun = new Map();
  for (const ln of rowsFromQuery("SELECT * FROM production_lines ORDER BY productionId, position")) {
    if (!byRun.has(ln.productionId)) byRun.set(ln.productionId, []);
    byRun.get(ln.productionId).push(ln);
  }
  for (const r of runs) {
    const lines = byRun.get(r.id) || [];
    r.inputs = lines.filter((l) => l.role === "input");
    r.outputs = lines.filter((l) => l.role === "output");
  }
  return runs;
});

ipcMain.handle("db-upsert-production", (e, run) => {
  db.run("BEGIN");
  try {
    db.run(
      `INSERT INTO productions (id,date,notes,laborCost,otherCost,splitMode,createdAt) VALUES (?,?,?,?,?,?,?)
       ON CONFLICT(id) DO UPDATE SET date=excluded.date, notes=excluded.notes, laborCost=excluded.laborCost,
         otherCost=excluded.otherCost, splitMode=excluded.splitMode`,
      [run.id, run.date, run.notes || "", Number(run.laborCost) || 0, Number(run.otherCost) || 0,
        run.splitMode === "manual" ? "manual" : "quantity", run.createdAt || new Date().toISOString()]
    );
    db.run("DELETE FROM production_lines WHERE productionId = ?", [run.id]);
    const insert = (role) => (ln, i) => {
      db.run(
        "INSERT INTO production_lines (id,productionId,role,position,catalogId,description,quantity,share,salePrice) VALUES (?,?,?,?,?,?,?,?,?)",
        [ln.id || crypto.randomUUID(), run.id, role, i, ln.catalogId || null, ln.description || "",
          Number(ln.quantity) || 0, Number(ln.share) || 0, Number(ln.salePrice) || 0]
      );
    };
    (run.inputs || []).forEach(insert("input"));
    (run.outputs || []).forEach(insert("output"));
    // The selling price entered for each product becomes its default price on the Sales page.
    for (const ln of run.outputs || []) {
      if (ln.catalogId && Number(ln.salePrice) > 0) {
        db.run("UPDATE catalog_items SET salePrice = ? WHERE id = ?", [Number(ln.salePrice), ln.catalogId]);
      }
    }
    db.run("COMMIT");
  } catch (err) {
    db.run("ROLLBACK");
    throw err;
  }
  persist();
  return run;
});

ipcMain.handle("db-delete-production", (e, id) => {
  db.run("DELETE FROM production_lines WHERE productionId = ?", [id]);
  db.run("DELETE FROM productions WHERE id = ?", [id]);
  persist();
  return { id };
});

/* ---- client orders: products made for a client by a factory, for a commission ----
   The products, client fabric, costs and payments of an order are kept together as JSON in `data`.
   `txs` are the ledger entries worked out from the order; they are replaced as a set on every save. */
ipcMain.handle("db-get-orders", () =>
  rowsFromQuery("SELECT * FROM orders ORDER BY date DESC, createdAt DESC").map((o) => {
    let data = {};
    try { data = JSON.parse(o.data || "{}"); } catch (err) { data = {}; }
    return {
      ...o, data: undefined,
      products: data.products || [], materials: data.materials || [], costs: data.costs || [], payments: data.payments || [],
    };
  }));

ipcMain.handle("db-upsert-order", (e, { order, txs }) => {
  db.run("BEGIN");
  try {
    db.run(
      `INSERT INTO orders (id,date,clientId,title,status,deliveredDate,commissionMode,commissionScope,commissionValue,notes,data,createdAt)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
       ON CONFLICT(id) DO UPDATE SET date=excluded.date, clientId=excluded.clientId, title=excluded.title, status=excluded.status,
         deliveredDate=excluded.deliveredDate, commissionMode=excluded.commissionMode, commissionScope=excluded.commissionScope,
         commissionValue=excluded.commissionValue, notes=excluded.notes, data=excluded.data`,
      [order.id, order.date, order.clientId, order.title || "", order.status === "delivered" ? "delivered" : "open",
        order.deliveredDate || null, order.commissionMode || "cost_pct", order.commissionScope === "product" ? "product" : "order",
        Number(order.commissionValue) || 0, order.notes || "",
        JSON.stringify({ products: order.products || [], materials: order.materials || [], costs: order.costs || [], payments: order.payments || [] }),
        order.createdAt || new Date().toISOString()]
    );
    db.run("DELETE FROM transactions WHERE orderId = ?", [order.id]);
    for (const tx of txs || []) {
      db.run(
        `INSERT INTO transactions (id,kind,date,partyId,description,quantity,unitPrice,total,paid,notes,category,orderId,commission)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [tx.id, tx.kind, tx.date, tx.partyId || null, tx.description || "", tx.quantity || 0, tx.unitPrice || 0,
          tx.total || 0, tx.paid || 0, tx.notes || "", null, order.id, Number(tx.commission) || 0]
      );
    }
    db.run("COMMIT");
  } catch (err) {
    db.run("ROLLBACK");
    throw err;
  }
  persist();
  return { id: order.id };
});

ipcMain.handle("db-delete-order", (e, id) => {
  db.run("DELETE FROM transactions WHERE orderId = ?", [id]);
  db.run("DELETE FROM orders WHERE id = ?", [id]);
  persist();
  return { id };
});

/* ---- stock adjustments: opening stock, waste, count corrections ---- */
ipcMain.handle("db-get-adjustments", () => rowsFromQuery("SELECT * FROM stock_adjustments ORDER BY date DESC, createdAt DESC"));

ipcMain.handle("db-upsert-adjustment", (e, a) => {
  db.run(
    `INSERT INTO stock_adjustments (id,date,catalogId,quantity,unitCost,reason,notes,createdAt) VALUES (?,?,?,?,?,?,?,?)
     ON CONFLICT(id) DO UPDATE SET date=excluded.date, catalogId=excluded.catalogId, quantity=excluded.quantity,
       unitCost=excluded.unitCost, reason=excluded.reason, notes=excluded.notes`,
    [a.id, a.date, a.catalogId, Number(a.quantity) || 0, a.unitCost == null || a.unitCost === "" ? null : Number(a.unitCost),
      a.reason || "", a.notes || "", a.createdAt || new Date().toISOString()]
  );
  persist();
  return a;
});

ipcMain.handle("db-delete-adjustment", (e, id) => {
  db.run("DELETE FROM stock_adjustments WHERE id = ?", [id]);
  persist();
  return { id };
});

/* ---- settings (company details, invoice numbering) ---- */
const SETTING_KEYS = [
  "companyNameAr", "companyNameEn", "address", "phone", "email", "taxNumber",
  "commercialRegister", "logo", "invoicePrefix", "invoiceStartNumber", "invoiceFooter",
  "stockWarnMin", "stockBlock", "stockBlockMin", "appName",
];

function getSetting(key, fallback) {
  const rows = rowsFromQuery("SELECT value FROM settings WHERE key = ?", [key]);
  return rows.length && rows[0].value != null && rows[0].value !== "" ? rows[0].value : fallback;
}

ipcMain.handle("settings-get", () => {
  const out = {};
  for (const r of rowsFromQuery("SELECT key, value FROM settings")) if (!LICENSE_KEYS.includes(r.key)) out[r.key] = r.value;
  return out;
});

ipcMain.handle("settings-save", (e, values) => {
  for (const key of SETTING_KEYS) {
    if (!values || !(key in values)) continue;
    const v = values[key] == null ? "" : String(values[key]);
    db.run(
      "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
      [key, v]
    );
  }
  persist();
  applyWindowTitle();
  return { ok: true };
});

// The name typed in Settings is also the window's title.
function applyWindowTitle() {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.setTitle(String(getSetting("appName", DEFAULT_APP_NAME)));
}

/* ---- sequential document numbers ----
   A statement gets a permanent number the first time it is printed or saved as PDF.
   Re-printing the same party + period + mode reuses that number instead of using up a new one. */
function findIssued({ partyId, dateFrom, dateTo, mode }) {
  const rows = rowsFromQuery(
    "SELECT number FROM issued_documents WHERE partyId = ? AND dateFrom = ? AND dateTo = ? AND mode = ? ORDER BY issuedAt LIMIT 1",
    [partyId, dateFrom, dateTo, mode]
  );
  return rows.length ? rows[0].number : null;
}

function nextNumber() {
  const year = new Date().getFullYear();
  const prefix = String(getSetting("invoicePrefix", "INV")).trim() || "INV";
  const start = Math.max(parseInt(getSetting("invoiceStartNumber", "1"), 10) || 1, 1);
  const rows = rowsFromQuery("SELECT MAX(seq) AS m FROM issued_documents WHERE year = ?", [year]);
  let seq = Math.max((rows[0] && rows[0].m ? rows[0].m : 0) + 1, start);
  let number = `${prefix}-${year}-${String(seq).padStart(4, "0")}`;
  // Guard against a clash if the prefix was changed back and forth.
  while (rowsFromQuery("SELECT 1 FROM issued_documents WHERE number = ?", [number]).length) {
    seq += 1;
    number = `${prefix}-${year}-${String(seq).padStart(4, "0")}`;
  }
  return { number, year, seq };
}

ipcMain.handle("doc-peek", (e, params) => {
  const existing = findIssued(params);
  if (existing) return { number: existing, issued: true };
  return { number: nextNumber().number, issued: false };
});

ipcMain.handle("doc-issue", (e, params) => {
  const existing = findIssued(params);
  if (existing) return { number: existing, issued: true };
  const { number, year, seq } = nextNumber();
  db.run(
    "INSERT INTO issued_documents (number, year, seq, partyId, dateFrom, dateTo, mode, issuedAt) VALUES (?,?,?,?,?,?,?,?)",
    [number, year, seq, params.partyId, params.dateFrom, params.dateTo, params.mode, new Date().toISOString()]
  );
  persist();
  return { number, issued: true };
});

/* ---- saving files (PDF / Excel) ---- */
const savedPaths = new Set(); // only files this app saved can be opened from the UI

function safeFileName(name) {
  return String(name || "document").replace(/[\\/:*?"<>|]+/g, "-").trim() || "document";
}

async function askSavePath(sender, defaultName, filters) {
  const win = BrowserWindow.fromWebContents(sender);
  const { canceled, filePath } = await dialog.showSaveDialog(win, {
    defaultPath: path.join(app.getPath("documents"), safeFileName(defaultName)),
    filters,
  });
  return canceled || !filePath ? null : filePath;
}

ipcMain.handle("file-save-pdf", async (e, { defaultName }) => {
  const filePath = await askSavePath(e.sender, defaultName, [{ name: "PDF", extensions: ["pdf"] }]);
  if (!filePath) return { ok: false, canceled: true };
  const data = await e.sender.printToPDF({
    printBackground: true,
    pageSize: "A4",
    preferCSSPageSize: true,
    displayHeaderFooter: true,
    headerTemplate: "<div></div>",
    footerTemplate:
      '<div style="width:100%;font-size:8px;color:#888;text-align:center;font-family:Arial,sans-serif;">' +
      '<span class="pageNumber"></span> / <span class="totalPages"></span></div>',
  });
  fs.writeFileSync(filePath, data);
  savedPaths.add(filePath);
  return { ok: true, filePath };
});

ipcMain.handle("file-save", async (e, { defaultName, data, filters }) => {
  const filePath = await askSavePath(e.sender, defaultName, filters || []);
  if (!filePath) return { ok: false, canceled: true };
  fs.writeFileSync(filePath, Buffer.from(data));
  savedPaths.add(filePath);
  return { ok: true, filePath };
});

ipcMain.handle("file-open", async (e, filePath) => {
  if (!savedPaths.has(filePath)) return { ok: false };
  const err = await shell.openPath(filePath);
  return { ok: !err, error: err || undefined };
});

/* ---- app info ---- */
ipcMain.handle("app-info", () => ({
  version: app.getVersion(),
  dbPath: dbFilePath(),
  electron: process.versions.electron,
}));

ipcMain.handle("app-show-data-folder", () => {
  shell.showItemInFolder(dbFilePath());
  return { ok: true };
});

/* ---- automatic updates (GitHub Releases) ----
   Checks shortly after start and every 6 hours. New versions download in the background;
   the user chooses when to restart. If the computer is offline, nothing happens. */
let updateStatus = { state: "idle" };

function sendUpdateStatus(status) {
  updateStatus = status;
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send("update-status", status);
}

function setupAutoUpdates() {
  if (!autoUpdater || !app.isPackaged) {
    updateStatus = { state: "unsupported" };
    return;
  }
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.on("checking-for-update", () => sendUpdateStatus({ state: "checking" }));
  autoUpdater.on("update-available", (info) => sendUpdateStatus({ state: "downloading", version: info.version, percent: 0 }));
  autoUpdater.on("update-not-available", () => sendUpdateStatus({ state: "current", checkedAt: new Date().toISOString() }));
  autoUpdater.on("download-progress", (p) =>
    sendUpdateStatus({ state: "downloading", version: updateStatus.version, percent: Math.round(p.percent || 0) }));
  autoUpdater.on("update-downloaded", (info) => sendUpdateStatus({ state: "ready", version: info.version }));
  autoUpdater.on("error", (err) => sendUpdateStatus({ state: "error", message: String((err && err.message) || err).slice(0, 300) }));
  const check = () => autoUpdater.checkForUpdates().catch(() => {});
  setTimeout(check, 8000);
  setInterval(check, 6 * 60 * 60 * 1000);
}

ipcMain.handle("update-get-status", () => updateStatus);
ipcMain.handle("update-check", async () => {
  if (!autoUpdater || !app.isPackaged) return { state: "unsupported" };
  try { await autoUpdater.checkForUpdates(); } catch (err) { sendUpdateStatus({ state: "error", message: String(err.message || err) }); }
  return updateStatus;
});
ipcMain.handle("update-install", () => {
  if (autoUpdater && updateStatus.state === "ready") {
    setImmediate(() => autoUpdater.quitAndInstall(true, true));
    return { ok: true };
  }
  return { ok: false };
});

function createWindow() {
  const iconPath = path.join(__dirname, "icon.png");
  const win = (mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 980,
    minHeight: 640,
    title: String(getSetting("appName", DEFAULT_APP_NAME)),
    backgroundColor: "#F7F5EF",
    autoHideMenuBar: true,
    show: false,
    icon: fs.existsSync(iconPath) ? iconPath : undefined,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  }));
  win.setMenuBarVisibility(false);
  win.on("page-title-updated", (e) => e.preventDefault()); // keep the title above, not the page's <title>
  win.once("ready-to-show", () => win.show());

  const isDev = !app.isPackaged;
  if (isDev) {
    win.loadURL("http://localhost:5173");
  } else {
    win.loadFile(path.join(__dirname, "..", "dist", "index.html"));
  }
}

app.whenReady().then(async () => {
  try {
    await initDb();
    createWindow();
    setupAutoUpdates();
  } catch (err) {
    console.error("[factory-ledger] startup failed:", err);
    const { dialog } = require("electron");
    dialog.showErrorBox(`${DEFAULT_APP_NAME} failed to start`, String((err && err.stack) || err));
    app.quit();
  }
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
