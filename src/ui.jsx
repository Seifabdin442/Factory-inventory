// Shared colours, helpers and small UI building blocks used across the app.
import React, { useEffect } from "react";
import { X, Download } from "lucide-react";
import { T } from "./i18n.js";

export const COLORS = {
  bg: "#F7F5EF",
  surface: "#FFFFFF",
  ink: "#232840",
  inkSoft: "#4A4E68",
  accent: "#C9972E",
  accentSoft: "#F1E4C4",
  in: "#2F7A5C",
  inSoft: "#E3F0E9",
  out: "#B84A2F",
  outSoft: "#F6E4DE",
  border: "#E3DFD3",
  muted: "#8A8577",
};

export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
// Local calendar date (not UTC) — otherwise entries made after midnight in Egypt land on yesterday.
export const isoDate = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
export const todayISO = () => isoDate(new Date());
export const monthKey = (d) => (d || "").slice(0, 7);
export const thisMonthKey = () => todayISO().slice(0, 7);

export function fmtMoney(n, lang) {
  const v = Math.round((Number(n) || 0) * 100) / 100;
  const s = v.toLocaleString(lang === "ar" ? "ar-EG" : "en-US", { maximumFractionDigits: 2 });
  return lang === "ar" ? `${s} ${T.ar.currency}` : `${T.en.currency} ${s}`;
}

export function balanceImpact(t) {
  if (t.kind === "sale") return t.total - t.paid;
  if (t.kind === "purchase") return -(t.total - t.paid);
  if (t.kind === "payment_in") return -t.paid;
  if (t.kind === "payment_out") return t.paid;
  return 0; // expenses are not tied to a client/supplier balance
}

export const errMsg = (err) => (err && err.message ? err.message : String(err));

export function companyInfo(settings, lang, t) {
  const s = settings || {};
  const name = (lang === "ar" ? (s.companyNameAr || s.companyNameEn) : (s.companyNameEn || s.companyNameAr)) || "";
  const contact = [s.phone, s.email].filter(Boolean).join("  ·  ");
  const legal = [
    s.taxNumber ? `${t.taxNumber}: ${s.taxNumber}` : "",
    s.commercialRegister ? `${t.commercialRegister}: ${s.commercialRegister}` : "",
  ].filter(Boolean).join("  ·  ");
  return {
    configured: !!name,
    name: name || t.appName,
    logo: s.logo || "",
    lines: [s.address, contact, legal].filter(Boolean),
    footer: s.invoiceFooter || "",
  };
}

export function StitchDivider() {
  return (
    <svg width="100%" height="8" style={{ display: "block", margin: "4px 0" }}>
      <line x1="0" y1="4" x2="100%" y2="4" stroke={COLORS.accent} strokeWidth="1.5"
        strokeDasharray="5,5" opacity="0.55" />
    </svg>
  );
}

export function Badge({ children, color, bg }) {
  return (
    <span style={{
      display: "inline-block", padding: "2px 10px", borderRadius: 999,
      fontSize: 12, fontWeight: 600, color, background: bg, whiteSpace: "nowrap",
    }}>{children}</span>
  );
}

export function Btn({ children, onClick, variant = "primary", style, disabled, title }) {
  const base = {
    padding: "9px 16px", borderRadius: 8, fontSize: 14, fontWeight: 600,
    cursor: disabled ? "not-allowed" : "pointer", border: "none",
    display: "inline-flex", alignItems: "center", gap: 6, opacity: disabled ? 0.5 : 1,
    transition: "transform 0.1s",
  };
  const variants = {
    primary: { background: COLORS.ink, color: "#fff" },
    accent: { background: COLORS.accent, color: "#fff" },
    ghost: { background: "transparent", color: COLORS.ink, border: `1px solid ${COLORS.border}` },
    danger: { background: COLORS.outSoft, color: COLORS.out },
  };
  return (
    <button disabled={disabled} onClick={disabled ? undefined : onClick} title={title}
      style={{ ...base, ...variants[variant], ...style }}
      onMouseDown={(e) => (e.currentTarget.style.transform = "scale(0.97)")}
      onMouseUp={(e) => (e.currentTarget.style.transform = "scale(1)")}
      onMouseLeave={(e) => (e.currentTarget.style.transform = "scale(1)")}>
      {children}
    </button>
  );
}

