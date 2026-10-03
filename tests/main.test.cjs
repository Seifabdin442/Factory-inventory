// Runs the real electron/main.cjs handlers under Node with a mocked `electron`, starting from a v2 database.
const assert = require("node:assert/strict");
const Module = require("module");
const path = require("path");
const fs = require("fs");
const os = require("os");

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fl-test-"));
const handlers = {};
let ready;
const electron = {
  app: {
    getPath: () => dir, isPackaged: false, getVersion: () => "test", quit() {}, on() {},
    whenReady: () => new Promise((r) => { ready = r; }),
  },
  BrowserWindow: class { constructor() { this.webContents = { send() {} }; } setMenuBarVisibility() {} once() {} loadURL() {} loadFile() {} isDestroyed() { return false; } static getAllWindows() { return [1]; } },
  ipcMain: { handle: (name, fn) => { handlers[name] = fn; } },
  dialog: { showErrorBox: (a, b) => { throw new Error(b); } },
  shell: {},
};
const origLoad = Module._load;
Module._load = function (request, ...rest) {
  if (request === "electron") return electron;
  if (request === "electron-updater") throw new Error("not available");
  return origLoad.call(this, request, ...rest);
};

(async () => {
  // A v2 database as written by version 1.2
  const SQL = await require("sql.js")({ locateFile: () => path.join(__dirname, "../node_modules/sql.js/dist/sql-wasm.wasm") });
  const old = new SQL.Database();
  old.run(`
    CREATE TABLE parties (id TEXT PRIMARY KEY, name TEXT NOT NULL, type TEXT NOT NULL, phone TEXT);
    CREATE TABLE transactions (id TEXT PRIMARY KEY, kind TEXT NOT NULL, date TEXT NOT NULL, partyId TEXT, description TEXT,
      quantity REAL, unitPrice REAL, total REAL, paid REAL, notes TEXT, category TEXT);
    CREATE TABLE transaction_items (id TEXT PRIMARY KEY, txId TEXT NOT NULL, position INTEGER NOT NULL DEFAULT 0, catalogId TEXT,
      description TEXT, quantity REAL, unitPrice REAL, total REAL);
    CREATE TABLE catalog_items (id TEXT PRIMARY KEY, name TEXT NOT NULL, unit TEXT, salePrice REAL, purchasePrice REAL, notes TEXT);
    CREATE TABLE users (id TEXT PRIMARY KEY, username TEXT NOT NULL UNIQUE, salt TEXT NOT NULL, hash TEXT NOT NULL, createdAt TEXT NOT NULL,
      recoverySalt TEXT, recoveryHash TEXT);
    CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT);
    INSERT INTO catalog_items VALUES ('old1','Cotton','m',0,50,'');
    INSERT INTO parties VALUES ('pa','Supplier A','supplier','');
    PRAGMA user_version = 2;
  `);
  fs.writeFileSync(path.join(dir, "factory-ledger.sqlite"), Buffer.from(old.export()));

  require("../electron/main.cjs");
  ready();
  await new Promise((r) => setTimeout(r, 1500));
  const call = (name, arg) => handlers[name]({ sender: {} }, arg);

  assert.ok(fs.existsSync(path.join(dir, "factory-ledger.before-v3.sqlite")), "backup before upgrade");
  let cat = call("db-get-catalog");
  assert.equal(cat.length, 1);
  assert.equal(cat[0].type, "material");
  assert.equal(cat[0].trackStock, 1);
  assert.equal(call("db-get-parties").length, 1, "old data intact");

  call("db-upsert-catalog-many", [
    { id: "ts-s", name: "T-shirt", size: "S", color: "Black", type: "product", salePrice: 0, trackStock: 1, minStock: 10 },
    { id: "ts-m", name: "T-shirt", size: "M", color: "Black", type: "product", salePrice: 0, trackStock: 1, minStock: null },
  ]);
  cat = call("db-get-catalog");
  assert.equal(cat.length, 3);
  assert.equal(cat.find((c) => c.id === "ts-s").minStock, 10);
  assert.equal(cat.find((c) => c.id === "ts-m").minStock, null);

  call("db-upsert-transaction", { id: "p1", kind: "purchase", date: "2026-10-01", partyId: "pa", total: 1000, paid: 0,
    items: [{ id: "p1a", catalogId: "old1", description: "Cotton", quantity: 3, unitPrice: 333.3333, total: 1000 }] });
  assert.equal(call("db-get-transactions")[0].items[0].total, 1000, "typed line total kept");

  const run = { id: "r1", date: "2026-10-02", notes: "n", laborCost: 120, otherCost: 5, splitMode: "manual",
    inputs: [{ id: "i1", catalogId: "old1", description: "Cotton", quantity: 2 }],
    outputs: [{ id: "o1", catalogId: "ts-s", description: "T-shirt - S - Black", quantity: 10, share: 40, salePrice: 150 },
      { id: "o2", catalogId: "ts-m", description: "T-shirt - M - Black", quantity: 10, share: 60, salePrice: 0 }] };
  call("db-upsert-production", run);
  let runs = call("db-get-productions");
  assert.equal(runs.length, 1);
  assert.equal(runs[0].inputs.length, 1);
  assert.equal(runs[0].outputs.length, 2);
  assert.equal(runs[0].outputs[1].share, 60);
  assert.equal(runs[0].laborCost, 120);
  assert.ok(runs[0].createdAt);
  assert.equal(call("db-get-catalog").find((c) => c.id === "ts-s").salePrice, 150, "selling price copied to the catalog");

  // editing replaces the lines and keeps createdAt
  call("db-upsert-production", { ...run, createdAt: runs[0].createdAt, outputs: [run.outputs[0]] });
  runs = call("db-get-productions");
  assert.equal(runs[0].outputs.length, 1);

  assert.throws(() => call("db-delete-catalog", "old1"), /production/);

  call("db-upsert-adjustment", { id: "a1", date: "2026-10-01", catalogId: "ts-m", quantity: 5, unitCost: 80, reason: "opening", notes: "" });
  call("db-upsert-adjustment", { id: "a2", date: "2026-10-03", catalogId: "ts-m", quantity: -1, unitCost: null, reason: "waste", notes: "" });
  let adj = call("db-get-adjustments");
  assert.equal(adj.length, 2);
  assert.equal(adj.find((a) => a.id === "a2").unitCost, null);
  call("db-delete-adjustment", "a2");
  call("db-delete-catalog", "ts-m");
  assert.equal(call("db-get-adjustments").length, 0, "adjustments go with their item");

  call("db-delete-production", "r1");
  assert.equal(call("db-get-productions").length, 0);
  call("db-delete-catalog", "old1");
  assert.equal(call("db-get-transactions")[0].items[0].catalogId, null);

  call("settings-save", { stockWarnMin: "7", stockBlock: "0", stockBlockMin: "2" });
  const st = call("settings-get");
  assert.deepEqual([st.stockWarnMin, st.stockBlock, st.stockBlockMin], ["7", "0", "2"]);

  // reopen from disk: everything persisted with the v3 schema
  const again = new SQL.Database(fs.readFileSync(path.join(dir, "factory-ledger.sqlite")));
  assert.equal(again.exec("PRAGMA user_version")[0].values[0][0], 3);
  assert.equal(again.exec("SELECT COUNT(*) FROM catalog_items")[0].values[0][0], 1);

  console.log("main process tests passed");
  fs.rmSync(dir, { recursive: true, force: true });
  process.exit(0);
})().catch((err) => { console.error(err); process.exit(1); });
