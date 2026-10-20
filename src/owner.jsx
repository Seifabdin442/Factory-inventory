// The Owner screen: trial / activation and the customer's user accounts.
// It is shown only while the hidden owner account is logged in; the main process refuses these
// actions for anyone else.
import React, { useState, useEffect } from "react";
import { Plus, Trash2, KeyRound, Clock, ShieldCheck, UserRound, Pencil, UsersRound } from "lucide-react";
import { COLORS, errMsg, todayISO, Btn, Input, Select, Modal } from "./ui.jsx";
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

/* Which pages this customer gets. Saved inside the signed licence, for this computer. */
function ModulesCard({ t, notify, license, onLicense, modules }) {
  const saved = license && Array.isArray(license.modules) ? license.modules : null; // null = everything
  const [on, setOn] = useState(() => new Set(saved || modules.map(([k]) => k)));
  const [busy, setBusy] = useState(false);
  const toggle = (key) => setOn((prev) => { const next = new Set(prev); if (next.has(key)) next.delete(key); else next.add(key); return next; });
  const dirty = modules.some(([k]) => on.has(k) !== (saved ? saved.includes(k) : true));
  async function save() {
    setBusy(true);
    try {
      const list = modules.map(([k]) => k).filter((k) => on.has(k));
      const res = await window.license.set({ mode: "modules", modules: list.length === modules.length ? null : list });
      if (res && res.ok) { onLicense(res.status); notify(t.modulesSaved); } else notify(t.saveFailed, "error");
    } catch (err) { notify(`${t.saveFailed}: ${errMsg(err)}`, "error"); }
    setBusy(false);
  }
  return (
    <SettingsCard title={t.modulesCard} desc={t.modulesDesc}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 8, marginBottom: 14 }}>
        {modules.map(([key, label]) => (
          <label key={key} data-module={key} style={{
            display: "flex", gap: 9, alignItems: "center", padding: "9px 12px", borderRadius: 9, cursor: "pointer", fontSize: 14, fontWeight: 600,
            border: `1px solid ${on.has(key) ? COLORS.accent : COLORS.border}`, background: on.has(key) ? COLORS.accentSoft : COLORS.surface,
          }}>
            <input type="checkbox" checked={on.has(key)} onChange={() => toggle(key)} style={{ width: 16, height: 16 }} />
            {label}
          </label>
        ))}
      </div>
      <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <Btn variant="accent" disabled={busy || !dirty} onClick={save}>{t.saveModules}</Btn>
        <span style={{ fontSize: 12.5, color: COLORS.muted }}>{fill(t.modulesCount, { n: on.size, m: modules.length })}</span>
      </div>
    </SettingsCard>
  );
}

/* Pages that only make sense as "see it or not" get two choices; the rest get three. */
const VIEW_ONLY_PAGES = ["dashboard", "reports", "invoices"];
const levelsFor = (key) => (key === "settings" ? ["none", "edit"] : VIEW_ONLY_PAGES.includes(key) ? ["none", "view"] : ["none", "view", "edit"]);

