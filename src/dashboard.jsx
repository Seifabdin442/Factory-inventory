// Dashboard and Reports (including the aging of balances).
import React, { useState, useMemo } from "react";
import { FileDown, Clock, ChevronLeft, ChevronRight } from "lucide-react";
import {
  COLORS, CHART, fmtMoney, thisMonthKey, StitchDivider, Btn, MetricCard, ReportCard, Empty,
} from "./ui.jsx";
import { fill } from "./i18n.js";
import { MonthlyCashChart, HBarList, AgingBar } from "./charts.jsx";
import { computeAging, monthlySeries, periodTotals } from "./analytics.js";
import { TxRow } from "./entries.jsx";
import { inventoryTotals } from "./inventory.js";
import { LowStockList } from "./stock.jsx";

const mono = "'JetBrains Mono', monospace";

function Card({ title, action, children, style }) {
  return (
    <div style={{ background: COLORS.surface, border: `1px solid ${COLORS.border}`, borderRadius: 12, padding: 16, minWidth: 0, ...style }}>
      {(title || action) && (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, marginBottom: 12 }}>
          <div style={{ fontWeight: 800, fontSize: 14.5 }}>{title}</div>
          {action}
        </div>
      )}
      {children}
    </div>
  );
}

const linkBtn = {
  background: "none", border: "none", color: COLORS.accent, fontWeight: 700, fontSize: 12.5,
  cursor: "pointer", fontFamily: "inherit", padding: 0, display: "inline-flex", alignItems: "center", gap: 3,
};

