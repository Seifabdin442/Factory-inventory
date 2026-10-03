// Pure calculations (no UI) — easy to test on their own.
import { balanceImpact } from "./ui.jsx";

const DAY = 86400000;
const toUTC = (iso) => {
  const [y, m, d] = String(iso).slice(0, 10).split("-").map(Number);
  return Date.UTC(y, (m || 1) - 1, d || 1);
};
export const daysBetween = (fromIso, toIso) => Math.max(0, Math.round((toUTC(toIso) - toUTC(fromIso)) / DAY));

export const AGING_BUCKETS = [30, 60, 90]; // 0–30, 31–60, 61–90, 90+
const bucketOf = (days) => (days <= 30 ? 0 : days <= 60 ? 1 : days <= 90 ? 2 : 3);

/*
 * Aging of open balances.
 * Assumes payments settle the OLDEST debts first (standard FIFO), so whatever is still
 * outstanding is made up of the MOST RECENT unpaid entries. We walk a party's entries
 * newest → oldest until the open balance is fully explained, and age each piece.
 *
 * side: "receivable" (they owe you) or "payable" (you owe them)
 */
export function computeAging(parties, transactions, today, side = "receivable") {
  const sign = side === "receivable" ? 1 : -1;
  const byParty = new Map();
  for (const tx of transactions) {
    if (!tx.partyId) continue;
    if (!byParty.has(tx.partyId)) byParty.set(tx.partyId, []);
    byParty.get(tx.partyId).push(tx);
  }
  const rows = [];
  for (const p of parties) {
    const list = byParty.get(p.id) || [];
    const balance = list.reduce((s, x) => s + balanceImpact(x), 0) * sign;
    if (balance <= 0.005) continue;
    const debts = list
      .map((x) => ({ date: x.date, amount: balanceImpact(x) * sign }))
      .filter((x) => x.amount > 0)
      .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
    const buckets = [0, 0, 0, 0];
    let remaining = balance;
    let oldest = null;
    for (const d of debts) {
      if (remaining <= 0.005) break;
      const take = Math.min(remaining, d.amount);
      buckets[bucketOf(daysBetween(d.date, today))] += take;
      remaining -= take;
      oldest = d.date;
    }
    if (remaining > 0.005) buckets[3] += remaining; // e.g. hand-edited data with no matching entry
    rows.push({
      party: p, total: balance, buckets, oldestDate: oldest,
      oldestDays: oldest ? daysBetween(oldest, today) : null,
    });
  }
  // Most overdue first, then biggest.
  rows.sort((a, b) => b.buckets[3] - a.buckets[3] || (b.oldestDays || 0) - (a.oldestDays || 0) || b.total - a.total);
  const totals = rows.reduce((acc, r) => {
    r.buckets.forEach((v, i) => { acc.buckets[i] += v; });
    acc.total += r.total;
    return acc;
  }, { total: 0, buckets: [0, 0, 0, 0] });
  return { rows, totals };
}

export const isMoneyIn = (x) => x.kind === "sale" || x.kind === "payment_in";
export const isMoneyOut = (x) => x.kind === "purchase" || x.kind === "payment_out" || x.kind === "expense";

/*
 * Profit uses the real cost of what was sold (from the inventory replay), not what was bought:
 *   sales − cost of goods sold − purchases that don't go into stock − expenses + commission on client orders
 * Fabric bought this month but still on the shelf is stock, not a loss.
 * Money spent on a client's order (entries with an orderId) is his, so it is left out of own purchases;
 * only the commission charged when the order is delivered counts as income.
 */
export function periodTotals(list, inv) {
  const sum = (f) => list.filter(f).reduce((s, x) => s + (Number(x.paid) || 0), 0);
  const sumTotal = (kind) => list.filter((x) => x.kind === kind).reduce((s, x) => s + (Number(x.total) || 0), 0);
  const moneyIn = sum(isMoneyIn);
  const moneyOut = sum(isMoneyOut);
  const sales = sumTotal("sale");
  const purchases = list.filter((x) => x.kind === "purchase" && !x.orderId).reduce((s, x) => s + (Number(x.total) || 0), 0);
  const commission = list.filter((x) => x.kind === "order_charge").reduce((s, x) => s + (Number(x.commission) || 0), 0);
  const expenses = sumTotal("expense");
  let cogs = 0;
  let stockPurchases = 0;
  if (inv) {
    for (const x of list) {
      if (x.kind === "sale") cogs += inv.txCogs.get(x.id) || 0;
      else if (x.kind === "purchase" && !x.orderId) {
        for (const it of x.items || []) if (it.catalogId && inv.stock.has(it.catalogId)) stockPurchases += Number(it.total) || 0;
      }
    }
  }
  const otherPurchases = purchases - stockPurchases;
  return {
    moneyIn, moneyOut, net: moneyIn - moneyOut, sales, purchases, expenses, cogs, stockPurchases, otherPurchases, commission,
    profit: sales - cogs - otherPurchases - expenses + commission,
  };
}

// Last `count` months ending at `endMonth` ("YYYY-MM"), oldest first.
export function monthlySeries(transactions, endMonth, count = 12) {
  const [ey, em] = endMonth.split("-").map(Number);
  const months = [];
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(ey, em - 1 - i, 1);
    months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }
  const map = new Map(months.map((k) => [k, { month: k, moneyIn: 0, moneyOut: 0 }]));
  for (const x of transactions) {
    const row = map.get(String(x.date).slice(0, 7));
    if (!row) continue;
    if (isMoneyIn(x)) row.moneyIn += Number(x.paid) || 0;
    else if (isMoneyOut(x)) row.moneyOut += Number(x.paid) || 0;
  }
  return months.map((k) => map.get(k));
}

export function expensesByCategory(list) {
  const map = new Map();
  for (const x of list) {
    if (x.kind !== "expense") continue;
    const k = x.category || "other";
    map.set(k, (map.get(k) || 0) + (Number(x.total) || 0));
  }
  return [...map.entries()].map(([category, total]) => ({ category, total })).sort((a, b) => b.total - a.total);
}
