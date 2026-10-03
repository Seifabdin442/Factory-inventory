// Stock and product costing (no UI) — easy to test on its own.
//
// Stock is never stored. It is replayed from the entries, oldest first:
//   purchase line      → stock in at (line total ÷ quantity)
//   stock adjustment   → stock in (opening stock, found) or out (waste, correction)
//   production run     → materials out at their average cost, products in at the run's cost per piece
//   sale line          → stock out at the product's average cost (this is the cost of goods sold)
// Each item keeps one weighted-average cost that moves every time stock comes in.

const num = (v) => Number(v) || 0;
const round6 = (n) => Math.round(n * 1e6) / 1e6;

export const isTracked = (c) => !!c && c.trackStock !== 0 && c.trackStock !== false;

// "T-shirt - L - Black"
export const itemLabel = (c) => [c.name, c.size, c.color].map((x) => String(x || "").trim()).filter(Boolean).join(" - ");

export function stockSettings(settings) {
  const s = settings || {};
  const n = (v, d) => (v === "" || v == null || isNaN(Number(v)) ? d : Number(v));
  return { warnMin: n(s.stockWarnMin, 5), block: s.stockBlock !== "0", blockMin: n(s.stockBlockMin, 0) };
}

// The low-stock level for one item: its own minimum if set, otherwise the one from Settings.
export function warnLevel(c, settings) {
  return c && c.minStock != null && c.minStock !== "" && !isNaN(Number(c.minStock)) ? Number(c.minStock) : stockSettings(settings).warnMin;
}

// "out" (nothing left), "low" (at or under the minimum) or "ok".
// An item that has never had any stock is "none": it isn't something to restock yet.
export function stockStatus(c, qty, settings, hasMoves = true) {
  if (!hasMoves) return "none";
  if (qty <= 0) return "out";
  return qty <= warnLevel(c, settings) ? "low" : "ok";
}

// What happens if `qty` is taken from `available`: "block", "warn" or "ok".
export function checkTake(c, available, qty, settings) {
  const st = stockSettings(settings);
  const left = round6(available - qty);
  if (st.block && left < st.blockMin) return { level: "block", left };
  if (left <= warnLevel(c, settings)) return { level: "warn", left };
  return { level: "ok", left };
}

