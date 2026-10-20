import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  Package, ShoppingCart, Users, BarChart3, Globe, X, Wallet, Scissors, FileText, Settings, Info,
  Receipt, Boxes, Keyboard, RefreshCw, Factory, Warehouse, Handshake, ShieldCheck,
} from "lucide-react";
import { T, fill } from "./i18n.js";
import {
  COLORS, uid, todayISO, thisMonthKey, monthKey, balanceImpact, errMsg, companyInfo, rangeFor, isModalOpen,
  Btn, Modal,
} from "./ui.jsx";
import { buildXlsx } from "./xlsx.js";
import { makeReportSheets } from "./reportSheets.js";
import { TxList, TxModal, ExpensesView, ExpenseModal } from "./entries.jsx";
import { PartiesView, PaymentModal, PartyModal, PartyDetailModal } from "./parties.jsx";
import { CatalogView, CatalogModal } from "./catalog.jsx";
import { Dashboard, ReportsView } from "./dashboard.jsx";
import { InvoicesView } from "./invoices.jsx";
import { SettingsView, AboutModal, ShortcutsModal, ToastHost, updateText } from "./settings.jsx";
import { AuthScreen, TrialEndedScreen } from "./auth.jsx";
import { computeInventory } from "./inventory.js";
import { InventoryView, AdjustModal, StockHistoryModal } from "./stock.jsx";
import { ProductionView, ProductionModal } from "./production.jsx";
import { orderTransactions } from "./orders.js";
import { OrdersView, OrderModal } from "./orders.jsx";
import { OwnerView } from "./owner.jsx";

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

function withWording(base, labelsJson, lang, appName) {
  let labels = {};
  try { labels = (JSON.parse(labelsJson || "{}") || {})[lang] || {}; } catch (e) { labels = {}; }
  const out = { ...base };
  for (const [key, value] of Object.entries(labels)) {
    if (typeof value === "string" && value.trim() && key in base) out[key] = value.trim();
  }
  if (appName) out.appName = appName;
  return out;
}

const PAGE_ORDER = ["dashboard", "purchases", "production", "sales", "orders", "inventory", "expenses", "parties", "catalog", "reports", "invoices", "settings"];

