// Tiny, dependency-free .xlsx writer (the counterpart of lib/xlsx.js, which only reads).
// An .xlsx is a zip of XML files; we store them uncompressed, so no compression library is needed.
// Cells are plain text or numbers, the header row is bold and columns are sized to their content.

const enc = new TextEncoder()

// ---------------------------------------------------------------- zip (stored, no compression)
const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()

function crc32(bytes) {
  let c = 0xffffffff
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function zip(files) {
  const parts = []
  const central = []
  let offset = 0
  const push = (bytes) => { parts.push(bytes); offset += bytes.length }
  const head = (size) => { const b = new Uint8Array(size); return [b, new DataView(b.buffer)] }

  for (const [name, text] of files) {
    const nameBytes = enc.encode(name)
    const data = enc.encode(text)
    const crc = crc32(data)

    const [lh, l] = head(30)
    l.setUint32(0, 0x04034b50, true); l.setUint16(4, 20, true); l.setUint16(6, 0x0800, true) // utf-8 names
    l.setUint16(8, 0, true); l.setUint16(10, 0, true); l.setUint16(12, 0x21, true)            // stored, date 1980-01-01
    l.setUint32(14, crc, true); l.setUint32(18, data.length, true); l.setUint32(22, data.length, true)
    l.setUint16(26, nameBytes.length, true); l.setUint16(28, 0, true)

    const [ch, c] = head(46)
    c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true)
    c.setUint16(10, 0, true); c.setUint16(12, 0, true); c.setUint16(14, 0x21, true)
    c.setUint32(16, crc, true); c.setUint32(20, data.length, true); c.setUint32(24, data.length, true)
    c.setUint16(28, nameBytes.length, true); c.setUint32(42, offset, true)

    central.push(ch, nameBytes)
    push(lh); push(nameBytes); push(data)
  }

  const centralStart = offset
  for (const b of central) push(b)
  const [eh, e] = head(22)
  e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true)
  e.setUint32(12, offset - centralStart, true); e.setUint32(16, centralStart, true)
  push(eh)

  return new Blob(parts, { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" })
}

// ---------------------------------------------------------------- sheet xml
const xmlEsc = (s) =>
  String(s)
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "") // characters XML cannot hold
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")

function colName(i) {
  let s = ""
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s
  return s
}

function sheetXml(headers, rows) {
  const cell = (v, r, c, style) => {
    const ref = `${colName(c)}${r + 1}`
    const s = style ? ` s="${style}"` : ""
    if (typeof v === "number" && Number.isFinite(v)) return `<c r="${ref}"${s}><v>${v}</v></c>`
    if (v == null || v === "") return ""
    return `<c r="${ref}"${s} t="inlineStr"><is><t xml:space="preserve">${xmlEsc(v)}</t></is></c>`
  }
  const all = [headers, ...rows]
  const widths = headers.map((_, c) => Math.min(60, Math.max(10, ...all.map((r) => String(r[c] ?? "").length + 2))))
  const cols = widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join("")
  const body = all
    .map((r, i) => `<row r="${i + 1}">${r.map((v, c) => cell(v, i, c, i === 0 ? 1 : 0)).join("")}</row>`)
    .join("")
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>${cols}</cols><sheetData>${body}</sheetData></worksheet>`
}

const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs></styleSheet>`

/** Builds an .xlsx file (a Blob) from a header row and data rows. Numbers stay numbers, everything else is text. */
export function buildXlsx(sheetName, headers, rows) {
  const name = xmlEsc(String(sheetName).replace(/[\\/?*[\]:]/g, " ").slice(0, 31) || "Sheet1")
  return zip([
    ["[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`],
    ["_rels/.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`],
    ["xl/workbook.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${name}" sheetId="1" r:id="rId1"/></sheets></workbook>`],
    ["xl/_rels/workbook.xml.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`],
    ["xl/styles.xml", STYLES],
    ["xl/worksheets/sheet1.xml", sheetXml(headers, rows)],
  ])
}

/** Downloads rows as a real Excel (.xlsx) file. */
export function downloadXlsx(filename, sheetName, headers, rows) {
  const url = URL.createObjectURL(buildXlsx(sheetName, headers, rows))
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
