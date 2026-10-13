// Production runs: materials go in, finished products come out with a cost per piece.
import React, { useState, useMemo } from "react";
import { Plus, Trash2, Pencil, X, Factory } from "lucide-react";
import { COLORS, uid, todayISO, fmtMoney, inRange, Btn, Input, Modal, Empty, SearchBox, DateRangeFilter, Kbd } from "./ui.jsx";
import { fill } from "./i18n.js";
import { itemLabel, computeInventory, stockSettings, warnLevel } from "./inventory.js";
import { fmtQty } from "./stock.jsx";

const mono = "'JetBrains Mono', monospace";
const num = (v) => Number(v) || 0;

export function ProductionView({ t, lang, productions, catalog, inv, onAdd, onEdit, onDelete, search, setSearch, range, setRange }) {
  const byId = useMemo(() => new Map(catalog.map((c) => [c.id, c])), [catalog]);
  const label = (ln) => (byId.has(ln.catalogId) ? itemLabel(byId.get(ln.catalogId)) : ln.description || "");
  const q = search.trim().toLowerCase();
  const list = productions.filter((r) => inRange(r.date, range) &&
    (!q || `${r.notes || ""} ${[...r.inputs, ...r.outputs].map(label).join(" ")}`.toLowerCase().includes(q)));
  const totalCost = list.reduce((s, r) => s + ((inv.runs.get(r.id) || {}).total || 0), 0);
  const totalPieces = list.reduce((s, r) => s + ((inv.runs.get(r.id) || {}).pieces || 0), 0);
  const iconBtn = { background: "none", border: "none", cursor: "pointer", color: COLORS.muted };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6, flexWrap: "wrap", gap: 10 }}>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800 }}>{t.production}</h2>
        <Btn variant="accent" onClick={onAdd} title="Ctrl+N"><Plus size={16} /> {t.addProduction}</Btn>
      </div>
      <div style={{ fontSize: 13, color: COLORS.muted, marginBottom: 14, maxWidth: 760 }}>{t.productionDesc}</div>
      <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", marginBottom: 12 }}>
        <SearchBox value={search} onChange={setSearch} placeholder={t.search} />
        <DateRangeFilter t={t} value={range} onChange={setRange} />
      </div>
      <div style={{
        display: "flex", gap: 22, flexWrap: "wrap", padding: "10px 16px", marginBottom: 12,
        background: COLORS.surface, border: `1px solid ${COLORS.border}`, borderRadius: 10, fontSize: 12.5,
      }}>
        <div><span style={{ color: COLORS.muted }}>{t.entriesCount}: </span><b style={{ fontFamily: mono }}>{list.length}</b></div>
        <div><span style={{ color: COLORS.muted }}>{t.pieces}: </span><b style={{ fontFamily: mono }}>{fmtQty(totalPieces, lang)}</b></div>
        <div><span style={{ color: COLORS.muted }}>{t.totalCost}: </span><b style={{ fontFamily: mono }}>{fmtMoney(totalCost, lang)}</b></div>
      </div>
      {list.length === 0 ? (
        productions.length === 0 ? (
          <div style={{ background: COLORS.surface, border: `1px dashed ${COLORS.border}`, borderRadius: 12, padding: 30, textAlign: "center" }}>
            <Factory size={28} color={COLORS.muted} />
            <div style={{ color: COLORS.muted, fontSize: 13.5, margin: "8px 0 14px" }}>{t.noData}</div>
            <Btn variant="accent" onClick={onAdd}><Plus size={16} /> {t.addProduction}</Btn>
          </div>
        ) : <Empty t={t} />
      ) : (
        <div style={{ background: COLORS.surface, border: `1px solid ${COLORS.border}`, borderRadius: 12, overflow: "hidden" }}>
          {list.map((r, i) => {
            const cost = inv.runs.get(r.id) || { total: 0, outputs: [], materials: 0 };
            return (
              <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", borderBottom: i === list.length - 1 ? "none" : `1px solid ${COLORS.border}` }}>
                <Factory size={18} color={COLORS.accent} style={{ flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  {r.outputs.map((ln, k) => (
                    <div key={ln.id} style={{ fontSize: 13.5, fontWeight: 600 }}>
                      <span style={{ fontFamily: mono }}>{fmtQty(ln.quantity, lang)}</span> × {label(ln)}
                      <span style={{ color: COLORS.muted, fontWeight: 500 }}> — {t.costPerPiece}: </span>
                      <span style={{ fontFamily: mono }}>{fmtMoney((cost.outputs[k] || {}).unitCost, lang)}</span>
                    </div>
                  ))}
                  <div style={{ fontSize: 12, color: COLORS.muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {r.date} · {r.inputs.map((ln) => `${fmtQty(ln.quantity, lang)} ${label(ln)}`).join(lang === "ar" ? "، " : ", ")}
                    {r.notes ? ` · ${r.notes}` : ""}
                  </div>
                </div>
                <div style={{ textAlign: "end" }}>
                  <div style={{ fontFamily: mono, fontWeight: 700, fontSize: 13.5, whiteSpace: "nowrap" }}>{fmtMoney(cost.total, lang)}</div>
                  <div style={{ fontSize: 11.5, color: COLORS.muted }}>{t.totalCost}</div>
                </div>
                {onEdit && <button onClick={() => onEdit(r)} title={t.edit} style={iconBtn}><Pencil size={15} /></button>}
                {onDelete && <button onClick={() => onDelete(r.id)} title={t.delete} style={iconBtn}><Trash2 size={15} /></button>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

const emptyInput = () => ({ id: uid(), catalogId: "", quantity: "" });
const emptyOutput = () => ({ id: uid(), catalogId: "", quantity: "", share: "", salePrice: "" });

export function ProductionModal({ t, lang, catalog, transactions, productions, adjustments, settings, editRun, onClose, onSave, onGoCatalog }) {
  const byId = useMemo(() => new Map(catalog.map((c) => [c.id, c])), [catalog]);
  const tracked = catalog.filter((c) => c.trackStock !== 0);
  const materials = tracked.filter((c) => c.type !== "product");
  const products = tracked.filter((c) => c.type === "product");
  const runId = useMemo(() => (editRun ? editRun.id : uid()), [editRun]);

  const [form, setForm] = useState(() => (editRun ? {
    date: editRun.date, notes: editRun.notes || "", laborCost: editRun.laborCost || "", otherCost: editRun.otherCost || "",
    splitMode: editRun.splitMode === "manual" ? "manual" : "quantity",
    inputs: editRun.inputs.length ? editRun.inputs.map((l) => ({ id: l.id, catalogId: l.catalogId || "", quantity: l.quantity })) : [emptyInput()],
    outputs: editRun.outputs.map((l) => ({ id: l.id, catalogId: l.catalogId || "", quantity: l.quantity, share: l.share || "", salePrice: l.salePrice || "" })),
  } : {
    date: todayISO(), notes: "", laborCost: "", otherCost: "", splitMode: "quantity",
    inputs: [emptyInput()], outputs: [emptyOutput()],
  }));
  const setLine = (key, id, patch) => setForm((f) => ({ ...f, [key]: f[key].map((l) => (l.id === id ? { ...l, ...patch } : l)) }));
  const addLine = (key) => setForm((f) => ({ ...f, [key]: [...f[key], key === "inputs" ? emptyInput() : emptyOutput()] }));
  const removeLine = (key, id) => setForm((f) => ({ ...f, [key]: f[key].length > 1 ? f[key].filter((l) => l.id !== id) : f[key] }));

  // Replay the stock with this run as typed so far: gives the real material costs and what is left.
  const draft = {
    id: runId, date: form.date || todayISO(), laborCost: num(form.laborCost), otherCost: num(form.otherCost),
    splitMode: form.splitMode, createdAt: editRun ? editRun.createdAt : "9999",
    inputs: form.inputs.map((l) => ({ ...l, quantity: num(l.quantity) })),
    outputs: form.outputs.map((l) => ({ ...l, quantity: num(l.quantity), share: num(l.share) })),
  };
  const inv = useMemo(
    () => computeInventory({ catalog, transactions, adjustments, productions: [...productions.filter((p) => p.id !== runId), draft] }),
    [catalog, transactions, adjustments, productions, JSON.stringify(draft)]
  );
  const cost = inv.runs.get(runId) || { materials: 0, total: 0, inputs: [], outputs: [], pieces: 0 };
  const st = stockSettings(settings);

  // Stock of each material on the run's date, just after this run takes its share.
  const leftAfter = new Map();
  for (const id of new Set(form.inputs.map((l) => l.catalogId).filter(Boolean))) {
    const s = inv.stock.get(id);
    const used = s ? s.moves.filter((m) => m.type === "used" && m.refId === runId) : [];
    if (used.length) leftAfter.set(id, used[used.length - 1].balance);
  }
  const usedInputs = form.inputs.filter((l) => l.catalogId || l.quantity !== "");
  const usedOutputs = form.outputs.filter((l) => l.catalogId || l.quantity !== "");
  const lineOk = (l) => l.catalogId && num(l.quantity) > 0;
  const blocked = st.block && [...leftAfter.values()].some((left) => left < st.blockMin);
  const shareSum = usedOutputs.reduce((s, l) => s + num(l.share), 0);
  const sharesOk = form.splitMode !== "manual" || Math.abs(shareSum - 100) < 0.01;
  const canSave = usedOutputs.length > 0 && usedOutputs.every(lineOk) && usedInputs.every(lineOk) && sharesOk && !blocked;

  const save = () => {
    if (!canSave) return;
    onSave({
      id: runId, date: form.date || todayISO(), notes: form.notes.trim(), laborCost: num(form.laborCost), otherCost: num(form.otherCost),
      splitMode: form.splitMode, createdAt: editRun ? editRun.createdAt : new Date().toISOString(),
      inputs: usedInputs.map((l) => ({ id: l.id, catalogId: l.catalogId, description: itemLabel(byId.get(l.catalogId)), quantity: num(l.quantity) })),
      outputs: usedOutputs.map((l) => ({
        id: l.id, catalogId: l.catalogId, description: itemLabel(byId.get(l.catalogId)), quantity: num(l.quantity),
        share: form.splitMode === "manual" ? num(l.share) : 0, salePrice: num(l.salePrice),
      })),
    });
  };

  const cell = { padding: "7px 9px", borderRadius: 7, border: `1px solid ${COLORS.border}`, fontSize: 13.5, fontFamily: "inherit", background: "#FCFBF8", color: COLORS.ink, width: "100%", boxSizing: "border-box" };
  const head = { fontSize: 12, color: COLORS.inkSoft, fontWeight: 700, padding: "0 2px 4px" };
  const money = { fontFamily: mono, fontWeight: 700, fontSize: 13.5, textAlign: "end", padding: "8px 2px", whiteSpace: "nowrap" };
  const section = { fontSize: 13.5, fontWeight: 800, margin: "6px 0 8px" };
  const xBtn = (disabled) => ({ background: "none", border: "none", cursor: disabled ? "default" : "pointer", color: disabled ? COLORS.border : COLORS.muted, padding: 4 });
  const manual = form.splitMode === "manual";
  const inGrid = "minmax(0, 1fr) 110px 120px 120px 28px";
  const outGrid = manual ? "minmax(0, 1fr) 90px 80px 112px 112px 112px 28px" : "minmax(0, 1fr) 90px 112px 112px 112px 28px";
  const toggle = (active) => ({
    padding: "5px 12px", borderRadius: 999, fontSize: 12.5, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
    border: `1px solid ${active ? COLORS.ink : COLORS.border}`, background: active ? COLORS.ink : COLORS.surface, color: active ? "#fff" : COLORS.inkSoft,
  });

  return (
    <Modal title={(editRun ? `${t.edit} — ` : "") + t.addProduction} onClose={onClose} onSubmit={save} width={900}>
      <div style={{ display: "grid", gridTemplateColumns: "180px minmax(0, 1fr)", gap: 12 }}>
        <Input label={t.date} type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
        <Input label={t.notes} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
      </div>

      <div style={section}>{t.materialsUsed}</div>
      <div style={{ display: "grid", gridTemplateColumns: inGrid, gap: 8, alignItems: "start" }}>
        <div style={head}>{t.item}</div>
        <div style={head}>{t.quantity}</div>
        <div style={{ ...head, textAlign: "end" }}>{t.avgCost}</div>
        <div style={{ ...head, textAlign: "end" }}>{t.lineTotal}</div>
        <div />
        {form.inputs.map((l, i) => {
          const c = byId.get(l.catalogId);
          const left = leftAfter.get(l.catalogId);
          const bad = c && left != null && st.block && left < st.blockMin;
          const low = c && left != null && !bad && left <= warnLevel(c, settings);
          const withUnit = (n) => `${fmtQty(n, lang)} ${c.unit || ""}`.trim();
          return (
            <React.Fragment key={l.id}>
              <div>
                <select value={l.catalogId} onChange={(e) => setLine("inputs", l.id, { catalogId: e.target.value })} style={cell} autoFocus={i === 0 && !editRun}>
                  <option value="">{t.pickItem}</option>
                  {materials.map((c2) => <option key={c2.id} value={c2.id}>{itemLabel(c2)}</option>)}
                  {products.length > 0 && <option disabled>──────</option>}
                  {products.map((c2) => <option key={c2.id} value={c2.id}>{itemLabel(c2)}</option>)}
                </select>
                {c && left != null && (
                  <div style={{ fontSize: 11.5, marginTop: 3, color: bad ? COLORS.out : low ? "#8A5A00" : COLORS.muted, fontWeight: bad || low ? 700 : 500 }}>
                    {bad ? fill(t.notEnoughStock, { n: withUnit(left + num(l.quantity)) }) : fill(low ? t.stockLowAfter : t.stockLeftAfter, { n: withUnit(left) })}
                  </div>
                )}
              </div>
              <input type="number" min="0" step="any" value={l.quantity} onChange={(e) => setLine("inputs", l.id, { quantity: e.target.value })}
                style={{ ...cell, borderColor: bad ? COLORS.out : COLORS.border }} />
              <div style={{ ...money, fontWeight: 500 }}>{c ? fmtMoney((cost.inputs[i] || {}).unitCost, lang) : "—"}</div>
              <div style={money}>{fmtMoney((cost.inputs[i] || {}).cost, lang)}</div>
              <button onClick={() => removeLine("inputs", l.id)} disabled={form.inputs.length === 1} title={t.removeItem} style={xBtn(form.inputs.length === 1)}><X size={16} /></button>
            </React.Fragment>
          );
        })}
      </div>
      <Btn variant="ghost" onClick={() => addLine("inputs")} style={{ padding: "7px 12px", marginTop: 8 }}><Plus size={15} /> {t.addMaterial}</Btn>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 12, marginTop: 14, alignItems: "end" }}>
        <Input label={t.tailoringCost} type="number" min="0" step="any" value={form.laborCost} onChange={(e) => setForm({ ...form, laborCost: e.target.value })} />
        <Input label={t.otherCosts} type="number" min="0" step="any" value={form.otherCost} onChange={(e) => setForm({ ...form, otherCost: e.target.value })} />
        <div style={{ marginBottom: 12, background: COLORS.bg, borderRadius: 8, padding: "8px 12px" }}>
          <div style={{ fontSize: 12, color: COLORS.muted }}>{t.materialsCost}: <span style={{ fontFamily: mono }}>{fmtMoney(cost.materials, lang)}</span></div>
          <div style={{ fontSize: 13.5, fontWeight: 800 }}>{t.totalCost}: <span style={{ fontFamily: mono }}>{fmtMoney(cost.total, lang)}</span></div>
        </div>
      </div>

      <div style={{ height: 1, background: COLORS.border, margin: "6px 0 12px" }} />
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <div style={section}>{t.productsMade}</div>
        {usedOutputs.length > 1 && (
          <div style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 12.5, color: COLORS.inkSoft }}>
            {t.splitCost}:
            <button style={toggle(!manual)} onClick={() => setForm({ ...form, splitMode: "quantity" })}>{t.splitByQty}</button>
            <button style={toggle(manual)} onClick={() => setForm({ ...form, splitMode: "manual" })}>{t.splitManual}</button>
          </div>
        )}
      </div>
      {products.length === 0 ? (
        <div style={{ background: COLORS.accentSoft, borderRadius: 8, padding: "10px 12px", fontSize: 13, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
          {t.noProductsYet}
          <Btn variant="primary" onClick={onGoCatalog} style={{ padding: "6px 12px", fontSize: 13 }}>{t.catalog}</Btn>
        </div>
      ) : (
        <>
          <div style={{ display: "grid", gridTemplateColumns: outGrid, gap: 8, alignItems: "start" }}>
            <div style={head}>{t.productType}</div>
            <div style={head}>{t.pieces}</div>
            {manual && <div style={head}>{t.sharePct}</div>}
            <div style={{ ...head, textAlign: "end" }}>{t.costPerPiece}</div>
            <div style={head}>{t.sellingPrice}</div>
            <div style={{ ...head, textAlign: "end" }}>{t.marginPerPiece}</div>
            <div />
            {form.outputs.map((l, i) => {
              const unitCost = (cost.outputs[i] || {}).unitCost || 0;
              const price = num(l.salePrice);
              const margin = price > 0 && unitCost > 0 ? price - unitCost : null;
              return (
                <React.Fragment key={l.id}>
                  <select value={l.catalogId} style={cell} onChange={(e) => {
                    const c = byId.get(e.target.value);
                    setLine("outputs", l.id, { catalogId: e.target.value, ...(c && c.salePrice > 0 && l.salePrice === "" ? { salePrice: c.salePrice } : {}) });
                  }}>
                    <option value="">{t.pickItem}</option>
                    {products.map((c2) => <option key={c2.id} value={c2.id}>{itemLabel(c2)}</option>)}
                  </select>
                  <input type="number" min="0" step="any" value={l.quantity} onChange={(e) => setLine("outputs", l.id, { quantity: e.target.value })} style={cell} />
                  {manual && (
                    <input type="number" min="0" max="100" step="any" value={l.share} onChange={(e) => setLine("outputs", l.id, { share: e.target.value })}
                      style={{ ...cell, borderColor: sharesOk ? COLORS.border : COLORS.out }} />
                  )}
                  <div style={money}>{unitCost > 0 ? fmtMoney(unitCost, lang) : "—"}</div>
                  <input type="number" min="0" step="any" value={l.salePrice} onChange={(e) => setLine("outputs", l.id, { salePrice: e.target.value })} style={cell} />
                  <div style={{ ...money, color: margin == null ? COLORS.border : margin >= 0 ? COLORS.in : COLORS.out }}>
                    {margin == null ? "—" : `${fmtMoney(margin, lang)} (${Math.round((margin / price) * 100)}%)`}
                  </div>
                  <button onClick={() => removeLine("outputs", l.id)} disabled={form.outputs.length === 1} title={t.removeItem} style={xBtn(form.outputs.length === 1)}><X size={16} /></button>
                </React.Fragment>
              );
            })}
          </div>
          <Btn variant="ghost" onClick={() => addLine("outputs")} style={{ padding: "7px 12px", marginTop: 8 }}><Plus size={15} /> {t.addProduct}</Btn>
          {manual && !sharesOk && <div style={{ color: COLORS.out, fontSize: 12.5, marginTop: 6 }}>{fill(t.sharesMust100, { n: Math.round(shareSum * 100) / 100 })}</div>}
        </>
      )}
      {blocked && <div style={{ color: COLORS.out, fontSize: 12.5, marginTop: 8, fontWeight: 700 }}>{t.stockBlockedHint}</div>}

      <div style={{ display: "flex", gap: 10, justifyContent: "space-between", alignItems: "center", marginTop: 16 }}>
        <span style={{ fontSize: 11.5, color: COLORS.muted }}><Kbd>Ctrl+Enter</Kbd> {t.save} · <Kbd>Esc</Kbd> {t.cancel}</span>
        <div style={{ display: "flex", gap: 10 }}>
          <Btn variant="ghost" onClick={onClose}>{t.cancel}</Btn>
          <Btn variant="accent" disabled={!canSave} onClick={save}>{t.save}</Btn>
        </div>
      </div>
    </Modal>
  );
}