function RoleModal({ t, role, pages, onClose, onSave }) {
  const [name, setName] = useState(role ? role.name : "");
  const [perms, setPerms] = useState(() => Object.fromEntries(pages.map(([k]) => [k, role ? role.permissions[k] || "none" : levelsFor(k).slice(-1)[0]])));
  const [error, setError] = useState("");
  const canSave = name.trim().length > 0;
  const save = async () => {
    if (!canSave) return;
    const res = await onSave({ id: role ? role.id : null, name: name.trim(), permissions: perms });
    if (!res || !res.ok) setError(t.saveFailed);
  };
  const setAll = (pick) => setPerms(Object.fromEntries(pages.map(([k]) => [k, pick(levelsFor(k))])));
  const chip = (active, tone) => ({
    padding: "5px 12px", borderRadius: 999, fontSize: 12.5, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
    border: `1px solid ${active ? tone : COLORS.border}`, background: active ? tone : COLORS.surface, color: active ? "#fff" : COLORS.inkSoft,
  });
  const tones = { none: COLORS.muted, view: COLORS.accent, edit: COLORS.in };
  const label = (key, lv) => (lv === "none" ? t.perm_none : lv === "view" ? (VIEW_ONLY_PAGES.includes(key) ? t.perm_allowed : t.perm_view) : (key === "settings" ? t.perm_allowed : t.perm_edit));
  return (
    <Modal title={role ? t.editRole : t.addRole} onClose={onClose} onSubmit={save} wide>
      <Input label={t.roleName} value={name} onChange={(e) => setName(e.target.value)} autoFocus placeholder={t.roleNamePh} maxLength={60} />
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, margin: "4px 0 8px", flexWrap: "wrap" }}>
        <div style={{ fontSize: 13.5, fontWeight: 800 }}>{t.permissionsLabel}</div>
        <div style={{ display: "flex", gap: 6 }}>
          <button style={chip(false, COLORS.ink)} onClick={() => setAll((l) => l[l.length - 1])}>{t.allowAll}</button>
          <button style={chip(false, COLORS.ink)} onClick={() => setAll((l) => (l.includes("view") ? "view" : "none"))}>{t.viewAll}</button>
          <button style={chip(false, COLORS.ink)} onClick={() => setAll(() => "none")}>{t.hideAll}</button>
        </div>
      </div>
      <div style={{ border: `1px solid ${COLORS.border}`, borderRadius: 10, overflow: "hidden", marginBottom: 12 }}>
        {pages.map(([key, text], i) => (
          <div key={key} data-perm-row={key} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "8px 12px", borderTop: i ? `1px solid ${COLORS.border}` : "none" }}>
            <span style={{ fontSize: 14, fontWeight: 600 }}>{text}</span>
            <span style={{ display: "flex", gap: 6 }}>
              {levelsFor(key).map((lv) => (
                <button key={lv} data-level={lv} style={chip(perms[key] === lv, tones[lv])} onClick={() => setPerms((prev) => ({ ...prev, [key]: lv }))}>{label(key, lv)}</button>
              ))}
            </span>
          </div>
        ))}
      </div>
      {error && <div role="alert" style={{ color: COLORS.out, fontSize: 13, marginBottom: 10 }}>{error}</div>}
      <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
        <Btn variant="ghost" onClick={onClose}>{t.cancel}</Btn>
        <Btn variant="accent" disabled={!canSave} onClick={save}>{t.save}</Btn>
      </div>
    </Modal>
  );
}

function RolesCard({ t, notify, pages, roles, reload }) {
  const [modal, setModal] = useState(null); // { role? }
  async function saveRole(data) {
    const res = await window.owner.saveRole(data);
    if (res && res.ok) { setModal(null); notify(t.savedOk); reload(); }
    return res;
  }
  async function remove(role) {
    const res = await window.owner.deleteRole(role.id);
    if (res && res.ok) { notify(t.deletedOk); reload(); }
    else notify(res && res.reason === "in-use" ? t.roleInUse : t.deleteFailed, "error");
  }
  const summary = (r) => {
    const count = (lv) => pages.filter(([k]) => r.permissions[k] === lv).length;
    return fill(t.roleSummary, { e: count("edit"), v: count("view"), n: count("none") });
  };
  const iconBtn = { background: "none", border: "none", cursor: "pointer", color: COLORS.muted, padding: 4 };
  return (
    <SettingsCard title={t.rolesCard} desc={t.rolesDesc}>
      {roles.length === 0 ? (
        <div style={{ color: COLORS.muted, fontSize: 13.5, marginBottom: 12 }}>{t.noRoles}</div>
      ) : (
        <div style={{ border: `1px solid ${COLORS.border}`, borderRadius: 10, marginBottom: 12, overflow: "hidden" }}>
          {roles.map((r, i) => (
            <div key={r.id} data-role-row={r.name} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderTop: i ? `1px solid ${COLORS.border}` : "none" }}>
              <UsersRound size={17} color={COLORS.inkSoft} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 14 }}>{r.name}</div>
                <div style={{ fontSize: 12, color: COLORS.muted }}>{summary(r)} · {fill(t.roleUsers, { n: r.users })}</div>
              </div>
              <button onClick={() => setModal({ role: r })} title={t.edit} style={iconBtn}><Pencil size={16} /></button>
              <button onClick={() => remove(r)} title={t.delete} style={iconBtn}><Trash2 size={16} /></button>
            </div>
          ))}
        </div>
      )}
      <Btn variant="primary" onClick={() => setModal({})}><Plus size={15} /> {t.addRole}</Btn>
      {modal && <RoleModal t={t} role={modal.role || null} pages={pages} onClose={() => setModal(null)} onSave={saveRole} />}
    </SettingsCard>
  );
}

