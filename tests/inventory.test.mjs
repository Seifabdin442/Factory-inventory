import assert from "node:assert/strict";
import { computeInventory, checkTake, stockStatus, inventoryTotals } from "../src/inventory.js";
import { periodTotals } from "../src/analytics.js";
import { orderCalc, orderTransactions, heldMaterials, heldFor } from "../src/orders.js";
import { balanceImpact } from "../src/ui.jsx";

const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-6, `${msg}: got ${a}, expected ${b}`);

const catalog = [
  { id: "cotton", name: "Cotton", type: "material", unit: "m", trackStock: 1 },
  { id: "zip", name: "Zipper", type: "material", trackStock: 1 },
  { id: "tsL", name: "T-shirt", size: "L", color: "Black", type: "product", salePrice: 150, trackStock: 1 },
  { id: "pants", name: "Sweatpants", type: "product", trackStock: 1 },
  { id: "svc", name: "Service", type: "product", trackStock: 0 },
];
// newest first, like the app
const transactions = [
  { id: "s1", kind: "sale", date: "2026-10-05", total: 3000, paid: 3000, items: [{ id: "s1a", catalogId: "tsL", quantity: 20, unitPrice: 150, total: 3000 }] },
  { id: "p3", kind: "purchase", date: "2026-10-02", total: 500, paid: 500, items: [{ id: "p3a", catalogId: null, description: "thread", quantity: 1, unitPrice: 500, total: 500 }] },
  { id: "p2", kind: "purchase", date: "2026-10-01", total: 300, paid: 300, items: [{ id: "p2a", catalogId: "zip", quantity: 100, unitPrice: 3, total: 300 }] },
  { id: "p1", kind: "purchase", date: "2026-10-01", total: 10000, paid: 10000, items: [{ id: "p1a", catalogId: "cotton", quantity: 200, unitPrice: 50, total: 10000 }] },
  { id: "e1", kind: "expense", date: "2026-10-03", total: 400, paid: 400, items: [] },
];
const run1 = {
  id: "r1", date: "2026-10-03", laborCost: 1200, otherCost: 0, splitMode: "quantity", createdAt: "a",
  inputs: [{ id: "i1", catalogId: "cotton", quantity: 150 }, { id: "i2", catalogId: "zip", quantity: 100 }],
  outputs: [{ id: "o1", catalogId: "tsL", quantity: 100 }],
};

let inv = computeInventory({ catalog, transactions, productions: [run1], adjustments: [] });
near(inv.runs.get("r1").materials, 7800, "materials cost");
near(inv.runs.get("r1").total, 9000, "run total");
near(inv.runs.get("r1").outputs[0].unitCost, 90, "cost per piece");
near(inv.stock.get("cotton").qty, 50, "cotton left");
near(inv.stock.get("zip").qty, 0, "zips left");
near(inv.stock.get("tsL").qty, 80, "t-shirts left after sale");
near(inv.txCogs.get("s1"), 1800, "cogs of the sale");
near(inv.stock.get("tsL").value, 7200, "t-shirt stock value");
assert.equal(inv.stock.has("svc"), false, "untracked item has no stock");

// profit = 3000 sales − 1800 cogs − 500 non-stock purchase − 400 expenses
const totals = periodTotals(transactions, inv);
near(totals.profit, 300, "profit");
near(totals.cogs, 1800, "cogs");
near(totals.otherPurchases, 500, "non-stock purchases");

// weighted average: 50 m left at 50, buy 50 m for 3500 total (70 each) → 60 average
const more = [{ id: "p4", kind: "purchase", date: "2026-10-06", total: 3500, paid: 0, items: [{ id: "p4a", catalogId: "cotton", quantity: 50, unitPrice: 70, total: 3500 }] }, ...transactions];
inv = computeInventory({ catalog, transactions: more, productions: [run1], adjustments: [] });
near(inv.stock.get("cotton").avgCost, 60, "weighted average");
near(inv.stock.get("cotton").qty, 100, "cotton qty");

// two products, split by pieces and by manual shares
const run2 = {
  id: "r2", date: "2026-10-07", laborCost: 1000, otherCost: 0, splitMode: "quantity", createdAt: "b",
  inputs: [{ id: "i3", catalogId: "cotton", quantity: 100 }],
  outputs: [{ id: "o2", catalogId: "tsL", quantity: 30 }, { id: "o3", catalogId: "pants", quantity: 20 }],
};
inv = computeInventory({ catalog, transactions: more, productions: [run1, run2], adjustments: [] });
near(inv.runs.get("r2").total, 7000, "run 2 total");
near(inv.runs.get("r2").outputs[0].unitCost, 140, "by pieces: t-shirt");
near(inv.runs.get("r2").outputs[1].unitCost, 140, "by pieces: pants");
const run2m = { ...run2, splitMode: "manual", outputs: [{ ...run2.outputs[0], share: 30 }, { ...run2.outputs[1], share: 70 }] };
inv = computeInventory({ catalog, transactions: more, productions: [run1, run2m], adjustments: [] });
near(inv.runs.get("r2").outputs[0].unitCost, 70, "manual: t-shirt 30% of 7000 / 30");
near(inv.runs.get("r2").outputs[1].unitCost, 245, "manual: pants 70% of 7000 / 20");
// t-shirt average: 80 at 90 + 30 at 70 = 9300 / 110
near(inv.stock.get("tsL").avgCost, 9300 / 110, "t-shirt average after second run");

