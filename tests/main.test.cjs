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
  const usersRows = () => { const d = new SQL2.Database(fs.readFileSync(path.join(dir, "factory-ledger.sqlite"))); const st = d.prepare("SELECT * FROM users"); const out = []; while (st.step()) out.push(st.getAsObject()); return out; };
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

  assert.ok(fs.existsSync(path.join(dir, "factory-ledger.before-v6.sqlite")), "backup before upgrade");
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
  assert.equal(call("auth-has-admin"), false);
  assert.equal(rowsCount("users"), 0, "no owner row before the customer has an account");
  assert.equal(call("auth-create-admin", { username: "Admin", password: "wrong-password" }).reason, "reserved", "customers cannot take the owner's username");
  assert.equal(rowsCount("users"), 0);
  assert.ok(call("auth-create-admin", { username: "client", password: "client-pass" }).recoveryCode);
  assert.equal(call("auth-has-admin"), true);
  assert.equal(call("auth-create-admin", { username: "second", password: "client-pass" }).reason, "exists", "the owner row does not count as a free slot");
  const ownerRow = usersRows().find((u) => u.role === "owner");
  assert.ok(ownerRow, "owner row added together with the customer's account");
  assert.equal(ownerRow.username, "admin");
  assert.equal(ownerRow.hash, testOwner.hash, "only the hash is stored");
  assert.equal(JSON.stringify(usersRows()).includes(TEST_OWNER_PASSWORD), false);
  assert.equal(call("auth-login", { username: "admin", password: "wrong-password" }).ok, false);
  assert.equal(call("auth-login", { username: "admin", password: ownerRow.hash }).ok, false, "the stored hash is not a password");
  assert.equal(call("auth-change-password", { currentPassword: "client-pass", newPassword: "client-pass" }).ok, true, "password change still targets the customer");
  assert.equal(call("license-set", { mode: "full" }).ok, false);
  const ownerLogin = call("auth-login", { username: "admin", password: TEST_OWNER_PASSWORD });
  assert.equal(ownerLogin.ok && ownerLogin.owner, true, "owner logs in with the hidden account");
  assert.equal(rowsCount("users"), 2, "customer + owner");
  assert.equal(call("license-set", { mode: "trial", days: 30, contact: "call 0100" }).status.daysLeft, 30);
  assert.equal(call("license-set", { mode: "expired" }).status.state, "expired");
  assert.equal(call("license-status").contact, "call 0100");
  assert.equal(call("license-set", { mode: "full" }).status.state, "full");
  const visible = call("settings-get");
  assert.equal(visible.license, undefined, "licence data is not exposed to the UI");
  call("settings-save", { license: "x", trialStart: "1" });
  assert.equal(call("license-status").state, "full", "the UI cannot overwrite the licence");
  // a trial that starts on a chosen date: 10 days from 3 days ago → 7 left
  assert.equal(call("license-set", { mode: "trial", days: 10, start: lic.isoDay(Date.now() - 3 * lic.DAY) }).status.daysLeft, 7);
  assert.equal(call("license-set", { mode: "full" }).status.state, "full");

  // ---- modules: which pages the customer gets ----
  assert.equal(call("license-status").modules, null, "everything is on unless the owner says otherwise");
  let ms = call("license-set", { mode: "modules", modules: ["sales", "purchases", "not-a-module"] }).status;
  assert.deepEqual(ms.modules, ["purchases", "sales"]);
  assert.equal(ms.state, "full", "changing modules keeps the activation");
  assert.deepEqual(call("license-set", { mode: "trial", days: 5 }).status.modules, ["purchases", "sales"], "changing the trial keeps the modules");
  assert.deepEqual(call("license-set", { mode: "modules", modules: [] }).status.modules, []);
  assert.equal(call("license-set", { mode: "modules", modules: null }).status.modules, null);
  assert.equal(call("license-set", { mode: "default" }).status.modules, null);
  // on the default trial (no licence yet) choosing modules keeps the trial's end date
  const defUntil = call("license-status").until;
  ms = call("license-set", { mode: "modules", modules: ["sales"] }).status;
  assert.deepEqual([ms.state, ms.until, ms.modules], ["trial", defUntil, ["sales"]]);
  assert.equal(call("license-set", { mode: "full" }).status.state, "full");

  // ---- roles and permissions ----
  assert.deepEqual(call("owner-list-roles"), []);
  assert.equal(call("owner-save-role", { name: "  ", permissions: {} }).ok, false);
  assert.equal(call("owner-save-role", { name: "Sales clerk", permissions: { sales: "edit", catalog: "view", inventory: "view", hacked: "edit", reports: "bogus" } }).ok, true);
  let role = call("owner-list-roles")[0];
  assert.equal(role.name, "Sales clerk");
  assert.deepEqual([role.permissions.sales, role.permissions.catalog, role.permissions.purchases, role.permissions.reports, role.permissions.hacked],
    ["edit", "view", "none", "none", undefined], "unknown pages and levels are dropped");
  assert.equal(call("owner-save-user", { username: "omar", password: "omar-pass", roleId: role.id }).ok, true);
  assert.equal(call("owner-list-roles")[0].users, 1);
  assert.equal(call("owner-delete-role", role.id).reason, "in-use");
  assert.equal(call("owner-save-role", { id: role.id, name: "Sales", permissions: { ...role.permissions, expenses: "view" } }).ok, true);
  assert.equal(call("owner-list-roles").length, 1, "editing does not create a second role");
  const omarId = call("owner-list-users").find((u) => u.username === "omar").id;
  call("db-upsert-party", { id: "pc", name: "Perm client", type: "client", phone: "" });
  call("db-upsert-catalog", { id: "pitem", name: "Perm item", type: "product", trackStock: 1 });
  call("db-upsert-transaction", { id: "ptx-buy", kind: "purchase", date: "2026-10-05", partyId: "pa", total: 5, paid: 5, items: [] });
  call("auth-logout");
  assert.equal(call("owner-save-role", { name: "x", permissions: {} }).ok, false, "only the owner manages roles");
  assert.deepEqual(call("owner-list-roles"), []);
  // the limited user: can sell and add a client while selling, nothing else
  const omar = call("auth-login", { username: "omar", password: "omar-pass" });
  assert.deepEqual([omar.permissions.sales, omar.permissions.catalog, omar.permissions.purchases], ["edit", "view", "none"]);
  const sale = { id: "ptx-sale", kind: "sale", date: "2026-10-05", partyId: "pc", total: 10, paid: 10, items: [] };
  call("db-upsert-transaction", sale);
  call("db-upsert-party", { id: "pc2", name: "Walk-in", type: "client", phone: "" });
  const denied = (name, arg) => assert.throws(() => call(name, arg), /NO_PERMISSION/, name);
  denied("db-upsert-transaction", { ...sale, id: "ptx-2", kind: "purchase" });
  denied("db-upsert-transaction", { ...sale, id: "ptx-3", kind: "expense" });
  denied("db-delete-transaction", "ptx-buy");
  denied("db-upsert-catalog", { id: "pitem", name: "Renamed" });
  denied("db-delete-catalog", "pitem");
  denied("db-delete-party", "pc");
  denied("db-upsert-production", { id: "rr", date: "2026-10-05", inputs: [], outputs: [] });
  denied("db-upsert-adjustment", { id: "aa", date: "2026-10-05", catalogId: "pitem", quantity: 1 });
  denied("db-upsert-order", { order: { id: "oo", date: "2026-10-05", clientId: "pc" }, txs: [] });
  denied("settings-save", { companyNameEn: "x" });
  assert.ok(call("db-get-catalog").some((c) => c.id === "pitem" && c.name === "Perm item"), "reading is not blocked, and nothing was changed");
  call("db-delete-transaction", "ptx-sale");
  // a user with no role keeps full access; the owner always has it
  call("auth-login", { username: "client", password: "client-pass" });
  assert.equal(call("auth-login", { username: "client", password: "client-pass" }).permissions, null);
  call("db-upsert-catalog", { id: "pitem", name: "Perm item 2", type: "product", trackStock: 1 });
  call("auth-login", { username: "admin", password: TEST_OWNER_PASSWORD });
  call("db-delete-transaction", "ptx-buy");
  call("db-delete-catalog", "pitem");
  call("db-delete-party", "pc"); call("db-delete-party", "pc2");
  // moving the user to full access frees the role for deletion
  assert.equal(call("owner-save-user", { id: omarId, roleId: null }).ok, true);
  assert.equal(call("owner-delete-role", role.id).ok, true);
  assert.equal(call("owner-delete-user", omarId).ok, true);

  // ---- owner manages the customer's users ----
  assert.deepEqual(call("owner-list-users").map((u) => u.username), ["client"], "the owner row is not listed");
  assert.equal(call("owner-save-user", { username: "ADMIN", password: "abcd" }).reason, "reserved");
  assert.equal(call("owner-save-user", { username: "Client", password: "abcd" }).reason, "taken");
  assert.equal(call("owner-save-user", { username: "sara", password: "abc" }).ok, false, "password too short");
  assert.equal(call("owner-save-user", { username: "sara", password: "sara-pass" }).ok, true);
  const sara = call("owner-list-users").find((u) => u.username === "sara");
  assert.equal(call("owner-save-user", { id: sara.id, password: "sara-new" }).ok, true, "owner resets a password");
  const clientId = call("owner-list-users").find((u) => u.username === "client").id;
  call("auth-logout");
  assert.equal(call("license-set", { mode: "default" }).ok, false, "logging out drops the owner's rights");
  assert.deepEqual(call("owner-list-users"), []);
  assert.equal(call("owner-save-user", { username: "x", password: "abcd" }).ok, false);
  assert.equal(call("owner-delete-user", clientId).ok, false);
  assert.equal(call("auth-login", { username: "sara", password: "sara-pass" }).ok, false, "old password no longer works");
  const saraLogin = call("auth-login", { username: "sara", password: "sara-new" });
  assert.ok(saraLogin.ok && saraLogin.recoveryCode, "a new user gets a recovery code at first login");
  // each user changes their own password, and a recovery code resets its own account
  assert.equal(call("auth-change-password", { currentPassword: "client-pass", newPassword: "zzzz" }).ok, false);
  assert.equal(call("auth-change-password", { currentPassword: "sara-new", newPassword: "sara-3" }).ok, true);
  assert.equal(call("auth-reset-with-code", { code: saraLogin.recoveryCode, newPassword: "sara-4" }).username, "sara");
  assert.equal(call("auth-login", { username: "client", password: "client-pass" }).ok, true, "the other account is untouched");
  call("auth-login", { username: "admin", password: TEST_OWNER_PASSWORD });
  assert.equal(call("owner-delete-user", usersRows().find((u) => u.role === "owner").id).ok, true);
  assert.ok(usersRows().some((u) => u.role === "owner"), "the owner row cannot be deleted this way");
  assert.equal(call("owner-delete-user", sara.id).ok, true);
  assert.deepEqual(call("owner-list-users").map((u) => u.username), ["client"]);
  call("auth-logout");
  assert.equal(call("auth-login", { username: "client", password: "client-pass" }).ok, true);
  assert.equal(call("license-set", { mode: "default" }).ok, false);

  // the licence rules on their own
  const now = Date.now();
  const base = { owner: testOwner, machine: "m1", now };
  const signed = (payload, key = derived.privateKey) => JSON.stringify({ payload, sig: lic.sign(key, payload) });
  const full = { mode: "full", until: null, machine: "m1", issuedAt: "x" };
  assert.equal(lic.status({ ...base, licenseJson: signed(full), trialStart: now - 400 * lic.DAY }).state, "full");
  assert.equal(lic.status({ ...base, licenseJson: "", trialStart: now - 20 * lic.DAY }).state, "expired", "default trial runs out");
  assert.equal(lic.status({ ...base, licenseJson: "", trialStart: now - 3 * lic.DAY }).daysLeft, 11);
  // modules are part of the signature: adding one by hand voids the licence
  const limited = JSON.parse(signed({ ...full, modules: ["sales"] }));
  assert.deepEqual(lic.status({ ...base, licenseJson: JSON.stringify(limited), trialStart: now }).modules, ["sales"]);
  limited.payload.modules = ["sales", "production"];
  assert.equal(lic.status({ ...base, licenseJson: JSON.stringify(limited), trialStart: now - 20 * lic.DAY }).state, "expired");
  delete limited.payload.modules;
  assert.equal(lic.status({ ...base, licenseJson: JSON.stringify(limited), trialStart: now - 20 * lic.DAY }).state, "expired");
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
  assert.equal(again.exec("PRAGMA user_version")[0].values[0][0], 6);
  assert.equal(again.exec("SELECT COUNT(*) FROM catalog_items")[0].values[0][0], 1);

  console.log("main process tests passed");
  fs.rmSync(dir, { recursive: true, force: true });
  process.exit(0);
})().catch((err) => { console.error(err); process.exit(1); });
