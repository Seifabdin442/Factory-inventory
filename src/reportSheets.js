// Builds the sheet definitions for the Excel reports (see xlsx.js for the file writer).
import { txItems } from "./ui.jsx";
import { computeAging, periodTotals } from "./analytics.js";
import { itemLabel, stockStatus } from "./inventory.js";

const byDate = (a, b) => (a.date > b.date ? 1 : a.date < b.date ? -1 : 0);

export function makeReportSheets(ctx) {
  const { t, isRTL, company, parties, partiesWithBalance, transactions, totalReceivable, totalPayable, today, catalog, inv, settings } = ctx;
  const partyName = (id) => { const p = parties.find((pp) => pp.id === id); return p ? p.name : ""; };
  const monthTx = (mk) => transactions.filter((x) => String(x.date).slice(0, 7) === mk);

  const top = (title) => [
    company.configured ? { text: company.name, style: "company" } : null,
    { text: title, style: "title" },
    { text: `${t.generatedOn}: ${today}`, style: "subtitle" },
  ];

  function summary(mk) {
    const s = periodTotals(monthTx(mk), inv);
    return {
      name: t.summaryReport, rtl: isRTL, topLines: top(`${t.summaryReport} — ${mk}`),
      columns: [{ header: t.item, width: 42 }, { header: t.value, type: "money", width: 22 }],
      rows: [
        [t.moneyIn, { v: s.moneyIn, tone: "in" }],
        [t.moneyOut, { v: s.moneyOut, tone: "out" }],
        [t.netCashFlow, { v: s.net, tone: s.net >= 0 ? "in" : "out" }],
        [`${t.totalSales} (${t.invoiced})`, s.sales],
        [`${t.totalPurchases} (${t.invoiced})`, s.purchases],
        [t.cogs, { v: s.cogs, tone: "out" }],
        [t.commissionIncome, { v: s.commission, tone: "in" }],
        [t.expensesTotal, { v: s.expenses, tone: "out" }],
        [`${t.estimatedProfit} (${t.profitHint})`, { v: s.profit, tone: s.profit >= 0 ? "in" : "out" }],
        [`${t.outstandingReceivables} (${t.snapshot})`, { v: totalReceivable, tone: "in" }],
        [`${t.outstandingPayables} (${t.snapshot})`, { v: totalPayable, tone: "out" }],
      ],
    };
  }

  function trade(kind, mk) {
    // Money spent on clients' orders is not part of own purchases.
    const list = monthTx(mk).filter((x) => x.kind === kind && !x.orderId).sort(byDate);
    const title = kind === "sale" ? t.salesReportTitle : t.purchasesReportTitle;
    return {
      name: title, rtl: isRTL, landscape: true, topLines: top(`${title} — ${mk}`), emptyText: t.noData,
      columns: [
        { header: t.date, type: "date", width: 12 },
        { header: kind === "sale" ? t.client : t.supplier, width: 24, wrap: true },
        { header: t.description, width: 38, wrap: true },
        { header: t.quantity, type: "number", width: 10 },
        { header: t.unitPrice, type: "money", width: 16 },
        { header: t.total, type: "money", width: 17 },
        { header: t.paid, type: "money", width: 17 },
        { header: t.remaining, type: "money", width: 17 },
        { header: t.notes, width: 24, wrap: true },
      ],
      rows: list.map((x) => {
        const items = txItems(x);
        const single = items.length <= 1;
        const desc = single ? (x.description || "") : items.map((i) => `${i.description} (${i.quantity} × ${i.unitPrice})`).join("\n");
        const remaining = (x.total || 0) - (x.paid || 0);
        return [x.date, partyName(x.partyId), desc,
          single ? (x.quantity || null) : null, single ? (x.unitPrice || null) : null,
          x.total || 0, { v: x.paid || 0, tone: "in" }, remaining > 0 ? { v: remaining, tone: "out" } : remaining, x.notes || ""];
      }),
      totals: { label: t.total, columns: [5, 6, 7] },
    };
  }

  function expenses(mk) {
    const list = monthTx(mk).filter((x) => x.kind === "expense").sort(byDate);
    return {
      name: t.expensesReport, rtl: isRTL, topLines: top(`${t.expensesReport} — ${mk}`), emptyText: t.noData,
      columns: [
        { header: t.date, type: "date", width: 12 },
        { header: t.category, width: 22 },
        { header: t.description, width: 34, wrap: true },
        { header: t.paymentAmount, type: "money", width: 18 },
        { header: t.notes, width: 26, wrap: true },
      ],
      rows: list.map((x) => [x.date, t["cat_" + (x.category || "other")], x.description || "", { v: x.total || 0, tone: "out" }, x.notes || ""]),
      totals: { label: t.total, columns: [3] },
    };
  }

  function balances() {
    const rows = [...partiesWithBalance]
      .sort((a, b) => Math.abs(b.balance) - Math.abs(a.balance))
      .map((p) => {
        const typeLabel = p.type === "client" ? t.clientType : p.type === "supplier" ? t.supplierType : t.bothType;
        const statusLabel = p.balance > 0 ? t.theyOweYou : p.balance < 0 ? t.youOweThem : t.settled;
        const tone = p.balance > 0 ? "in" : p.balance < 0 ? "out" : null;
        return [p.name, typeLabel, p.phone || "", statusLabel, tone ? { v: Math.abs(p.balance), tone } : 0];
      });
    return {
      name: t.balancesReport, rtl: isRTL, topLines: top(`${t.balancesReport} — ${t.snapshot}`), emptyText: t.noData,
      columns: [
        { header: t.name, width: 28, wrap: true }, { header: t.type, width: 16 }, { header: t.phone, width: 16 },
        { header: t.statusCol, width: 16 }, { header: t.balance, type: "money", width: 20 },
      ],
      rows,
    };
  }

  function aging(side) {
    const { rows } = computeAging(parties, transactions, today, side);
    const title = `${t.agingReport} — ${side === "receivable" ? t.receivables : t.payables}`;
    return {
      name: `${t.agingReport} (${side === "receivable" ? t.receivables : t.payables})`, rtl: isRTL, landscape: true,
      topLines: top(title), emptyText: t.noOpenBalances,
      columns: [
        { header: t.name, width: 28, wrap: true }, { header: t.total, type: "money", width: 17 },
        { header: t.bucket0, type: "money", width: 16 }, { header: t.bucket1, type: "money", width: 16 },
        { header: t.bucket2, type: "money", width: 16 }, { header: t.bucket3, type: "money", width: 16 },
        { header: t.oldestUnpaid, type: "date", width: 14 },
      ],
      rows: rows.map((r) => [r.party.name, r.total, r.buckets[0] || null, r.buckets[1] || null, r.buckets[2] || null,
        r.buckets[3] ? { v: r.buckets[3], tone: "out" } : null, r.oldestDate]),
      totals: { label: t.total, columns: [1, 2, 3, 4, 5] },
    };
  }

  function inventory() {
    const rows = catalog.filter((c) => inv.stock.has(c.id)).map((c) => {
      const s = inv.stock.get(c.id);
      const status = stockStatus(c, s.qty, settings, s.moves.length > 0);
      return [itemLabel(c), c.type === "product" ? t.productType : t.materialType, c.unit || "", s.qty,
        s.avgCost || null, s.value || 0, c.type === "product" && c.salePrice ? c.salePrice : null,
        status === "out" ? t.outOfStock : status === "low" ? t.lowStock : status === "none" ? "" : t.inStock];
    });
    return {
      name: t.inventoryReport, rtl: isRTL, landscape: true, topLines: top(`${t.inventoryReport} — ${t.snapshot}`), emptyText: t.noData,
      columns: [
        { header: t.name, width: 32, wrap: true }, { header: t.type, width: 14 }, { header: t.unit, width: 10 },
        { header: t.stockOnHand, type: "number", width: 13 }, { header: t.avgCost, type: "money", width: 16 },
        { header: t.stockValue, type: "money", width: 18 }, { header: t.salePrice, type: "money", width: 16 },
        { header: t.statusCol, width: 14 },
      ],
      rows,
      totals: { label: t.total, columns: [5] },
    };
  }

  return { summary, trade, expenses, balances, aging, inventory };
}
