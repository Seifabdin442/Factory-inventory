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

const canonical = (p) => JSON.stringify([p.mode, p.until || "", p.machine, p.issuedAt]);

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

/* The trial's start date is kept in two places (the database and a small file outside the app's data
   folder). The earliest one wins, so deleting the database does not restart the trial. */
function readMarker(file) {
  try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch (err) { return null; }
}
function writeMarker(file, marker) {
  try { fs.writeFileSync(file, JSON.stringify(marker)); } catch (err) { /* read-only profile: the database copy still works */ }
}

function ensureTrialStart({ markerFile, get, set, now }) {
  const marker = readMarker(markerFile) || {};
  const starts = [Number(get("trialStart")), Number(marker.start)].filter((n) => n > 0);
  const start = starts.length ? Math.min(...starts) : now;
  const id = marker.id || get("installId") || crypto.randomUUID();
  if (Number(get("trialStart")) !== start) set("trialStart", String(start));
  if (get("installId") !== id) set("installId", id);
  if (Number(marker.start) !== start || marker.id !== id) writeMarker(markerFile, { start, id });
  return { start, id };
}

// Turning the computer's clock back does not give time back: the latest time ever seen is remembered.
function trustedNow({ get, set, now }) {
  const seen = Number(get("lastSeen")) || 0;
  if (now > seen) { set("lastSeen", String(now)); return now; }
  return seen;
}

const endOfDay = (isoDate) => new Date(`${isoDate}T23:59:59`).getTime();
const isoDay = (ms) => { const d = new Date(ms); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };

function status({ owner, licenseJson, trialStart, machine, now }) {
  let lic = null;
  try { lic = licenseJson ? JSON.parse(licenseJson) : null; } catch (err) { lic = null; }
  if (lic && lic.payload && lic.payload.machine === machine && verify(owner, lic.payload, lic.sig)) {
    const p = lic.payload;
    if (p.mode === "full") return { state: "full", source: "owner" };
    if (p.mode === "trial" && p.until) {
      const end = endOfDay(p.until);
      return now <= end
        ? { state: "trial", until: p.until, daysLeft: Math.max(1, Math.ceil((end - now) / DAY)), source: "owner" }
        : { state: "expired", until: p.until, source: "owner" };
    }
    return { state: "expired", source: "owner" };
  }
  // A trial of N days is N calendar days counting the first one; daysLeft counts today.
  const end = endOfDay(isoDay(trialStart + ((Number(owner.defaultTrialDays) || 14) - 1) * DAY));
  return now <= end
    ? { state: "trial", until: isoDay(end), daysLeft: Math.max(1, Math.ceil((end - now) / DAY)), source: "default" }
    : { state: "expired", until: isoDay(end), source: "default" };
}

module.exports = { deriveOwner, checkOwner, sign, verify, machineId, ensureTrialStart, trustedNow, status, isoDay, DAY };
