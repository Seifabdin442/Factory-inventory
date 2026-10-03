/*
 * Minimal, dependency-free .xlsx writer.
 *
 * Produces real Office Open XML workbooks (not the old "HTML saved as .xls" trick), so Excel
 * opens them without the "format and extension don't match" warning. Supports what the reports
 * need: styled title/header rows, money/number/date cells kept as real numbers, green/red tones,
 * zebra striping, SUM totals rows, frozen header, auto-filter, repeat-header-on-print,
 * right-to-left sheets, column widths and fit-to-page printing.
 *
 * Usage:
 *   const bytes = buildXlsx({ creator, currency: "EGP", sheets: [ {
 *     name, rtl, landscape,
 *     topLines: [{ text, style: "company" | "title" | "subtitle" }],
 *     columns: [{ header, width, type: "text" | "money" | "number" | "date" }],
 *     rows: [[ "text", 12.5, { v: 300, tone: "in" | "out" } ]],
 *     totals: { label, columns: [indexes of columns to SUM] },   // optional
 *     emptyText,                                                   // shown when rows is empty
 *   } ] });
 */

const COLORS = {
  navy: "FF232840",
  white: "FFFFFFFF",
  muted: "FF8A8577",
  green: "FF2F7A5C",
  red: "FFB84A2F",
  stripe: "FFF7F5EF",
  totalFill: "FFF1E4C4",
  border: "FFD9D4C7",
};

/* ---------- XML helpers ---------- */
function esc(s) {
  return String(s == null ? "" : s)
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function colName(i) {
  let n = i + 1;
  let s = "";
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

function dateSerial(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ""));
  if (!m) return null;
  return (Date.UTC(+m[1], +m[2] - 1, +m[3]) - Date.UTC(1899, 11, 30)) / 86400000;
}

function sheetNameSafe(name, used) {
  let base = String(name || "Sheet").replace(/[\[\]:*?\/\\]/g, " ").trim().slice(0, 31) || "Sheet";
  let n = base;
  let i = 2;
  while (used.has(n.toLowerCase())) {
    const suffix = ` (${i++})`;
    n = base.slice(0, 31 - suffix.length) + suffix;
  }
  used.add(n.toLowerCase());
  return n;
}

/* ---------- style registry ---------- */
function createStyles(currency) {
  const numFmts = [
    { id: 164, code: `#,##0.00 "${currency}";-#,##0.00 "${currency}"` },
    { id: 165, code: "yyyy-mm-dd" },
  ];
  const fonts = ['<font><sz val="11"/><name val="Arial"/><family val="2"/></font>'];
  const fills = ['<fill><patternFill patternType="none"/></fill>', '<fill><patternFill patternType="gray125"/></fill>'];
  const borders = ["<border><left/><right/><top/><bottom/><diagonal/></border>"];
  const xfs = ['<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'];
  const cache = new Map();

  function idx(list, xml) {
    let i = list.indexOf(xml);
    if (i === -1) { list.push(xml); i = list.length - 1; }
    return i;
  }

  // spec: { bold, italic, size, color, fill, border: "thin" | "total", numFmt, align, wrap }
  function get(spec) {
    const key = JSON.stringify(spec);
    if (cache.has(key)) return cache.get(key);
    const font = `<font>${spec.bold ? "<b/>" : ""}${spec.italic ? "<i/>" : ""}<sz val="${spec.size || 11}"/>` +
      `${spec.color ? `<color rgb="${spec.color}"/>` : ""}<name val="Arial"/><family val="2"/></font>`;
    const fontId = idx(fonts, font);
    const fillId = spec.fill
      ? idx(fills, `<fill><patternFill patternType="solid"><fgColor rgb="${spec.fill}"/><bgColor indexed="64"/></patternFill></fill>`)
      : 0;
    let borderId = 0;
    if (spec.border === "thin") {
      const side = (n) => `<${n} style="thin"><color rgb="${COLORS.border}"/></${n}>`;
      borderId = idx(borders, `<border>${side("left")}${side("right")}${side("top")}${side("bottom")}<diagonal/></border>`);
    } else if (spec.border === "total") {
      const thin = (n) => `<${n} style="thin"><color rgb="${COLORS.border}"/></${n}>`;
      borderId = idx(borders, `<border>${thin("left")}${thin("right")}<top style="medium"><color rgb="${COLORS.navy}"/></top>` +
        `<bottom style="double"><color rgb="${COLORS.navy}"/></bottom><diagonal/></border>`);
    }
    const numFmtId = spec.numFmt || 0;
    const align = spec.align || spec.wrap
      ? `<alignment${spec.align ? ` horizontal="${spec.align}"` : ""} vertical="center"${spec.wrap ? ' wrapText="1"' : ""}/>`
      : "";
    const xf = `<xf numFmtId="${numFmtId}" fontId="${fontId}" fillId="${fillId}" borderId="${borderId}" xfId="0"` +
      `${numFmtId ? ' applyNumberFormat="1"' : ""}${fontId ? ' applyFont="1"' : ""}${fillId ? ' applyFill="1"' : ""}` +
      `${borderId ? ' applyBorder="1"' : ""}${align ? ' applyAlignment="1">' + align + "</xf>" : "/>"}`;
    const i = idx(xfs, xf);
    cache.set(key, i);
    return i;
  }

  function xml() {
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
      `<numFmts count="${numFmts.length}">${numFmts.map((f) => `<numFmt numFmtId="${f.id}" formatCode="${esc(f.code)}"/>`).join("")}</numFmts>` +
      `<fonts count="${fonts.length}">${fonts.join("")}</fonts>` +
      `<fills count="${fills.length}">${fills.join("")}</fills>` +
      `<borders count="${borders.length}">${borders.join("")}</borders>` +
      '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
      `<cellXfs count="${xfs.length}">${xfs.join("")}</cellXfs>` +
      '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
      "</styleSheet>";
  }

  return { get, xml };
}

