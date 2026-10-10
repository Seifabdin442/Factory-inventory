import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  Package, ShoppingCart, Users, BarChart3, Plus, Globe, X, Trash2, Pencil, ArrowUpCircle, ArrowDownCircle,
  Search, Download, Wallet, Scissors, Printer, FileText, Settings, Info, CheckCircle2, AlertCircle, FileDown,
  Upload, FolderOpen, Receipt, Boxes, Keyboard, KeyRound, RefreshCw, ShieldCheck, Copy, Clock, TrendingUp,
} from "lucide-react";
import {
  COLORS, CHART, AGING_COLORS, EXPENSE_CATEGORIES, uid, isoDate, todayISO, monthKey, thisMonthKey, fmtMoney,
  balanceImpact, errMsg, companyInfo, txItems, rangeFor, inRange, StitchDivider, Badge, Btn, Input, Select, Modal,
  MetricCard, ReportCard, Empty, DateRangeFilter, SearchBox, Kbd,
} from "./ui.jsx";
import { fill } from "./i18n.js";
import { RecoveryCodeBox } from "./auth.jsx";

const SETTINGS_DEFAULTS = {
  companyNameAr: "", companyNameEn: "", address: "", phone: "", email: "", taxNumber: "",
  commercialRegister: "", logo: "", invoicePrefix: "INV", invoiceStartNumber: "1", invoiceFooter: "",
  stockWarnMin: "5", stockBlock: "1", stockBlockMin: "0", appName: "",
};

