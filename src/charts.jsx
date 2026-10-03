// Small, dependency-free SVG charts for the dashboard and reports.
import React, { useState } from "react";
import { COLORS, CHART, AGING_COLORS, fmtMoney } from "./ui.jsx";

function niceScale(max, ticks = 4) {
  if (!(max > 0)) return { max: 1, step: 1 };
  const raw = max / ticks;
  const pow = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * pow).find((s) => s >= raw) || 10 * pow;
  return { max: Math.ceil(max / step) * step, step };
}

const compact = (n, lang) =>
  new Intl.NumberFormat(lang === "ar" ? "ar-EG" : "en-US", { notation: "compact", maximumFractionDigits: 1 }).format(n);

function monthLabel(key, lang, withYear) {
  const [y, m] = key.split("-").map(Number);
  return new Intl.DateTimeFormat(lang === "ar" ? "ar-EG" : "en-US", { month: "short", ...(withYear ? { year: "numeric" } : {}) })
    .format(new Date(y, m - 1, 1));
}

function LegendKey({ color, label }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12.5, color: COLORS.inkSoft }}>
      <span style={{ width: 10, height: 10, borderRadius: 3, background: color, display: "inline-block" }} />
      {label}
    </span>
  );
}

// Column with a 4px rounded top and a square base.
function columnPath(x, y, w, h) {
  if (h <= 0) return "";
  const r = Math.min(4, w / 2, h);
  return `M${x},${y + h} L${x},${y + r} Q${x},${y} ${x + r},${y} L${x + w - r},${y} Q${x + w},${y} ${x + w},${y + r} L${x + w},${y + h} Z`;
}

/* Money in vs money out per month (grouped columns). */
export function MonthlyCashChart({ data, t, lang }) {
  const [hover, setHover] = useState(null);
  const W = 720, H = 230, padL = 48, padR = 12, padT = 12, padB = 28;
  const plotW = W - padL - padR, plotH = H - padT - padB;
  const maxVal = Math.max(...data.map((d) => Math.max(d.moneyIn, d.moneyOut)), 0);
  const { max, step } = niceScale(maxVal);
  const band = plotW / data.length;
  const barW = Math.min(14, (band - 10) / 2);
  const y = (v) => padT + plotH - (v / max) * plotH;
  const ticks = [];
  for (let v = 0; v <= max + 1e-9; v += step) ticks.push(v);
  const hovered = hover != null ? data[hover] : null;

  return (
    <div dir="ltr" style={{ position: "relative" }}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: "block" }} role="img"
        aria-label={`${t.moneyIn} / ${t.moneyOut}`} onMouseLeave={() => setHover(null)}>
        {ticks.map((v) => (
          <g key={v}>
            <line x1={padL} x2={W - padR} y1={y(v)} y2={y(v)} stroke={v === 0 ? "#CFC9BA" : CHART.grid} strokeWidth="1" />
            <text x={padL - 8} y={y(v) + 4} textAnchor="end" fontSize="11" fill={CHART.axis}>{compact(v, lang)}</text>
          </g>
        ))}
        {data.map((d, i) => {
          const cx = padL + band * i + band / 2;
          const active = hover === i;
          return (
            <g key={d.month}>
              {active && <rect x={padL + band * i + 2} y={padT} width={band - 4} height={plotH} fill="#F4F1E8" rx="6" />}
              <path d={columnPath(cx - barW - 1, y(d.moneyIn), barW, y(0) - y(d.moneyIn))} fill={CHART.in} />
              <path d={columnPath(cx + 1, y(d.moneyOut), barW, y(0) - y(d.moneyOut))} fill={CHART.out} />
              <text x={cx} y={H - 9} textAnchor="middle" fontSize="11" fill={active ? COLORS.ink : CHART.axis} fontWeight={active ? 700 : 400}>
                {monthLabel(d.month, lang, false)}
              </text>
              <rect x={padL + band * i} y={0} width={band} height={H} fill="transparent" onMouseEnter={() => setHover(i)} />
            </g>
          );
        })}
      </svg>
      {hovered && (
        <div style={{
          position: "absolute", top: 8,
          left: `${((padL + band * hover + band / 2) / W) * 100}%`,
          transform: hover > data.length / 2 ? "translateX(calc(-100% - 14px))" : "translateX(14px)",
          background: COLORS.ink, color: "#fff", borderRadius: 8, padding: "8px 10px", fontSize: 12,
          pointerEvents: "none", whiteSpace: "nowrap", boxShadow: "0 6px 18px rgba(35,40,64,0.25)", zIndex: 2,
        }} dir={lang === "ar" ? "rtl" : "ltr"}>
          <div style={{ fontWeight: 800, marginBottom: 4 }}>{monthLabel(hovered.month, lang, true)}</div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <span style={{ width: 8, height: 8, borderRadius: 2, background: CHART.in }} />{t.moneyIn}: <b>{fmtMoney(hovered.moneyIn, lang)}</b>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <span style={{ width: 8, height: 8, borderRadius: 2, background: CHART.out }} />{t.moneyOut}: <b>{fmtMoney(hovered.moneyOut, lang)}</b>
          </div>
          <div style={{ marginTop: 4, color: "#B9BCD0" }}>{t.netCashFlow}: <b style={{ color: "#fff" }}>{fmtMoney(hovered.moneyIn - hovered.moneyOut, lang)}</b></div>
        </div>
      )}
      <div style={{ display: "flex", gap: 16, justifyContent: "center", marginTop: 6 }} dir={lang === "ar" ? "rtl" : "ltr"}>
        <LegendKey color={CHART.in} label={t.moneyIn} />
        <LegendKey color={CHART.out} label={t.moneyOut} />
      </div>
    </div>
  );
}