/* ---------- worksheet ---------- */
function buildSheet(sheet, styles, sheetIndex, safeName) {
  const cols = sheet.columns;
  const nCols = cols.length;
  const lastCol = colName(Math.max(nCols - 1, 0));
  const rowsXml = [];
  const merges = [];
  let r = 0;

  const cellStr = (ref, s, text) =>
    `<c r="${ref}" s="${s}" t="inlineStr"><is><t xml:space="preserve">${esc(text)}</t></is></c>`;
  const cellNum = (ref, s, n) => `<c r="${ref}" s="${s}"><v>${n}</v></c>`;

  // Title block
  const lineStyles = {
    company: styles.get({ bold: true, size: 14, color: COLORS.navy }),
    title: styles.get({ bold: true, size: 16, color: COLORS.navy }),
    subtitle: styles.get({ italic: true, size: 10, color: COLORS.muted }),
  };
  const lineHeights = { company: 22, title: 26, subtitle: 16 };
  for (const line of sheet.topLines || []) {
    if (!line || !line.text) continue;
    r += 1;
    const style = line.style || "subtitle";
    rowsXml.push(`<row r="${r}" ht="${lineHeights[style] || 16}" customHeight="1">${cellStr("A" + r, lineStyles[style] || lineStyles.subtitle, line.text)}</row>`);
    if (nCols > 1) merges.push(`A${r}:${lastCol}${r}`);
  }
  r += 1; // spacer row
  rowsXml.push(`<row r="${r}" ht="8" customHeight="1"/>`);

  // Header
  r += 1;
  const headerRow = r;
  const headStyle = styles.get({ bold: true, color: COLORS.white, fill: COLORS.navy, border: "thin", align: "center", wrap: true });
  rowsXml.push(`<row r="${r}" ht="24" customHeight="1">${cols.map((c, i) => cellStr(colName(i) + r, headStyle, c.header)).join("")}</row>`);

  // Data rows
  const firstData = r + 1;
  const rows = sheet.rows || [];
  rows.forEach((row, ri) => {
    r += 1;
    const stripe = ri % 2 === 1 ? COLORS.stripe : undefined;
    const cells = cols.map((col, ci) => {
      const ref = colName(ci) + r;
      let raw = row[ci];
      let tone = null;
      if (raw && typeof raw === "object") { tone = raw.tone || null; raw = raw.v; }
      const color = tone === "in" ? COLORS.green : tone === "out" ? COLORS.red : undefined;
      const base = { border: "thin", fill: stripe, color, bold: !!tone };
      if (raw === null || raw === undefined || raw === "") return `<c r="${ref}" s="${styles.get(base)}"/>`;
      if (col.type === "money" && typeof raw === "number" && isFinite(raw)) {
        return cellNum(ref, styles.get({ ...base, numFmt: 164 }), Math.round(raw * 100) / 100);
      }
      if (col.type === "number" && typeof raw === "number" && isFinite(raw)) {
        return cellNum(ref, styles.get({ ...base, align: "center" }), raw);
      }
      if (col.type === "date") {
        const serial = dateSerial(raw);
        if (serial !== null) return cellNum(ref, styles.get({ ...base, numFmt: 165, align: "center" }), serial);
      }
      return cellStr(ref, styles.get({ ...base, wrap: !!col.wrap }), raw);
    });
    rowsXml.push(`<row r="${r}">${cells.join("")}</row>`);
  });
  const lastData = r;

  if (rows.length === 0 && sheet.emptyText) {
    r += 1;
    rowsXml.push(`<row r="${r}">${cellStr("A" + r, styles.get({ italic: true, color: COLORS.muted }), sheet.emptyText)}</row>`);
    if (nCols > 1) merges.push(`A${r}:${lastCol}${r}`);
  }

  // Totals row with live SUM formulas
  if (sheet.totals && rows.length > 0) {
    r += 1;
    const labelStyle = styles.get({ bold: true, fill: COLORS.totalFill, border: "total" });
    const sumCols = new Set(sheet.totals.columns || []);
    const cells = cols.map((col, ci) => {
      const ref = colName(ci) + r;
      if (ci === 0) return cellStr(ref, labelStyle, sheet.totals.label || "Total");
      if (sumCols.has(ci)) {
        const total = rows.reduce((s, row) => {
          const v = row[ci] && typeof row[ci] === "object" ? row[ci].v : row[ci];
          return s + (typeof v === "number" && isFinite(v) ? v : 0);
        }, 0);
        const s = styles.get({ bold: true, fill: COLORS.totalFill, border: "total", numFmt: col.type === "money" ? 164 : 0 });
        const L = colName(ci);
        return `<c r="${ref}" s="${s}"><f>SUM(${L}${firstData}:${L}${lastData})</f><v>${Math.round(total * 100) / 100}</v></c>`;
      }
      return `<c r="${ref}" s="${labelStyle}"/>`;
    });
    rowsXml.push(`<row r="${r}" ht="20" customHeight="1">${cells.join("")}</row>`);
  }

  const colsXml = cols.map((c, i) => `<col min="${i + 1}" max="${i + 1}" width="${c.width || 14}" customWidth="1"/>`).join("");
  const filterRef = rows.length ? `A${headerRow}:${lastCol}${lastData}` : null;
  const xml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
    '<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>' +
    `<dimension ref="A1:${lastCol}${Math.max(r, 1)}"/>` +
    `<sheetViews><sheetView workbookViewId="0"${sheetIndex === 0 ? ' tabSelected="1"' : ""}${sheet.rtl ? ' rightToLeft="1"' : ""} showGridLines="0">` +
    `<pane ySplit="${headerRow}" topLeftCell="A${headerRow + 1}" activePane="bottomLeft" state="frozen"/>` +
    `<selection pane="bottomLeft" activeCell="A${headerRow + 1}" sqref="A${headerRow + 1}"/></sheetView></sheetViews>` +
    '<sheetFormatPr defaultRowHeight="18" customHeight="1"/>' +
    `<cols>${colsXml}</cols>` +
    `<sheetData>${rowsXml.join("")}</sheetData>` +
    (filterRef ? `<autoFilter ref="${filterRef}"/>` : "") +
    (merges.length ? `<mergeCells count="${merges.length}">${merges.map((m) => `<mergeCell ref="${m}"/>`).join("")}</mergeCells>` : "") +
    '<printOptions horizontalCentered="1"/>' +
    '<pageMargins left="0.4" right="0.4" top="0.5" bottom="0.6" header="0.3" footer="0.3"/>' +
    `<pageSetup paperSize="9" orientation="${sheet.landscape ? "landscape" : "portrait"}" fitToWidth="1" fitToHeight="0"/>` +
    '<headerFooter><oddFooter>&amp;C&amp;P / &amp;N</oddFooter></headerFooter>' +
    "</worksheet>";

  const quoted = `'${safeName.replace(/'/g, "''")}'`;
  const definedNames = [
    `<definedName name="_xlnm.Print_Titles" localSheetId="${sheetIndex}">${esc(quoted)}!$${headerRow}:$${headerRow}</definedName>`,
  ];
  if (filterRef) {
    definedNames.push(
      `<definedName name="_xlnm._FilterDatabase" localSheetId="${sheetIndex}" hidden="1">${esc(quoted)}!$A$${headerRow}:$${lastCol}$${lastData}</definedName>`
    );
  }
  return { xml, definedNames };
}

