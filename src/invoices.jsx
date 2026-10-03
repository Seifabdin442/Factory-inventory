import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  Package, ShoppingCart, Users, BarChart3, Plus, Globe, X, Trash2, Pencil, ArrowUpCircle, ArrowDownCircle,
  Search, Download, Wallet, Scissors, Printer, FileText, Settings, Info, CheckCircle2, AlertCircle, FileDown,
  Upload, FolderOpen, Receipt, Boxes, Keyboard, KeyRound, RefreshCw, ShieldCheck, Copy, Clock, TrendingUp,
} from "lucide-react";
import {
  COLORS, CHART, AGING_COLORS, EXPENSE_CATEGORIES, uid, isoDate, todayISO, monthKey, thisMonthKey, fmtMoney,
  balanceImpact, errMsg, companyInfo, txItems, rangeFor, inRange, StitchDivider, Badge, Btn, Input, Select, Modal,
  MetricCard, ReportCard, Empty, DateRangeFilter, SearchBox, Kbd,
} from "./ui.jsx";
import { fill } from "./i18n.js";

export function InvoicesView({ t, lang, parties, transactions, partyId, setPartyId, dateFrom, setDateFrom, dateTo, setDateTo, mode, setMode,
  settings, notify, onGoSettings, printRef }) {
  const isRTL = lang === "ar";
  const party = parties.find((p) => p.id === partyId) || null;
  const partyTx = party ? transactions.filter((x) => x.partyId === party.id) : [];
  const company = companyInfo(settings, lang, t);
  const [docInfo, setDocInfo] = useState(null); // { number, issued }
  const [busy, setBusy] = useState(false);

  const docParams = party ? { partyId: party.id, dateFrom, dateTo, mode } : null;

  useEffect(() => {
    let alive = true;
    if (!party || !window.docs) { setDocInfo(null); return undefined; }
    window.docs.peek(docParams).then((r) => { if (alive) setDocInfo(r); }).catch(() => {});
    return () => { alive = false; };
  }, [partyId, dateFrom, dateTo, mode, settings.invoicePrefix, settings.invoiceStartNumber]);

  const before = partyTx.filter((x) => x.date < dateFrom);
  const openingBalance = before.reduce((s, x) => s + balanceImpact(x), 0);

  const inPeriod = partyTx
    .filter((x) => x.date >= dateFrom && x.date <= dateTo)
    .sort((a, b) => (a.date > b.date ? 1 : a.date < b.date ? -1 : 0));

  let running = openingBalance;
  const ledgerRows = inPeriod.map((x) => {
    const impact = balanceImpact(x);
    running += impact;
    const label = { purchase: t.purchases, sale: t.sales, payment_in: t.paymentIn, payment_out: t.paymentOut }[x.kind];
    // One line per item, e.g. "Cotton shirts (24 × EGP 85)"
    const items = txItems(x);
    const desc = (x.kind === "purchase" || x.kind === "sale") && items.length
      ? items.map((it) => `${it.description || label}${it.quantity ? ` (${it.quantity} × ${fmtMoney(it.unitPrice, lang)})` : ""}`)
      : [x.notes || label];
    return {
      date: x.date, label, desc,
      debit: impact > 0 ? impact : 0,
      credit: impact < 0 ? -impact : 0,
      balanceAfter: running,
    };
  });

  const totalDebit = ledgerRows.reduce((s, r) => s + r.debit, 0);
  const totalCredit = ledgerRows.reduce((s, r) => s + r.credit, 0);
  const closingBalance = openingBalance + (totalDebit - totalCredit);

  // Give the statement its permanent number, then let React re-render before printing/saving.
  async function issueNumber() {
    const r = await window.docs.issue(docParams);
    setDocInfo(r);
    await new Promise((res) => setTimeout(res, 120));
    return r.number;
  }

  async function handlePrint() {
    setBusy(true);
    try {
      await issueNumber();
      window.print();
    } catch (err) {
      notify(`${t.issueFailed}: ${errMsg(err)}`, "error");
    }
    setBusy(false);
  }

  async function handlePdf() {
    setBusy(true);
    try {
      const number = await issueNumber();
      const res = await window.files.savePdf(`${number} - ${party.name}.pdf`);
      if (res && res.ok) notify(t.pdfSaved, "success", { label: t.open, onClick: () => window.files.open(res.filePath) });
    } catch (err) {
      notify(`${t.saveFailed}: ${errMsg(err)}`, "error");
    }
    setBusy(false);
  }

  // Lets the app-wide Ctrl+P shortcut print this statement.
  useEffect(() => {
    if (!printRef) return undefined;
    printRef.current = party ? handlePrint : null;
    return () => { printRef.current = null; };
  });

  const docNumber = docInfo ? docInfo.number : "—";
  const paperInk = "#1A1A1A";
  const paperMuted = "#666666";
  const paperLine = "#222222";
  const paperRule = "#DDDDDD";
  const startAlign = isRTL ? "right" : "left";
  const endAlign = isRTL ? "left" : "right";
  const th = { padding: "7px 8px", textAlign: startAlign, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.4, fontWeight: 800 };
  const thNum = { ...th, textAlign: endAlign };
  const tdNum = { padding: "7px 8px", fontFamily: "'JetBrains Mono', monospace", textAlign: endAlign, whiteSpace: "nowrap" };

  return (
    <div>
      <div className="no-print">
        <h2 style={{ margin: "0 0 16px", fontSize: 20, fontWeight: 800 }}>{t.invoicesTab}</h2>
        {!company.configured && (
          <div style={{
            background: COLORS.accentSoft, borderRadius: 10, padding: "10px 14px", marginBottom: 14,
            display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", fontSize: 13,
          }}>
            <span>{t.addCompanyHint}</span>
            <Btn variant="ghost" onClick={onGoSettings} style={{ background: "#fff", padding: "6px 12px" }}>
              <Settings size={14} /> {t.goToSettings}
            </Btn>
          </div>
        )}
        <div style={{
          background: COLORS.surface, border: `1px solid ${COLORS.border}`, borderRadius: 12,
          padding: 16, marginBottom: 20, display: "flex", gap: 14, flexWrap: "wrap", alignItems: "flex-end",
        }}>
          <div style={{ minWidth: 220 }}>
            <Select label={t.chooseParty} value={partyId} onChange={(e) => setPartyId(e.target.value)}>
              <option value="">—</option>
              {parties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </Select>
          </div>
          <Input label={t.dateFrom} type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          <Input label={t.dateTo} type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
          <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
            <Btn variant={mode === "detailed" ? "accent" : "ghost"} onClick={() => setMode("detailed")}>{t.invoiceDetailed}</Btn>
            <Btn variant={mode === "summary" ? "accent" : "ghost"} onClick={() => setMode("summary")}>{t.invoiceSummary}</Btn>
          </div>
          {party && (
            <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
              <Btn variant="primary" onClick={handlePrint} disabled={busy}>
                <Printer size={15} /> {t.printInvoice}
              </Btn>
              <Btn variant="ghost" onClick={handlePdf} disabled={busy}>
                <FileDown size={15} /> {t.savePdf}
              </Btn>
            </div>
          )}
          {party && docInfo && (
            <div style={{ flexBasis: "100%", fontSize: 12.5, color: COLORS.inkSoft, display: "flex", gap: 8, alignItems: "center" }}>
              <span>{t.docNumber}:</span>
              <b style={{ fontFamily: "'JetBrains Mono', monospace" }}>{docInfo.number}</b>
              <Badge color={docInfo.issued ? COLORS.in : COLORS.inkSoft} bg={docInfo.issued ? COLORS.inSoft : COLORS.bg}>
                {docInfo.issued ? t.numberIssued : t.numberWillBeAssigned}
              </Badge>
            </div>
          )}
        </div>
        {!party && <Empty t={{ noData: t.pickPartyFirst }} />}
      </div>

      {party && (
        <div id="invoice-print-area" style={{
          background: "#ffffff", border: `1px solid ${COLORS.border}`, borderRadius: 4,
          padding: "40px 44px", maxWidth: 780, margin: "0 auto", color: paperInk,
          fontFamily: "'Cairo', sans-serif", boxShadow: "0 2px 14px rgba(35,40,64,0.06)",
        }} dir={isRTL ? "rtl" : "ltr"}>

          {/* Letterhead */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 20 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 14, minWidth: 0 }}>
              {company.logo ? (
                <img src={company.logo} alt="" style={{ maxHeight: 68, maxWidth: 150, objectFit: "contain", flexShrink: 0 }} />
              ) : !company.configured ? (
                <Scissors size={24} color={paperInk} style={{ flexShrink: 0 }} />
              ) : null}
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 800, fontSize: 20, letterSpacing: 0.2, lineHeight: 1.3 }}>{company.name}</div>
                {company.lines.map((line, i) => (
                  <div key={i} style={{ fontSize: 11.5, color: paperMuted, lineHeight: 1.55 }}>{line}</div>
                ))}
              </div>
            </div>
            <div style={{ textAlign: endAlign, flexShrink: 0 }}>
              <div style={{ fontWeight: 800, fontSize: 21, textTransform: "uppercase", letterSpacing: 1, lineHeight: 1.2 }}>{t.statementOfAccount}</div>
              <div style={{ fontSize: 12.5, marginTop: 6 }}>
                <span style={{ color: paperMuted }}>{t.docNumber}: </span>
                <b style={{ fontFamily: "'JetBrains Mono', monospace" }}>{docNumber}</b>
              </div>
              <div style={{ fontSize: 12.5 }}>
                <span style={{ color: paperMuted }}>{t.generatedOn}: </span><b>{todayISO()}</b>
              </div>
            </div>
          </div>
          <div style={{ height: 3, background: paperLine, margin: "16px 0 20px" }} />

          {/* Bill-to / details block */}
          <div style={{ display: "flex", justifyContent: "space-between", gap: 20, flexWrap: "wrap", marginBottom: 24 }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: paperMuted, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>
                {party.type === "supplier" ? t.supplier : t.client}
              </div>
              <div style={{ fontWeight: 700, fontSize: 16 }}>{party.name}</div>
              <div style={{ fontSize: 12.5, color: paperMuted, marginTop: 2 }}>
                {party.type === "client" ? t.clientType : party.type === "supplier" ? t.supplierType : t.bothType}
                {party.phone ? ` · ${party.phone}` : ""}
              </div>
            </div>
            <div style={{ textAlign: endAlign, fontSize: 12.5 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: paperMuted, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>{t.period}</div>
              <b>{dateFrom} → {dateTo}</b>
            </div>
          </div>

          {mode === "detailed" && (
            ledgerRows.length === 0 ? (
              <div style={{ padding: 20, textAlign: "center", color: paperMuted, border: `1px solid ${paperRule}`, marginBottom: 20 }}>{t.noTxInPeriod}</div>
            ) : (
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5, marginBottom: 20 }}>
                <thead>
                  <tr style={{ borderBottom: `2px solid ${paperLine}` }}>
                    <th style={th}>{t.date}</th>
                    <th style={th}>{t.description}</th>
                    <th style={thNum}>{t.debit}</th>
                    <th style={thNum}>{t.credit}</th>
                    <th style={thNum}>{t.runningBalance}</th>
                  </tr>
                </thead>
                <tbody>
                  <tr style={{ borderBottom: `1px solid ${paperRule}`, background: "#F6F6F6" }}>
                    <td colSpan={4} style={{ padding: "7px 8px", fontStyle: "italic", color: paperMuted }}>{t.openingBalance}</td>
                    <td style={{ ...tdNum, fontWeight: 700 }}>{fmtMoney(Math.abs(openingBalance), lang)}</td>
                  </tr>
                  {ledgerRows.map((r, i) => (
                    <tr key={i} style={{ borderBottom: `1px solid ${paperRule}` }}>
                      <td style={{ padding: "7px 8px", whiteSpace: "nowrap" }}>{r.date}</td>
                      <td style={{ padding: "7px 8px" }}>{r.desc.map((d, j) => <div key={j}>{d}</div>)}</td>
                      <td style={tdNum}>{r.debit ? fmtMoney(r.debit, lang) : "—"}</td>
                      <td style={tdNum}>{r.credit ? fmtMoney(r.credit, lang) : "—"}</td>
                      <td style={{ ...tdNum, fontWeight: 700 }}>{fmtMoney(Math.abs(r.balanceAfter), lang)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )
          )}

          {/* Totals box */}
          <div className="keep-together" style={{ display: "flex", justifyContent: "flex-end", marginBottom: 36 }}>
            <table style={{ borderCollapse: "collapse", fontSize: 13, minWidth: 280 }}>
              <tbody>
                <tr>
                  <td style={{ padding: "5px 0", paddingInlineEnd: 18, color: paperMuted }}>{t.openingBalance}</td>
                  <td style={{ padding: "5px 0", textAlign: endAlign, fontFamily: "'JetBrains Mono', monospace" }}>{fmtMoney(Math.abs(openingBalance), lang)}</td>
                </tr>
                <tr>
                  <td style={{ padding: "5px 0", paddingInlineEnd: 18, color: paperMuted }}>{t.totalDebit}</td>
                  <td style={{ padding: "5px 0", textAlign: endAlign, fontFamily: "'JetBrains Mono', monospace" }}>{fmtMoney(totalDebit, lang)}</td>
                </tr>
                <tr>
                  <td style={{ padding: "5px 0", paddingInlineEnd: 18, color: paperMuted }}>{t.totalCredit}</td>
                  <td style={{ padding: "5px 0", textAlign: endAlign, fontFamily: "'JetBrains Mono', monospace" }}>{fmtMoney(totalCredit, lang)}</td>
                </tr>
                <tr style={{ borderTop: `2px solid ${paperLine}` }}>
                  <td style={{ padding: "9px 0 2px", paddingInlineEnd: 18, fontWeight: 800, fontSize: 14 }}>{t.closingBalance}</td>
                  <td style={{ padding: "9px 0 2px", textAlign: endAlign, fontWeight: 800, fontSize: 16, fontFamily: "'JetBrains Mono', monospace" }}>
                    {fmtMoney(Math.abs(closingBalance), lang)}
                  </td>
                </tr>
                <tr>
                  <td colSpan={2} style={{ paddingTop: 2, textAlign: endAlign, fontSize: 11.5, color: paperMuted }}>
                    {closingBalance > 0 ? t.theyOweYou : closingBalance < 0 ? t.youOweThem : t.settled}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Signatures + footer */}
          <div className="keep-together">
            <div style={{ display: "flex", justifyContent: "space-between", gap: 40, marginTop: 50 }}>
              <div style={{ flex: 1, textAlign: "center" }}>
                <div style={{ borderTop: `1px solid ${paperInk}`, paddingTop: 6, fontSize: 12, color: paperMuted }}>
                  {company.name}
                </div>
              </div>
              <div style={{ flex: 1, textAlign: "center" }}>
                <div style={{ borderTop: `1px solid ${paperInk}`, paddingTop: 6, fontSize: 12, color: paperMuted }}>
                  {party.name}
                </div>
              </div>
            </div>
            {company.footer && (
              <div style={{ marginTop: 34, paddingTop: 10, borderTop: `1px solid ${paperRule}`, textAlign: "center", fontSize: 11.5, color: paperMuted }}>
                {company.footer}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