export function Dashboard({ t, lang, transactions, parties, partiesWithBalance, totalReceivable, totalPayable, today, onOpenParty, onGoAging,
  catalog, inv, settings, onGoInventory }) {
  const stockTotals = inventoryTotals(catalog, inv, settings);
  const isRTL = lang === "ar";
  const Arrow = isRTL ? ChevronLeft : ChevronRight;
  const month = thisMonthKey();
  const stats = periodTotals(transactions.filter((x) => String(x.date).slice(0, 7) === month), inv);
  const series = useMemo(() => monthlySeries(transactions, month, 12), [transactions, month]);
  const aging = useMemo(() => computeAging(parties, transactions, today, "receivable"), [parties, transactions, today]);
  const topDebtors = partiesWithBalance.filter((p) => p.balance > 0).sort((a, b) => b.balance - a.balance).slice(0, 5);
  const recent = transactions.slice(0, 6);
  const bucketLabels = [t.bucket0, t.bucket1, t.bucket2, t.bucket3];

  return (
    <div>
      <h2 style={{ margin: "0 0 4px", fontSize: 20, fontWeight: 800 }}>{t.dashboard}</h2>
      <div style={{ fontSize: 13, color: COLORS.muted, marginBottom: 16 }}>{t.thisMonth}</div>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
        <MetricCard label={t.moneyIn} value={fmtMoney(stats.moneyIn, lang)} tone="in" />
        <MetricCard label={t.moneyOut} value={fmtMoney(stats.moneyOut, lang)} tone="out" />
        <MetricCard label={t.netCashFlow} value={fmtMoney(stats.net, lang)} tone={stats.net >= 0 ? "in" : "out"} />
        <MetricCard label={t.estimatedProfit} value={fmtMoney(stats.profit, lang)} tone={stats.profit >= 0 ? "in" : "out"} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.7fr) minmax(260px, 1fr)", gap: 16, marginBottom: 16 }}>
        <Card title={t.cashLast12}>
          <MonthlyCashChart data={series} t={t} lang={lang} />
        </Card>
        <Card title={t.receivablesAging} action={<button style={linkBtn} onClick={onGoAging}>{t.viewAging} <Arrow size={14} /></button>}>
          <div style={{ fontSize: 12, color: COLORS.muted }}>{t.outstandingReceivables}</div>
          <div style={{ fontFamily: mono, fontWeight: 800, fontSize: 22, color: COLORS.in, margin: "2px 0 14px" }}>{fmtMoney(totalReceivable, lang)}</div>
          <AgingBar buckets={aging.totals.buckets} labels={bucketLabels} lang={lang} />
          {aging.totals.buckets[3] > 0 && (
            <div style={{
              marginTop: 14, display: "flex", gap: 8, alignItems: "center", fontSize: 12.5,
              background: COLORS.outSoft, color: COLORS.out, borderRadius: 8, padding: "8px 10px", fontWeight: 700,
            }}>
              <Clock size={15} /> {t.overdue90}: <span style={{ fontFamily: mono }}>{fmtMoney(aging.totals.buckets[3], lang)}</span>
            </div>
          )}
        </Card>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(260px, 1fr) minmax(0, 1.7fr)", gap: 16, marginBottom: 16 }}>
        <Card title={t.topDebtors}>
          <HBarList lang={lang} color={CHART.in} emptyText={t.noOpenBalances}
            rows={topDebtors.map((p) => ({ key: p.id, label: p.name, value: p.balance }))}
            onClick={(r) => onOpenParty(r.key)} />
        </Card>
        <Card title={t.recent} style={{ paddingBottom: 0 }}>
          <div style={{ margin: "0 -16px", borderTop: `1px solid ${COLORS.border}` }}>
            {recent.length === 0 ? <Empty t={t} /> : recent.map((x, i) => {
              const p = parties.find((pp) => pp.id === x.partyId);
              return <TxRow key={x.id} tx={x} lang={lang} t={t} last={i === recent.length - 1} partyName={p ? p.name : ""} />;
            })}
          </div>
        </Card>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(260px, 1fr) minmax(0, 1.7fr)", gap: 16, marginBottom: 16 }}>
        <Card title={t.inventory} action={<button style={linkBtn} onClick={onGoInventory}>{t.viewInventory} <Arrow size={14} /></button>}>
          <div style={{ fontSize: 12, color: COLORS.muted }}>{t.totalStockValue}</div>
          <div style={{ fontFamily: mono, fontWeight: 800, fontSize: 22, margin: "2px 0 10px" }}>{fmtMoney(stockTotals.value, lang)}</div>
          <div style={{ fontSize: 12.5, color: COLORS.inkSoft }}>{t.materials}: <span style={{ fontFamily: mono }}>{fmtMoney(stockTotals.materialsValue, lang)}</span></div>
          <div style={{ fontSize: 12.5, color: COLORS.inkSoft }}>{t.products}: <span style={{ fontFamily: mono }}>{fmtMoney(stockTotals.productsValue, lang)}</span></div>
        </Card>
        <Card title={t.lowStockItems}>
          <LowStockList t={t} lang={lang} catalog={catalog} inv={inv} settings={settings} onOpen={onGoInventory} />
        </Card>
      </div>

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <MetricCard label={t.outstandingReceivables} value={fmtMoney(totalReceivable, lang)} tone="in" />
        <MetricCard label={t.outstandingPayables} value={fmtMoney(totalPayable, lang)} tone="out" />
        <MetricCard label={t.numClients} value={parties.filter((p) => p.type !== "supplier").length} />
        <MetricCard label={t.numSuppliers} value={parties.filter((p) => p.type !== "client").length} />
      </div>
    </div>
  );
}

