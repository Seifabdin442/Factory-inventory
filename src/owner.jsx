// The Owner screen: trial / activation and the customer's user accounts.
// It is shown only while the hidden owner account is logged in; the main process refuses these
// actions for anyone else.
import React, { useState, useEffect } from "react";
import { Plus, Trash2, KeyRound, Clock, ShieldCheck, UserRound } from "lucide-react";
import { COLORS, errMsg, todayISO, Btn, Input, Modal } from "./ui.jsx";
import { fill } from "./i18n.js";
import { SettingsCard } from "./settings.jsx";

function LicenseCard({ t, notify, license, onLicense }) {
  const [start, setStart] = useState(todayISO());
  const [days, setDays] = useState(String((license && license.defaultTrialDays) || 14));
  const [contact, setContact] = useState((license && license.contact) || "");
  const [busy, setBusy] = useState(false);
  async function apply(change) {
    setBusy(true);
    try {
      const res = await window.license.set({ ...change, contact });
      if (res && res.ok) { onLicense(res.status); notify(t.licenseSaved); } else notify(t.saveFailed, "error");
    } catch (err) { notify(`${t.saveFailed}: ${errMsg(err)}`, "error"); }
    setBusy(false);
  }
  const st = license || {};
  const label = st.state === "full" ? t.lic_full
    : st.state === "trial" ? fill(t.lic_trial, { d: st.until, n: st.daysLeft })
      : fill(t.lic_expired, { d: st.until || "" });
  const color = st.state === "full" ? COLORS.in : st.state === "trial" ? "#8A5A00" : COLORS.out;
  const n = Math.max(Math.round(Number(days) || 0), 0);
  return (
    <SettingsCard title={t.licenseCard} desc={t.licenseDesc}>
      <div data-license-state={st.state} style={{ fontSize: 14.5, fontWeight: 800, color, marginBottom: 14 }}>{label}</div>
      <div style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap" }}>
        <div style={{ width: 180 }}>
          <Input label={t.trialStartDate} type="date" value={start} onChange={(e) => setStart(e.target.value)} />
        </div>
        <div style={{ width: 150 }}>
          <Input label={t.trialDays} type="number" min="1" step="1" value={days} onChange={(e) => setDays(e.target.value)} dir="ltr" />
        </div>
        <Btn variant="primary" disabled={busy || n < 1 || !start} onClick={() => apply({ mode: "trial", days: n, start })} style={{ marginBottom: 12 }}>
          <Clock size={15} /> {t.setTrial}
        </Btn>
      </div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 16 }}>
        <Btn variant="accent" disabled={busy} onClick={() => apply({ mode: "full" })}><ShieldCheck size={15} /> {t.activateFull}</Btn>
        <Btn variant="danger" disabled={busy} onClick={() => apply({ mode: "expired" })}>{t.endTrialNow}</Btn>
        <Btn variant="ghost" disabled={busy} onClick={() => apply({ mode: "default" })}>{fill(t.resetTrial, { n: st.defaultTrialDays || 14 })}</Btn>
      </div>
      <Input label={t.contactOnExpiry} value={contact} onChange={(e) => setContact(e.target.value)} placeholder={t.contactOnExpiryPh} maxLength={200} />
      <Btn variant="ghost" disabled={busy} onClick={() => apply({ mode: "contact" })}>{t.saveContact}</Btn>
    </SettingsCard>
  );
}

function UserModal({ t, user, onClose, onSave }) {
  const [username, setUsername] = useState(user ? user.username : "");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const canSave = username.trim() && password.length >= 4;
  const save = async () => {
    if (!canSave) return;
    const res = await onSave({ id: user ? user.id : null, username: username.trim(), password });
    if (!res || !res.ok) setError(res && (res.reason === "reserved" || res.reason === "taken") ? t.usernameTaken : t.saveFailed);
  };
  return (
    <Modal title={user ? `${t.resetPassword} — ${user.username}` : t.addUser} onClose={onClose} onSubmit={save}>
      <Input label={t.username} value={username} onChange={(e) => setUsername(e.target.value)} autoFocus={!user} disabled={!!user} />
      <Input label={user ? t.newPassword : t.password} type="password" value={password} autoFocus={!!user} onChange={(e) => setPassword(e.target.value)} />
      <div style={{ fontSize: 12, color: COLORS.muted, margin: "-6px 0 10px" }}>{t.passwordTooShort}</div>
      {error && <div role="alert" style={{ color: COLORS.out, fontSize: 13, marginBottom: 10 }}>{error}</div>}
      <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
        <Btn variant="ghost" onClick={onClose}>{t.cancel}</Btn>
        <Btn variant="accent" disabled={!canSave} onClick={save}>{t.save}</Btn>
      </div>
    </Modal>
  );
}

