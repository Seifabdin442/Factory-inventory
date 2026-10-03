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
import { TxRow } from "./entries.jsx";

export function PartiesView({ t, lang, parties, onAdd, onOpen, search, setSearch }) {
  const filtered = parties.filter((p) => p.name.toLowerCase().includes(search.toLowerCase()));
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 10 }}>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800 }}>{t.parties}</h2>
        <Btn variant="accent" onClick={onAdd} title="Ctrl+N"><Plus size={16} /> {t.addParty}</Btn>
      </div>
      <div style={{ marginBottom: 14 }}><SearchBox value={search} onChange={setSearch} placeholder={t.search} /></div>
      {filtered.length === 0 ? <Empty t={t} /> : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(230px, 1fr))", gap: 12 }}>
          {filtered.map((p) => {
            const typeLabel = p.type === "client" ? t.clientType : p.type === "supplier" ? t.supplierType : t.bothType;
            const bal = p.balance;
            return (
              <div key={p.id} onClick={() => onOpen(p)} style={{
                background: COLORS.surface, border: `1px solid ${COLORS.border}`, borderRadius: 12,
                padding: 16, cursor: "pointer",
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                  <div style={{ fontWeight: 700, fontSize: 15 }}>{p.name}</div>
                  <Badge color={COLORS.inkSoft} bg={COLORS.accentSoft}>{typeLabel}</Badge>
                </div>
                <div style={{ fontSize: 12, color: COLORS.muted, marginBottom: 8 }}>
                  {bal > 0 ? t.theyOweYou : bal < 0 ? t.youOweThem : t.settled}
                </div>
                <div style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 800, fontSize: 16, color: bal > 0 ? COLORS.in : bal < 0 ? COLORS.out : COLORS.muted }}>
                  {fmtMoney(Math.abs(bal), lang)}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function PaymentModal({ t, lang, party, editPay, onClose, onSave }) {
  const [amount, setAmount] = useState(editPay ? editPay.paid : "");
  const [date, setDate] = useState(editPay ? editPay.date : todayISO());
  const [notes, setNotes] = useState(editPay ? editPay.notes : "");
  const isIn = party.type !== "supplier";
  return (
    <Modal title={(editPay ? `${t.edit} — ` : "") + `${t.recordPayment} — ${party.name}`} onClose={onClose}
      onSubmit={() => { if (Number(amount) > 0) onSave({ date, amount, notes }); }}>
      <Input label={t.date} type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      <Input label={t.paymentAmount} type="number" min="0" step="any" value={amount} autoFocus onChange={(e) => setAmount(e.target.value)} />
      <Input label={t.notes} value={notes} onChange={(e) => setNotes(e.target.value)} />
      <div style={{ fontSize: 12.5, color: COLORS.muted, marginBottom: 12 }}>
        {isIn ? t.paymentIn : t.paymentOut}
      </div>
      <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
        <Btn variant="ghost" onClick={onClose}>{t.cancel}</Btn>
        <Btn variant="accent" disabled={!(Number(amount) > 0)} onClick={() => onSave({ date, amount, notes })}>{t.save}</Btn>
      </div>
    </Modal>
  );
}

export function PartyModal({ t, lang, editParty, onClose, onSave }) {
  const [name, setName] = useState(editParty ? editParty.name : "");
  const [type, setType] = useState(editParty ? editParty.type : "client");
  const [phone, setPhone] = useState(editParty ? (editParty.phone || "") : "");
  return (
    <Modal title={editParty ? `${t.edit} — ${t.addParty}` : t.addParty} onClose={onClose}
      onSubmit={() => { if (name.trim()) onSave(name.trim(), type, phone); }}>
      <Input label={t.name} value={name} autoFocus onChange={(e) => setName(e.target.value)} />
      <Select label={t.type} value={type} onChange={(e) => setType(e.target.value)}>
        <option value="client">{t.clientType}</option>
        <option value="supplier">{t.supplierType}</option>
        <option value="both">{t.bothType}</option>
      </Select>
      <Input label={t.phone} value={phone} onChange={(e) => setPhone(e.target.value)} />
      <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 8 }}>
        <Btn variant="ghost" onClick={onClose}>{t.cancel}</Btn>
        <Btn variant="accent" disabled={!name.trim()} onClick={() => onSave(name.trim(), type, phone)}>{t.save}</Btn>
      </div>
    </Modal>
  );
}

export function PartyDetailModal({ t, lang, party, transactions, onClose, onPay, onDeleteTx, onEditTx, onEditParty, onDeleteParty }) {
  const bal = party.balance ?? 0;
  const typeLabel = party.type === "client" ? t.clientType : party.type === "supplier" ? t.supplierType : t.bothType;
  const sorted = [...transactions].sort((a, b) => (a.date < b.date ? 1 : -1));
  return (
    <Modal title={party.name} onClose={onClose} wide>
      <div style={{ display: "flex", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
        <Badge color={COLORS.inkSoft} bg={COLORS.accentSoft}>{typeLabel}</Badge>
        {party.phone && <Badge color={COLORS.inkSoft} bg={COLORS.bg}>{party.phone}</Badge>}
      </div>
      <div style={{
        background: bal > 0 ? COLORS.inSoft : bal < 0 ? COLORS.outSoft : COLORS.bg,
        borderRadius: 10, padding: 14, marginBottom: 16,
      }}>
        <div style={{ fontSize: 12.5, color: COLORS.muted, marginBottom: 4 }}>
          {bal > 0 ? t.theyOweYou : bal < 0 ? t.youOweThem : t.settled}
        </div>
        <div style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 800, fontSize: 20, color: bal > 0 ? COLORS.in : bal < 0 ? COLORS.out : COLORS.muted }}>
          {fmtMoney(Math.abs(bal), lang)}
        </div>
      </div>
      <div style={{ display: "flex", gap: 10, marginBottom: 18 }}>
        <Btn variant="accent" onClick={onPay}><Wallet size={15} /> {t.recordPayment}</Btn>
        <Btn variant="ghost" onClick={onEditParty}><Pencil size={15} /> {t.edit}</Btn>
        <Btn variant="danger" onClick={onDeleteParty}><Trash2 size={15} /> {t.delete}</Btn>
      </div>
      <h4 style={{ fontSize: 14, fontWeight: 700, marginBottom: 8 }}>{t.history}</h4>
      {sorted.length === 0 ? <Empty t={t} /> : (
        <div style={{ border: `1px solid ${COLORS.border}`, borderRadius: 10, overflow: "hidden" }}>
          {sorted.map((x, i) => <TxRow key={x.id} tx={x} lang={lang} t={t} last={i === sorted.length - 1} onDelete={onDeleteTx} onEdit={onEditTx} />)}
        </div>
      )}
    </Modal>
  );
}