/* Ranked horizontal bars (one series): label · bar · value. */
export function HBarList({ rows, lang, color = CHART.bar, onClick, emptyText }) {
  const max = Math.max(...rows.map((r) => r.value), 0) || 1;
  if (!rows.length) return <div style={{ color: COLORS.muted, fontSize: 13, padding: "14px 0" }}>{emptyText}</div>;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {rows.map((r) => (
        <div key={r.key} onClick={onClick ? () => onClick(r) : undefined}
          style={{ cursor: onClick ? "pointer" : "default" }} title={`${r.label}: ${fmtMoney(r.value, lang)}`}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, fontSize: 13, marginBottom: 4 }}>
            <span style={{ fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.label}</span>
            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, whiteSpace: "nowrap" }}>{fmtMoney(r.value, lang)}</span>
          </div>
          <div style={{ height: 8, background: "#F1EEE5", borderRadius: 4 }}>
            <div style={{ width: `${Math.max((r.value / max) * 100, 1.5)}%`, height: "100%", background: r.color || color, borderRadius: 4 }} />
          </div>
        </div>
      ))}
    </div>
  );
}

/* One stacked bar split into the four aging buckets, with a legend underneath. */
export function AgingBar({ buckets, labels, lang, height = 14 }) {
  const total = buckets.reduce((s, v) => s + v, 0);
  return (
    <div>
      <div style={{ display: "flex", gap: 2, height, borderRadius: 4, overflow: "hidden", background: total ? "transparent" : "#F1EEE5" }}>
        {total > 0 && buckets.map((v, i) => v > 0 && (
          <div key={i} title={`${labels[i]}: ${fmtMoney(v, lang)}`}
            style={{ width: `${(v / total) * 100}%`, minWidth: 3, background: AGING_COLORS[i] }} />
        ))}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: "6px 14px", marginTop: 10 }}>
        {buckets.map((v, i) => (
          <div key={i} style={{ fontSize: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, color: COLORS.inkSoft }}>
              <span style={{ width: 10, height: 10, borderRadius: 3, background: AGING_COLORS[i] }} />{labels[i]}
            </div>
            <div style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, marginTop: 2 }}>{fmtMoney(v, lang)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