export function readLogoFile(file, maxSize = 360) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => {
      const img = new Image();
      img.onerror = reject;
      img.onload = () => {
        const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(img.width * scale));
        canvas.height = Math.max(1, Math.round(img.height * scale));
        canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/png"));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

export function SettingsCard({ title, desc, children }) {
  return (
    <div style={{ background: COLORS.surface, border: `1px solid ${COLORS.border}`, borderRadius: 12, padding: 20, marginBottom: 16 }}>
      <div style={{ fontWeight: 800, fontSize: 15.5 }}>{title}</div>
      {desc && <div style={{ fontSize: 12.5, color: COLORS.muted, marginTop: 2, marginBottom: 14 }}>{desc}</div>}
      {children}
    </div>
  );
}

export function SettingsView({ t, lang, settings, onSave, notify, isOwner, license, onLicense }) {
  const [form, setForm] = useState(() => ({ ...SETTINGS_DEFAULTS, ...settings }));
  const [saving, setSaving] = useState(false);
  const fileRef = React.useRef(null);
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const prefix = (form.invoicePrefix || "").trim();
  const prefixOk = /^[A-Za-z0-9-]{1,10}$/.test(prefix);
  const startNum = Math.max(parseInt(form.invoiceStartNumber, 10) || 1, 1);
  const preview = `${prefixOk ? prefix : "INV"}-${new Date().getFullYear()}-${String(startNum).padStart(4, "0")}`;

  async function pickLogo(e) {
    const file = e.target.files && e.target.files[0];
    e.target.value = "";
    if (!file) return;
    try {
      const dataUrl = await readLogoFile(file);
      setForm((f) => ({ ...f, logo: dataUrl }));
    } catch (err) {
      notify(t.logoFailed, "error");
    }
  }

  async function save() {
    if (!prefixOk) { notify(t.prefixInvalid, "error"); return; }
    setSaving(true);
    const clean = {};
    for (const key of Object.keys(SETTINGS_DEFAULTS)) clean[key] = typeof form[key] === "string" ? form[key].trim() : form[key];
    clean.invoicePrefix = prefix.toUpperCase();
    clean.invoiceStartNumber = String(startNum);
    clean.stockWarnMin = String(Math.max(Number(form.stockWarnMin) || 0, 0));
    clean.stockBlockMin = String(Math.max(Number(form.stockBlockMin) || 0, 0));
    clean.stockBlock = form.stockBlock === "0" ? "0" : "1";
    const ok = await onSave(clean);
    if (ok) setForm((f) => ({ ...f, ...clean }));
    setSaving(false);
  }

  const grid = { display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", columnGap: 14 };

  return (
    <div style={{ maxWidth: 820 }}>
      <h2 style={{ margin: "0 0 16px", fontSize: 20, fontWeight: 800 }}>{t.settings}</h2>

      <SettingsCard title={t.companyDetails} desc={t.companyDetailsDesc}>
        <div style={{ display: "flex", gap: 16, alignItems: "center", marginBottom: 16, flexWrap: "wrap" }}>
          <div style={{
            width: 132, height: 84, borderRadius: 10, border: `1px dashed ${COLORS.border}`, background: "#FCFBF8",
            display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", flexShrink: 0,
          }}>
            {form.logo
              ? <img src={form.logo} alt="" style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }} />
              : <Scissors size={26} color={COLORS.muted} />}
          </div>
          <div>
            <div style={{ fontSize: 13, color: COLORS.inkSoft, fontWeight: 600, marginBottom: 6 }}>{t.logo}</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <Btn variant="ghost" onClick={() => fileRef.current && fileRef.current.click()}><Upload size={15} /> {t.uploadLogo}</Btn>
              {form.logo && <Btn variant="danger" onClick={() => setForm((f) => ({ ...f, logo: "" }))}><Trash2 size={15} /> {t.removeLogo}</Btn>}
            </div>
            <div style={{ fontSize: 11.5, color: COLORS.muted, marginTop: 6 }}>{t.logoHint}</div>
            <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" onChange={pickLogo} style={{ display: "none" }} />
          </div>
        </div>
        <Input label={t.appNameLabel} value={form.appName} onChange={set("appName")} placeholder={t.appName} maxLength={40} />
        <div style={{ fontSize: 12, color: COLORS.muted, margin: "-6px 0 14px" }}>{t.appNameHint}</div>
        <div style={grid}>
          <Input label={t.companyNameAr} value={form.companyNameAr} onChange={set("companyNameAr")} dir="rtl" />
          <Input label={t.companyNameEn} value={form.companyNameEn} onChange={set("companyNameEn")} dir="ltr" />
        </div>
        <Input label={t.address} value={form.address} onChange={set("address")} />
        <div style={grid}>
          <Input label={t.phone} value={form.phone} onChange={set("phone")} dir="ltr" />
          <Input label={t.email} value={form.email} onChange={set("email")} dir="ltr" />
          <Input label={t.taxNumber} value={form.taxNumber} onChange={set("taxNumber")} dir="ltr" />
          <Input label={t.commercialRegister} value={form.commercialRegister} onChange={set("commercialRegister")} dir="ltr" />
        </div>
      </SettingsCard>

      <SettingsCard title={t.numbering} desc={t.numberingDesc}>
        <div style={grid}>
          <Input label={t.invoicePrefix} value={form.invoicePrefix} onChange={set("invoicePrefix")} dir="ltr" maxLength={10}
            style={prefixOk ? undefined : { border: `1px solid ${COLORS.out}` }} />
          <Input label={t.invoiceStartNumber} type="number" min="1" value={form.invoiceStartNumber} onChange={set("invoiceStartNumber")} dir="ltr" />
        </div>
        {!prefixOk && <div style={{ color: COLORS.out, fontSize: 12.5, marginTop: -6, marginBottom: 10 }}>{t.prefixInvalid}</div>}
        <div style={{ fontSize: 13, color: COLORS.inkSoft, marginBottom: 14 }}>
          {t.numberPreview}: <b style={{ fontFamily: "'JetBrains Mono', monospace", direction: "ltr", unicodeBidi: "isolate" }}>{preview}</b>
        </div>
        <Input label={t.invoiceFooter} value={form.invoiceFooter} onChange={set("invoiceFooter")} placeholder={t.invoiceFooterPh} />
      </SettingsCard>

      <SettingsCard title={t.stockSettings} desc={t.stockSettingsDesc}>
        <Input label={t.stockWarnMin} type="number" min="0" step="any" value={form.stockWarnMin} onChange={set("stockWarnMin")} dir="ltr" />
        <div style={{ fontSize: 12, color: COLORS.muted, margin: "-6px 0 14px" }}>{t.stockWarnMinHint}</div>
        <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13.5, fontWeight: 600, marginBottom: 10, cursor: "pointer" }}>
          <input type="checkbox" checked={form.stockBlock !== "0"} onChange={(e) => setForm((f) => ({ ...f, stockBlock: e.target.checked ? "1" : "0" }))} />
          {t.stockBlock}
        </label>
        <Input label={t.stockBlockMin} type="number" min="0" step="any" value={form.stockBlockMin} onChange={set("stockBlockMin")} dir="ltr"
          disabled={form.stockBlock === "0"} />
        <div style={{ fontSize: 12, color: COLORS.muted, marginTop: -6 }}>{t.stockBlockMinHint}</div>
      </SettingsCard>

      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 16 }}>
        <Btn variant="accent" onClick={save} disabled={saving}><CheckCircle2 size={16} /> {t.saveSettings}</Btn>
      </div>

      <SecurityCard t={t} notify={notify} />
      {isOwner && <LicenseCard t={t} notify={notify} license={license} onLicense={onLicense} />}
    </div>
  );
}