/* ---------- zip (store, no compression) ---------- */
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function zip(files) {
  const enc = new TextEncoder();
  const now = new Date();
  const dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | Math.floor(now.getSeconds() / 2);
  const dosDate = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
  const locals = [];
  const centrals = [];
  let offset = 0;

  for (const f of files) {
    const name = enc.encode(f.name);
    const data = typeof f.data === "string" ? enc.encode(f.data) : f.data;
    const crc = crc32(data);

    const lh = new DataView(new ArrayBuffer(30));
    lh.setUint32(0, 0x04034b50, true);
    lh.setUint16(4, 20, true);
    lh.setUint16(6, 0x0800, true); // UTF-8 names
    lh.setUint16(8, 0, true); // stored
    lh.setUint16(10, dosTime, true);
    lh.setUint16(12, dosDate, true);
    lh.setUint32(14, crc, true);
    lh.setUint32(18, data.length, true);
    lh.setUint32(22, data.length, true);
    lh.setUint16(26, name.length, true);
    lh.setUint16(28, 0, true);
    locals.push(new Uint8Array(lh.buffer), name, data);

    const ch = new DataView(new ArrayBuffer(46));
    ch.setUint32(0, 0x02014b50, true);
    ch.setUint16(4, 20, true);
    ch.setUint16(6, 20, true);
    ch.setUint16(8, 0x0800, true);
    ch.setUint16(10, 0, true);
    ch.setUint16(12, dosTime, true);
    ch.setUint16(14, dosDate, true);
    ch.setUint32(16, crc, true);
    ch.setUint32(20, data.length, true);
    ch.setUint32(24, data.length, true);
    ch.setUint16(28, name.length, true);
    ch.setUint16(30, 0, true);
    ch.setUint16(32, 0, true);
    ch.setUint16(34, 0, true);
    ch.setUint16(36, 0, true);
    ch.setUint32(38, 0, true);
    ch.setUint32(42, offset, true);
    centrals.push(new Uint8Array(ch.buffer), name);

    offset += 30 + name.length + data.length;
  }

  const centralSize = centrals.reduce((s, b) => s + b.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, files.length, true);
  end.setUint16(10, files.length, true);
  end.setUint32(12, centralSize, true);
  end.setUint32(16, offset, true);

  const parts = [...locals, ...centrals, new Uint8Array(end.buffer)];
  const out = new Uint8Array(parts.reduce((s, p) => s + p.length, 0));
  let p = 0;
  for (const part of parts) { out.set(part, p); p += part.length; }
  return out;
}

