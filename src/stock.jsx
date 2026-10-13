// Inventory: what is in stock, what it cost, low-stock warnings, manual adjustments and history.
import React, { useState } from "react";
import { SlidersHorizontal, History, Trash2, FileDown, AlertTriangle } from "lucide-react";
import { COLORS, uid, todayISO, fmtMoney, Badge, Btn, Input, Select, Modal, Empty, SearchBox, MetricCard } from "./ui.jsx";
import { fill } from "./i18n.js";
import { itemLabel, stockStatus, inventoryTotals, warnLevel } from "./inventory.js";

const mono = "'JetBrains Mono', monospace";

export function fmtQty(n, lang) {
  return (Math.round((Number(n) || 0) * 1000) / 1000).toLocaleString(lang === "ar" ? "ar-EG" : "en-US", { maximumFractionDigits: 3 });
}

export function StatusBadge({ t, status }) {
  if (status === "none") return <span style={{ color: COLORS.border }}>—</span>;
  if (status === "out") return <Badge color={COLORS.out} bg={COLORS.outSoft}>{t.outOfStock}</Badge>;
  if (status === "low") return <Badge color="#8A5A00" bg={COLORS.accentSoft}>{t.lowStock}</Badge>;
  return <Badge color={COLORS.in} bg={COLORS.inSoft}>{t.inStock}</Badge>;
}