/* Trial and activation — rendered only for the hidden owner account. */
function LicenseCard({ t, notify, license, onLicense }) {
  const [days, setDays] = useState("14");
  const [contact, setContact] = useState((license && license.contact) || "");
  const [busy, setBusy] = useState(false);
  async function apply(change) {
    setBusy(true);
    try {
      const res = await window.license.set({ ...change, contact });
      if (res && res.ok) { onLicense(res.status); notify(t.licenseSaved); } else notify(t.saveFailed, "error");
    } catch (err) { notify(`${t.saveFailed}: ${errMsg(err)}`, "error"); }
    setBusy(false);
  }
  const st = license || {};
  const label = st.state === "full" ? t.lic_full
    : st.state === "trial" ? fill(t.lic_trial, { d: st.until, n: st.daysLeft })
      : fill(t.lic_expired, { d: st.until || "" });
  const color = st.state === "full" ? COLORS.in : st.state === "trial" ? "#8A5A00" : COLORS.out;
  return (
    <SettingsCard title={t.licenseCard} desc={t.licenseDesc}>
      <div data-license-state={st.state} style={{ fontSize: 14.5, fontWeight: 800, color, marginBottom: 14 }}>{label}</div>
      <div style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap" }}>
        <div style={{ width: 150 }}>
          <Input label={t.trialDays} type="number" min="0" step="1" value={days} onChange={(e) => setDays(e.target.value)} dir="ltr" />
        </div>
        <Btn variant="primary" disabled={busy} onClick={() => apply({ mode: "trial", days: Number(days) || 0 })} style={{ marginBottom: 12 }}>
          <Clock size={15} /> {t.setTrial}
        </Btn>
      </div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 16 }}>
        <Btn variant="accent" disabled={busy} onClick={() => apply({ mode: "full" })}><ShieldCheck size={15} /> {t.activateFull}</Btn>
        <Btn variant="danger" disabled={busy} onClick={() => apply({ mode: "expired" })}>{t.endTrialNow}</Btn>
        <Btn variant="ghost" disabled={busy} onClick={() => apply({ mode: "default" })}>{fill(t.resetTrial, { n: st.defaultTrialDays || 14 })}</Btn>
      </div>
      <Input label={t.contactOnExpiry} value={contact} onChange={(e) => setContact(e.target.value)} placeholder={t.contactOnExpiryPh} maxLength={200} />
      <Btn variant="ghost" disabled={busy} onClick={() => apply({ mode: "contact" })}>{t.saveContact}</Btn>
    </SettingsCard>
  );
}