// adjustments: opening stock with a cost, then waste
const adjustments = [
  { id: "a1", date: "2026-09-30", catalogId: "pants", quantity: 10, unitCost: 200, reason: "opening", createdAt: "a" },
  { id: "a2", date: "2026-10-08", catalogId: "pants", quantity: -3, unitCost: null, reason: "waste", createdAt: "b" },
];
inv = computeInventory({ catalog, transactions: more, productions: [run1], adjustments });
near(inv.stock.get("pants").qty, 7, "pants after adjustments");
near(inv.stock.get("pants").avgCost, 200, "pants cost");
assert.equal(inv.stock.get("pants").moves.length, 2);

// warnings and blocking
const settings = { stockWarnMin: "5", stockBlock: "1", stockBlockMin: "0" };
assert.equal(checkTake(catalog[2], 80, 81, settings).level, "block");
assert.equal(checkTake(catalog[2], 80, 80, settings).level, "warn");
assert.equal(checkTake(catalog[2], 80, 76, settings).level, "warn");
assert.equal(checkTake(catalog[2], 80, 70, settings).level, "ok");
assert.equal(checkTake(catalog[2], 80, 79, { ...settings, stockBlockMin: "2" }).level, "block");
assert.equal(checkTake(catalog[2], 80, 500, { ...settings, stockBlock: "0" }).level, "warn");
assert.equal(checkTake({ ...catalog[2], minStock: 20 }, 80, 65, settings).level, "warn");
assert.equal(stockStatus(catalog[2], 0, settings), "out");
assert.equal(stockStatus(catalog[2], 5, settings), "low");
assert.equal(stockStatus(catalog[2], 6, settings), "ok");
const tt = inventoryTotals(catalog, inv, settings);
assert.ok(tt.value > 0 && tt.outOf.some((c) => c.id === "zip"));

// ---- client orders (brokering) ----
const labels = { order: "Order", cost: "cost", commission: "commission", cost_material: "Materials", cost_making: "Making", cost_other: "Other" };
const order = {
  id: "o1", date: "2026-10-01", clientId: "cli", title: "Tees", status: "delivered", deliveredDate: "2026-10-10",
  commissionMode: "cost_pct", commissionScope: "order", commissionValue: 10,
  products: [{ id: "a", name: "Tee", quantity: 60, price: 200 }, { id: "b", name: "Pants", quantity: 40, price: 300 }],
  materials: [{ id: "m", name: "Cotton", unit: "m", received: 100, used: 70, returned: 10 }],
  costs: [{ id: "c1", type: "material", supplierId: "sup", amount: 6000, paid: 2000 }, { id: "c2", type: "making", supplierId: "", amount: 3000, paid: 0 }],
  payments: [{ id: "p1", date: "2026-10-01", dir: "in", amount: 10000 }],
};
let oc = orderCalc(order);
near(oc.cost, 9000, "order cost");
near(oc.commission, 900, "10% of cost");
near(oc.due, 9900, "total due");
near(oc.balance, -100, "100 to return");
near(orderCalc({ ...order, commissionMode: "price_pct" }).commission, (60 * 200 + 40 * 300) * 0.1, "10% of selling price");
near(orderCalc({ ...order, commissionMode: "per_piece", commissionValue: 5 }).commission, 500, "5 per piece");
// per product: 5% on tees, 20% on pants, cost shared by pieces (5400 / 3600)
const perProd = { ...order, commissionScope: "product", products: [{ ...order.products[0], commissionValue: 5 }, { ...order.products[1], commissionValue: 20 }] };
near(orderCalc(perProd).commission, 5400 * 0.05 + 3600 * 0.2, "per-product percentages");

const otx = orderTransactions(order, labels);
assert.equal(otx.length, 4);
const clientBal = otx.filter((x) => x.partyId === "cli").reduce((s, x) => s + balanceImpact(x), 0);
near(clientBal, -100, "client is owed 100 back");
near(otx.filter((x) => x.partyId === "sup").reduce((s, x) => s + balanceImpact(x), 0), -4000, "supplier is owed 4000");
assert.equal(otx.find((x) => x.id === "o1-cost-c2").paid, 3000, "cash cost is fully paid");
assert.ok(otx.every((x) => x.orderId === "o1"));
// only the commission is income; the 9000 spent is the client's money, not own purchases
const pt = periodTotals(otx, computeInventory({ catalog, transactions: otx, productions: [], adjustments: [] }));
near(pt.profit, 900, "profit is the commission");
near(pt.purchases, 0, "order costs are not own purchases");
near(pt.moneyIn, 10000, "cash in");
near(pt.moneyOut, 5000, "cash out");
assert.equal(orderTransactions({ ...order, status: "open" }, labels).some((x) => x.kind === "order_charge"), false, "no charge before delivery");
// refund settles the client
const settled = orderTransactions({ ...order, payments: [...order.payments, { id: "p2", date: "2026-10-11", dir: "out", amount: 100 }] }, labels);
near(settled.filter((x) => x.partyId === "cli").reduce((s, x) => s + balanceImpact(x), 0), 0, "settled after refund");
// client fabric: 100 received − 70 used − 10 returned = 20 kept; the next order uses 15 of it
const held = heldMaterials([order, { id: "o2", clientId: "cli", materials: [{ name: "cotton", received: 0, used: 15, returned: 0 }] }]);
near(heldFor(held, "cli")[0].qty, 5, "fabric held for the client");
assert.equal(heldFor(heldMaterials([order], "o1"), "cli").length, 0);

console.log("inventory and order tests passed");