function UsersCard({ t, notify }) {
  const [users, setUsers] = useState([]);
  const [modal, setModal] = useState(null); // { user? }
  const [confirm, setConfirm] = useState(null);
  const load = () => window.owner.listUsers().then((list) => setUsers(list || [])).catch((err) => notify(errMsg(err), "error"));
  useEffect(() => { load(); }, []);
  async function saveUser(data) {
    const res = await window.owner.saveUser(data);
    if (res && res.ok) { setModal(null); notify(t.savedOk); load(); }
    return res;
  }
  async function remove(id) {
    const res = await window.owner.deleteUser(id);
    if (res && res.ok) { notify(t.deletedOk); load(); } else notify(t.deleteFailed, "error");
    setConfirm(null);
  }
  const iconBtn = { background: "none", border: "none", cursor: "pointer", color: COLORS.muted, padding: 4 };
  return (
    <SettingsCard title={t.usersCard} desc={t.usersDesc}>
      {users.length === 0 ? (
        <div style={{ color: COLORS.muted, fontSize: 13.5, marginBottom: 12 }}>{t.noUsers}</div>
      ) : (
        <div style={{ border: `1px solid ${COLORS.border}`, borderRadius: 10, marginBottom: 12, overflow: "hidden" }}>
          {users.map((u, i) => (
            <div key={u.id} data-user-row={u.username} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderTop: i ? `1px solid ${COLORS.border}` : "none" }}>
              <UserRound size={17} color={COLORS.inkSoft} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 14 }}>{u.username}</div>
                <div style={{ fontSize: 12, color: COLORS.muted }}>{t.createdOn}: {String(u.createdAt || "").slice(0, 10)}</div>
              </div>
              <button onClick={() => setModal({ user: u })} title={t.resetPassword} style={iconBtn}><KeyRound size={16} /></button>
              <button onClick={() => setConfirm(u)} title={t.delete} style={iconBtn}><Trash2 size={16} /></button>
            </div>
          ))}
        </div>
      )}
      <Btn variant="primary" onClick={() => setModal({})}><Plus size={15} /> {t.addUser}</Btn>
      {modal && <UserModal t={t} user={modal.user || null} onClose={() => setModal(null)} onSave={saveUser} />}
      {confirm && (
        <Modal title={fill(t.confirmDeleteUser, { u: confirm.username })} onClose={() => setConfirm(null)}>
          <div style={{ fontSize: 13, color: COLORS.inkSoft, marginBottom: 14 }}>{users.length === 1 ? t.deleteLastUserHint : t.deleteUserHint}</div>
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
            <Btn variant="ghost" onClick={() => setConfirm(null)}>{t.no}</Btn>
            <Btn variant="danger" onClick={() => remove(confirm.id)}>{t.yes}, {t.delete}</Btn>
          </div>
        </Modal>
      )}
    </SettingsCard>
  );
}

export function OwnerView({ t, notify, license, onLicense }) {
  return (
    <div style={{ maxWidth: 820 }}>
      <h2 style={{ margin: "0 0 4px", fontSize: 20, fontWeight: 800 }}>{t.ownerTab}</h2>
      <div style={{ fontSize: 13, color: COLORS.muted, marginBottom: 16 }}>{t.ownerDesc}</div>
      <LicenseCard t={t} notify={notify} license={license} onLicense={onLicense} />
      <UsersCard t={t} notify={notify} />
    </div>
  );
}