export function Input({ label, ...props }) {
  return (
    <label style={{ display: "block", marginBottom: 12 }}>
      {label && <div style={{ fontSize: 13, color: COLORS.inkSoft, marginBottom: 4, fontWeight: 600 }}>{label}</div>}
      <input {...props} style={{
        width: "100%", padding: "9px 12px", borderRadius: 8, border: `1px solid ${COLORS.border}`,
        fontSize: 14, boxSizing: "border-box", background: "#FCFBF8", color: COLORS.ink, fontFamily: "inherit",
        ...(props.style || {}),
      }} />
    </label>
  );
}

export function Select({ label, children, ...props }) {
  return (
    <label style={{ display: "block", marginBottom: 12 }}>
      {label && <div style={{ fontSize: 13, color: COLORS.inkSoft, marginBottom: 4, fontWeight: 600 }}>{label}</div>}
      <select {...props} style={{
        width: "100%", padding: "9px 12px", borderRadius: 8, border: `1px solid ${COLORS.border}`,
        fontSize: 14, boxSizing: "border-box", background: "#FCFBF8", color: COLORS.ink, fontFamily: "inherit",
      }}>{children}</select>
    </label>
  );
}

// Only the top-most open modal reacts to Esc / Ctrl+Enter.
const modalStack = [];