export function computeInventory({ catalog, transactions, productions, adjustments }) {
  const stock = new Map();
  for (const c of catalog || []) if (isTracked(c)) stock.set(c.id, { qty: 0, avgCost: 0, moves: [] });

  const events = [];
  let seq = 0;
  // Transactions arrive newest first; walk them backwards so same-day entries keep their saved order.
  const txs = transactions || [];
  for (let i = txs.length - 1; i >= 0; i--) {
    const tx = txs[i];
    if (tx.kind !== "purchase" && tx.kind !== "sale") continue;
    for (const it of tx.items || []) {
      if (!it.catalogId || !stock.has(it.catalogId) || !(num(it.quantity) > 0)) continue;
      events.push({ date: tx.date, order: tx.kind === "purchase" ? 0 : 3, seq: seq++, type: tx.kind, tx, it });
    }
  }
  const byCreated = (a, b) => String(a.createdAt || "").localeCompare(String(b.createdAt || ""));
  for (const a of [...(adjustments || [])].sort(byCreated)) {
    if (stock.has(a.catalogId) && num(a.quantity) !== 0) events.push({ date: a.date, order: 1, seq: seq++, type: "adjust", adj: a });
  }
  for (const p of [...(productions || [])].sort(byCreated)) events.push({ date: p.date, order: 2, seq: seq++, type: "production", run: p });
  events.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.order - b.order || a.seq - b.seq));

  const move = (id, m) => { const s = stock.get(id); s.moves.push({ ...m, balance: s.qty }); };
  function stockIn(id, qty, unitCost) {
    const s = stock.get(id);
    s.avgCost = s.qty <= 0 ? unitCost : (s.qty * s.avgCost + qty * unitCost) / (s.qty + qty);
    s.qty = round6(s.qty + qty);
  }
  function stockOut(id, qty) {
    const s = stock.get(id);
    s.qty = round6(s.qty - qty);
    return qty * s.avgCost;
  }

  const lineCost = new Map(); // sale line id → cost of the goods on that line
  const txCogs = new Map(); // sale id → cost of goods sold
  const runs = new Map(); // production id → costs

  for (const ev of events) {
    if (ev.type === "purchase") {
      const qty = num(ev.it.quantity);
      const unitCost = num(ev.it.total) / qty;
      stockIn(ev.it.catalogId, qty, unitCost);
      move(ev.it.catalogId, { date: ev.date, type: "purchase", qty, unitCost, refId: ev.tx.id, partyId: ev.tx.partyId });
    } else if (ev.type === "sale") {
      const qty = num(ev.it.quantity);
      const unitCost = stock.get(ev.it.catalogId).avgCost;
      const cost = stockOut(ev.it.catalogId, qty);
      lineCost.set(ev.it.id, cost);
      txCogs.set(ev.tx.id, (txCogs.get(ev.tx.id) || 0) + cost);
      move(ev.it.catalogId, { date: ev.date, type: "sale", qty: -qty, unitCost, refId: ev.tx.id, partyId: ev.tx.partyId });
    } else if (ev.type === "adjust") {
      const a = ev.adj;
      const qty = num(a.quantity);
      const s = stock.get(a.catalogId);
      if (qty > 0) {
        const unitCost = a.unitCost == null || a.unitCost === "" ? s.avgCost : num(a.unitCost);
        stockIn(a.catalogId, qty, unitCost);
        move(a.catalogId, { date: ev.date, type: "adjust", qty, unitCost, refId: a.id, reason: a.reason, notes: a.notes });
      } else {
        const unitCost = s.avgCost;
        stockOut(a.catalogId, -qty);
        move(a.catalogId, { date: ev.date, type: "adjust", qty, unitCost, refId: a.id, reason: a.reason, notes: a.notes });
      }
    } else {
      const run = ev.run;
      const inputs = (run.inputs || []).map((ln) => {
        const qty = num(ln.quantity);
        if (!stock.has(ln.catalogId) || !(qty > 0)) return { unitCost: 0, cost: 0 };
        const unitCost = stock.get(ln.catalogId).avgCost;
        const cost = stockOut(ln.catalogId, qty);
        move(ln.catalogId, { date: ev.date, type: "used", qty: -qty, unitCost, refId: run.id });
        return { unitCost, cost };
      });
      const materials = inputs.reduce((s, x) => s + x.cost, 0);
      const total = materials + num(run.laborCost) + num(run.otherCost);
      // Split the run's cost between its products: by pieces, or by the shares typed in.
      const weight = (ln) => (num(ln.quantity) > 0 ? (run.splitMode === "manual" ? num(ln.share) : num(ln.quantity)) : 0);
      const sumW = (run.outputs || []).reduce((s, ln) => s + weight(ln), 0);
      const outputs = (run.outputs || []).map((ln) => {
        const qty = num(ln.quantity);
        if (!(qty > 0) || !(sumW > 0)) return { unitCost: 0, cost: 0 };
        const cost = (total * weight(ln)) / sumW;
        const unitCost = cost / qty;
        if (stock.has(ln.catalogId)) {
          stockIn(ln.catalogId, qty, unitCost);
          move(ln.catalogId, { date: ev.date, type: "produced", qty, unitCost, refId: run.id });
        }
        return { unitCost, cost };
      });
      const pieces = (run.outputs || []).reduce((s, ln) => s + num(ln.quantity), 0);
      runs.set(run.id, { materials, total, inputs, outputs, pieces });
    }
  }

  for (const s of stock.values()) s.value = Math.max(s.qty, 0) * s.avgCost;
  return { stock, lineCost, txCogs, runs };
}

// Totals for the Inventory page and the dashboard.
export function inventoryTotals(catalog, inv, settings) {
  const out = { materialsValue: 0, productsValue: 0, value: 0, low: [], outOf: [] };
  for (const c of catalog) {
    const s = inv.stock.get(c.id);
    if (!s) continue;
    if (c.type === "product") out.productsValue += s.value; else out.materialsValue += s.value;
    const status = stockStatus(c, s.qty, settings, s.moves.length > 0);
    if (status === "out") out.outOf.push(c); else if (status === "low") out.low.push(c);
  }
  out.value = out.materialsValue + out.productsValue;
  return out;
}

// Stock available to an entry that is being edited: what is on hand now plus what that entry already took.
export function availableFor(inv, catalogId, ownQty = 0) {
  const s = inv.stock.get(catalogId);
  return s ? round6(s.qty + ownQty) : null;
}
