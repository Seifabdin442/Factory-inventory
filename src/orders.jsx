// Client orders: products made for a client by a factory, with a commission for this business.
import React, { useState, useMemo } from "react";
import { Plus, Trash2, Pencil, X, Handshake } from "lucide-react";
import { COLORS, uid, todayISO, fmtMoney, Badge, Btn, Input, Select, Modal, Empty, SearchBox, MetricCard, Kbd } from "./ui.jsx";
import { fill } from "./i18n.js";
import { itemLabel } from "./inventory.js";
import { orderCalc, heldMaterials, heldFor, COMMISSION_MODES, COST_TYPES } from "./orders.js";
import { fmtQty } from "./stock.jsx";

const mono = "'JetBrains Mono', monospace";
const num = (v) => Number(v) || 0;

export function OrdersView({ t, lang, orders, parties, onAdd, onEdit, onDelete, search, setSearch }) {
  const [filter, setFilter] = useState("all");
  const partyName = (id) => { const p = parties.find((x) => x.id === id); return p ? p.name : ""; };
  const held = useMemo(() => heldMaterials(orders), [orders]);
  const rows = orders.map((o) => ({ o, c: orderCalc(o) }));
  const q = search.trim().toLowerCase();
  const list = rows.filter(({ o }) => (filter === "all" || o.status === filter) &&
    (!q || `${partyName(o.clientId)} ${o.title || ""} ${o.notes || ""} ${o.products.map((p) => p.name).join(" ")}`.toLowerCase().includes(q)));
  const open = rows.filter(({ o }) => o.status !== "delivered");
  const month = todayISO().slice(0, 7);
  const commissionMonth = rows.filter(({ o }) => o.status === "delivered" && String(o.deliveredDate || "").slice(0, 7) === month)
    .reduce((s, { c }) => s + c.commission, 0);
  // Money received for orders that are not delivered yet, less what was already spent on them.
  const heldMoney = open.reduce((s, { c }) => s + Math.max(c.received - c.cost, 0), 0);
  const heldRows = [...held.keys()].flatMap((clientId) => heldFor(held, clientId).map((r) => ({ ...r, clientId })));
  const chip = (active) => ({
    padding: "6px 12px", borderRadius: 999, fontSize: 12.5, fontWeight: 700, cursor: "pointer",
    border: `1px solid ${active ? COLORS.ink : COLORS.border}`, fontFamily: "inherit",
    background: active ? COLORS.ink : COLORS.surface, color: active ? "#fff" : COLORS.inkSoft,
  });
  const iconBtn = { background: "none", border: "none", cursor: "pointer", color: COLORS.muted };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6, flexWrap: "wrap", gap: 10 }}>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800 }}>{t.orders}</h2>
        <Btn variant="accent" onClick={onAdd} title="Ctrl+N"><Plus size={16} /> {t.addOrder}</Btn>
      </div>
      <div style={{ fontSize: 13, color: COLORS.muted, marginBottom: 14, maxWidth: 760 }}>{t.ordersDesc}</div>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
        <MetricCard label={t.openOrders} value={open.length} />
        <MetricCard label={t.commissionThisMonth} value={fmtMoney(commissionMonth, lang)} tone="in" />
        <MetricCard label={t.heldMoney} value={fmtMoney(heldMoney, lang)} />
      </div>
      <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", marginBottom: 12 }}>
        <SearchBox value={search} onChange={setSearch} placeholder={t.search} />
        <div style={{ display: "flex", gap: 6 }}>
          {[["all", t.all], ["open", t.orderOpen], ["delivered", t.orderDelivered]].map(([k, label]) => (
            <button key={k} style={chip(filter === k)} onClick={() => setFilter(k)}>{label}</button>
          ))}
        </div>
      </div>
      {list.length === 0 ? (
        orders.length === 0 ? (
          <div style={{ background: COLORS.surface, border: `1px dashed ${COLORS.border}`, borderRadius: 12, padding: 30, textAlign: "center" }}>
            <Handshake size={28} color={COLORS.muted} />
            <div style={{ color: COLORS.muted, fontSize: 13.5, margin: "8px 0 14px" }}>{t.noData}</div>
            <Btn variant="accent" onClick={onAdd}><Plus size={16} /> {t.addOrder}</Btn>
          </div>
        ) : <Empty t={t} />
      ) : (
        <div style={{ background: COLORS.surface, border: `1px solid ${COLORS.border}`, borderRadius: 12, overflow: "hidden" }}>
          {list.map(({ o, c }, i) => (
            <div key={o.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", borderBottom: i === list.length - 1 ? "none" : `1px solid ${COLORS.border}` }}>
              <Handshake size={18} color={COLORS.accent} style={{ flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13.5, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {partyName(o.clientId)}{o.title ? ` — ${o.title}` : ""}
                </div>
                <div style={{ fontSize: 12, color: COLORS.muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {o.date} · {o.products.map((p) => `${fmtQty(p.quantity, lang)} × ${p.name}`).join(lang === "ar" ? "، " : ", ")}
                </div>
              </div>
              {o.status === "delivered"
                ? <Badge color={COLORS.in} bg={COLORS.inSoft}>{t.orderDelivered}</Badge>
                : <Badge color="#8A5A00" bg={COLORS.accentSoft}>{t.orderOpen}</Badge>}
              <div style={{ textAlign: "end", minWidth: 120 }}>
                <div style={{ fontFamily: mono, fontWeight: 700, fontSize: 13.5, color: COLORS.in, whiteSpace: "nowrap" }}>{fmtMoney(c.commission, lang)}</div>
                <div style={{ fontSize: 11.5, color: COLORS.muted }}>{t.commission}</div>
              </div>
              <div style={{ textAlign: "end", minWidth: 130 }}>
                <div style={{ fontFamily: mono, fontWeight: 700, fontSize: 13.5, whiteSpace: "nowrap", color: c.balance > 0 ? COLORS.out : COLORS.ink }}>
                  {fmtMoney(Math.abs(c.balance), lang)}
                </div>
                <div style={{ fontSize: 11.5, color: COLORS.muted }}>{c.balance > 0 ? t.clientOwes : c.balance < 0 ? t.toReturn : t.settled}</div>
              </div>
              <button onClick={() => onEdit(o)} title={t.edit} style={iconBtn}><Pencil size={15} /></button>
              <button onClick={() => onDelete(o.id)} title={t.delete} style={iconBtn}><Trash2 size={15} /></button>
            </div>
          ))}
        </div>
      )}
      {heldRows.length > 0 && (
        <div style={{ background: COLORS.surface, border: `1px solid ${COLORS.border}`, borderRadius: 12, padding: 16, marginTop: 16, maxWidth: 560 }}>
          <div style={{ fontWeight: 800, fontSize: 14.5 }}>{t.heldFabric}</div>
          <div style={{ fontSize: 12.5, color: COLORS.muted, marginBottom: 10 }}>{t.heldFabricDesc}</div>
          {heldRows.map((r) => (
            <div key={r.clientId + r.name} style={{ display: "flex", justifyContent: "space-between", gap: 10, padding: "6px 0", borderTop: `1px solid ${COLORS.border}`, fontSize: 13.5 }}>
              <span><b>{partyName(r.clientId)}</b> — {r.name}</span>
              <span style={{ fontFamily: mono, fontWeight: 700 }}>{fmtQty(r.qty, lang)} {r.unit}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const newProduct = () => ({ id: uid(), name: "", quantity: "", price: "", commissionValue: "" });
const newMaterial = () => ({ id: uid(), name: "", unit: "", received: "", used: "", returned: "" });
const newCost = () => ({ id: uid(), type: "making", supplierId: "", description: "", amount: "", paid: "" });
const newPayment = () => ({ id: uid(), date: todayISO(), dir: "in", amount: "" });

export function OrderModal({ t, lang, parties, catalog, orders, editOrder, onClose, onSave }) {
  const clients = parties.filter((p) => p.type !== "supplier");
  const suppliers = parties.filter((p) => p.type !== "client");
  const orderId = useMemo(() => (editOrder ? editOrder.id : uid()), [editOrder]);
  const [form, setForm] = useState(() => (editOrder ? {
    date: editOrder.date, clientId: editOrder.clientId, newClientName: "", title: editOrder.title || "", notes: editOrder.notes || "",
    commissionMode: editOrder.commissionMode || "cost_pct", commissionScope: editOrder.commissionScope || "order",
    commissionValue: editOrder.commissionValue || "", delivered: editOrder.status === "delivered", deliveredDate: editOrder.deliveredDate || todayISO(),
    products: editOrder.products.length ? editOrder.products : [newProduct()],
    materials: editOrder.materials, costs: editOrder.costs, payments: editOrder.payments,
  } : {
    date: todayISO(), clientId: clients[0] ? clients[0].id : "__new__", newClientName: "", title: "", notes: "",
    commissionMode: "cost_pct", commissionScope: "order", commissionValue: "", delivered: false, deliveredDate: todayISO(),
    products: [newProduct()], materials: [], costs: [], payments: [],
  }));
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const setLine = (key, id, patch) => setForm((f) => ({ ...f, [key]: f[key].map((l) => (l.id === id ? { ...l, ...patch } : l)) }));
  const addLine = (key, make) => setForm((f) => ({ ...f, [key]: [...f[key], make()] }));
  const removeLine = (key, id) => setForm((f) => ({ ...f, [key]: f[key].filter((l) => l.id !== id) }));

  const mode = form.commissionMode;
  const perProduct = form.commissionScope === "product";
  const isPct = mode !== "per_piece";
  const draft = { ...form, id: orderId, status: form.delivered ? "delivered" : "open" };
  const calc = orderCalc(draft);

  // Fabric this client already has here from earlier orders.
  const heldBefore = useMemo(() => heldFor(heldMaterials(orders, orderId), form.clientId), [orders, orderId, form.clientId]);
  const heldQty = (name) => { const r = heldBefore.find((x) => x.name.toLowerCase() === String(name).trim().toLowerCase()); return r ? r.qty : 0; };
  const heldAfter = (m) => heldQty(m.name) + form.materials.filter((x) => x.name.trim().toLowerCase() === m.name.trim().toLowerCase())
    .reduce((s, x) => s + num(x.received) - num(x.used) - num(x.returned), 0);

  const usedProducts = form.products.filter((p) => p.name.trim() || p.quantity !== "");
  const productsOk = usedProducts.length > 0 && usedProducts.every((p) => p.name.trim() && num(p.quantity) > 0 && (mode !== "price_pct" || num(p.price) > 0));
  const materialsOk = form.materials.every((m) => m.name.trim() && heldAfter(m) >= -1e-9);
  const costsOk = form.costs.every((c) => num(c.amount) > 0);
  const paymentsOk = form.payments.every((p) => num(p.amount) > 0);
  const clientOk = form.clientId !== "__new__" || form.newClientName.trim();
  const canSave = clientOk && productsOk && materialsOk && costsOk && paymentsOk;

  const save = () => {
    if (!canSave) return;
    onSave({
      id: orderId, date: form.date || todayISO(), clientId: form.clientId, title: form.title.trim(), notes: form.notes.trim(),
      commissionMode: mode, commissionScope: form.commissionScope, commissionValue: num(form.commissionValue),
      status: form.delivered ? "delivered" : "open", deliveredDate: form.delivered ? form.deliveredDate || todayISO() : null,
      createdAt: editOrder ? editOrder.createdAt : new Date().toISOString(),
      products: usedProducts.map((p) => ({ id: p.id, name: p.name.trim(), quantity: num(p.quantity), price: num(p.price), commissionValue: num(p.commissionValue) })),
      materials: form.materials.map((m) => ({ id: m.id, name: m.name.trim(), unit: m.unit.trim(), received: num(m.received), used: num(m.used), returned: num(m.returned) })),
      costs: form.costs.map((c) => ({ id: c.id, type: c.type, supplierId: c.supplierId || "", description: c.description.trim(), amount: num(c.amount), paid: num(c.paid) })),
      payments: form.payments.map((p) => ({ id: p.id, date: p.date || todayISO(), dir: p.dir, amount: num(p.amount) })),
    }, form.clientId === "__new__" ? form.newClientName.trim() : null);
  };

  const cell = { padding: "7px 9px", borderRadius: 7, border: `1px solid ${COLORS.border}`, fontSize: 13.5, fontFamily: "inherit", background: "#FCFBF8", color: COLORS.ink, width: "100%", boxSizing: "border-box" };
  const head = { fontSize: 12, color: COLORS.inkSoft, fontWeight: 700, padding: "0 2px 2px" };
  const money = { fontFamily: mono, fontWeight: 700, fontSize: 13.5, textAlign: "end", padding: "8px 2px", whiteSpace: "nowrap" };
  const section = { fontSize: 13.5, fontWeight: 800, margin: "16px 0 2px" };
  const hint = { fontSize: 12, color: COLORS.muted, marginBottom: 8 };
  const xBtn = { background: "none", border: "none", cursor: "pointer", color: COLORS.muted, padding: 4 };
  const addBtn = { padding: "6px 12px", marginTop: 8, fontSize: 13 };
  const toggle = (active) => ({
    padding: "5px 12px", borderRadius: 999, fontSize: 12.5, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
    border: `1px solid ${active ? COLORS.ink : COLORS.border}`, background: active ? COLORS.ink : COLORS.surface, color: active ? "#fff" : COLORS.inkSoft,
  });
  const numInput = (key, l, field, extra) => (
    <input type="number" min="0" step="any" value={l[field]} onChange={(e) => setLine(key, l.id, { [field]: e.target.value })} style={{ ...cell, ...(extra || {}) }} />
  );
  const prodGrid = `minmax(0, 1fr) 84px ${mode === "price_pct" ? "104px " : ""}${perProduct ? "96px " : ""}104px 104px 28px`;
  const valueLabel = isPct ? t.commissionPct : t.commissionPerPiece;

  return (
    <Modal title={(editOrder ? `${t.edit} — ` : "") + t.addOrder} onClose={onClose} onSubmit={save} width={940}>
      <div style={{ display: "grid", gridTemplateColumns: "170px minmax(0, 1fr) minmax(0, 1fr)", gap: 12 }}>
        <Input label={t.date} type="date" value={form.date} onChange={set("date")} />
        <div>
          <Select label={t.client} value={form.clientId} onChange={set("clientId")}>
            {clients.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            <option value="__new__">{t.newParty}</option>
          </Select>
          {form.clientId === "__new__" && <Input label={t.name} value={form.newClientName} autoFocus onChange={set("newClientName")} />}
        </div>
        <Input label={t.orderTitle} value={form.title} onChange={set("title")} placeholder={t.orderTitlePh} />
      </div>

      <div style={{ background: COLORS.bg, borderRadius: 10, padding: "12px 14px" }}>
        <div style={{ fontSize: 13.5, fontWeight: 800, marginBottom: 8 }}>{t.commission}</div>
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.4fr) minmax(0, 1.3fr) 130px", gap: 12, alignItems: "end" }}>
          <Select label={t.commissionOn} value={mode} onChange={set("commissionMode")}>
            {COMMISSION_MODES.map((m) => <option key={m} value={m}>{t["cm_" + m]}</option>)}
          </Select>
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 13, color: COLORS.inkSoft, marginBottom: 6, fontWeight: 600 }}>{t.commissionScope}</div>
            <div style={{ display: "flex", gap: 6 }}>
              <button style={toggle(!perProduct)} onClick={() => setForm({ ...form, commissionScope: "order" })}>{t.scopeOrder}</button>
              <button style={toggle(perProduct)} onClick={() => setForm({ ...form, commissionScope: "product" })}>{t.scopeProduct}</button>
            </div>
          </div>
          {!perProduct && <Input label={valueLabel} type="number" min="0" step="any" value={form.commissionValue} onChange={set("commissionValue")} />}
        </div>
      </div>

      <div style={section}>{t.orderProducts}</div>
      <datalist id="order-products">{catalog.filter((c) => c.type === "product").map((c) => <option key={c.id} value={itemLabel(c)} />)}</datalist>
      <div style={{ display: "grid", gridTemplateColumns: prodGrid, gap: 8, alignItems: "start" }}>
        <div style={head}>{t.productType}</div>
        <div style={head}>{t.pieces}</div>
        {mode === "price_pct" && <div style={head}>{t.pricePerPiece}</div>}
        {perProduct && <div style={head}>{valueLabel}</div>}
        <div style={{ ...head, textAlign: "end" }}>{t.costPerPiece}</div>
        <div style={{ ...head, textAlign: "end" }}>{t.commission}</div>
        <div />
        {form.products.map((p, i) => (
          <React.Fragment key={p.id}>
            <input list="order-products" value={p.name} onChange={(e) => setLine("products", p.id, { name: e.target.value })} style={cell} autoFocus={i === 0 && !editOrder && clients.length > 0} />
            {numInput("products", p, "quantity")}
            {mode === "price_pct" && numInput("products", p, "price")}
            {perProduct && numInput("products", p, "commissionValue")}
            <div style={{ ...money, fontWeight: 500 }}>{calc.lines[i] && calc.lines[i].costPerPiece > 0 ? fmtMoney(calc.lines[i].costPerPiece, lang) : "—"}</div>
            <div style={{ ...money, color: COLORS.in }}>{fmtMoney(calc.lines[i] ? calc.lines[i].commission : 0, lang)}</div>
            <button onClick={() => removeLine("products", p.id)} disabled={form.products.length === 1} title={t.removeItem} style={{ ...xBtn, opacity: form.products.length === 1 ? 0.3 : 1 }}><X size={16} /></button>
          </React.Fragment>
        ))}
      </div>
      <Btn variant="ghost" onClick={() => addLine("products", newProduct)} style={addBtn}><Plus size={15} /> {t.addProduct}</Btn>

      <div style={section}>{t.moneyFromClient}</div>
      <div style={hint}>{t.moneyFromClientHint}</div>
      {form.payments.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "170px minmax(0, 1fr) 150px 28px", gap: 8, alignItems: "center" }}>
          {form.payments.map((p) => (
            <React.Fragment key={p.id}>
              <input type="date" value={p.date} onChange={(e) => setLine("payments", p.id, { date: e.target.value })} style={cell} />
              <select value={p.dir} onChange={(e) => setLine("payments", p.id, { dir: e.target.value })} style={cell}>
                <option value="in">{t.payIn}</option>
                <option value="out">{t.payOut}</option>
              </select>
              {numInput("payments", p, "amount")}
              <button onClick={() => removeLine("payments", p.id)} title={t.removeItem} style={xBtn}><X size={16} /></button>
            </React.Fragment>
          ))}
        </div>
      )}
      <Btn variant="ghost" onClick={() => addLine("payments", newPayment)} style={addBtn}><Plus size={15} /> {t.addPayment}</Btn>

      <div style={section}>{t.fabricFromClient}</div>
      <div style={hint}>{t.fabricFromClientHint}</div>
      {heldBefore.length > 0 && (
        <div style={{ fontSize: 12.5, background: COLORS.accentSoft, borderRadius: 8, padding: "7px 10px", marginBottom: 8 }}>
          {t.alreadyHeld}: {heldBefore.map((r) => `${r.name} ${fmtQty(r.qty, lang)} ${r.unit}`.trim()).join(lang === "ar" ? "، " : ", ")}
        </div>
      )}
      <datalist id="order-held">{heldBefore.map((r) => <option key={r.name} value={r.name} />)}</datalist>
      {form.materials.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 80px 104px 104px 104px 110px 28px", gap: 8, alignItems: "start" }}>
          <div style={head}>{t.materialType}</div>
          <div style={head}>{t.unit}</div>
          <div style={head}>{t.fabricReceived}</div>
          <div style={head}>{t.fabricUsed}</div>
          <div style={head}>{t.fabricReturned}</div>
          <div style={{ ...head, textAlign: "end" }}>{t.fabricKept}</div>
          <div />
          {form.materials.map((m) => {
            const after = heldAfter(m);
            return (
              <React.Fragment key={m.id}>
                <input list="order-held" value={m.name} onChange={(e) => setLine("materials", m.id, { name: e.target.value })} style={cell} />
                <input value={m.unit} onChange={(e) => setLine("materials", m.id, { unit: e.target.value })} style={cell} placeholder={t.unitPlaceholder} />
                {numInput("materials", m, "received")}
                {numInput("materials", m, "used")}
                {numInput("materials", m, "returned")}
                <div style={{ ...money, color: after < -1e-9 ? COLORS.out : COLORS.ink }}>{m.name.trim() ? fmtQty(after, lang) : "—"}</div>
                <button onClick={() => removeLine("materials", m.id)} title={t.removeItem} style={xBtn}><X size={16} /></button>
              </React.Fragment>
            );
          })}
        </div>
      )}
      {!materialsOk && form.materials.some((m) => m.name.trim()) && <div style={{ color: COLORS.out, fontSize: 12.5, marginTop: 6 }}>{t.fabricOverused}</div>}
      <Btn variant="ghost" onClick={() => addLine("materials", newMaterial)} style={addBtn}><Plus size={15} /> {t.addFabric}</Btn>

      <div style={section}>{t.orderCosts}</div>
      <div style={hint}>{t.orderCostsHint}</div>
      {form.costs.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "150px minmax(0, 1fr) minmax(0, 1fr) 112px 112px 28px", gap: 8, alignItems: "start" }}>
          <div style={head}>{t.type}</div>
          <div style={head}>{t.paidTo}</div>
          <div style={head}>{t.description}</div>
          <div style={head}>{t.paymentAmount}</div>
          <div style={head}>{t.paid}</div>
          <div />
          {form.costs.map((c) => (
            <React.Fragment key={c.id}>
              <select value={c.type} onChange={(e) => setLine("costs", c.id, { type: e.target.value })} style={cell}>
                {COST_TYPES.map((k) => <option key={k} value={k}>{t["cost_" + k]}</option>)}
              </select>
              <select value={c.supplierId} onChange={(e) => setLine("costs", c.id, { supplierId: e.target.value })} style={cell}>
                <option value="">{t.paidCash}</option>
                {suppliers.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              <input value={c.description} onChange={(e) => setLine("costs", c.id, { description: e.target.value })} style={cell} />
              {numInput("costs", c, "amount")}
              {c.supplierId ? numInput("costs", c, "paid") : <div style={{ ...money, fontWeight: 500, color: COLORS.muted }}>{fmtMoney(c.amount, lang)}</div>}
              <button onClick={() => removeLine("costs", c.id)} title={t.removeItem} style={xBtn}><X size={16} /></button>
            </React.Fragment>
          ))}
        </div>
      )}
      <Btn variant="ghost" onClick={() => addLine("costs", newCost)} style={addBtn}><Plus size={15} /> {t.addCost}</Btn>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 340px", gap: 16, marginTop: 18, alignItems: "start" }}>
        <div>
          <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 14, fontWeight: 700, marginBottom: 6, cursor: "pointer" }}>
            <input type="checkbox" checked={form.delivered} onChange={(e) => setForm({ ...form, delivered: e.target.checked })} style={{ width: 16, height: 16 }} />
            {t.markDelivered}
          </label>
          <div style={hint}>{t.markDeliveredHint}</div>
          {form.delivered && <div style={{ maxWidth: 190 }}><Input label={t.deliveredDate} type="date" value={form.deliveredDate} onChange={set("deliveredDate")} /></div>}
          <Input label={t.notes} value={form.notes} onChange={set("notes")} />
        </div>
        <div data-settlement="1" style={{ background: COLORS.ink, color: "#fff", borderRadius: 12, padding: "14px 16px", fontSize: 13.5 }}>
          <div style={{ fontWeight: 800, marginBottom: 8 }}>{t.settlement}</div>
          {[[t.orderCost, calc.cost], [t.commission, calc.commission]].map(([label, v]) => (
            <div key={label} style={{ display: "flex", justifyContent: "space-between", padding: "3px 0", color: "#D5D7E3" }}>
              <span>{label}</span><span style={{ fontFamily: mono }}>{fmtMoney(v, lang)}</span>
            </div>
          ))}
          <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderTop: "1px solid rgba(255,255,255,0.2)", marginTop: 4, fontWeight: 800 }}>
            <span>{t.totalDue}</span><span style={{ fontFamily: mono }}>{fmtMoney(calc.due, lang)}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", padding: "3px 0", color: "#D5D7E3" }}>
            <span>{t.receivedFromClient}</span><span style={{ fontFamily: mono }}>{fmtMoney(calc.received, lang)}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderTop: "1px solid rgba(255,255,255,0.2)", marginTop: 4, fontWeight: 800, color: COLORS.accent }}>
            <span>{calc.balance > 0 ? t.clientOwes : calc.balance < 0 ? t.toReturn : t.settled}</span>
            <span style={{ fontFamily: mono }}>{fmtMoney(Math.abs(calc.balance), lang)}</span>
          </div>
          {calc.pieces > 0 && (
            <div style={{ fontSize: 12, color: "#B9BCD0", marginTop: 6 }}>
              {fill(t.perPieceLine, { n: fmtQty(calc.pieces, lang), c: fmtMoney(calc.due / calc.pieces, lang) })}
            </div>
          )}
        </div>
      </div>

      <div style={{ display: "flex", gap: 10, justifyContent: "space-between", alignItems: "center", marginTop: 14 }}>
        <span style={{ fontSize: 11.5, color: COLORS.muted }}><Kbd>Ctrl+Enter</Kbd> {t.save} · <Kbd>Esc</Kbd> {t.cancel}</span>
        <div style={{ display: "flex", gap: 10 }}>
          <Btn variant="ghost" onClick={onClose}>{t.cancel}</Btn>
          <Btn variant="accent" disabled={!canSave} onClick={save}>{t.save}</Btn>
        </div>
      </div>
    </Modal>
  );
}