export function Modal({ title, onClose, onSubmit, children, wide, width }) {
  const idRef = React.useRef(null);
  if (!idRef.current) idRef.current = Math.random().toString(36).slice(2);
  const handlers = React.useRef({ onClose, onSubmit });
  handlers.current = { onClose, onSubmit };

  useEffect(() => {
    const id = idRef.current;
    modalStack.push(id);
    const onKey = (e) => {
      if (modalStack[modalStack.length - 1] !== id) return;
      if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); handlers.current.onClose && handlers.current.onClose(); }
      else if ((e.ctrlKey || e.metaKey) && (e.key === "Enter" || e.code === "KeyS") && handlers.current.onSubmit) {
        e.preventDefault(); e.stopPropagation(); handlers.current.onSubmit();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      const i = modalStack.lastIndexOf(id);
      if (i !== -1) modalStack.splice(i, 1);
    };
  }, []);

  return (
    <div className="no-print" style={{
      position: "fixed", inset: 0, background: "rgba(35,40,64,0.45)", zIndex: 50,
      display: "flex", alignItems: "center", justifyContent: "center", padding: 16,
    }} onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div role="dialog" aria-modal="true" style={{
        background: COLORS.surface, borderRadius: 14, padding: 24, width: "100%",
        maxWidth: width || (wide ? 640 : 460), maxHeight: "90vh", overflowY: "auto",
        boxShadow: "0 20px 60px rgba(35,40,64,0.25)",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h3 style={{ margin: 0, fontSize: 18, color: COLORS.ink, fontWeight: 800 }}>{title}</h3>
          <button onClick={onClose} title="Esc" style={{ background: "none", border: "none", cursor: "pointer", color: COLORS.muted }}>
            <X size={20} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export const isModalOpen = () => modalStack.length > 0;

export function MetricCard({ label, value, tone }) {
  const toneColor = tone === "in" ? COLORS.in : tone === "out" ? COLORS.out : COLORS.ink;
  return (
    <div style={{
      background: COLORS.surface, border: `1px solid ${COLORS.border}`, borderRadius: 12,
      padding: "16px 18px", flex: "1 1 180px", minWidth: 160,
    }}>
      <div style={{ fontSize: 12.5, color: COLORS.muted, fontWeight: 700, marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.3 }}>{label}</div>
      <div style={{ fontSize: 21, fontWeight: 800, color: toneColor, fontFamily: "'JetBrains Mono', monospace" }}>{value}</div>
    </div>
  );
}

export function ReportCard({ title, desc, label, onClick }) {
  return (
    <div style={{ background: COLORS.surface, border: `1px solid ${COLORS.border}`, borderRadius: 12, padding: 16 }}>
      <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 6 }}>{title}</div>
      <div style={{ fontSize: 12, color: COLORS.muted, marginBottom: 12 }}>{desc}</div>
      <Btn variant="accent" style={{ width: "100%", justifyContent: "center" }} onClick={onClick}>
        <Download size={15} /> {label}
      </Btn>
    </div>
  );
}

export function Empty({ t }) {
  return <div style={{ padding: 30, textAlign: "center", color: COLORS.muted, fontSize: 14 }}>{t.noData}</div>;
}

/* ---------- chart colours (validated: colour-blind safe on white) ---------- */
export const CHART = { in: "#15855A", out: "#C4472B", grid: "#ECE8DD", axis: "#8A8577", bar: "#232840" };
// Aging buckets: one warm hue, light → dark as the debt gets older.
export const AGING_COLORS = ["#E8C77E", "#D9964A", "#BD5F2E", "#8A3519"];

/* ---------- expenses ---------- */
export const EXPENSE_CATEGORIES = ["rent", "salaries", "utilities", "transport", "maintenance", "supplies", "other"];

/* ---------- line items ---------- */
// Entries saved before v1.2 have no items; treat them as a single line.
export function txItems(tx) {
  if (tx.items && tx.items.length) return tx.items;
  if (tx.kind !== "sale" && tx.kind !== "purchase") return [];
  return [{
    id: `${tx.id}-0`, catalogId: null, description: tx.description || "",
    quantity: tx.quantity || 0, unitPrice: tx.unitPrice || 0, total: tx.total || 0,
  }];
}

/* ---------- date ranges ---------- */
export function rangeFor(preset) {
  const now = new Date();
  const y = now.getFullYear(), m = now.getMonth();
  if (preset === "thisMonth") return { from: isoDate(new Date(y, m, 1)), to: isoDate(new Date(y, m + 1, 0)) };
  if (preset === "lastMonth") return { from: isoDate(new Date(y, m - 1, 1)), to: isoDate(new Date(y, m, 0)) };
  if (preset === "last3") return { from: isoDate(new Date(y, m - 2, 1)), to: isoDate(new Date(y, m + 1, 0)) };
  if (preset === "thisYear") return { from: `${y}-01-01`, to: `${y}-12-31` };
  return { from: "", to: "" }; // all
}

export const inRange = (date, range) =>
  (!range.from || date >= range.from) && (!range.to || date <= range.to);

const PRESETS = ["thisMonth", "lastMonth", "last3", "thisYear", "all"];

export function DateRangeFilter({ t, value, onChange }) {
  const chip = (active) => ({
    padding: "6px 12px", borderRadius: 999, fontSize: 12.5, fontWeight: 700, cursor: "pointer",
    border: `1px solid ${active ? COLORS.ink : COLORS.border}`, fontFamily: "inherit",
    background: active ? COLORS.ink : COLORS.surface, color: active ? "#fff" : COLORS.inkSoft,
  });
  const dateInput = {
    padding: "6px 10px", borderRadius: 8, border: `1px solid ${COLORS.border}`, fontSize: 13,
    fontFamily: "inherit", background: COLORS.surface, color: COLORS.ink,
  };
  return (
    <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
      {PRESETS.map((p) => (
        <button key={p} style={chip(value.preset === p)} onClick={() => onChange({ preset: p, ...rangeFor(p) })}>
          {t["range_" + p]}
        </button>
      ))}
      <span style={{ width: 6 }} />
      <input type="date" aria-label={t.dateFrom} value={value.from} style={dateInput}
        onChange={(e) => onChange({ ...value, preset: "custom", from: e.target.value })} />
      <span style={{ color: COLORS.muted, fontSize: 12 }}>→</span>
      <input type="date" aria-label={t.dateTo} value={value.to} style={dateInput}
        onChange={(e) => onChange({ ...value, preset: "custom", to: e.target.value })} />
    </div>
  );
}

export function SearchBox({ value, onChange, placeholder }) {
  return (
    <div style={{ position: "relative", maxWidth: 320, flex: "1 1 220px" }}>
      <input data-search="1" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
        style={{
          width: "100%", padding: "9px 12px", paddingInlineStart: 34, borderRadius: 8, border: `1px solid ${COLORS.border}`,
          fontSize: 14, boxSizing: "border-box", fontFamily: "inherit", background: COLORS.surface,
        }} />
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={COLORS.muted} strokeWidth="2" strokeLinecap="round"
        style={{ position: "absolute", top: 11, insetInlineStart: 11, pointerEvents: "none" }}>
        <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
      </svg>
    </div>
  );
}

export function Kbd({ children }) {
  return (
    <kbd style={{
      fontFamily: "'JetBrains Mono', monospace", fontSize: 11.5, padding: "2px 6px", borderRadius: 5,
      border: `1px solid ${COLORS.border}`, borderBottomWidth: 2, background: COLORS.bg, color: COLORS.ink,
      direction: "ltr", unicodeBidi: "isolate", whiteSpace: "nowrap",
    }}>{children}</kbd>
  );
}
