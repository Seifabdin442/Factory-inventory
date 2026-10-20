// Trial period and full activation.
//
// A new install runs as a free trial for `defaultTrialDays`. Only the hidden owner account (see owner.cjs)
// can change that: extend or shorten the trial, activate the app fully, or end the trial.
//
// The owner's decision is stored as a licence signed with a key that only exists while the owner is logged
// in (it is derived from the owner password). The app holds just the matching public key, so editing the
// database by hand cannot extend a trial or activate the app. A licence is tied to the computer it was
// issued on; copied to another computer it is ignored and that computer falls back to its own trial.
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const os = require("os");
const { execSync } = require("child_process");

const DAY = 86400000;
const SCRYPT = { N: 131072, r: 8, p: 1, maxmem: 512 * 1024 * 1024 }; // deliberately slow: ~0.5 s per guess

// 64 bytes from the password: the first half is compared with the stored hash, the second half seeds the signing key.
function deriveOwner(password, salt) {
  const out = crypto.scryptSync(String(password), Buffer.from(salt, "hex"), 64, SCRYPT);
  const seed = out.subarray(32);
  const privateKey = crypto.createPrivateKey({
    key: Buffer.concat([Buffer.from("302e020100300506032b657004220420", "hex"), seed]), format: "der", type: "pkcs8",
  });
  const publicKey = crypto.createPublicKey(privateKey).export({ format: "der", type: "spki" }).toString("hex");
  return { hash: out.subarray(0, 32).toString("hex"), privateKey, publicKey };
}

function checkOwner(owner, username, password) {
  if (!owner || !owner.hash || String(username).trim().toLowerCase() !== String(owner.username).toLowerCase()) return null;
  const d = deriveOwner(password, owner.salt);
  const a = Buffer.from(d.hash, "hex");
  const b = Buffer.from(owner.hash, "hex");
  return a.length === b.length && crypto.timingSafeEqual(a, b) ? d.privateKey : null;
}

// The pages the owner can switch on or off for a customer. The dashboard and settings are always there.
const MODULES = ["purchases", "production", "sales", "orders", "inventory", "expenses", "parties", "catalog", "reports", "invoices"];

// `modules` (the list of pages switched on, or null for all of them) is part of what gets signed, so the
// customer cannot switch a page on by editing the database. Licences from before modules existed have no
// such field and keep their original signature.
const canonical = (p) => JSON.stringify(p.modules === undefined
  ? [p.mode, p.until || "", p.machine, p.issuedAt]
  : [p.mode, p.until || "", p.machine, p.issuedAt, p.modules]);

function sign(privateKey, payload) {
  return crypto.sign(null, Buffer.from(canonical(payload)), privateKey).toString("hex");
}

function verify(owner, payload, sig) {
  try {
    const key = crypto.createPublicKey({ key: Buffer.from(owner.publicKey, "hex"), format: "der", type: "spki" });
    return crypto.verify(null, Buffer.from(canonical(payload)), key, Buffer.from(String(sig), "hex"));
  } catch (err) {
    return false;
  }
}

let cachedMachine = null;
function machineId(fallback) {
  if (cachedMachine) return cachedMachine;
  let raw = "";
  if (process.platform === "win32") {
    try {
      const out = execSync('reg query "HKLM\\SOFTWARE\\Microsoft\\Cryptography" /v MachineGuid', { encoding: "utf8", windowsHide: true, timeout: 5000 });
      const m = /MachineGuid\s+REG_SZ\s+(\S+)/i.exec(out);
      if (m) raw = m[1];
    } catch (err) { /* fall through */ }
  }
  if (!raw) raw = `${fallback}|${os.hostname()}`;
  cachedMachine = crypto.createHash("sha256").update(raw).digest("hex").slice(0, 24);
  return cachedMachine;
}

/* The trial's start date and the latest time seen are kept in several places: the database, a small
   file outside the app's data folder and (in the installed app) the Windows registry. Each place is a
   "store" with read() → { start, id, lastSeen } and write(patch). The earliest start and the latest
   time win, so deleting or restoring the database, or editing one place, gives no extra days. */
function fileStore(file) {
  let cache = null;
  return {
    read() {
      if (!cache) { try { cache = JSON.parse(fs.readFileSync(file, "utf8")) || {}; } catch (err) { cache = {}; } }
      return cache;
    },
    write(patch) {
      cache = { ...this.read(), ...patch };
      try { fs.writeFileSync(file, JSON.stringify(cache)); } catch (err) { /* read-only profile: the other stores still work */ }
    },
  };
}

function registryStore(keyPath) {
  if (process.platform !== "win32") return null;
  let cache = null;
  const names = { start: "Start", id: "Id", lastSeen: "LastSeen" };
  return {
    read() {
      if (cache) return cache;
      cache = {};
      try {
        const out = execSync(`reg query "${keyPath}"`, { encoding: "utf8", windowsHide: true, timeout: 5000, stdio: ["ignore", "pipe", "ignore"] });
        for (const [field, name] of Object.entries(names)) {
          const m = new RegExp(`^\\s+${name}\\s+REG_SZ\\s+(.+)$`, "m").exec(out);
          if (m) cache[field] = field === "id" ? m[1].trim() : Number(m[1].trim()) || 0;
        }
      } catch (err) { /* not there yet */ }
      return cache;
    },
    write(patch) {
      cache = { ...this.read(), ...patch };
      for (const [field, value] of Object.entries(patch)) {
        if (!value || !names[field]) continue;
        try {
          execSync(`reg add "${keyPath}" /v ${names[field]} /t REG_SZ /d "${String(value).replace(/"/g, "")}" /f`,
            { windowsHide: true, timeout: 5000, stdio: "ignore" });
        } catch (err) { /* no access: the other stores still work */ }
      }
    },
  };
}

