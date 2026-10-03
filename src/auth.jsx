// Login, first-time setup, password reset with a recovery code.
import React, { useState } from "react";
import { Scissors, Globe, KeyRound, Copy, FileDown, ShieldCheck } from "lucide-react";
import { COLORS, Btn, Input } from "./ui.jsx";
import { fill } from "./i18n.js";

const mono = "'JetBrains Mono', monospace";

/* Shows a recovery code once, with copy / save-as-file, and requires a tick before continuing. */
export function RecoveryCodeBox({ t, code, onDone, doneLabel }) {
  const [confirmed, setConfirmed] = useState(false);
  const [copied, setCopied] = useState(false);
  async function copy() {
    try { await navigator.clipboard.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch (e) { /* ignore */ }
  }
  async function saveFile() {
    const text = `Factory Ledger — ${t.recoveryCode}\r\n\r\n${code}\r\n\r\n${new Date().toISOString().slice(0, 10)}\r\n`;
    try { await window.files.save("factory-ledger-recovery-code.txt", new TextEncoder().encode(text), [{ name: "Text", extensions: ["txt"] }]); } catch (e) { /* ignore */ }
  }
  return (
    <div>
      <div style={{ display: "flex", gap: 10, alignItems: "flex-start", marginBottom: 14 }}>
        <ShieldCheck size={22} color={COLORS.accent} style={{ flexShrink: 0, marginTop: 2 }} />
        <div style={{ fontSize: 13, color: COLORS.inkSoft, lineHeight: 1.6 }}>{t.saveRecoveryDesc}</div>
      </div>
      <div dir="ltr" data-recovery-code={code} style={{
        fontFamily: mono, fontSize: 22, fontWeight: 700, letterSpacing: 2, textAlign: "center",
        background: COLORS.bg, border: `2px dashed ${COLORS.accent}`, borderRadius: 10, padding: "16px 10px",
        userSelect: "all", color: COLORS.ink, marginBottom: 10,
      }}>{code}</div>
      <div style={{ display: "flex", gap: 8, justifyContent: "center", marginBottom: 14 }}>
        <Btn variant="ghost" onClick={copy} style={{ padding: "6px 12px" }}><Copy size={14} /> {copied ? t.copied : t.copy}</Btn>
        <Btn variant="ghost" onClick={saveFile} style={{ padding: "6px 12px" }}><FileDown size={14} /> {t.saveAsFile}</Btn>
      </div>
      <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13, fontWeight: 600, marginBottom: 14, cursor: "pointer" }}>
        <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} style={{ width: 16, height: 16 }} />
        {t.savedItConfirm}
      </label>
      <Btn variant="accent" disabled={!confirmed} onClick={onDone} style={{ width: "100%", justifyContent: "center" }}>
        {doneLabel || t.continue}
      </Btn>
    </div>
  );
}