export default function FactoryLedger() {
  const [lang, setLang] = useState("ar");
  const baseT = T[lang];
  const isRTL = lang === "ar";
  const today = todayISO();

  const [parties, setParties] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [catalog, setCatalog] = useState([]);
  const [productions, setProductions] = useState([]);
  const [adjustments, setAdjustments] = useState([]);
  const [orders, setOrders] = useState([]);
  const [settings, setSettings] = useState({});
  // The app's name can be changed in Settings; it replaces the built-in name everywhere.
  // Names typed in Settings → Wording replace the built-in ones (per language), so the app fits any business.
  const customName = (settings.appName || "").trim();
  const t = withWording(baseT, settings.labels, lang, customName);
  const [loaded, setLoaded] = useState(false);
  const [tab, setTab] = useState("dashboard");

  const [authChecked, setAuthChecked] = useState(false);
  const [hasAdmin, setHasAdmin] = useState(false);
  const [loggedIn, setLoggedIn] = useState(false);
  const [isOwner, setIsOwner] = useState(false); // the hidden account that controls trials and activation
  const [license, setLicense] = useState(null); // { state: "trial" | "full" | "expired", daysLeft, until, contact }
  // Pages the owner switched off for this customer are hidden. The owner always sees everything.
  // What this user may do on each page: "none" (hidden), "view" or "edit".
  // Two things decide it: the modules the owner sold to this customer, and the user's role.
  const [perms, setPerms] = useState(null); // the logged-in user's role; null = full access
  const licensed = (key) => key === "dashboard" || key === "settings" || !license || !Array.isArray(license.modules) || license.modules.includes(key);
  const level = (key) => (isOwner ? "edit" : !licensed(key) ? "none" : !perms ? "edit" : perms[key] || "none");
  const allowed = (key) => level(key) !== "none";
  const canEdit = (key) => level(key) === "edit";
  const ed = (key, fn) => (canEdit(key) ? fn : undefined); // an action only "edit" users get
  const txModule = (tx) => (tx.orderId ? "orders" : { purchase: "purchases", sale: "sales", expense: "expenses" }[tx.kind] || "parties");
  const refreshLicense = () => window.license && window.license.status().then((s) => s && setLicense(s)).catch(() => {});

  const [txModal, setTxModal] = useState(null); // { kind: 'purchase'|'sale', editId? }
  const [expenseModal, setExpenseModal] = useState(null); // { editId? }
  const [payModal, setPayModal] = useState(null); // { party, editId? }
  const [partyModal, setPartyModal] = useState(false);
  const [partyDetail, setPartyDetail] = useState(null);
  const [catalogModal, setCatalogModal] = useState(null); // { edit? }
  const [prodModal, setProdModal] = useState(null); // { editId? }
  const [adjustModal, setAdjustModal] = useState(null); // { item? }
  const [orderModal, setOrderModal] = useState(null); // { editId? }
  const [historyItem, setHistoryItem] = useState(null);
  const [confirmDel, setConfirmDel] = useState(null); // { kind:'tx'|'party'|'catalog'|'production'|'adjustment', id }
  const [search, setSearch] = useState("");
  const [ranges, setRanges] = useState(() => ({
    purchase: { preset: "all", ...rangeFor("all") },
    sale: { preset: "all", ...rangeFor("all") },
    expense: { preset: "thisMonth", ...rangeFor("thisMonth") },
    production: { preset: "all", ...rangeFor("all") },
  }));
  const [reportMonth, setReportMonth] = useState(thisMonthKey());
  const [agingSide, setAgingSide] = useState("receivable");
  const [invoicePartyId, setInvoicePartyId] = useState("");
  const [invoiceFrom, setInvoiceFrom] = useState(thisMonthKey() + "-01");
  const [invoiceTo, setInvoiceTo] = useState(todayISO());
  const [invoiceMode, setInvoiceMode] = useState("detailed");
  const [toasts, setToasts] = useState([]);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [updStatus, setUpdStatus] = useState({ state: "idle" });
  const printRef = useRef(null);
  const updateToastShown = useRef(false);

  function notify(message, type = "success", action) {
    const id = uid();
    setToasts((prev) => [...prev.slice(-2), { id, message, type, action }]);
    setTimeout(() => setToasts((prev) => prev.filter((x) => x.id !== id)), type === "error" ? 8000 : action ? 9000 : 4500);
  }
  const dismissToast = (id) => setToasts((prev) => prev.filter((x) => x.id !== id));

  useEffect(() => {
    (async () => {
      try { setHasAdmin(!!(await window.auth.hasAdmin())); } catch (e) { /* ignore */ }
      // Needed before login so the login screen shows the chosen app name.
      try { const st = await window.settings.get(); if (st) setSettings(st); } catch (e) { /* ignore */ }
      await refreshLicense();
      setAuthChecked(true);
    })();
  }, []);

  useEffect(() => {
    if (!loggedIn) return;
    (async () => {
      try {
        const [p, tx, st, cat, prods, adjs, ords] = await Promise.all([
          window.db.getParties(), window.db.getTransactions(),
          window.settings ? window.settings.get() : Promise.resolve({}),
          window.db.getCatalog ? window.db.getCatalog() : Promise.resolve([]),
          window.db.getProductions(), window.db.getAdjustments(), window.db.getOrders(),
        ]);
        setOrders(ords || []);
        setProductions(prods || []);
        setAdjustments(adjs || []);
        setParties(p || []);
        setTransactions(tx || []);
        setSettings(st || {});
        setCatalog(cat || []);
      } catch (e) { notify(errMsg(e), "error"); }
      setLoaded(true);
    })();
  }, [loggedIn]);

  useEffect(() => { if (!allowed(tab)) setTab(PAGE_ORDER.find(allowed) || "dashboard"); }, [tab, license, isOwner, perms]);

  // Notice a trial running out while the app stays open.
  useEffect(() => {
    const timer = setInterval(refreshLicense, 60 * 60 * 1000);
    return () => clearInterval(timer);
  }, []);

  // Automatic updates: follow the status sent by the main process.
  useEffect(() => {
    if (!window.updates) return undefined;
    window.updates.getStatus().then((s) => s && setUpdStatus(s)).catch(() => {});
    return window.updates.onStatus((s) => setUpdStatus(s));
  }, []);
  useEffect(() => {
    if (updStatus.state === "ready" && loggedIn && !updateToastShown.current) {
      updateToastShown.current = true;
      notify(fill(t.updateReadyToast, { v: updStatus.version }), "success",
        { label: t.restartToUpdate, onClick: () => window.updates.install() });
    }
  }, [updStatus.state, loggedIn]);

  function logout() {
    if (window.auth.logout) window.auth.logout().catch(() => {});
    setIsOwner(false);
    setPerms(null);
    setLoggedIn(false);
    setLoaded(false);
    setParties([]);
    setTransactions([]);
    setCatalog([]);
    setProductions([]);
    setAdjustments([]);
    setOrders([]);
    setTab("dashboard");
  }

  const partiesWithBalance = useMemo(() => {
    const bal = new Map();
    for (const x of transactions) if (x.partyId) bal.set(x.partyId, (bal.get(x.partyId) || 0) + balanceImpact(x));
    return parties.map((p) => ({ ...p, balance: bal.get(p.id) || 0 }));
  }, [parties, transactions]);

  // Stock on hand, average costs and the cost of each sale, replayed from all entries.
  const inventory = useMemo(
    () => computeInventory({ catalog, transactions, productions, adjustments }),
    [catalog, transactions, productions, adjustments]
  );

  const totalReceivable = partiesWithBalance.reduce((s, p) => s + Math.max(p.balance, 0), 0);
  const totalPayable = partiesWithBalance.reduce((s, p) => s + Math.max(-p.balance, 0), 0);
  const monthTx = (mk) => transactions.filter((x) => monthKey(x.date) === mk);

  /* ---------- saving ---------- */
  function reportSave(promise, silent) {
    promise.then(
      () => { if (!silent) notify(t.savedOk); },
      (err) => { console.error(err); notify(`${t.saveFailed}: ${errMsg(err)}`, "error"); }
    );
  }
  function reportDelete(promise) {
    promise.then(
      () => notify(t.deletedOk),
      (err) => { console.error(err); notify(`${t.deleteFailed}: ${errMsg(err)}`, "error"); }
    );
  }

  function addParty(name, type, phone, silent) {
    const p = { id: uid(), name, type, phone: phone || "" };
    setParties((prev) => [...prev, p]);
    reportSave(window.db.upsertParty(p), silent);
    return p;
  }
  function updateParty(id, name, type, phone) {
    const p = { id, name, type, phone: phone || "" };
    setParties((prev) => prev.map((x) => (x.id === id ? p : x)));
    reportSave(window.db.upsertParty(p));
  }
  function findOrCreateParty(name, defaultType) {
    const existing = parties.find((p) => p.name.trim().toLowerCase() === name.trim().toLowerCase());
    if (existing) return existing;
    return addParty(name.trim(), defaultType, "", true);
  }

  function storeTransaction(record, editId) {
    setTransactions((prev) => (editId ? prev.map((x) => (x.id === editId ? record : x)) : [record, ...prev])
      .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)));
    reportSave(window.db.upsertTransaction(record));
  }

  function saveTransaction(kind, form, editId) {
    let partyId = form.partyId;
    if (partyId === "__new__") partyId = findOrCreateParty(form.newPartyName, kind === "purchase" ? "supplier" : "client").id;
    let record;
    if (kind === "purchase" || kind === "sale") {
      const items = form.items.map((it) => ({ ...it, total: round2(it.total != null ? it.total : it.quantity * it.unitPrice) }));
      const total = round2(items.reduce((s, it) => s + it.total, 0));
      const single = items.length === 1 ? items[0] : null;
      record = {
        id: editId || uid(), kind, date: form.date || todayISO(), partyId,
        description: items.map((it) => it.description).filter(Boolean).join(isRTL ? "، " : ", "),
        quantity: single ? single.quantity : items.reduce((s, it) => s + it.quantity, 0),
        unitPrice: single ? single.unitPrice : 0,
        total, paid: round2(form.paid), notes: form.notes || "", items,
      };
    } else {
      const amount = round2(form.amount);
      record = {
        id: editId || uid(), kind, date: form.date || todayISO(), partyId, description: "", quantity: 0, unitPrice: 0,
        total: amount, paid: amount, notes: form.notes || "", items: [],
      };
    }
    storeTransaction(record, editId);
  }

  function saveExpense(form, editId) {
    const amount = round2(form.amount);
    storeTransaction({
      id: editId || uid(), kind: "expense", date: form.date || todayISO(), partyId: null, category: form.category || "other",
      description: (form.description || "").trim(), quantity: 0, unitPrice: 0, total: amount, paid: amount,
      notes: form.notes || "", items: [],
    }, editId);
  }

  // A client order owns its ledger entries: they are rebuilt from the order every time it is saved.
  function saveOrder(order, newClientName) {
    const full = newClientName ? { ...order, clientId: findOrCreateParty(newClientName, "client").id } : order;
    const txs = orderTransactions(full, {
      order: t.orderWord, cost: t.orderCost, commission: t.commission,
      cost_material: t.cost_material, cost_making: t.cost_making, cost_other: t.cost_other,
    });
    setOrders((prev) => [full, ...prev.filter((o) => o.id !== full.id)]
      .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : String(b.createdAt).localeCompare(String(a.createdAt)))));
    setTransactions((prev) => [...txs, ...prev.filter((x) => x.orderId !== full.id)]
      .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)));
    reportSave(window.db.upsertOrder(full, txs));
  }
  function deleteOrder(id) {
    setOrders((prev) => prev.filter((o) => o.id !== id));
    setTransactions((prev) => prev.filter((x) => x.orderId !== id));
    reportDelete(window.db.deleteOrder(id));
  }

  function deleteTransaction(id) {
    const tx = transactions.find((x) => x.id === id);
    if (tx && !canEdit(txModule(tx))) { notify(t.noPermission, "error"); return; }
    if (tx && tx.orderId) { notify(t.orderOwnedTx, "error"); return; }
    setTransactions((prev) => prev.filter((x) => x.id !== id));
    reportDelete(window.db.deleteTransaction(id));
  }
  function deleteParty(id) {
    const gone = new Set(orders.filter((o) => o.clientId === id).map((o) => o.id));
    setOrders((prev) => prev.filter((o) => !gone.has(o.id)));
    setParties((prev) => prev.filter((p) => p.id !== id));
    setTransactions((prev) => prev.filter((x) => x.partyId !== id && !gone.has(x.orderId)));
    reportDelete(window.db.deleteParty(id));
  }
  function saveCatalogItems(items) {
    const ids = new Set(items.map((c) => c.id));
    setCatalog((prev) => [...prev.filter((c) => !ids.has(c.id)), ...items].sort((a, b) => a.name.localeCompare(b.name)));
    reportSave(window.db.upsertCatalogMany(items));
  }
  function saveProduction(run) {
    setProductions((prev) => [run, ...prev.filter((p) => p.id !== run.id)]
      .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : String(b.createdAt).localeCompare(String(a.createdAt)))));
    // The selling price typed in the run becomes the product's default sale price.
    const prices = new Map(run.outputs.filter((o) => o.salePrice > 0).map((o) => [o.catalogId, o.salePrice]));
    if (prices.size) setCatalog((prev) => prev.map((c) => (prices.has(c.id) ? { ...c, salePrice: prices.get(c.id) } : c)));
    reportSave(window.db.upsertProduction(run));
  }
  function deleteProduction(id) {
    setProductions((prev) => prev.filter((p) => p.id !== id));
    reportDelete(window.db.deleteProduction(id));
  }
  function saveAdjustment(adj) {
    setAdjustments((prev) => [adj, ...prev]);
    reportSave(window.db.upsertAdjustment(adj));
  }
  function deleteAdjustment(id) {
    setAdjustments((prev) => prev.filter((a) => a.id !== id));
    reportDelete(window.db.deleteAdjustment(id));
  }
  function deleteCatalogItem(id) {
    if (productions.some((p) => [...p.inputs, ...p.outputs].some((l) => l.catalogId === id))) {
      notify(t.catalogInUse, "error");
      return;
    }
    setAdjustments((prev) => prev.filter((a) => a.catalogId !== id));
    setCatalog((prev) => prev.filter((c) => c.id !== id));
    setTransactions((prev) => prev.map((x) => (x.items && x.items.some((i) => i.catalogId === id)
      ? { ...x, items: x.items.map((i) => (i.catalogId === id ? { ...i, catalogId: null } : i)) } : x)));
    reportDelete(window.db.deleteCatalog(id));
  }

  async function saveSettings(values) {
    try {
      await window.settings.save(values);
      setSettings((prev) => ({ ...prev, ...values }));
      notify(t.settingsSaved);
      return true;
    } catch (err) {
      notify(`${t.saveFailed}: ${errMsg(err)}`, "error");
      return false;
    }
  }

  /* ---------- Excel reports ---------- */
  const company = companyInfo(settings, lang, t);
  const sheets = makeReportSheets({
    t, isRTL, company, parties, partiesWithBalance, transactions, totalReceivable, totalPayable, today,
    catalog, inv: inventory, settings,
  });

  async function saveWorkbook(fileName, title, sheetList) {
    try {
      const bytes = buildXlsx({ sheets: sheetList, title, creator: company.name, currency: t.currency });
      const res = await window.files.save(fileName, bytes, [{ name: "Excel", extensions: ["xlsx"] }]);
      if (res && res.ok) notify(t.excelSaved, "success", { label: t.open, onClick: () => window.files.open(res.filePath) });
    } catch (err) {
      console.error(err);
      notify(`${t.saveFailed}: ${errMsg(err)}`, "error");
    }
  }
  const mk = reportMonth;
  const exports = {
    summary: () => saveWorkbook(`summary-${mk}.xlsx`, t.summaryReport, [sheets.summary(mk)]),
    sales: () => saveWorkbook(`sales-${mk}.xlsx`, t.salesReportTitle, [sheets.trade("sale", mk)]),
    purchases: () => saveWorkbook(`purchases-${mk}.xlsx`, t.purchasesReportTitle, [sheets.trade("purchase", mk)]),
    expenses: () => saveWorkbook(`expenses-${mk}.xlsx`, t.expensesReport, [sheets.expenses(mk)]),
    balances: () => saveWorkbook(`balances-${today}.xlsx`, t.balancesReport, [sheets.balances()]),
    aging: () => saveWorkbook(`aging-${agingSide}-${today}.xlsx`, t.agingReport, [sheets.aging(agingSide)]),
    inventory: () => saveWorkbook(`inventory-${today}.xlsx`, t.inventoryReport, [sheets.inventory()]),
    all: () => saveWorkbook(`monthly-report-${mk}.xlsx`, `${t.reports} — ${mk}`, [
      sheets.summary(mk), sheets.trade("sale", mk), sheets.trade("purchase", mk), sheets.expenses(mk),
      sheets.balances(), sheets.aging("receivable"), sheets.aging("payable"), sheets.inventory(),
    ]),
  };

  /* ---------- navigation & keyboard shortcuts ---------- */
  const navItems = [
    { key: "dashboard", label: t.dashboard, icon: BarChart3 },
    { key: "purchases", label: t.purchases, icon: Package },
    { key: "production", label: t.production, icon: Factory },
    { key: "sales", label: t.sales, icon: ShoppingCart },
    { key: "orders", label: t.orders, icon: Handshake },
    { key: "inventory", label: t.inventory, icon: Warehouse },
    { key: "expenses", label: t.expenses, icon: Receipt },
    { key: "parties", label: t.parties, icon: Users },
    { key: "catalog", label: t.catalog, icon: Boxes },
    { key: "reports", label: t.reports, icon: Wallet },
    { key: "invoices", label: t.invoicesTab, icon: FileText },
    { key: "settings", label: t.settings, icon: Settings },
    // Only the hidden owner account gets this page.
    ...(isOwner ? [{ key: "owner", label: t.ownerTab, icon: ShieldCheck }] : []),
  ].filter((item) => item.key === "owner" || allowed(item.key));

  function goTab(key) {
    setTab(key);
    setSearch("");
  }
  function openNew() {
    if (!canEdit(PAGE_ORDER.includes(tab) && tab !== "dashboard" && tab !== "reports" && tab !== "invoices" && tab !== "settings" ? tab : "sales")) return;
    if (tab === "purchases") setTxModal({ kind: "purchase" });
    else if (tab === "expenses") setExpenseModal({});
    else if (tab === "parties") setPartyModal(true);
    else if (tab === "catalog") setCatalogModal({});
    else if (tab === "production") setProdModal({});
    else if (tab === "orders") setOrderModal({});
    else if (tab === "inventory") setAdjustModal({});
    else if (allowed("sales")) setTxModal({ kind: "sale" });
  }
  function openParty(id) {
    const p = parties.find((x) => x.id === id);
    if (p && allowed("parties")) setPartyDetail(p);
  }
  function goAging() {
    if (!allowed("reports")) return;
    goTab("reports");
    setTimeout(() => { const el = document.getElementById("aging"); if (el) el.scrollIntoView({ behavior: "smooth", block: "start" }); }, 80);
  }

  const keyState = useRef({});
  keyState.current = { loggedIn: loggedIn && loaded, tab, openNew, goTab, navItems };
  useEffect(() => {
    const onKey = (e) => {
      const st = keyState.current;
      if (!st.loggedIn) return;
      if (e.key === "F1") { e.preventDefault(); if (!isModalOpen()) setShortcutsOpen(true); return; }
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
      // Use physical keys (e.code) so shortcuts also work with the Arabic keyboard layout.
      const code = e.code;
      if (isModalOpen()) { if (code === "KeyN" || code === "KeyP") e.preventDefault(); return; }
      if (code === "KeyN") { e.preventDefault(); st.openNew(); }
      else if (code === "KeyF") {
        const el = document.querySelector("[data-search]");
        if (el) { e.preventDefault(); el.focus(); el.select(); }
      } else if (code === "KeyP") {
        e.preventDefault();
        if (st.tab === "invoices" && printRef.current) printRef.current();
      } else if (/^Digit[1-9]$/.test(code) || /^Numpad[1-9]$/.test(code)) {
        const item = st.navItems[Number(code.slice(-1)) - 1];
        if (item) { e.preventDefault(); st.goTab(item.key); }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  /* ---------- screens ---------- */
  const loadingScreen = <div style={{ padding: 40, textAlign: "center", color: COLORS.muted, fontFamily: "'Cairo', sans-serif" }}>{t.loading}</div>;
  if (!authChecked) return loadingScreen;
  if (!loggedIn) {
    return (
      <AuthScreen hasAdmin={hasAdmin} lang={lang} setLang={setLang} t={t}
        onCreated={() => { setHasAdmin(true); setIsOwner(false); setPerms(null); refreshLicense(); setLoggedIn(true); }}
        onLoggedIn={(res) => { setIsOwner(!!(res && res.owner)); setPerms((res && res.permissions) || null); refreshLicense(); setLoggedIn(true); }} />
    );
  }
  if (license && license.state === "expired" && !isOwner) {
    return <TrialEndedScreen t={t} lang={lang} license={license} onLogout={logout} />;
  }
  if (!loaded) return loadingScreen;

  const sideBtn = {
    display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", borderRadius: 8,
    border: "1px solid rgba(255,255,255,0.15)", background: "transparent", color: "#D5D7E3",
    cursor: "pointer", fontSize: 13, fontFamily: "inherit", marginTop: 6,
  };
  const editingTx = txModal && txModal.editId ? transactions.find((x) => x.id === txModal.editId) : null;
  const editingExpense = expenseModal && expenseModal.editId ? transactions.find((x) => x.id === expenseModal.editId) : null;
  const editTx = (tx) => {
    if (!canEdit(txModule(tx))) { notify(t.noPermission, "error"); return; }
    if (tx.orderId) { setPartyDetail(null); setOrderModal({ editId: tx.orderId }); }
    else if (tx.kind === "expense") setExpenseModal({ editId: tx.id });
    else if (tx.kind === "purchase" || tx.kind === "sale") setTxModal({ kind: tx.kind, editId: tx.id });
    else { const p = parties.find((x) => x.id === tx.partyId); if (p) setPayModal({ party: p, editId: tx.id }); }
  };
  const setRange = (kind) => (value) => setRanges((r) => ({ ...r, [kind]: value }));

  return (
    <div dir={isRTL ? "rtl" : "ltr"} className="app-root" style={{
      fontFamily: "'Cairo', sans-serif", background: COLORS.bg, height: "100vh",
      display: "flex", color: COLORS.ink, overflow: "hidden",
    }}>
      <style>{`
        @media print {
          html, body, #root, .app-root, .app-main {
            height: auto !important; overflow: visible !important; background: #ffffff !important;
          }
          .app-main { padding: 0 !important; }
          .no-print { display: none !important; }
          #invoice-print-area {
            width: 100% !important; max-width: 100% !important; padding: 0 !important; margin: 0 !important;
            border: none !important; box-shadow: none !important; border-radius: 0 !important;
          }
          #invoice-print-area tr { break-inside: avoid; }
          #invoice-print-area .keep-together { break-inside: avoid; }
          @page { size: A4; margin: 14mm 13mm 16mm; }
        }
      `}</style>

      {/* Sidebar */}
      <div className="no-print" style={{
        width: 214, background: COLORS.ink, color: "#fff", padding: "20px 14px", height: "100vh",
        boxSizing: "border-box", overflowY: "auto", display: "flex", flexDirection: "column", gap: 2, flexShrink: 0,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, padding: "0 6px" }}>
          <Scissors size={20} color={COLORS.accent} />
          <div style={{ fontWeight: 800, fontSize: 16 }}>{t.appName}</div>
        </div>
        <div style={{ fontSize: 11.5, color: "#9498B0", padding: "0 6px", marginBottom: 14 }}>
          {company.configured ? company.name : t.tagline}
        </div>
        {navItems.map((item, i) => {
          const Icon = item.icon;
          const active = tab === item.key;
          return (
            <button key={item.key} onClick={() => goTab(item.key)} title={i < 9 ? `Ctrl+${i + 1}` : undefined} style={{
              display: "flex", alignItems: "center", gap: 10, padding: "9px 12px",
              borderRadius: 8, border: "none", cursor: "pointer", textAlign: isRTL ? "right" : "left",
              background: active ? "rgba(201,151,46,0.18)" : "transparent",
              color: active ? COLORS.accent : "#D5D7E3", fontSize: 14, fontWeight: 600, fontFamily: "inherit",
            }}>
              <Icon size={17} /> {item.label}
            </button>
          );
        })}
        <div style={{ flex: 1, minHeight: 12 }} />
        {license && license.state === "trial" && (
          <div data-trial-badge="1" style={{ background: "rgba(255,255,255,0.08)", borderRadius: 10, padding: "8px 12px", marginBottom: 6, fontSize: 12, color: "#F1E4C4", lineHeight: 1.5 }}>
            {fill(t.trialBadge, { n: license.daysLeft })}
          </div>
        )}
        {(updStatus.state === "ready" || updStatus.state === "downloading") && (
          <div style={{ background: "rgba(201,151,46,0.16)", borderRadius: 10, padding: "10px 12px", marginBottom: 4 }}>
            <div style={{ fontSize: 12, color: "#F1E4C4", lineHeight: 1.5 }}>{updateText(t, updStatus)}</div>
            {updStatus.state === "ready" && (
              <Btn variant="accent" onClick={() => window.updates.install()} style={{ width: "100%", justifyContent: "center", marginTop: 8, padding: "7px 10px", fontSize: 13 }}>
                <RefreshCw size={14} /> {t.restartToUpdate}
              </Btn>
            )}
          </div>
        )}
        <button onClick={() => setShortcutsOpen(true)} style={sideBtn} title="F1"><Keyboard size={15} /> {t.shortcuts}</button>
        <button onClick={() => setLang(lang === "ar" ? "en" : "ar")} style={sideBtn}><Globe size={15} /> {lang === "ar" ? "English" : "العربية"}</button>
        <button onClick={() => setAboutOpen(true)} style={sideBtn}><Info size={15} /> {t.about}</button>
        <button onClick={logout} style={sideBtn}><X size={15} /> {t.logout}</button>
      </div>

      {/* Main */}
      <div className="app-main" style={{ flex: 1, padding: 26, overflowY: "auto", height: "100vh", boxSizing: "border-box", minWidth: 0 }}>
        {tab === "dashboard" && allowed("dashboard") && (
          <Dashboard t={t} lang={lang} transactions={transactions} parties={parties} partiesWithBalance={partiesWithBalance}
            totalReceivable={totalReceivable} totalPayable={totalPayable} today={today}
            catalog={catalog} inv={inventory} settings={settings} onGoInventory={allowed("inventory") ? () => goTab("inventory") : undefined}
            onOpenParty={openParty} onGoAging={goAging} />
        )}
        {(tab === "purchases" || tab === "sales") && (() => {
          const kind = tab === "purchases" ? "purchase" : "sale";
          return (
            <TxList key={kind} t={t} lang={lang} kind={kind} transactions={transactions.filter((x) => x.kind === kind && !x.orderId)}
              parties={parties} onAdd={ed(tab, () => setTxModal({ kind }))}
              onDelete={ed(tab, (id) => setConfirmDel({ kind: "tx", id }))} onEdit={ed(tab, editTx)}
              search={search} setSearch={setSearch} range={ranges[kind]} setRange={setRange(kind)} />
          );
        })()}
        {tab === "expenses" && (
          <ExpensesView t={t} lang={lang} transactions={transactions} onAdd={ed("expenses", () => setExpenseModal({}))}
            onEdit={ed("expenses", editTx)} onDelete={ed("expenses", (id) => setConfirmDel({ kind: "tx", id }))}
            range={ranges.expense} setRange={setRange("expense")} search={search} setSearch={setSearch} />
        )}
        {tab === "production" && (
          <ProductionView t={t} lang={lang} productions={productions} catalog={catalog} inv={inventory}
            onAdd={ed("production", () => setProdModal({}))} onEdit={ed("production", (r) => setProdModal({ editId: r.id }))}
            onDelete={ed("production", (id) => setConfirmDel({ kind: "production", id }))}
            search={search} setSearch={setSearch} range={ranges.production} setRange={setRange("production")} />
        )}
        {tab === "orders" && (
          <OrdersView t={t} lang={lang} orders={orders} parties={parties} search={search} setSearch={setSearch}
            onAdd={ed("orders", () => setOrderModal({}))} onEdit={ed("orders", (o) => setOrderModal({ editId: o.id }))}
            onDelete={ed("orders", (id) => setConfirmDel({ kind: "order", id }))} />
        )}
        {tab === "inventory" && (
          <InventoryView t={t} lang={lang} catalog={catalog} inv={inventory} settings={settings}
            search={search} setSearch={setSearch} onAdjust={ed("inventory", (c) => setAdjustModal({ item: c }))}
            onHistory={(c) => setHistoryItem(c)} onExport={exports.inventory} onGoCatalog={() => goTab("catalog")} />
        )}
        {tab === "parties" && (
          <PartiesView t={t} lang={lang} parties={partiesWithBalance}
            onAdd={ed("parties", () => setPartyModal(true))} onOpen={(p) => setPartyDetail(p)}
            search={search} setSearch={setSearch} />
        )}
        {tab === "catalog" && (
          <CatalogView t={t} lang={lang} catalog={catalog} transactions={transactions} inv={inventory}
            onAdd={ed("catalog", () => setCatalogModal({}))} onEdit={ed("catalog", (c) => setCatalogModal({ edit: c }))}
            onDelete={ed("catalog", (c) => setConfirmDel({ kind: "catalog", id: c.id }))} search={search} setSearch={setSearch} />
        )}
        {tab === "reports" && (
          <ReportsView t={t} lang={lang} reportMonth={reportMonth} setReportMonth={setReportMonth}
            transactions={monthTx(reportMonth)} allTransactions={transactions} parties={parties} inv={inventory}
            totalReceivable={totalReceivable} totalPayable={totalPayable} today={today}
            agingSide={agingSide} setAgingSide={setAgingSide} onOpenParty={openParty} exports={exports} />
        )}
        {tab === "invoices" && (
          <InvoicesView t={t} lang={lang} parties={parties} transactions={transactions}
            partyId={invoicePartyId} setPartyId={setInvoicePartyId}
            dateFrom={invoiceFrom} setDateFrom={setInvoiceFrom}
            dateTo={invoiceTo} setDateTo={setInvoiceTo}
            mode={invoiceMode} setMode={setInvoiceMode}
            settings={settings} notify={notify} onGoSettings={() => goTab("settings")} printRef={printRef} />
        )}
        {tab === "settings" && (
          <SettingsView t={t} baseT={baseT} lang={lang} settings={settings} onSave={saveSettings} notify={notify}
            isOwner={isOwner} />
        )}
        {tab === "owner" && isOwner && (
          <OwnerView t={t} notify={notify} license={license} onLicense={setLicense} dashboardLabel={t.dashboard} settingsLabel={t.settings} modules={[
            ["purchases", t.purchases], ["production", t.production], ["sales", t.sales], ["orders", t.orders],
            ["inventory", t.inventory], ["expenses", t.expenses], ["parties", t.parties], ["catalog", t.catalog],
            ["reports", t.reports], ["invoices", t.invoicesTab],
          ]} />
        )}
      </div>

      {txModal && (
        <TxModal t={t} lang={lang} kind={txModal.kind} parties={parties} catalog={catalog} editTx={editingTx}
          inv={inventory} settings={settings}
          onClose={() => setTxModal(null)}
          onSave={(form) => { saveTransaction(txModal.kind, form, txModal.editId); setTxModal(null); }} />
      )}
      {expenseModal && (
        <ExpenseModal t={t} lang={lang} editTx={editingExpense} onClose={() => setExpenseModal(null)}
          onSave={(form) => { saveExpense(form, expenseModal.editId); setExpenseModal(null); }} />
      )}
      {payModal && (
        <PaymentModal t={t} lang={lang} party={payModal.party}
          editPay={payModal.editId ? transactions.find((x) => x.id === payModal.editId) : null}
          onClose={() => { setPayModal(null); setPartyDetail(payModal.party); }}
          onSave={(form) => {
            const existing = payModal.editId ? transactions.find((x) => x.id === payModal.editId) : null;
            const kind = existing ? existing.kind : (payModal.party.type === "supplier" ? "payment_out" : "payment_in");
            saveTransaction(kind, { ...form, partyId: payModal.party.id }, payModal.editId);
            setPayModal(null);
            setPartyDetail(payModal.party);
          }} />
      )}
      {partyModal && (
        <PartyModal t={t} lang={lang} editParty={typeof partyModal === "object" ? partyModal.edit : null}
          onClose={() => setPartyModal(false)}
          onSave={(name, type, phone) => {
            if (typeof partyModal === "object" && partyModal.edit) updateParty(partyModal.edit.id, name, type, phone);
            else addParty(name, type, phone);
            setPartyModal(false);
          }} />
      )}
      {catalogModal && (
        <CatalogModal t={t} editItem={catalogModal.edit || null} settings={settings} onClose={() => setCatalogModal(null)}
          onSave={(items) => { saveCatalogItems(items); setCatalogModal(null); }} />
      )}
      {prodModal && (
        <ProductionModal t={t} lang={lang} catalog={catalog} transactions={transactions} productions={productions}
          adjustments={adjustments} settings={settings}
          editRun={prodModal.editId ? productions.find((p) => p.id === prodModal.editId) : null}
          onClose={() => setProdModal(null)}
          onGoCatalog={() => { setProdModal(null); goTab("catalog"); setCatalogModal({}); }}
          onSave={(run) => { saveProduction(run); setProdModal(null); }} />
      )}
      {orderModal && (
        <OrderModal t={t} lang={lang} parties={parties} catalog={catalog} orders={orders}
          editOrder={orderModal.editId ? orders.find((o) => o.id === orderModal.editId) : null}
          onClose={() => setOrderModal(null)}
          onSave={(order, newClientName) => { saveOrder(order, newClientName); setOrderModal(null); }} />
      )}
      {adjustModal && (
        <AdjustModal t={t} lang={lang} catalog={catalog} inv={inventory} item={adjustModal.item || null}
          onClose={() => setAdjustModal(null)}
          onSave={(adj) => { saveAdjustment(adj); setAdjustModal(null); }} />
      )}
      {historyItem && !confirmDel && (
        <StockHistoryModal t={t} lang={lang} item={catalog.find((c) => c.id === historyItem.id) || historyItem} inv={inventory}
          settings={settings} parties={parties} onClose={() => setHistoryItem(null)}
          onDeleteAdjustment={ed("inventory", (id) => setConfirmDel({ kind: "adjustment", id }))} />
      )}
      {partyDetail && !payModal && !txModal && !partyModal && (
        <PartyDetailModal t={t} lang={lang}
          party={partiesWithBalance.find((p) => p.id === partyDetail.id) || partyDetail}
          transactions={transactions.filter((x) => x.partyId === partyDetail.id)}
          parties={parties}
          onClose={() => setPartyDetail(null)}
          onPay={ed("parties", () => setPayModal({ party: partyDetail }))}
          onDeleteTx={(id) => {
            const tx = transactions.find((x) => x.id === id);
            if (tx && !canEdit(txModule(tx))) notify(t.noPermission, "error"); else setConfirmDel({ kind: "tx", id });
          }}
          onEditTx={editTx}
          onDeleteParty={ed("parties", () => setConfirmDel({ kind: "party", id: partyDetail.id }))}
          onEditParty={ed("parties", () => setPartyModal({ edit: parties.find((p) => p.id === partyDetail.id) || partyDetail }))}
        />
      )}
      {confirmDel && (
        <Modal title={confirmDel.kind === "catalog" ? t.confirmDeleteCatalog : t.confirmDelete} onClose={() => setConfirmDel(null)}>
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
            <Btn variant="ghost" onClick={() => setConfirmDel(null)}>{t.no}</Btn>
            <Btn variant="danger" onClick={() => {
              if (confirmDel.kind === "tx") deleteTransaction(confirmDel.id);
              else if (confirmDel.kind === "catalog") deleteCatalogItem(confirmDel.id);
              else if (confirmDel.kind === "production") deleteProduction(confirmDel.id);
              else if (confirmDel.kind === "order") deleteOrder(confirmDel.id);
              else if (confirmDel.kind === "adjustment") deleteAdjustment(confirmDel.id);
              else { deleteParty(confirmDel.id); setPartyDetail(null); }
              setConfirmDel(null);
            }}>{t.yes}, {t.delete}</Btn>
          </div>
        </Modal>
      )}
      {aboutOpen && (
        <AboutModal t={t} company={company} onClose={() => setAboutOpen(false)} updStatus={updStatus}
          onCheckUpdates={() => window.updates && window.updates.check().then((s) => s && setUpdStatus(s)).catch(() => {})}
          onInstallUpdate={() => window.updates && window.updates.install()} />
      )}
      {shortcutsOpen && <ShortcutsModal t={t} onClose={() => setShortcutsOpen(false)} />}
      <ToastHost toasts={toasts} onDismiss={dismissToast} t={t} />
    </div>
  );
}