export function InventoryView({ t, lang, catalog, inv, settings, search, setSearch, onAdjust, onHistory, onExport, onGoCatalog }) {
  const [filter, setFilter] = useState("all");
  const totals = inventoryTotals(catalog, inv, settings);
  const q = search.trim().toLowerCase();
  const rows = catalog
    .filter((c) => inv.stock.has(c.id))
    .map((c) => ({ c, s: inv.stock.get(c.id), status: stockStatus(c, inv.stock.get(c.id).qty, settings, inv.stock.get(c.id).moves.length > 0) }))
    .filter(({ c, status }) =>
      (filter === "all" || (filter === "low" ? status === "low" || status === "out" : (c.type || "material") === filter)) &&
      (!q || `${itemLabel(c)} ${c.unit || ""} ${c.notes || ""}`.toLowerCase().includes(q)));

  const th = { padding: "10px 12px", fontSize: 12, color: COLORS.muted, fontWeight: 700, textAlign: "end", borderBottom: `1px solid ${COLORS.border}`, whiteSpace: "nowrap" };
  const td = { padding: "10px 12px", fontSize: 13.5, textAlign: "end", borderBottom: `1px solid ${COLORS.border}`, fontFamily: mono, whiteSpace: "nowrap" };
  const chip = (active) => ({
    padding: "6px 12px", borderRadius: 999, fontSize: 12.5, fontWeight: 700, cursor: "pointer",
    border: `1px solid ${active ? COLORS.ink : COLORS.border}`, fontFamily: "inherit",
    background: active ? COLORS.ink : COLORS.surface, color: active ? "#fff" : COLORS.inkSoft,
  });
  const iconBtn = { background: "none", border: "none", cursor: "pointer", color: COLORS.muted };
  const alerts = totals.low.length + totals.outOf.length;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6, flexWrap: "wrap", gap: 10 }}>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800 }}>{t.inventory}</h2>
        <div style={{ display: "flex", gap: 8 }}>
          <Btn variant="ghost" onClick={onExport}><FileDown size={15} /> Excel</Btn>
          <Btn variant="accent" onClick={onAdjust ? () => onAdjust(null) : undefined} title="Ctrl+N" disabled={!rows.length && !catalog.length}>
            <SlidersHorizontal size={16} /> {t.adjustStock}
          </Btn>
        </div>
      </div>
      <div style={{ fontSize: 13, color: COLORS.muted, marginBottom: 14, maxWidth: 760 }}>{t.inventoryDesc}</div>

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
        <MetricCard label={t.materialsValue} value={fmtMoney(totals.materialsValue, lang)} />
        <MetricCard label={t.productsValue} value={fmtMoney(totals.productsValue, lang)} />
        <MetricCard label={t.totalStockValue} value={fmtMoney(totals.value, lang)} tone="in" />
        <MetricCard label={t.lowStockItems} value={alerts} tone={alerts ? "out" : undefined} />
      </div>

      <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", marginBottom: 12 }}>
        <SearchBox value={search} onChange={setSearch} placeholder={t.search} />
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {[["all", t.all], ["material", t.materials], ["product", t.products], ["low", t.lowStock]].map(([k, label]) => (
            <button key={k} style={chip(filter === k)} onClick={() => setFilter(k)}>{label}</button>
          ))}
        </div>
      </div>

      {catalog.length === 0 ? (
        <div style={{ background: COLORS.surface, border: `1px dashed ${COLORS.border}`, borderRadius: 12, padding: 30, textAlign: "center" }}>
          <div style={{ color: COLORS.muted, fontSize: 13.5, marginBottom: 14 }}>{t.inventoryEmpty}</div>
          <Btn variant="accent" onClick={onGoCatalog}>{t.catalog}</Btn>
        </div>
      ) : rows.length === 0 ? <Empty t={t} /> : (
        <div style={{ background: COLORS.surface, border: `1px solid ${COLORS.border}`, borderRadius: 12, overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={{ ...th, textAlign: "start" }}>{t.name}</th>
                <th style={th}>{t.stockOnHand}</th>
                <th style={th}>{t.avgCost}</th>
                <th style={th}>{t.stockValue}</th>
                <th style={th}>{t.salePrice}</th>
                <th style={th}>{t.margin}</th>
                <th style={{ ...th, textAlign: "center" }}>{t.statusCol}</th>
                <th style={th} />
              </tr>
            </thead>
            <tbody>
              {rows.map(({ c, s, status }) => {
                const isProduct = c.type === "product";
                const margin = isProduct && c.salePrice > 0 && s.avgCost > 0 ? c.salePrice - s.avgCost : null;
                return (
                  <tr key={c.id}>
                    <td style={{ ...td, textAlign: "start", fontFamily: "inherit", whiteSpace: "normal" }}>
                      <div style={{ fontWeight: 700 }}>{itemLabel(c)}</div>
                      <div style={{ fontSize: 12, color: COLORS.muted }}>{isProduct ? t.productType : t.materialType}</div>
                    </td>
                    <td style={{ ...td, fontWeight: 800, color: s.qty < 0 ? COLORS.out : COLORS.ink }}>
                      {fmtQty(s.qty, lang)} <span style={{ fontFamily: "'Cairo', sans-serif", fontWeight: 500, fontSize: 12, color: COLORS.muted }}>{c.unit || ""}</span>
                    </td>
                    <td style={td}>{s.avgCost > 0 ? fmtMoney(s.avgCost, lang) : "—"}</td>
                    <td style={td}>{s.value > 0 ? fmtMoney(s.value, lang) : "—"}</td>
                    <td style={td}>{isProduct && c.salePrice > 0 ? fmtMoney(c.salePrice, lang) : "—"}</td>
                    <td style={{ ...td, color: margin == null ? COLORS.border : margin >= 0 ? COLORS.in : COLORS.out, fontWeight: 700 }}>
                      {margin == null ? "—" : `${fmtMoney(margin, lang)} (${Math.round((margin / c.salePrice) * 100)}%)`}
                    </td>
                    <td style={{ ...td, textAlign: "center", fontFamily: "inherit" }}><StatusBadge t={t} status={status} /></td>
                    <td style={td}>
                      {onAdjust && <button onClick={() => onAdjust(c)} title={t.adjustStock} style={iconBtn}><SlidersHorizontal size={15} /></button>}
                      <button onClick={() => onHistory(c)} title={t.stockHistory} style={iconBtn}><History size={15} /></button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ---------- add / remove / recount stock by hand ---------- */
const REASONS = ["opening", "count", "waste", "other"];

export function AdjustModal({ t, lang, catalog, inv, item, onClose, onSave }) {
  const tracked = catalog.filter((c) => inv.stock.has(c.id));
  const [form, setForm] = useState(() => ({
    catalogId: item ? item.id : (tracked[0] ? tracked[0].id : ""),
    date: todayISO(), mode: "add", quantity: "", unitCost: "", reason: "opening", notes: "",
  }));
  const c = tracked.find((x) => x.id === form.catalogId);
  const s = c ? inv.stock.get(c.id) : null;
  const current = s ? s.qty : 0;
  const qty = Number(form.quantity);
  const delta = form.mode === "add" ? qty : form.mode === "remove" ? -qty : qty - current;
  const qtyOk = form.quantity !== "" && !isNaN(qty) && (form.mode === "set" ? qty >= 0 : qty > 0);
  const canSave = !!c && qtyOk && delta !== 0;
  // Stock coming in needs a cost: what was typed, else the item's current average, else its purchase price.
  const defaultCost = s && s.avgCost > 0 ? s.avgCost : (c && Number(c.purchasePrice)) || 0;
  const save = () => {
    if (!canSave) return;
    onSave({
      id: uid(), date: form.date || todayISO(), catalogId: c.id, quantity: delta,
      unitCost: delta > 0 ? (form.unitCost === "" ? defaultCost : Number(form.unitCost) || 0) : null,
      reason: form.reason, notes: form.notes.trim(), createdAt: new Date().toISOString(),
    });
  };
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  return (
    <Modal title={t.adjustStock} onClose={onClose} onSubmit={save}>
      <Select label={t.item} value={form.catalogId} onChange={set("catalogId")} disabled={!!item}>
        {tracked.map((x) => <option key={x.id} value={x.id}>{itemLabel(x)}</option>)}
      </Select>
      {c && (
        <div style={{ fontSize: 13, color: COLORS.inkSoft, margin: "-4px 0 12px" }}>
          {t.currentStock}: <b style={{ fontFamily: mono }}>{fmtQty(current, lang)}</b> {c.unit || ""}
        </div>
      )}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Select label={t.adjustType} value={form.mode} onChange={set("mode")}>
          <option value="add">{t.adjAdd}</option>
          <option value="remove">{t.adjRemove}</option>
          <option value="set">{t.adjSet}</option>
        </Select>
        <Input label={form.mode === "set" ? t.countedQty : t.quantity} type="number" min="0" step="any" autoFocus
          value={form.quantity} onChange={set("quantity")} />
      </div>
      {delta > 0 && qtyOk && (
        <Input label={`${t.unitCost} (${t.optional})`} type="number" min="0" step="any" value={form.unitCost}
          placeholder={defaultCost ? String(Math.round(defaultCost * 100) / 100) : ""} onChange={set("unitCost")} />
      )}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Select label={t.reason} value={form.reason} onChange={set("reason")}>
          {REASONS.map((r) => <option key={r} value={r}>{t["reason_" + r]}</option>)}
        </Select>
        <Input label={t.date} type="date" value={form.date} onChange={set("date")} />
      </div>
      <Input label={t.notes} value={form.notes} onChange={set("notes")} />
      {c && qtyOk && delta !== 0 && (
        <div style={{ fontSize: 13, color: COLORS.inkSoft, marginBottom: 8 }}>
          {t.stockAfter}: <b style={{ fontFamily: mono, color: current + delta < 0 ? COLORS.out : COLORS.ink }}>{fmtQty(current + delta, lang)}</b> {c.unit || ""}
        </div>
      )}
      <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 8 }}>
        <Btn variant="ghost" onClick={onClose}>{t.cancel}</Btn>
        <Btn variant="accent" disabled={!canSave} onClick={save}>{t.save}</Btn>
      </div>
    </Modal>
  );
}

/* ---------- every stock movement of one item ---------- */
export function StockHistoryModal({ t, lang, item, inv, settings, parties, onClose, onDeleteAdjustment }) {
  const s = inv.stock.get(item.id) || { qty: 0, avgCost: 0, moves: [] };
  const moves = [...s.moves].reverse();
  const partyName = (id) => { const p = parties.find((x) => x.id === id); return p ? p.name : ""; };
  const th = { padding: "8px 10px", fontSize: 12, color: COLORS.muted, fontWeight: 700, textAlign: "end", borderBottom: `1px solid ${COLORS.border}`, whiteSpace: "nowrap" };
  const td = { padding: "8px 10px", fontSize: 13, textAlign: "end", borderBottom: `1px solid ${COLORS.border}`, fontFamily: mono, whiteSpace: "nowrap" };
  return (
    <Modal title={`${t.stockHistory} — ${itemLabel(item)}`} onClose={onClose} width={760}>
      <div style={{ display: "flex", gap: 22, flexWrap: "wrap", fontSize: 13, marginBottom: 12 }}>
        <span>{t.stockOnHand}: <b style={{ fontFamily: mono }}>{fmtQty(s.qty, lang)}</b> {item.unit || ""}</span>
        <span>{t.avgCost}: <b style={{ fontFamily: mono }}>{fmtMoney(s.avgCost, lang)}</b></span>
        <span>{t.lowStock}: <b style={{ fontFamily: mono }}>≤ {fmtQty(warnLevel(item, settings), lang)}</b></span>
      </div>
      {moves.length === 0 ? <Empty t={t} /> : (
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={{ ...th, textAlign: "start" }}>{t.date}</th>
              <th style={{ ...th, textAlign: "start" }}>{t.movement}</th>
              <th style={th}>{t.quantity}</th>
              <th style={th}>{t.unitCost}</th>
              <th style={th}>{t.stockAfter}</th>
              <th style={th} />
            </tr>
          </thead>
          <tbody>
            {moves.map((m, i) => {
              const detail = m.type === "adjust" ? [t["reason_" + (m.reason || "other")], m.notes].filter(Boolean).join(" · ") : partyName(m.partyId);
              return (
                <tr key={i}>
                  <td style={{ ...td, textAlign: "start" }}>{m.date}</td>
                  <td style={{ ...td, textAlign: "start", fontFamily: "inherit", whiteSpace: "normal" }}>
                    {t["mv_" + m.type]}{detail ? <span style={{ color: COLORS.muted }}> — {detail}</span> : null}
                  </td>
                  <td style={{ ...td, fontWeight: 700, color: m.qty >= 0 ? COLORS.in : COLORS.out }}>{m.qty >= 0 ? "+" : "−"}{fmtQty(Math.abs(m.qty), lang)}</td>
                  <td style={td}>{fmtMoney(m.unitCost, lang)}</td>
                  <td style={{ ...td, color: m.balance < 0 ? COLORS.out : COLORS.ink }}>{fmtQty(m.balance, lang)}</td>
                  <td style={td}>
                    {m.type === "adjust" && onDeleteAdjustment && (
                      <button onClick={() => onDeleteAdjustment(m.refId)} title={t.delete} style={{ background: "none", border: "none", cursor: "pointer", color: COLORS.muted }}>
                        <Trash2 size={14} />
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </Modal>
  );
}

/* ---------- dashboard card: what needs restocking ---------- */
export function LowStockList({ t, lang, catalog, inv, settings, onOpen }) {
  const totals = inventoryTotals(catalog, inv, settings);
  const list = [...totals.outOf, ...totals.low].slice(0, 6);
  if (!list.length) return <div style={{ color: COLORS.muted, fontSize: 13, padding: "6px 0" }}>{t.noLowStock}</div>;
  return (
    <div>
      {list.map((c) => {
        const qty = inv.stock.get(c.id).qty;
        return (
          <div key={c.id} onClick={onOpen} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, padding: "7px 0", cursor: "pointer", borderBottom: `1px solid ${COLORS.border}` }}>
            <span style={{ fontSize: 13.5, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              <AlertTriangle size={13} color={qty <= 0 ? COLORS.out : COLORS.accent} style={{ verticalAlign: "-2px", marginInlineEnd: 6 }} />
              {itemLabel(c)}
            </span>
            <span style={{ fontFamily: mono, fontSize: 13, fontWeight: 700, color: qty <= 0 ? COLORS.out : COLORS.ink, whiteSpace: "nowrap" }}>
              {fmtQty(qty, lang)} {c.unit || ""}
            </span>
          </div>
        );
      })}
      {totals.low.length + totals.outOf.length > list.length && (
        <div style={{ fontSize: 12, color: COLORS.muted, paddingTop: 8 }}>{fill(t.andMore, { n: totals.low.length + totals.outOf.length - list.length })}</div>
      )}
    </div>
  );
}