export function AuthScreen({ hasAdmin, lang, setLang, t, onCreated, onLoggedIn }) {
  const isRTL = lang === "ar";
  const [mode, setMode] = useState(hasAdmin ? "login" : "setup"); // login | setup | reset | code
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState(null); // { code, then }

  const lockedMsg = (res) => (res && res.reason === "locked" ? fill(t.tooManyAttempts, { n: res.wait }) : null);

  function checkNewPassword(pw, pw2) {
    if (pw !== pw2) return t.passwordsMustMatch;
    if (pw.length < 4) return t.passwordTooShort;
    return null;
  }

  async function submit() {
    setError("");
    setBusy(true);
    try {
      if (mode === "setup") {
        if (!username.trim() || !password) { setError(t.fillAllFields); return; }
        const bad = checkNewPassword(password, confirm);
        if (bad) { setError(bad); return; }
        const res = await window.auth.createAdmin(username.trim(), password);
        if (res && res.ok) {
          if (res.recoveryCode) setPending({ code: res.recoveryCode, then: onCreated });
          else onCreated();
          if (res.recoveryCode) setMode("code");
        } else setError(t.invalidCredentials);
      } else if (mode === "login") {
        if (!username.trim() || !password) { setError(t.fillAllFields); return; }
        const res = await window.auth.login(username.trim(), password);
        if (res && res.ok) {
          if (res.recoveryCode) { setPending({ code: res.recoveryCode, then: onLoggedIn }); setMode("code"); }
          else onLoggedIn();
        } else setError(lockedMsg(res) || t.invalidCredentials);
      } else if (mode === "reset") {
        if (!code.trim() || !password) { setError(t.fillAllFields); return; }
        const bad = checkNewPassword(password, confirm);
        if (bad) { setError(bad); return; }
        const res = await window.auth.resetWithCode(code, password);
        if (res && res.ok) {
          setNotice(fill(t.passwordResetDone, { u: res.username }));
          setPending({ code: res.recoveryCode, then: onLoggedIn });
          setMode("code");
        } else if (res && res.reason === "no-code") setError(t.noRecoveryCode);
        else setError(lockedMsg(res) || t.invalidCode);
      }
    } catch (e) {
      setError(t.invalidCredentials);
    } finally {
      setBusy(false);
    }
  }

  function go(next) {
    setMode(next); setError(""); setNotice(""); setPassword(""); setConfirm(""); setCode("");
  }

  const onEnter = (e) => { if (e.key === "Enter") submit(); };
  const titles = { login: t.welcomeBack, setup: t.setupAdminDesc, reset: t.recoveryCodeDesc, code: t.saveRecoveryTitle };
  const link = { background: "none", border: "none", color: COLORS.accent, cursor: "pointer", fontFamily: "inherit", fontSize: 13, fontWeight: 700, padding: 0 };

  return (
    <div dir={isRTL ? "rtl" : "ltr"} style={{
      minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
      background: COLORS.bg, fontFamily: "'Cairo', sans-serif", position: "relative",
    }}>
      {setLang && (
        <button onClick={() => setLang(isRTL ? "en" : "ar")} style={{
          position: "absolute", top: 18, insetInlineEnd: 18, display: "flex", alignItems: "center", gap: 6,
          background: COLORS.surface, border: `1px solid ${COLORS.border}`, borderRadius: 8, padding: "7px 12px",
          cursor: "pointer", fontFamily: "inherit", fontSize: 13, color: COLORS.inkSoft,
        }}><Globe size={14} /> {isRTL ? "English" : "العربية"}</button>
      )}
      <div style={{
        width: mode === "code" ? 420 : 340, background: COLORS.surface, borderRadius: 14, padding: 28,
        border: `1px solid ${COLORS.border}`, boxShadow: "0 12px 30px rgba(35,40,64,0.12)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
          {mode === "reset" || mode === "code" ? <KeyRound size={20} color={COLORS.accent} /> : <Scissors size={20} color={COLORS.accent} />}
          <div style={{ fontWeight: 800, fontSize: 17 }}>{mode === "reset" ? t.resetPassword : mode === "code" ? t.saveRecoveryTitle : t.appName}</div>
        </div>
        {mode !== "code" && <div style={{ fontSize: 13, color: COLORS.muted, marginBottom: 18 }}>{titles[mode]}</div>}

        {notice && (
          <div style={{ background: COLORS.inSoft, color: COLORS.in, borderRadius: 8, padding: "8px 10px", fontSize: 13, fontWeight: 700, margin: "8px 0 14px" }}>
            {notice}
          </div>
        )}

        {mode === "code" && pending && (
          <div style={{ marginTop: 12 }}>
            <RecoveryCodeBox t={t} code={pending.code} onDone={() => pending.then()} />
          </div>
        )}

        {(mode === "login" || mode === "setup") && (
          <>
            <Input label={t.username} value={username} autoFocus onChange={(e) => setUsername(e.target.value)} onKeyDown={onEnter} />
            <Input label={t.password} type="password" value={password} onChange={(e) => setPassword(e.target.value)} onKeyDown={onEnter} />
            {mode === "setup" && (
              <Input label={t.confirmPassword} type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} onKeyDown={onEnter} />
            )}
          </>
        )}

        {mode === "reset" && (
          <>
            <Input label={t.recoveryCode} value={code} autoFocus dir="ltr" placeholder="XXXX-XXXX-XXXX-XXXX"
              onChange={(e) => setCode(e.target.value)} onKeyDown={onEnter} style={{ fontFamily: mono, letterSpacing: 1 }} />
            <Input label={t.newPassword} type="password" value={password} onChange={(e) => setPassword(e.target.value)} onKeyDown={onEnter} />
            <Input label={t.confirmPassword} type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} onKeyDown={onEnter} />
          </>
        )}

        {error && <div role="alert" style={{ color: COLORS.out, fontSize: 13, marginBottom: 10 }}>{error}</div>}

        {mode !== "code" && (
          <Btn variant="accent" disabled={busy} style={{ width: "100%", justifyContent: "center", marginTop: 6 }} onClick={submit}>
            {mode === "login" ? t.loginButton : mode === "setup" ? t.createAdminAccount : t.resetPassword}
          </Btn>
        )}
        {mode === "login" && (
          <div style={{ textAlign: "center", marginTop: 14 }}>
            <button style={link} onClick={() => go("reset")}>{t.forgotPassword}</button>
          </div>
        )}
        {mode === "reset" && (
          <div style={{ textAlign: "center", marginTop: 14 }}>
            <button style={link} onClick={() => go("login")}>{t.backToLogin}</button>
          </div>
        )}
      </div>
    </div>
  );
}