function ensureTrialStart({ stores, markerFile, get, set, now }) {
  const list = (stores || [fileStore(markerFile)]).filter(Boolean);
  const kept = list.map((s) => s.read() || {});
  const starts = [Number(get("trialStart")), ...kept.map((k) => Number(k.start))].filter((n) => n > 0);
  const start = starts.length ? Math.min(...starts) : now;
  const id = kept.map((k) => k.id).find(Boolean) || get("installId") || crypto.randomUUID();
  if (Number(get("trialStart")) !== start) set("trialStart", String(start));
  if (get("installId") !== id) set("installId", id);
  list.forEach((s, i) => { if (Number(kept[i].start) !== start || kept[i].id !== id) s.write({ start, id }); });
  return { start, id };
}

/* What time it really is, as far as the trial is concerned. The computer's clock alone can't be
   trusted, so the answer is the latest of:
     - the clock;
     - the latest time ever seen (turning the clock back gives nothing back);
     - the time when this session started + how long the app has been running, measured with a
       timer that does not follow the clock (so changing the date while the app is open, or setting it
       back every morning, still lets the trial run down while the app is used);
     - the time from the internet, when the computer is online, + the running time since. */
const session = { base: null, net: null };
const monoNow = () => Number(process.hrtime.bigint() / 1000000n);

function setNetworkTime(time, mono = monoNow()) {
  if (Number(time) > 0) session.net = { t: Number(time), mono };
}

function trustedNow({ get, set, now, stores = [], mono = monoNow() }) {
  const list = stores.filter(Boolean);
  const seen = Math.max(Number(get("lastSeen")) || 0, ...list.map((s) => Number((s.read() || {}).lastSeen) || 0));
  let t = Math.max(now, seen);
  if (session.base) t = Math.max(t, session.base.t + (mono - session.base.mono));
  // How far behind the clock is compared with what this computer itself has already shown. The internet
  // time is left out on purpose: a clock that was simply never set right is not someone cheating.
  session.rollback = t - now;
  if (session.net) t = Math.max(t, session.net.t + (mono - session.net.mono));
  if (!session.base) session.base = { t, mono };
  if (t > (Number(get("lastSeen")) || 0)) set("lastSeen", String(t));
  // The other stores only need to follow roughly; a minute is plenty and saves writes.
  for (const s of list) if (t - (Number((s.read() || {}).lastSeen) || 0) > 60000) s.write({ lastSeen: t });
  return t;
}

// Cheap check between full ones: how far the clock is behind the running timer right now.
function clockRollback(now = Date.now(), mono = monoNow()) {
  return session.base ? session.base.t + (mono - session.base.mono) - now : 0;
}
const lastRollback = () => session.rollback || 0;

const resetSessionForTests = () => { session.base = null; session.net = null; session.rollback = 0; };

const endOfDay = (isoDate) => new Date(`${isoDate}T23:59:59`).getTime();
const isoDay = (ms) => { const d = new Date(ms); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };

// The owner's licence for this computer, or null if there is none or it does not check out.
function validPayload({ owner, licenseJson, machine }) {
  let lic = null;
  try { lic = licenseJson ? JSON.parse(licenseJson) : null; } catch (err) { lic = null; }
  return lic && lic.payload && lic.payload.machine === machine && verify(owner, lic.payload, lic.sig) ? lic.payload : null;
}

const cleanModules = (list) => (Array.isArray(list) ? MODULES.filter((m) => list.includes(m)) : null);

function status({ owner, licenseJson, trialStart, machine, now }) {
  const p = validPayload({ owner, licenseJson, machine });
  if (p) {
    const modules = cleanModules(p.modules);
    if (p.mode === "full") return { state: "full", source: "owner", modules };
    if (p.mode === "trial" && p.until) {
      const end = endOfDay(p.until);
      return now <= end
        ? { state: "trial", until: p.until, daysLeft: Math.max(1, Math.ceil((end - now) / DAY)), source: "owner", modules }
        : { state: "expired", until: p.until, source: "owner", modules };
    }
    return { state: "expired", source: "owner", modules };
  }
  // A trial of N days is N calendar days counting the first one; daysLeft counts today.
  const end = endOfDay(isoDay(trialStart + ((Number(owner.defaultTrialDays) || 14) - 1) * DAY));
  return now <= end
    ? { state: "trial", until: isoDay(end), daysLeft: Math.max(1, Math.ceil((end - now) / DAY)), source: "default", modules: null }
    : { state: "expired", until: isoDay(end), source: "default", modules: null };
}

module.exports = {
  deriveOwner, checkOwner, sign, verify, machineId, ensureTrialStart, trustedNow, setNetworkTime, fileStore, registryStore,
  clockRollback, lastRollback,
  resetSessionForTests, status, validPayload, cleanModules, isoDay, DAY, MODULES,
};