export function AgingSection({ t, lang, parties, transactions, today, side, setSide, onOpenParty, onExport }) {
  const aging = useMemo(() => computeAging(parties, transactions, today, side), [parties, transactions, today, side]);
  const labels = [t.bucket0, t.bucket1, t.bucket2, t.bucket3];
  const th = { padding: "9px 10px", fontSize: 11.5, color: COLORS.muted, fontWeight: 700, textAlign: "end", borderBottom: `1px solid ${COLORS.border}`, whiteSpace: "nowrap" };
  const td = { padding: "9px 10px", fontSize: 13, textAlign: "end", fontFamily: mono, borderBottom: `1px solid ${COLORS.border}`, whiteSpace: "nowrap" };
  const tab = (active) => ({
    padding: "7px 14px", borderRadius: 8, border: "none", cursor: "pointer", fontFamily: "inherit", fontWeight: 700, fontSize: 13,
    background: active ? COLORS.surface : "transparent", color: active ? COLORS.ink : COLORS.muted,
    boxShadow: active ? "0 1px 4px rgba(35,40,64,0.12)" : "none",
  });
  return (
    <div id="aging" style={{ background: COLORS.surface, border: `1px solid ${COLORS.border}`, borderRadius: 12, padding: 16, marginBottom: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
        <div>
          <div style={{ fontWeight: 800, fontSize: 15.5 }}>{t.agingReport}</div>
          <div style={{ fontSize: 12.5, color: COLORS.muted, maxWidth: 520 }}>{t.agingDesc}</div>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <div style={{ display: "flex", background: COLORS.bg, borderRadius: 10, padding: 3 }}>
            <button style={tab(side === "receivable")} onClick={() => setSide("receivable")}>{t.receivables}</button>
            <button style={tab(side === "payable")} onClick={() => setSide("payable")}>{t.payables}</button>
          </div>
          <Btn variant="ghost" onClick={onExport} style={{ padding: "7px 12px" }}><FileDown size={15} /> Excel</Btn>
        </div>
      </div>
      <AgingBar buckets={aging.totals.buckets} labels={labels} lang={lang} />
      {aging.rows.length === 0 ? <Empty t={{ noData: t.noOpenBalances }} /> : (
        <div style={{ overflowX: "auto", marginTop: 16 }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={{ ...th, textAlign: "start" }}>{t.name}</th>
                <th style={th}>{t.total}</th>
                {labels.map((l) => <th key={l} style={th}>{l}</th>)}
                <th style={th}>{t.oldestUnpaid}</th>
              </tr>
            </thead>
            <tbody>
              {aging.rows.map((r) => (
                <tr key={r.party.id} onClick={() => onOpenParty(r.party.id)} style={{ cursor: "pointer" }}>
                  <td style={{ ...td, textAlign: "start", fontFamily: "inherit", fontWeight: 700 }}>{r.party.name}</td>
                  <td style={{ ...td, fontWeight: 800 }}>{fmtMoney(r.total, lang)}</td>
                  {r.buckets.map((v, i) => (
                    <td key={i} style={{ ...td, color: v > 0 ? (i === 3 ? COLORS.out : COLORS.ink) : COLORS.border, fontWeight: i === 3 && v > 0 ? 800 : 500 }}>
                      {v > 0 ? fmtMoney(v, lang) : "—"}
                    </td>
                  ))}
                  <td style={{ ...td, fontFamily: "inherit", fontSize: 12.5 }}>
                    {r.oldestDate}<div style={{ color: COLORS.muted, fontSize: 11.5 }}>{fill(t.daysAgo, { n: r.oldestDays })}</div>
                  </td>
                </tr>
              ))}
              <tr>
                <td style={{ ...td, textAlign: "start", fontFamily: "inherit", fontWeight: 800, borderBottom: "none" }}>{t.total}</td>
                <td style={{ ...td, fontWeight: 800, borderBottom: "none" }}>{fmtMoney(aging.totals.total, lang)}</td>
                {aging.totals.buckets.map((v, i) => <td key={i} style={{ ...td, fontWeight: 800, borderBottom: "none" }}>{fmtMoney(v, lang)}</td>)}
                <td style={{ ...td, borderBottom: "none" }} />
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export function ReportsView({ t, lang, reportMonth, setReportMonth, transactions, allTransactions, parties, totalReceivable, totalPayable,
  today, agingSide, setAgingSide, onOpenParty, exports, inv }) {
  const s = periodTotals(transactions, inv);
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 10 }}>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800 }}>{t.reports}</h2>
        <input type="month" value={reportMonth} onChange={(e) => setReportMonth(e.target.value)}
          style={{ padding: "8px 12px", borderRadius: 8, border: `1px solid ${COLORS.border}`, fontSize: 14, fontFamily: "inherit" }} />
      </div>
      <div style={{
        background: COLORS.ink, color: "#fff", borderRadius: 12, padding: "16px 18px", marginBottom: 12,
        display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14, flexWrap: "wrap",
      }}>
        <div>
          <div style={{ fontWeight: 800, fontSize: 15 }}>{t.downloadAllExcel}</div>
          <div style={{ fontSize: 12.5, color: "#B9BCD0" }}>{t.fullWorkbookDesc} · {reportMonth}</div>
        </div>
        <Btn variant="accent" onClick={exports.all}><FileDown size={16} /> {t.downloadExcel}</Btn>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 12, marginBottom: 22 }}>
        <ReportCard title={t.summaryReport} desc={t.transactionsThisMonth} label={t.downloadExcel} onClick={exports.summary} />
        <ReportCard title={t.salesReportTitle} desc={t.sales} label={t.downloadExcel} onClick={exports.sales} />
        <ReportCard title={t.purchasesReportTitle} desc={t.purchases} label={t.downloadExcel} onClick={exports.purchases} />
        <ReportCard title={t.expensesReport} desc={t.expenses} label={t.downloadExcel} onClick={exports.expenses} />
        <ReportCard title={t.balancesReport} desc={t.snapshot} label={t.downloadExcel} onClick={exports.balances} />
        <ReportCard title={t.inventoryReport} desc={t.snapshot} label={t.downloadExcel} onClick={exports.inventory} />
      </div>
      <StitchDivider />
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", margin: "18px 0" }}>
        <MetricCard label={t.moneyIn} value={fmtMoney(s.moneyIn, lang)} tone="in" />
        <MetricCard label={t.moneyOut} value={fmtMoney(s.moneyOut, lang)} tone="out" />
        <MetricCard label={t.netCashFlow} value={fmtMoney(s.net, lang)} tone={s.net >= 0 ? "in" : "out"} />
      </div>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 6 }}>
        <MetricCard label={`${t.totalSales} (${t.invoiced})`} value={fmtMoney(s.sales, lang)} />
        <MetricCard label={`${t.totalPurchases} (${t.invoiced})`} value={fmtMoney(s.purchases, lang)} />
        <MetricCard label={t.cogs} value={fmtMoney(s.cogs, lang)} tone="out" />
        <MetricCard label={t.expensesTotal} value={fmtMoney(s.expenses, lang)} tone="out" />
        <MetricCard label={t.estimatedProfit} value={fmtMoney(s.profit, lang)} tone={s.profit >= 0 ? "in" : "out"} />
      </div>
      <div style={{ fontSize: 11.5, color: COLORS.muted, marginBottom: 18 }}>{t.estimatedProfit} = {t.profitHint}</div>
      <StitchDivider />
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", margin: "18px 0" }}>
        <MetricCard label={`${t.outstandingReceivables} (${t.snapshot})`} value={fmtMoney(totalReceivable, lang)} tone="in" />
        <MetricCard label={`${t.outstandingPayables} (${t.snapshot})`} value={fmtMoney(totalPayable, lang)} tone="out" />
      </div>
      <AgingSection t={t} lang={lang} parties={parties} transactions={allTransactions} today={today}
        side={agingSide} setSide={setAgingSide} onOpenParty={onOpenParty} onExport={exports.aging} />
      <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 10 }}>{t.transactionsThisMonth}</h3>
      {transactions.length === 0 ? <Empty t={t} /> : (
        <div style={{ background: COLORS.surface, border: `1px solid ${COLORS.border}`, borderRadius: 12, overflow: "hidden" }}>
          {transactions.map((x, i) => {
            const p = parties.find((pp) => pp.id === x.partyId);
            return <TxRow key={x.id} tx={x} lang={lang} t={t} last={i === transactions.length - 1} partyName={p ? p.name : ""} />;
          })}
        </div>
      )}
    </div>
  );
}
