// Saved items and fabrics with default prices, suggested while entering purchases/sales.
import React, { useState, useMemo } from "react";
import { Plus, Trash2, Pencil, Boxes } from "lucide-react";
import { COLORS, uid, fmtMoney, Btn, Input, Select, Modal, Empty, SearchBox } from "./ui.jsx";
import { fill } from "./i18n.js";
import { itemLabel, isTracked } from "./inventory.js";
import { fmtQty } from "./stock.jsx";

const mono = "'JetBrains Mono', monospace";

export function CatalogView({ t, lang, catalog, transactions, inv, onAdd, onEdit, onDelete, search, setSearch }) {
  const usage = useMemo(() => {
    const m = new Map();
    for (const tx of transactions) for (const it of tx.items || []) {
      if (it.catalogId) m.set(it.catalogId, (m.get(it.catalogId) || 0) + 1);
    }
    return m;
  }, [transactions]);
  const q = search.trim().toLowerCase();
  const list = catalog.filter((c) => !q || `${itemLabel(c)} ${c.unit || ""} ${c.notes || ""}`.toLowerCase().includes(q));
  const th = { padding: "10px 14px", fontSize: 12, color: COLORS.muted, fontWeight: 700, textAlign: "start", borderBottom: `1px solid ${COLORS.border}`, whiteSpace: "nowrap" };
  const td = { padding: "11px 14px", fontSize: 13.5, borderBottom: `1px solid ${COLORS.border}` };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6, flexWrap: "wrap", gap: 10 }}>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800 }}>{t.catalog}</h2>
        <Btn variant="accent" onClick={onAdd} title="Ctrl+N"><Plus size={16} /> {t.addCatalogItem}</Btn>
      </div>
      <div style={{ fontSize: 13, color: COLORS.muted, marginBottom: 14, maxWidth: 720 }}>{t.catalogDesc}</div>
      <div style={{ marginBottom: 12 }}><SearchBox value={search} onChange={setSearch} placeholder={t.search} /></div>
      {list.length === 0 ? (
        catalog.length === 0 ? (
          <div style={{ background: COLORS.surface, border: `1px dashed ${COLORS.border}`, borderRadius: 12, padding: 30, textAlign: "center" }}>
            <Boxes size={28} color={COLORS.muted} />
            <div style={{ color: COLORS.muted, fontSize: 13.5, margin: "8px 0 14px" }}>{t.noData}</div>
            <Btn variant="accent" onClick={onAdd}><Plus size={16} /> {t.addCatalogItem}</Btn>
          </div>
        ) : <Empty t={t} />
      ) : (
        <div style={{ background: COLORS.surface, border: `1px solid ${COLORS.border}`, borderRadius: 12, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={th}>{t.name}</th>
                <th style={th}>{t.type}</th>
                <th style={th}>{t.unit}</th>
                <th style={{ ...th, textAlign: "end" }}>{t.salePrice}</th>
                <th style={{ ...th, textAlign: "end" }}>{t.purchasePrice}</th>
                <th style={{ ...th, textAlign: "end" }}>{t.stockOnHand}</th>
                <th style={{ ...th, textAlign: "center" }}>{t.timesUsed}</th>
                <th style={th} />
              </tr>
            </thead>
            <tbody>
              {list.map((c) => (
                <tr key={c.id}>
                  <td style={td}>
                    <div style={{ fontWeight: 700 }}>{itemLabel(c)}</div>
                    {c.notes && <div style={{ fontSize: 12, color: COLORS.muted }}>{c.notes}</div>}
                  </td>
                  <td style={{ ...td, color: COLORS.inkSoft }}>{c.type === "product" ? t.productType : t.materialType}</td>
                  <td style={{ ...td, color: COLORS.inkSoft }}>{c.unit || "—"}</td>
                  <td style={{ ...td, textAlign: "end", fontFamily: mono }}>{c.salePrice ? fmtMoney(c.salePrice, lang) : "—"}</td>
                  <td style={{ ...td, textAlign: "end", fontFamily: mono }}>{c.purchasePrice ? fmtMoney(c.purchasePrice, lang) : "—"}</td>
                  <td style={{ ...td, textAlign: "end", fontFamily: mono }}>
                    {inv && inv.stock.has(c.id) ? fmtQty(inv.stock.get(c.id).qty, lang) : <span style={{ color: COLORS.muted, fontFamily: "inherit", fontSize: 12 }}>{t.notTracked}</span>}
                  </td>
                  <td style={{ ...td, textAlign: "center", color: COLORS.inkSoft }}>{usage.get(c.id) || 0}</td>
                  <td style={{ ...td, textAlign: "end", whiteSpace: "nowrap" }}>
                    {onEdit && <button onClick={() => onEdit(c)} title={t.edit} style={{ background: "none", border: "none", cursor: "pointer", color: COLORS.muted }}><Pencil size={15} /></button>}
                    {onDelete && <button onClick={() => onDelete(c)} title={t.delete} style={{ background: "none", border: "none", cursor: "pointer", color: COLORS.muted }}><Trash2 size={15} /></button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const splitList = (v) => String(v || "").split(/[,،]/).map((x) => x.trim()).filter(Boolean);

export function CatalogModal({ t, editItem, settings, onClose, onSave }) {
  const [form, setForm] = useState(() => ({
    name: editItem ? editItem.name : "",
    type: editItem ? editItem.type || "material" : "material",
    unit: editItem ? editItem.unit || "" : "",
    size: editItem ? editItem.size || "" : "",
    color: editItem ? editItem.color || "" : "",
    salePrice: editItem && editItem.salePrice ? editItem.salePrice : "",
    purchasePrice: editItem && editItem.purchasePrice ? editItem.purchasePrice : "",
    minStock: editItem && editItem.minStock != null ? editItem.minStock : "",
    trackStock: editItem ? isTracked(editItem) : true,
    notes: editItem ? editItem.notes || "" : "",
  }));
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const isProduct = form.type === "product";
  // A new product can be added in every size and colour at once: "S, M, L" × "black, white" → 6 items.
  const sizes = editItem ? [form.size.trim()] : splitList(form.size);
  const colors = editItem ? [form.color.trim()] : splitList(form.color);
  const combos = [];
  for (const size of sizes.length ? sizes : [""]) for (const color of colors.length ? colors : [""]) combos.push({ size, color });
  const canSave = form.name.trim().length > 0;
  const save = () => {
    if (!canSave) return;
    const base = {
      name: form.name.trim(), type: form.type, unit: form.unit.trim(), notes: form.notes,
      salePrice: Number(form.salePrice) || 0, purchasePrice: Number(form.purchasePrice) || 0,
      minStock: form.minStock === "" ? null : Number(form.minStock), trackStock: form.trackStock ? 1 : 0,
    };
    onSave(combos.map((v, i) => ({ ...base, ...v, id: editItem && i === 0 ? editItem.id : uid() })));
  };
  return (
    <Modal title={editItem ? t.editCatalogItem : t.addCatalogItem} onClose={onClose} onSubmit={save} wide>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Select label={t.type} value={form.type} onChange={set("type")}>
          <option value="material">{t.materialType}</option>
          <option value="product">{t.productType}</option>
        </Select>
        <Input label={t.unit} value={form.unit} onChange={set("unit")} placeholder={t.unitPlaceholder} />
      </div>
      <Input label={t.name} value={form.name} onChange={set("name")} autoFocus />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Input label={editItem ? t.size : t.sizes} value={form.size} onChange={set("size")} placeholder={editItem ? "" : "S, M, L, XL"} />
        <Input label={editItem ? t.color : t.colors} value={form.color} onChange={set("color")} placeholder={editItem ? "" : t.colorsPlaceholder} />
      </div>
      {!editItem && (
        <div style={{ fontSize: 12, color: combos.length > 1 ? COLORS.in : COLORS.muted, margin: "-6px 0 12px", fontWeight: combos.length > 1 ? 700 : 500 }}>
          {combos.length > 1 ? fill(t.variantsWillCreate, { n: combos.length }) : t.variantsHint}
        </div>
      )}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        {isProduct
          ? <Input label={t.salePrice} type="number" min="0" step="any" value={form.salePrice} onChange={set("salePrice")} />
          : <Input label={t.purchasePrice} type="number" min="0" step="any" value={form.purchasePrice} onChange={set("purchasePrice")} />}
        <Input label={t.minStockLabel} type="number" min="0" step="any" value={form.minStock} onChange={set("minStock")}
          placeholder={String((settings && settings.stockWarnMin) || 5)} disabled={!form.trackStock} />
      </div>
      <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13.5, marginBottom: 12, cursor: "pointer" }}>
        <input type="checkbox" checked={form.trackStock} onChange={(e) => setForm({ ...form, trackStock: e.target.checked })} />
        {t.trackStock}
      </label>
      <Input label={t.notes} value={form.notes} onChange={set("notes")} />
      <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 8 }}>
        <Btn variant="ghost" onClick={onClose}>{t.cancel}</Btn>
        <Btn variant="accent" disabled={!canSave} onClick={save}>{t.save}</Btn>
      </div>
    </Modal>
  );
}