function SecurityCard({ t, notify }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [codePassword, setCodePassword] = useState("");
  const [newCode, setNewCode] = useState(null);
  const [busy, setBusy] = useState(false);

  async function changePassword() {
    if (!current || !next) { notify(t.fillAllFields, "error"); return; }
    if (next !== confirm) { notify(t.passwordsMustMatch, "error"); return; }
    if (next.length < 4) { notify(t.passwordTooShort, "error"); return; }
    setBusy(true);
    try {
      const res = await window.auth.changePassword(current, next);
      if (res && res.ok) { notify(t.passwordChanged); setCurrent(""); setNext(""); setConfirm(""); }
      else notify(t.wrongPassword, "error");
    } catch (err) { notify(errMsg(err), "error"); }
    setBusy(false);
  }

  async function createCode() {
    if (!codePassword) { notify(t.confirmWithPassword, "error"); return; }
    setBusy(true);
    try {
      const res = await window.auth.newRecoveryCode(codePassword);
      if (res && res.ok) { setNewCode(res.recoveryCode); setCodePassword(""); }
      else notify(t.wrongPassword, "error");
    } catch (err) { notify(errMsg(err), "error"); }
    setBusy(false);
  }

  const grid = { display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", columnGap: 12 };
  return (
    <SettingsCard title={t.security} desc={t.securityDesc}>
      <div style={{ fontSize: 13.5, fontWeight: 800, marginBottom: 8 }}>{t.changePassword}</div>
      <div style={grid}>
        <Input label={t.currentPassword} type="password" value={current} onChange={(e) => setCurrent(e.target.value)} />
        <Input label={t.newPassword} type="password" value={next} onChange={(e) => setNext(e.target.value)} />
        <Input label={t.confirmPassword} type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
      </div>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 18 }}>
        <Btn variant="primary" onClick={changePassword} disabled={busy}><KeyRound size={15} /> {t.changePassword}</Btn>
      </div>
      <div style={{ height: 1, background: COLORS.border, margin: "0 0 16px" }} />
      <div style={{ fontSize: 13.5, fontWeight: 800, marginBottom: 2 }}>{t.newRecoveryCode}</div>
      <div style={{ fontSize: 12.5, color: COLORS.muted, marginBottom: 10 }}>{t.newRecoveryIssued}</div>
      <div style={{ display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap" }}>
        <div style={{ flex: "1 1 220px", maxWidth: 320 }}>
          <Input label={t.confirmWithPassword} type="password" value={codePassword} onChange={(e) => setCodePassword(e.target.value)} />
        </div>
        <Btn variant="ghost" onClick={createCode} disabled={busy} style={{ marginBottom: 12 }}><ShieldCheck size={15} /> {t.newRecoveryCode}</Btn>
      </div>
      {newCode && (
        <Modal title={t.saveRecoveryTitle} onClose={() => {}}>
          <RecoveryCodeBox t={t} code={newCode} onDone={() => { setNewCode(null); notify(t.newRecoveryIssued); }} doneLabel={t.close} />
        </Modal>
      )}
    </SettingsCard>
  );
}

export function updateText(t, st) {
  if (!st) return "";
  const map = {
    checking: t.upd_checking, current: t.upd_current, error: t.upd_error, unsupported: t.upd_unsupported,
    downloading: fill(t.upd_downloading, { v: st.version || "", p: st.percent || 0 }),
    ready: fill(t.upd_ready, { v: st.version || "" }),
  };
  return map[st.state] || "";
}

export function AboutModal({ t, company, onClose, updStatus, onCheckUpdates, onInstallUpdate }) {
  const [info, setInfo] = useState(null);
  useEffect(() => {
    if (window.appInfo) window.appInfo.get().then(setInfo).catch(() => {});
  }, []);
  const st = updStatus || { state: "idle" };
  const checking = st.state === "checking" || st.state === "downloading";
  return (
    <Modal title={t.about} onClose={onClose}>
      <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 18 }}>
        <div style={{
          width: 56, height: 56, borderRadius: 14, background: COLORS.ink, display: "flex",
          alignItems: "center", justifyContent: "center", flexShrink: 0,
        }}>
          <Scissors size={28} color={COLORS.accent} />
        </div>
        <div>
          <div style={{ fontWeight: 800, fontSize: 18 }}>{t.appName}</div>
          <div style={{ fontSize: 13, color: COLORS.muted }}>
            {t.version} <span dir="ltr" style={{ fontFamily: "'JetBrains Mono', monospace", unicodeBidi: "isolate" }}>{info ? info.version : "…"}</span>
          </div>
        </div>
      </div>
      {company.configured && (
        <div style={{ fontSize: 13, marginBottom: 12 }}>
          <span style={{ color: COLORS.muted }}>{t.companyDetails}: </span><b>{company.name}</b>
        </div>
      )}

      <div style={{ background: COLORS.bg, borderRadius: 10, padding: "12px 14px", marginBottom: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 800 }}>{t.updates}</div>
            <div style={{ fontSize: 12.5, color: st.state === "error" ? COLORS.out : st.state === "ready" ? COLORS.in : COLORS.muted }}>
              {updateText(t, st) || "—"}
            </div>
          </div>
          {st.state === "ready" ? (
            <Btn variant="accent" onClick={onInstallUpdate}><RefreshCw size={15} /> {t.restartToUpdate}</Btn>
          ) : (
            <Btn variant="ghost" onClick={onCheckUpdates} disabled={checking || st.state === "unsupported"}>
              <RefreshCw size={15} /> {t.checkUpdates}
            </Btn>
          )}
        </div>
      </div>

      <div style={{ fontSize: 13, color: COLORS.muted, marginBottom: 4 }}>{t.dataLocation}</div>
      <div dir="ltr" style={{
        fontFamily: "'JetBrains Mono', monospace", fontSize: 12, background: COLORS.bg, borderRadius: 8,
        padding: "8px 10px", wordBreak: "break-all", userSelect: "all", marginBottom: 16,
      }}>{info ? info.dbPath : "…"}</div>
      <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
        <Btn variant="ghost" onClick={() => window.appInfo && window.appInfo.showDataFolder()}><FolderOpen size={15} /> {t.openDataFolder}</Btn>
        <Btn variant="primary" onClick={onClose}>{t.close}</Btn>
      </div>
    </Modal>
  );
}