function UserModal({ t, user, roles, onClose, onSave }) {
  const [username, setUsername] = useState(user ? user.username : "");
  const [password, setPassword] = useState("");
  const [roleId, setRoleId] = useState("");
  const [error, setError] = useState("");
  const canSave = username.trim() && password.length >= 4;
  const save = async () => {
    if (!canSave) return;
    const res = await onSave(user ? { id: user.id, password } : { id: null, username: username.trim(), password, roleId: roleId || null });
    if (!res || !res.ok) setError(res && (res.reason === "reserved" || res.reason === "taken") ? t.usernameTaken : t.saveFailed);
  };
  return (
    <Modal title={user ? `${t.resetPassword} — ${user.username}` : t.addUser} onClose={onClose} onSubmit={save}>
      <Input label={t.username} value={username} onChange={(e) => setUsername(e.target.value)} autoFocus={!user} disabled={!!user} />
      <Input label={user ? t.newPassword : t.password} type="password" value={password} autoFocus={!!user} onChange={(e) => setPassword(e.target.value)} />
      <div style={{ fontSize: 12, color: COLORS.muted, margin: "-6px 0 10px" }}>{t.passwordTooShort}</div>
      {!user && (
        <Select label={t.role} value={roleId} onChange={(e) => setRoleId(e.target.value)}>
          <option value="">{t.fullAccess}</option>
          {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
        </Select>
      )}
      {error && <div role="alert" style={{ color: COLORS.out, fontSize: 13, marginBottom: 10 }}>{error}</div>}
      <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
        <Btn variant="ghost" onClick={onClose}>{t.cancel}</Btn>
        <Btn variant="accent" disabled={!canSave} onClick={save}>{t.save}</Btn>
      </div>
    </Modal>
  );
}

/* Each time the clock was turned back during a trial. */
function ClockLog({ t }) {
  const [info, setInfo] = useState({ log: [], pending: false });
  const load = () => window.owner.clockLog().then((r) => r && setInfo(r)).catch(() => {});
  useEffect(() => { load(); }, []);
  if (!info.log.length && !info.pending) return null;
  const fmt = (ms) => new Date(Number(ms)).toLocaleString();
  return (
    <div data-clock-log="1" style={{ background: COLORS.outSoft, borderRadius: 10, padding: "10px 14px", marginBottom: 12, fontSize: 13 }}>
      <div style={{ fontWeight: 800, color: COLORS.out, marginBottom: 4 }}>{t.clockLogTitle}</div>
      {info.pending && <div style={{ marginBottom: 4 }}>{t.clockLockPending}</div>}
      {info.log.slice(0, 5).map((e, i) => (
        <div key={i}>{fill(t.clockLogLine, { clock: fmt(e.clock), real: fmt(e.trusted), u: e.user || "—" })}</div>
      ))}
      <button onClick={() => window.owner.clearClockLock().then(load)} style={{ marginTop: 6, background: "none", border: "none", color: COLORS.out, fontWeight: 700, cursor: "pointer", padding: 0, fontFamily: "inherit" }}>
        {t.clockLogClear}
      </button>
    </div>
  );
}

function UsersCard({ t, notify, roles, reloadRoles }) {
  const [users, setUsers] = useState([]);
  const [modal, setModal] = useState(null); // { user? }
  const [confirm, setConfirm] = useState(null);
  const load = () => window.owner.listUsers().then((list) => setUsers(list || [])).catch((err) => notify(errMsg(err), "error"));
  useEffect(() => { load(); }, []);
  async function saveUser(data) {
    const res = await window.owner.saveUser(data);
    if (res && res.ok) { setModal(null); notify(t.savedOk); load(); reloadRoles(); }
    return res;
  }
  async function changeRole(u, roleId) {
    const res = await window.owner.saveUser({ id: u.id, roleId: roleId || null });
    if (res && res.ok) { notify(t.savedOk); load(); reloadRoles(); } else notify(t.saveFailed, "error");
  }
  async function unblock(u) {
    const res = await window.owner.saveUser({ id: u.id, blocked: false });
    if (res && res.ok) { notify(t.userUnblocked); load(); } else notify(t.saveFailed, "error");
  }
  async function remove(id) {
    const res = await window.owner.deleteUser(id);
    if (res && res.ok) { notify(t.deletedOk); load(); reloadRoles(); } else notify(t.deleteFailed, "error");
    setConfirm(null);
  }
  const iconBtn = { background: "none", border: "none", cursor: "pointer", color: COLORS.muted, padding: 4 };
  return (
    <SettingsCard title={t.usersCard} desc={t.usersDesc}>
      <ClockLog t={t} />
      {users.length === 0 ? (
        <div style={{ color: COLORS.muted, fontSize: 13.5, marginBottom: 12 }}>{t.noUsers}</div>
      ) : (
        <div style={{ border: `1px solid ${COLORS.border}`, borderRadius: 10, marginBottom: 12, overflow: "hidden" }}>
          {users.map((u, i) => (
            <div key={u.id} data-user-row={u.username} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderTop: i ? `1px solid ${COLORS.border}` : "none" }}>
              <UserRound size={17} color={COLORS.inkSoft} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 14 }}>
                  {u.username}
                  {u.blocked ? <span data-blocked="1" style={{ marginInlineStart: 8, fontSize: 12, fontWeight: 700, color: COLORS.out, background: COLORS.outSoft, borderRadius: 999, padding: "1px 9px" }}>{t.blockedBadge}</span> : null}
                </div>
                <div style={{ fontSize: 12, color: COLORS.muted }}>{t.createdOn}: {String(u.createdAt || "").slice(0, 10)}</div>
              </div>
              {u.blocked ? <Btn variant="danger" onClick={() => unblock(u)} style={{ padding: "5px 10px", fontSize: 12.5 }}>{t.unblock}</Btn> : null}
              <select value={u.roleId || ""} onChange={(e) => changeRole(u, e.target.value)} aria-label={t.role} data-user-role={u.username}
                style={{ padding: "6px 10px", borderRadius: 8, border: `1px solid ${COLORS.border}`, fontSize: 13, fontFamily: "inherit", background: COLORS.surface, maxWidth: 200 }}>
                <option value="">{t.fullAccess}</option>
                {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
              <button onClick={() => setModal({ user: u })} title={t.resetPassword} style={iconBtn}><KeyRound size={16} /></button>
              <button onClick={() => setConfirm(u)} title={t.delete} style={iconBtn}><Trash2 size={16} /></button>
            </div>
          ))}
        </div>
      )}
      <Btn variant="primary" onClick={() => setModal({})}><Plus size={15} /> {t.addUser}</Btn>
      {modal && <UserModal t={t} user={modal.user || null} roles={roles} onClose={() => setModal(null)} onSave={saveUser} />}
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

export function OwnerView({ t, notify, license, onLicense, modules, dashboardLabel, settingsLabel }) {
  const [roles, setRoles] = useState([]);
  const reloadRoles = () => window.owner.listRoles().then((list) => setRoles(list || [])).catch((err) => notify(errMsg(err), "error"));
  useEffect(() => { reloadRoles(); }, []);
  const pages = [["dashboard", dashboardLabel], ...modules, ["settings", settingsLabel]];
  return (
    <div style={{ maxWidth: 820 }}>
      <h2 style={{ margin: "0 0 4px", fontSize: 20, fontWeight: 800 }}>{t.ownerTab}</h2>
      <div style={{ fontSize: 13, color: COLORS.muted, marginBottom: 16 }}>{t.ownerDesc}</div>
      <LicenseCard t={t} notify={notify} license={license} onLicense={onLicense} />
      <ModulesCard t={t} notify={notify} license={license} onLicense={onLicense} modules={modules} />
      <RolesCard t={t} notify={notify} pages={pages} roles={roles} reload={reloadRoles} />
      <UsersCard t={t} notify={notify} roles={roles} reloadRoles={reloadRoles} />
    </div>
  );
}
