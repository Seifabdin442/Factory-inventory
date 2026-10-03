// Purchases, sales and expenses: list rows, filtered lists, and the entry forms.
import React, { useState, useMemo } from "react";
import {
  Plus, Trash2, Pencil, ArrowUpCircle, ArrowDownCircle, Receipt, X,
} from "lucide-react";
import {
  COLORS, CHART, EXPENSE_CATEGORIES, uid, todayISO, fmtMoney, txItems, inRange,
  Badge, Btn, Input, Select, Modal, Empty, DateRangeFilter, SearchBox, Kbd,
} from "./ui.jsx";
import { HBarList } from "./charts.jsx";
import { expensesByCategory } from "./analytics.js";
import { fill } from "./i18n.js";
import { itemLabel, checkTake, availableFor } from "./inventory.js";
import { fmtQty } from "./stock.jsx";

const mono = "'JetBrains Mono', monospace";
const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

export function kindLabel(t, kind) {
  return { purchase: t.purchases, sale: t.sales, payment_in: t.paymentIn, payment_out: t.paymentOut, expense: t.expense, order_charge: t.orderCharge }[kind];
}

/* ---------- one row in any list ---------- */
export function TxRow({ tx, lang, t, last, partyName, onDelete, onEdit }) {
  const isCharge = tx.kind === "order_charge";
  const isIn = tx.kind === "sale" || tx.kind === "payment_in" || isCharge;
  const isExpense = tx.kind === "expense";
  const isTrade = tx.kind === "sale" || tx.kind === "purchase";
  const Icon = isExpense ? Receipt : isIn ? ArrowUpCircle : ArrowDownCircle;
  const color = isIn ? COLORS.in : COLORS.out;
  const label = tx.orderId && tx.kind === "payment_out" ? t.refundToClient : kindLabel(t, tx.kind);
  const itemCount = tx.items ? tx.items.length : 0;
  const head = isExpense ? t["cat_" + (tx.category || "other")] : (partyName || label);
  const amount = isTrade || isCharge ? tx.total : tx.paid;
  const remaining = isTrade ? round2((tx.total || 0) - (tx.paid || 0)) : 0;

  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 12, padding: "12px 16px",
      borderBottom: last ? "none" : `1px solid ${COLORS.border}`,
    }}>
      <Icon size={18} color={color} style={{ flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13.5, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {head} {tx.description ? `— ${tx.description}` : tx.orderId && tx.notes ? `— ${tx.notes}` : ""}
        </div>
        <div style={{ fontSize: 12, color: COLORS.muted, display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
          <span>{tx.date} · {label}</span>
          {itemCount > 1 && <Badge color={COLORS.inkSoft} bg={COLORS.bg}>{itemCount} {t.itemsCount}</Badge>}
        </div>
      </div>
      <div style={{ textAlign: "end" }}>
        <div style={{ fontFamily: mono, fontWeight: 700, fontSize: 13.5, color, whiteSpace: "nowrap" }}>
          {isIn ? "+" : "−"}{fmtMoney(amount, lang)}
        </div>
        {remaining > 0 && (
          <div style={{ fontSize: 11.5, color: COLORS.muted, whiteSpace: "nowrap" }}>
            {t.remaining}: <span style={{ fontFamily: mono }}>{fmtMoney(remaining, lang)}</span>
          </div>
        )}
      </div>
      {onEdit && (
        <button onClick={() => onEdit(tx)} title={t.edit} style={{ background: "none", border: "none", cursor: "pointer", color: COLORS.muted }}>
          <Pencil size={15} />
        </button>
      )}
      {onDelete && (
        <button onClick={() => onDelete(tx.id)} title={t.delete} style={{ background: "none", border: "none", cursor: "pointer", color: COLORS.muted }}>
          <Trash2 size={15} />
        </button>
      )}
    </div>
  );
}

function SummaryStrip({ items }) {
  return (
    <div style={{
      display: "flex", gap: 22, flexWrap: "wrap", padding: "10px 16px", marginBottom: 12,
      background: COLORS.surface, border: `1px solid ${COLORS.border}`, borderRadius: 10, fontSize: 12.5,
    }}>
      {items.map((it) => (
        <div key={it.label}>
          <span style={{ color: COLORS.muted }}>{it.label}: </span>
          <b style={{ fontFamily: mono, color: it.color || COLORS.ink }}>{it.value}</b>
        </div>
      ))}
    </div>
  );
}

/* ---------- purchases / sales list with date + text filters ---------- */
export function TxList({ t, lang, kind, transactions, parties, onAdd, onDelete, onEdit, search, setSearch, range, setRange }) {
  const partyName = (id) => { const p = parties.find((pp) => pp.id === id); return p ? p.name : ""; };
  const q = search.trim().toLowerCase();
  const filtered = transactions.filter((x) => {
    if (!inRange(x.date, range)) return false;
    if (!q) return true;
    const hay = `${partyName(x.partyId)} ${x.description} ${x.notes || ""} ${(x.items || []).map((i) => i.description).join(" ")}`.toLowerCase();
    return hay.includes(q);
  });
  const total = filtered.reduce((s, x) => s + (x.total || 0), 0);
  const paid = filtered.reduce((s, x) => s + (x.paid || 0), 0);
  const label = kind === "purchase" ? t.purchases : t.sales;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, flexWrap: "wrap", gap: 10 }}>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800 }}>{label}</h2>
        <Btn variant="accent" onClick={onAdd} title="Ctrl+N"><Plus size={16} /> {kind === "purchase" ? t.addPurchase : t.addSale}</Btn>
      </div>
      <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", marginBottom: 12 }}>
        <SearchBox value={search} onChange={setSearch} placeholder={t.search} />
        <DateRangeFilter t={t} value={range} onChange={setRange} />
      </div>
      <SummaryStrip items={[
        { label: t.entriesCount, value: filtered.length },
        { label: t.total, value: fmtMoney(total, lang) },
        { label: t.paid, value: fmtMoney(paid, lang), color: kind === "sale" ? COLORS.in : COLORS.out },
        { label: t.remaining, value: fmtMoney(total - paid, lang) },
      ]} />
      {filtered.length === 0 ? <Empty t={t} /> : (
        <div style={{ background: COLORS.surface, border: `1px solid ${COLORS.border}`, borderRadius: 12, overflow: "hidden" }}>
          {filtered.map((x, i) => (
            <TxRow key={x.id} tx={x} lang={lang} t={t} last={i === filtered.length - 1}
              partyName={partyName(x.partyId)} onDelete={onDelete} onEdit={onEdit} />
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------- purchase / sale form with several line items ---------- */
// `total` holds the amount when the user types the line total instead of a unit price (usual for fabric).
const emptyLine = () => ({ id: uid(), catalogId: null, description: "", quantity: 1, unitPrice: "", total: null, unit: "", fromCatalog: false });
const lineTotal = (it) => (it.total != null && it.total !== "" ? round2(it.total) : round2((Number(it.quantity) || 0) * (Number(it.unitPrice) || 0)));
const round4 = (n) => Math.round((Number(n) || 0) * 10000) / 10000;

export function TxModal({ t, lang, kind, parties, catalog, inv, settings, editTx, onClose, onSave }) {
  const relevantParties = parties.filter((p) => (kind === "purchase" ? p.type !== "client" : p.type !== "supplier"));
  const catalogByName = useMemo(() => {
    const m = new Map();
    for (const c of catalog) m.set(itemLabel(c).toLowerCase(), c);
    return m;
  }, [catalog]);
  const catalogById = useMemo(() => new Map(catalog.map((c) => [c.id, c])), [catalog]);
  const defaultPrice = (c) => Number(kind === "sale" ? c.salePrice : c.purchasePrice) || 0;

  const [form, setForm] = useState(() => ({
    date: editTx ? editTx.date : todayISO(),
    partyId: editTx ? editTx.partyId : (relevantParties[0]?.id || "__new__"),
    newPartyName: "",
    paid: editTx ? editTx.paid : "",
    notes: editTx ? editTx.notes || "" : "",
    items: editTx
      ? txItems(editTx).map((it) => ({
        id: it.id || uid(), catalogId: it.catalogId || null, description: it.description || "",
        quantity: it.quantity, unitPrice: it.unitPrice,
        // Keep a saved total that isn't exactly quantity × price (it was typed as a total).
        total: Math.abs(round2(it.quantity * it.unitPrice) - round2(it.total)) > 0.005 ? it.total : null,
        unit: (it.catalogId && catalogById.get(it.catalogId)?.unit) || "", fromCatalog: false,
      }))
      : [emptyLine()],
  }));

  const setItem = (id, patch) => setForm((f) => ({ ...f, items: f.items.map((it) => (it.id === id ? { ...it, ...patch } : it)) }));

  function onDescription(it, value) {
    const c = catalogByName.get(value.trim().toLowerCase());
    if (c) {
      const price = defaultPrice(c);
      const usePrice = price > 0 && (it.unitPrice === "" || it.unitPrice === 0 || it.fromCatalog);
      setItem(it.id, {
        description: value, catalogId: c.id, unit: c.unit || "",
        ...(usePrice ? { unitPrice: price, total: null, fromCatalog: true } : {}),
      });
    } else {
      setItem(it.id, { description: value, catalogId: null, unit: "" });
    }
  }

  function addLine(focus = true) {
    const line = emptyLine();
    setForm((f) => ({ ...f, items: [...f.items, line] }));
    if (focus) setTimeout(() => { const el = document.querySelector(`[data-line-desc="${line.id}"]`); if (el) el.focus(); }, 30);
  }
  const removeLine = (id) => setForm((f) => ({ ...f, items: f.items.length > 1 ? f.items.filter((it) => it.id !== id) : f.items }));

  // Typing a line total works out the unit price; typing a price or quantity works out the total.
  function onTotal(it, value) {
    const q = Number(it.quantity) || 0;
    setItem(it.id, { total: value, unitPrice: value !== "" && q > 0 ? round4(Number(value) / q) : it.unitPrice, fromCatalog: false });
  }
  function onQuantity(it, value) {
    const q = Number(value) || 0;
    // rawTotal is only set when the total was typed by hand; then the total stays and the price follows.
    const typed = it.rawTotal != null && it.rawTotal !== "";
    setItem(it.id, typed && q > 0 ? { quantity: value, unitPrice: round4(Number(it.rawTotal) / q) } : { quantity: value });
  }

  const lines = form.items.map((it) => ({ ...it, rawTotal: it.total, total: lineTotal(it) }));
  const used = lines.filter((it) => it.description.trim() || Number(it.unitPrice) > 0);
  const valid = used.filter((it) => Number(it.quantity) > 0 && Number(it.unitPrice) > 0);
  const total = round2(valid.reduce((s, it) => s + it.total, 0));
  const itemsOk = used.length > 0 && valid.length === used.length;
  const partyOk = form.partyId !== "__new__" || form.newPartyName.trim();

  // Sales take products out of stock: warn when it runs low, block when there isn't enough.
  const stockChecks = new Map();
  if (kind === "sale" && inv) {
    const wanted = new Map();
    for (const it of lines) if (it.catalogId && inv.stock.has(it.catalogId)) wanted.set(it.catalogId, (wanted.get(it.catalogId) || 0) + (Number(it.quantity) || 0));
    const own = new Map();
    if (editTx) for (const it of editTx.items || []) if (it.catalogId) own.set(it.catalogId, (own.get(it.catalogId) || 0) + (Number(it.quantity) || 0));
    for (const [id, qty] of wanted) {
      const available = availableFor(inv, id, own.get(id) || 0);
      stockChecks.set(id, { available, ...checkTake(catalogById.get(id), available, qty, settings) });
    }
  }
  const stockBlocked = [...stockChecks.values()].some((c) => c.level === "block");
  const canSave = partyOk && itemsOk && !stockBlocked;
  const remaining = round2(total - (Number(form.paid) || 0));

  const save = () => {
    if (!canSave) return;
    onSave({
      ...form,
      items: valid.map((it) => ({
        id: it.id, catalogId: it.catalogId, description: it.description.trim(),
        quantity: Number(it.quantity), unitPrice: Number(it.unitPrice), total: it.total,
      })),
    });
  };

  const cell = { padding: "7px 9px", borderRadius: 7, border: `1px solid ${COLORS.border}`, fontSize: 13.5, fontFamily: "inherit", background: "#FCFBF8", color: COLORS.ink, width: "100%", boxSizing: "border-box" };
  const headCell = { fontSize: 12, color: COLORS.inkSoft, fontWeight: 700, padding: "0 2px 4px" };
  const grid = "minmax(0, 1fr) 96px 112px 128px 28px";

  return (
    <Modal title={(editTx ? `${t.edit} — ` : "") + (kind === "purchase" ? t.addPurchase : t.addSale)} onClose={onClose} onSubmit={save} width={820}>
      <div style={{ display: "grid", gridTemplateColumns: "180px minmax(0, 1fr)", gap: 12 }}>
        <Input label={t.date} type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
        <div>
          <Select label={kind === "purchase" ? t.supplier : t.client} value={form.partyId}
            onChange={(e) => setForm({ ...form, partyId: e.target.value })}>
            {relevantParties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            <option value="__new__">{t.newParty}</option>
          </Select>
          {form.partyId === "__new__" && (
            <Input label={t.name} value={form.newPartyName} autoFocus onChange={(e) => setForm({ ...form, newPartyName: e.target.value })} />
          )}
        </div>
      </div>

      <div style={{ fontSize: 13.5, fontWeight: 800, margin: "4px 0 8px" }}>{t.items}</div>
      <datalist id="catalog-list">
        {(kind === "sale" ? [...catalog].sort((a, b) => (a.type === "product" ? 0 : 1) - (b.type === "product" ? 0 : 1)) : catalog).map((c) => {
          const s = inv && inv.stock.get(c.id);
          return <option key={c.id} value={itemLabel(c)}>{s ? `${t.stockOnHand}: ${fmtQty(s.qty, lang)} ${c.unit || ""}` : c.unit || ""}</option>;
        })}
      </datalist>
      <div style={{ display: "grid", gridTemplateColumns: grid, gap: 8, alignItems: "start" }}>
        <div style={headCell}>{t.itemName}</div>
        <div style={headCell}>{t.quantity}</div>
        <div style={headCell}>{t.unitPrice}</div>
        <div style={headCell}>{t.lineTotal}</div>
        <div />
        {lines.map((it, idx) => {
          const bad = (it.description.trim() || Number(it.unitPrice) > 0) && !(Number(it.quantity) > 0 && Number(it.unitPrice) > 0);
          const chk = stockChecks.get(it.catalogId);
          return (
            <React.Fragment key={it.id}>
              <div style={{ position: "relative" }}>
                <input data-line-desc={it.id} list="catalog-list" value={it.description} placeholder={t.pickFromCatalog}
                  onChange={(e) => onDescription(it, e.target.value)} style={cell} autoFocus={idx === 0 && !editTx} />
                {it.catalogId && (
                  <span style={{ position: "absolute", insetInlineEnd: 8, top: 9, fontSize: 10.5, color: COLORS.in, fontWeight: 700 }}>●</span>
                )}
                {chk && (
                  <div data-stock-check={chk.level} style={{ fontSize: 11.5, marginTop: 3, fontWeight: chk.level === "ok" ? 500 : 700,
                    color: chk.level === "block" ? COLORS.out : chk.level === "warn" ? "#8A5A00" : COLORS.muted }}>
                    {fill(chk.level === "block" ? t.notEnoughStock : chk.level === "warn" ? t.stockLowAfter : t.stockLeftAfter,
                      { n: `${fmtQty(chk.level === "block" ? chk.available : chk.left, lang)} ${it.unit || ""}`.trim() })}
                  </div>
                )}
              </div>
              <div style={{ position: "relative" }}>
                <input type="number" min="0" step="any" value={it.quantity} onChange={(e) => onQuantity(it, e.target.value)}
                  style={{ ...cell, paddingInlineEnd: it.unit ? 38 : 9, borderColor: chk && chk.level === "block" ? COLORS.out : COLORS.border }} />
                {it.unit && <span style={{ position: "absolute", insetInlineEnd: 8, top: 9, fontSize: 11, color: COLORS.muted }}>{it.unit}</span>}
              </div>
              <input type="number" min="0" step="any" value={it.unitPrice}
                onChange={(e) => setItem(it.id, { unitPrice: e.target.value, total: null, fromCatalog: false })}
                style={{ ...cell, borderColor: bad ? COLORS.out : COLORS.border }} />
              <input type="number" min="0" step="any" data-line-total={it.id} value={it.rawTotal != null ? it.rawTotal : (it.total || "")}
                onChange={(e) => onTotal(it, e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.ctrlKey && idx === lines.length - 1) { e.preventDefault(); addLine(); } }}
                style={{ ...cell, fontFamily: mono, fontWeight: 700, borderColor: bad ? COLORS.out : COLORS.border }} />
              <button onClick={() => removeLine(it.id)} disabled={lines.length === 1} title={t.removeItem}
                style={{ background: "none", border: "none", cursor: lines.length === 1 ? "default" : "pointer", color: lines.length === 1 ? COLORS.border : COLORS.muted, padding: 4 }}>
                <X size={16} />
              </button>
            </React.Fragment>
          );
        })}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 10, gap: 10, flexWrap: "wrap" }}>
        <Btn variant="ghost" onClick={() => addLine()} style={{ padding: "7px 12px" }}><Plus size={15} /> {t.addItem}</Btn>
        <div style={{ fontSize: 14 }}>
          {t.grandTotal}: <b style={{ fontFamily: mono, fontSize: 17 }}>{fmtMoney(total, lang)}</b>
        </div>
      </div>
      {!itemsOk && used.length > 0 && <div style={{ color: COLORS.out, fontSize: 12.5, marginTop: 6 }}>{t.atLeastOneItem}</div>}
      {kind === "purchase" && <div style={{ color: COLORS.muted, fontSize: 12, marginTop: 6 }}>{t.totalEntryHint}</div>}
      {stockBlocked && <div style={{ color: COLORS.out, fontSize: 12.5, marginTop: 6, fontWeight: 700 }}>{t.stockBlockedHint}</div>}

      <div style={{ height: 1, background: COLORS.border, margin: "16px 0" }} />
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1.4fr)", gap: 12, alignItems: "end" }}>
        <div>
          <Input label={t.paid} type="number" min="0" step="any" value={form.paid} onChange={(e) => setForm({ ...form, paid: e.target.value })} />
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 12, flexWrap: "wrap" }}>
          <Btn variant="ghost" onClick={() => setForm({ ...form, paid: total })} style={{ padding: "7px 12px" }} disabled={!total}>{t.paidInFull}</Btn>
          <span style={{ fontSize: 13, color: COLORS.inkSoft }}>
            {t.remaining}: <b style={{ fontFamily: mono, color: remaining > 0 ? COLORS.out : COLORS.ink }}>{fmtMoney(remaining, lang)}</b>
          </span>
        </div>
      </div>
      <Input label={t.notes} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
      <div style={{ display: "flex", gap: 10, justifyContent: "space-between", alignItems: "center", marginTop: 8 }}>
        <span style={{ fontSize: 11.5, color: COLORS.muted }}><Kbd>Ctrl+Enter</Kbd> {t.save} · <Kbd>Esc</Kbd> {t.cancel}</span>
        <div style={{ display: "flex", gap: 10 }}>
          <Btn variant="ghost" onClick={onClose}>{t.cancel}</Btn>
          <Btn variant="accent" disabled={!canSave} onClick={save}>{t.save}</Btn>
        </div>
      </div>
    </Modal>
  );
}