export function ShortcutsModal({ t, onClose }) {
  const rows = [
    ["Ctrl + N", t.sc_new], ["Ctrl + F", t.sc_search], ["Ctrl + P", t.sc_print], ["Ctrl + 1 … 9", t.sc_tabs],
    ["Ctrl + Enter", t.sc_save], ["Esc", t.sc_close], ["F1", t.sc_help],
  ];
  return (
    <Modal title={t.shortcuts} onClose={onClose}>
      <div style={{ display: "flex", flexDirection: "column" }}>
        {rows.map(([k, label], i) => (
          <div key={k} style={{
            display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, padding: "10px 0",
            borderBottom: i === rows.length - 1 ? "none" : `1px solid ${COLORS.border}`, fontSize: 13.5,
          }}>
            <span>{label}</span><Kbd>{k}</Kbd>
          </div>
        ))}
      </div>
    </Modal>
  );
}

export function ToastHost({ toasts, onDismiss, t }) {
  if (!toasts.length) return null;
  return (
    <div className="no-print" style={{
      position: "fixed", bottom: 20, insetInlineEnd: 20, zIndex: 40, // below dialogs (50) so it never covers their buttons
      display: "flex", flexDirection: "column", gap: 8, maxWidth: 380,
    }}>
      <style>{`@keyframes toast-in { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }`}</style>
      {toasts.map((toast) => {
        const isError = toast.type === "error";
        const Icon = isError ? AlertCircle : CheckCircle2;
        return (
          <div key={toast.id} role="status" style={{
            display: "flex", alignItems: "center", gap: 10, padding: "11px 12px 11px 14px", borderRadius: 10,
            background: isError ? COLORS.out : COLORS.ink, color: "#fff", fontSize: 13.5, fontWeight: 600,
            boxShadow: "0 10px 30px rgba(35,40,64,0.28)", animation: "toast-in 0.18s ease-out",
          }}>
            <Icon size={18} color={isError ? "#fff" : "#7FD1AE"} style={{ flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 0, wordBreak: "break-word" }}>{toast.message}</div>
            {toast.action && (
              <button onClick={() => { toast.action.onClick(); onDismiss(toast.id); }} style={{
                background: "rgba(255,255,255,0.14)", border: "none", color: "#fff", borderRadius: 6,
                padding: "4px 10px", cursor: "pointer", fontFamily: "inherit", fontWeight: 700, fontSize: 12.5,
              }}>{toast.action.label}</button>
            )}
            <button onClick={() => onDismiss(toast.id)} aria-label={t.close} style={{
              background: "none", border: "none", color: "rgba(255,255,255,0.7)", cursor: "pointer", padding: 2, display: "flex",
            }}><X size={15} /></button>
          </div>
        );
      })}
    </div>
  );
}