/* ---------- workbook ---------- */
export function buildXlsx({ sheets, creator, title, currency = "EGP" }) {
  const styles = createStyles(currency);
  const used = new Set();
  const built = sheets.map((s, i) => {
    const safeName = sheetNameSafe(s.name, used);
    return { safeName, ...buildSheet(s, styles, i, safeName) };
  });

  const nowIso = new Date().toISOString().replace(/\.\d+Z$/, "Z");
  const files = [
    {
      name: "[Content_Types].xml",
      data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
        '<Default Extension="xml" ContentType="application/xml"/>' +
        '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
        built.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("") +
        '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
        '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>' +
        '<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>' +
        "</Types>",
    },
    {
      name: "_rels/.rels",
      data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
        '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>' +
        '<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>' +
        "</Relationships>",
    },
    {
      name: "docProps/core.xml",
      data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">' +
        `<dc:title>${esc(title || "")}</dc:title><dc:creator>${esc(creator || "Factory Ledger")}</dc:creator>` +
        `<dcterms:created xsi:type="dcterms:W3CDTF">${nowIso}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${nowIso}</dcterms:modified>` +
        "</cp:coreProperties>",
    },
    {
      name: "docProps/app.xml",
      data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>Factory Ledger</Application></Properties>',
    },
    {
      name: "xl/workbook.xml",
      data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
        '<bookViews><workbookView activeTab="0"/></bookViews>' +
        `<sheets>${built.map((b, i) => `<sheet name="${esc(b.safeName)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("")}</sheets>` +
        `<definedNames>${built.flatMap((b) => b.definedNames).join("")}</definedNames>` +
        "</workbook>",
    },
    {
      name: "xl/_rels/workbook.xml.rels",
      data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        built.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("") +
        `<Relationship Id="rId${built.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
        "</Relationships>",
    },
    ...built.map((b, i) => ({ name: `xl/worksheets/sheet${i + 1}.xml`, data: b.xml })),
    // styles last: every sheet has registered its styles by now
    { name: "xl/styles.xml", data: styles.xml() },
  ];

  return zip(files);
}