/* ---------- expenses ---------- */
export function ExpensesView({ t, lang, transactions, onAdd, onEdit, onDelete, range, setRange, search, setSearch }) {
  const [category, setCategory] = useState("");
  const q = search.trim().toLowerCase();
  const inPeriod = transactions.filter((x) => x.kind === "expense" && inRange(x.date, range));
  const filtered = inPeriod.filter((x) =>
    (!category || (x.category || "other") === category) &&
    (!q || `${x.description} ${x.notes || ""} ${t["cat_" + (x.category || "other")]}`.toLowerCase().includes(q)));
  const total = filtered.reduce((s, x) => s + (x.total || 0), 0);
  const byCat = expensesByCategory(inPeriod);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, flexWrap: "wrap", gap: 10 }}>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800 }}>{t.expenses}</h2>
        <Btn variant="accent" onClick={onAdd} title="Ctrl+N"><Plus size={16} /> {t.addExpense}</Btn>
      </div>
      <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", marginBottom: 12 }}>
        <SearchBox value={search} onChange={setSearch} placeholder={t.search} />
        <select value={category} onChange={(e) => setCategory(e.target.value)} aria-label={t.category}
          style={{ padding: "8px 10px", borderRadius: 8, border: `1px solid ${COLORS.border}`, fontSize: 13, fontFamily: "inherit", background: COLORS.surface }}>
          <option value="">{t.allCategories}</option>
          {EXPENSE_CATEGORIES.map((c) => <option key={c} value={c}>{t["cat_" + c]}</option>)}
        </select>
        <DateRangeFilter t={t} value={range} onChange={setRange} />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.6fr) minmax(240px, 1fr)", gap: 16, alignItems: "start" }}>
        <div>
          <SummaryStrip items={[
            { label: t.entriesCount, value: filtered.length },
            { label: t.expensesTotal, value: fmtMoney(total, lang), color: COLORS.out },
          ]} />
          {filtered.length === 0 ? <Empty t={t} /> : (
            <div style={{ background: COLORS.surface, border: `1px solid ${COLORS.border}`, borderRadius: 12, overflow: "hidden" }}>
              {filtered.map((x, i) => (
                <TxRow key={x.id} tx={x} lang={lang} t={t} last={i === filtered.length - 1} onDelete={onDelete} onEdit={onEdit} />
              ))}
            </div>
          )}
        </div>
        <div style={{ background: COLORS.surface, border: `1px solid ${COLORS.border}`, borderRadius: 12, padding: 16 }}>
          <div style={{ fontWeight: 800, fontSize: 14.5, marginBottom: 12 }}>{t.byCategory}</div>
          <HBarList lang={lang} color={CHART.out} emptyText={t.noData}
            rows={byCat.map((c) => ({ key: c.category, label: t["cat_" + c.category], value: c.total }))}
            onClick={(r) => setCategory(category === r.key ? "" : r.key)} />
        </div>
      </div>
    </div>
  );
}

