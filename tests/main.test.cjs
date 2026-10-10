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
    getPath: () => dir, setPath() {}, isPackaged: false, getVersion: () => "test", quit() {}, on() {},
    whenReady: () => new Promise((r) => { ready = r; }),
  },
  BrowserWindow: class { constructor() { this.webContents = { send() {} }; } setMenuBarVisibility() {} once() {} on() {} setTitle(t) { electron.lastTitle = t; } loadURL() {} loadFile() {} isDestroyed() { return false; } static getAllWindows() { return [1]; } },
  ipcMain: { handle: (name, fn) => { handlers[name] = fn; } },
  dialog: { showErrorBox: (a, b) => { throw new Error(b); } },
  shell: {},
};
// A throwaway owner account for the tests (the real one lives in electron/owner.cjs).
const lic = require("../electron/license.cjs");
const TEST_OWNER_PASSWORD = "test-owner-password";
const testSalt = "00112233445566778899aabbccddeeff";
const derived = lic.deriveOwner(TEST_OWNER_PASSWORD, testSalt);
const testOwner = { username: "admin", salt: testSalt, hash: derived.hash, publicKey: derived.publicKey, defaultTrialDays: 14 };
const origLoad = Module._load;
Module._load = function (request, ...rest) {
  if (request === "electron") return electron;
  if (request === "./owner.cjs") return testOwner;
  if (request === "electron-updater") throw new Error("not available");
  return origLoad.call(this, request, ...rest);
};

