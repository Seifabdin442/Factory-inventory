// Client orders (brokering) — pure calculations, no UI.
//
// The client hands over money and/or fabric, a factory makes the products, and this business keeps a
// commission. The goods and the money spent are the client's: only the commission is income.
//
// Commission is chosen per order:
//   mode  "cost_pct"   percentage of what the order cost (materials bought + making + other costs)
//         "price_pct"  percentage of the products' selling price (price per piece × pieces)
//         "per_piece"  fixed amount for every piece
//   scope "order"      one value for the whole order
//         "product"    each product line has its own value

const num = (v) => Number(v) || 0;
const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

export const COMMISSION_MODES = ["cost_pct", "price_pct", "per_piece"];
export const COST_TYPES = ["material", "making", "other"];

export function orderCalc(o) {
  const products = o.products || [];
  const pieces = products.reduce((s, p) => s + num(p.quantity), 0);
  const cost = round2((o.costs || []).reduce((s, c) => s + num(c.amount), 0));
  const perProduct = o.commissionScope === "product";
  const lines = products.map((p) => {
    const qty = num(p.quantity);
    const lineCost = pieces > 0 ? (cost * qty) / pieces : 0; // costs are shared by number of pieces
    const value = perProduct ? num(p.commissionValue) : num(o.commissionValue);
    const commission = o.commissionMode === "price_pct" ? (qty * num(p.price) * value) / 100
      : o.commissionMode === "per_piece" ? qty * value
        : (lineCost * value) / 100;
    return { cost: lineCost, commission, costPerPiece: qty > 0 ? lineCost / qty : 0, duePerPiece: qty > 0 ? (lineCost + commission) / qty : 0 };
  });
  const commission = round2(lines.reduce((s, l) => s + l.commission, 0));
  const due = round2(cost + commission);
  const received = round2((o.payments || []).reduce((s, p) => s + (p.dir === "out" ? -num(p.amount) : num(p.amount)), 0));
  return {
    pieces, cost, commission, due, received, lines,
    balance: round2(due - received), // > 0: the client still owes this; < 0: this much is to be returned to him
    costPerPiece: pieces > 0 ? cost / pieces : 0,
  };
}

/* The ledger entries of an order. They carry the order's id and are rewritten whenever the order is saved:
 *   money from / back to the client  → payment_in / payment_out on the client
 *   each cost                        → a purchase on the supplier or factory (not part of own purchases or stock)
 *   delivery                         → one "order_charge" on the client for cost + commission
 */
export function orderTransactions(o, labels) {
  const calc = orderCalc(o);
  const name = o.title || labels.order;
  const txs = [];
  for (const p of o.payments || []) {
    const amount = round2(p.amount);
    if (!(amount > 0)) continue;
    txs.push({
      id: `${o.id}-pay-${p.id}`, kind: p.dir === "out" ? "payment_out" : "payment_in", date: p.date || o.date, partyId: o.clientId,
      description: "", quantity: 0, unitPrice: 0, total: amount, paid: amount, notes: `${labels.order}: ${name}`, items: [], orderId: o.id, commission: 0,
    });
  }
  for (const c of o.costs || []) {
    const amount = round2(c.amount);
    if (!(amount > 0)) continue;
    txs.push({
      id: `${o.id}-cost-${c.id}`, kind: "purchase", date: c.date || o.date, partyId: c.supplierId || null,
      description: `${c.description || labels["cost_" + (c.type || "other")]} — ${labels.order}: ${name}`,
      quantity: 1, unitPrice: amount, total: amount,
      // Without a supplier it was paid in cash on the spot.
      paid: c.supplierId ? Math.min(round2(c.paid), amount) : amount,
      notes: "", items: [], orderId: o.id, commission: 0,
    });
  }
  if (o.status === "delivered" && calc.due > 0) {
    txs.push({
      id: `${o.id}-charge`, kind: "order_charge", date: o.deliveredDate || o.date, partyId: o.clientId,
      description: name, quantity: calc.pieces, unitPrice: 0, total: calc.due, paid: 0,
      notes: `${labels.order}: ${name} — ${labels.cost} ${calc.cost} + ${labels.commission} ${calc.commission}`,
      items: [], orderId: o.id, commission: calc.commission,
    });
  }
  return txs;
}

/* Fabric the client handed over is his, so it never enters own stock. Per client and material name:
 *   held = received − used − returned, across all his orders.
 * Anything left after an order simply stays held for his next order unless it is marked as returned. */
export function heldMaterials(orders, exceptOrderId) {
  const byClient = new Map();
  for (const o of orders || []) {
    if (o.id === exceptOrderId) continue;
    for (const m of o.materials || []) {
      const name = String(m.name || "").trim();
      if (!name) continue;
      if (!byClient.has(o.clientId)) byClient.set(o.clientId, new Map());
      const map = byClient.get(o.clientId);
      const key = name.toLowerCase();
      const row = map.get(key) || { name, unit: m.unit || "", qty: 0 };
      row.qty = Math.round((row.qty + num(m.received) - num(m.used) - num(m.returned)) * 1e6) / 1e6;
      if (m.unit) row.unit = m.unit;
      map.set(key, row);
    }
  }
  return byClient;
}

export const heldFor = (held, clientId) => [...(held.get(clientId) || new Map()).values()].filter((r) => Math.abs(r.qty) > 1e-9);