export function ExpenseModal({ t, lang, editTx, onClose, onSave }) {
  const [form, setForm] = useState(() => ({
    date: editTx ? editTx.date : todayISO(),
    category: editTx ? editTx.category || "other" : "rent",
    amount: editTx ? editTx.total : "",
    description: editTx ? editTx.description || "" : "",
    notes: editTx ? editTx.notes || "" : "",
  }));
  const canSave = Number(form.amount) > 0;
  const save = () => { if (canSave) onSave(form); };
  return (
    <Modal title={(editTx ? `${t.edit} — ` : "") + t.addExpense} onClose={onClose} onSubmit={save}>
      <Input label={t.date} type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
      <Select label={t.category} value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
        {EXPENSE_CATEGORIES.map((c) => <option key={c} value={c}>{t["cat_" + c]}</option>)}
      </Select>
      <Input label={t.paymentAmount} type="number" min="0" step="any" value={form.amount} autoFocus
        onChange={(e) => setForm({ ...form, amount: e.target.value })} />
      <Input label={t.description} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
      <Input label={t.notes} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
      <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 8 }}>
        <Btn variant="ghost" onClick={onClose}>{t.cancel}</Btn>
        <Btn variant="accent" disabled={!canSave} onClick={save}>{t.save}</Btn>
      </div>
    </Modal>
  );
}