(async () => {
  const rowsCount = (table) => { const d = new SQL2.Database(fs.readFileSync(path.join(dir, "factory-ledger.sqlite"))); return d.exec(`SELECT COUNT(*) FROM ${table}`)[0].values[0][0]; };
  let SQL2;
  // A v2 database as written by version 1.2
  const SQL = await require("sql.js")({ locateFile: () => path.join(__dirname, "../node_modules/sql.js/dist/sql-wasm.wasm") });
  SQL2 = SQL;
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

  assert.ok(fs.existsSync(path.join(dir, "factory-ledger.before-v4.sqlite")), "backup before upgrade");
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

  // ---- trial and activation ----
  let lst = call("license-status");
  assert.equal(lst.state, "trial");
  assert.equal(lst.daysLeft, 14, "14 calendar days counting install day");
  assert.ok(fs.existsSync(path.join(dir, ".factory-inventory-install")), "trial start is also kept outside the database");
  assert.equal(call("license-set", { mode: "full" }).ok, false, "nobody but the owner can change the licence");
  assert.equal(call("auth-create-admin", { username: "admin", password: "wrong-password" }).ok, true, "a customer may pick the name admin");
  assert.equal(call("auth-login", { username: "admin", password: "wrong-password" }).owner, undefined);
  assert.equal(call("license-set", { mode: "full" }).ok, false);
  const ownerLogin = call("auth-login", { username: "admin", password: TEST_OWNER_PASSWORD });
  assert.equal(ownerLogin.ok && ownerLogin.owner, true, "owner logs in with the hidden account");
  assert.equal(rowsCount("users"), 1, "the owner is not stored in the database");
  assert.equal(call("license-set", { mode: "trial", days: 30, contact: "call 0100" }).status.daysLeft, 30);
  assert.equal(call("license-set", { mode: "expired" }).status.state, "expired");
  assert.equal(call("license-status").contact, "call 0100");
  assert.equal(call("license-set", { mode: "full" }).status.state, "full");
  const visible = call("settings-get");
  assert.equal(visible.license, undefined, "licence data is not exposed to the UI");
  call("settings-save", { license: "x", trialStart: "1" });
  assert.equal(call("license-status").state, "full", "the UI cannot overwrite the licence");
  call("auth-logout");
  assert.equal(call("license-set", { mode: "default" }).ok, false, "logging out drops the owner's rights");
  assert.equal(call("auth-login", { username: "admin", password: "wrong-password" }).ok, true);
  assert.equal(call("license-set", { mode: "default" }).ok, false);

  // the licence rules on their own
  const now = Date.now();
  const base = { owner: testOwner, machine: "m1", now };
  const signed = (payload, key = derived.privateKey) => JSON.stringify({ payload, sig: lic.sign(key, payload) });
  const full = { mode: "full", until: null, machine: "m1", issuedAt: "x" };
  assert.equal(lic.status({ ...base, licenseJson: signed(full), trialStart: now - 400 * lic.DAY }).state, "full");
  assert.equal(lic.status({ ...base, licenseJson: "", trialStart: now - 20 * lic.DAY }).state, "expired", "default trial runs out");
  assert.equal(lic.status({ ...base, licenseJson: "", trialStart: now - 3 * lic.DAY }).daysLeft, 11);
  // hand-edited licence: the signature no longer matches, so the default trial applies
  const forged = JSON.stringify({ payload: { ...full, mode: "full" }, sig: "00".repeat(64) });
  assert.equal(lic.status({ ...base, licenseJson: forged, trialStart: now - 20 * lic.DAY }).state, "expired");
  const edited = JSON.parse(signed({ mode: "trial", until: lic.isoDay(now - lic.DAY), machine: "m1", issuedAt: "x" }));
  edited.payload.until = lic.isoDay(now + 300 * lic.DAY);
  assert.equal(lic.status({ ...base, licenseJson: JSON.stringify(edited), trialStart: now - 20 * lic.DAY }).state, "expired");
  // copied to another computer, or signed with a different password
  assert.equal(lic.status({ ...base, machine: "m2", licenseJson: signed(full), trialStart: now - 20 * lic.DAY }).state, "expired");
  const other = lic.deriveOwner("another-password", testSalt);
  assert.equal(lic.status({ ...base, licenseJson: signed(full, other.privateKey), trialStart: now - 20 * lic.DAY }).state, "expired");
  // turning the clock back does not give time back; deleting the database does not restart the trial
  const mem = { lastSeen: String(now) };
  assert.equal(lic.trustedNow({ get: (k) => mem[k], set: (k, v) => { mem[k] = v; }, now: now - 30 * lic.DAY }), now);
  const fresh = {};
  const again2 = lic.ensureTrialStart({ markerFile: path.join(dir, ".factory-inventory-install"), get: (k) => fresh[k] || "", set: (k, v) => { fresh[k] = v; }, now: now + 99 * lic.DAY });
  assert.ok(again2.start <= now + 1000, "an emptied database picks the original start date back up");

  // client orders: the order and its ledger entries are saved and replaced together
  call("db-upsert-party", { id: "cl", name: "Client", type: "client", phone: "" });
  const order = { id: "ord1", date: "2026-10-04", clientId: "cl", title: "500 tees", status: "open", commissionMode: "cost_pct",
    commissionScope: "order", commissionValue: 10, products: [{ id: "x", name: "Tee", quantity: 100 }], materials: [], costs: [], payments: [] };
  call("db-upsert-order", { order, txs: [
    { id: "ord1-pay-1", kind: "payment_in", date: "2026-10-04", partyId: "cl", total: 10000, paid: 10000, notes: "Order: 500 tees" },
    { id: "ord1-cost-1", kind: "purchase", date: "2026-10-04", partyId: "pa", description: "Making", total: 3000, paid: 0 },
  ] });
  let ords = call("db-get-orders");
  assert.equal(ords.length, 1);
  assert.equal(ords[0].products[0].name, "Tee");
  assert.equal(ords[0].commissionValue, 10);
  assert.equal(call("db-get-transactions").filter((x) => x.orderId === "ord1").length, 2);
  call("db-upsert-order", { order: { ...order, status: "delivered", deliveredDate: "2026-10-06", createdAt: ords[0].createdAt }, txs: [
    { id: "ord1-charge", kind: "order_charge", date: "2026-10-06", partyId: "cl", total: 3300, paid: 0, commission: 300 },
  ] });
  const otx = call("db-get-transactions").filter((x) => x.orderId === "ord1");
  assert.equal(otx.length, 1, "old order entries replaced");
  assert.equal(otx[0].commission, 300);
  assert.equal(call("db-get-orders")[0].status, "delivered");
  call("db-delete-party", "cl");
  assert.equal(call("db-get-orders").length, 0, "orders go with their client");
  assert.equal(call("db-get-transactions").filter((x) => x.orderId).length, 0);

  call("settings-save", { stockWarnMin: "7", stockBlock: "0", stockBlockMin: "2" });
  const st = call("settings-get");
  assert.deepEqual([st.stockWarnMin, st.stockBlock, st.stockBlockMin], ["7", "0", "2"]);

  // reopen from disk: everything persisted with the v3 schema
  const again = new SQL.Database(fs.readFileSync(path.join(dir, "factory-ledger.sqlite")));
  assert.equal(again.exec("PRAGMA user_version")[0].values[0][0], 4);
  assert.equal(again.exec("SELECT COUNT(*) FROM catalog_items")[0].values[0][0], 1);

  console.log("main process tests passed");
  fs.rmSync(dir, { recursive: true, force: true });
  process.exit(0);
})().catch((err) => { console.error(err); process.exit(1); });
