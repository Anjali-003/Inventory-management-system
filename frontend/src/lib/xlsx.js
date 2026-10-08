// Small, dependency-free spreadsheet reader for the import dialogs.
// Reads .xlsx / .xlsm (a zip of XML files) and .csv / .tsv. It only extracts cell text and numbers,
// which is all the product and BOM imports need. Old binary .xls files are not supported.

const MAX_FILE_BYTES = 5 * 1024 * 1024
const MAX_ENTRY_BYTES = 40 * 1024 * 1024
const utf8 = new TextDecoder("utf-8")

export class SheetError extends Error {}

// ---------------------------------------------------------------- zip
const u16 = (d, o) => d[o] | (d[o + 1] << 8)
const u32 = (d, o) => (d[o] | (d[o + 1] << 8) | (d[o + 2] << 16) | (d[o + 3] << 24)) >>> 0

async function inflateRaw(bytes) {
  if (typeof DecompressionStream === "undefined") {
    throw new SheetError("This browser cannot open Excel files. Please update it, or upload a CSV file instead.")
  }
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate-raw"))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

/** Returns Map(entry name -> { method, compSize, uncompSize, offset }). */
function zipEntries(d) {
  let eocd = -1
  for (let i = d.length - 22; i >= Math.max(0, d.length - 22 - 65535); i--) {
    if (u32(d, i) === 0x06054b50) { eocd = i; break }
  }
  if (eocd < 0) throw new SheetError("This file is not a valid .xlsx workbook.")
  const count = u16(d, eocd + 10)
  let p = u32(d, eocd + 16)
  const out = new Map()
  for (let n = 0; n < count; n++) {
    if (u32(d, p) !== 0x02014b50) throw new SheetError("This file is not a valid .xlsx workbook.")
    const flags = u16(d, p + 8)
    const nameLen = u16(d, p + 28)
    const extraLen = u16(d, p + 30)
    const commentLen = u16(d, p + 32)
    const name = utf8.decode(d.subarray(p + 46, p + 46 + nameLen))
    out.set(name, { flags, method: u16(d, p + 10), compSize: u32(d, p + 20), uncompSize: u32(d, p + 24), offset: u32(d, p + 42) })
    p += 46 + nameLen + extraLen + commentLen
  }
  return out
}

async function entryText(d, entries, name) {
  const e = entries.get(name)
  if (!e) return null
  if (e.flags & 1) throw new SheetError("This workbook is password protected. Remove the password and try again.")
  if (e.uncompSize > MAX_ENTRY_BYTES) throw new SheetError("This workbook is too large to import.")
  if (u32(d, e.offset) !== 0x04034b50) throw new SheetError("This file is not a valid .xlsx workbook.")
  const start = e.offset + 30 + u16(d, e.offset + 26) + u16(d, e.offset + 28)
  const raw = d.subarray(start, start + e.compSize)
  let bytes
  if (e.method === 0) bytes = raw
  else if (e.method === 8) bytes = await inflateRaw(raw)
  else throw new SheetError("This workbook uses an unsupported compression method.")
  return utf8.decode(bytes)
}

// ---------------------------------------------------------------- xml helpers
const ENT = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" }
const decode = (s) =>
  s.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (m, g) => {
    if (g[0] === "#") {
      const code = g[1].toLowerCase() === "x" ? parseInt(g.slice(2), 16) : parseInt(g.slice(1), 10)
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : ""
    }
    return ENT[g.toLowerCase()] ?? m
  })

const attrsOf = (s) => {
  const o = {}
  for (const m of s.matchAll(/([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) o[m[1]] = decode(m[2] ?? m[3] ?? "")
  return o
}

// text of every <t> in a block, skipping phonetic (furigana) runs
const textOf = (xml) => {
  const clean = xml.replace(/<rPh\b[\s\S]*?<\/rPh>/g, "")
  let out = ""
  for (const m of clean.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>|<t\b[^>]*\/>/g)) out += m[1] ? decode(m[1]) : ""
  return out
}

const colIndex = (letters) => {
  let n = 0
  for (const ch of letters.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64)
  return n - 1
}

function parseSharedStrings(xml) {
  if (!xml) return []
  const out = []
  for (const m of xml.matchAll(/<si\b[^>]*\/>|<si\b[^>]*>([\s\S]*?)<\/si>/g)) out.push(m[1] ? textOf(m[1]) : "")
  return out
}

function parseSheet(xml, shared) {
  const rows = []
  let maxCol = 0
  let seq = 0
  for (const rm of xml.matchAll(/<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g)) {
    const rAttr = attrsOf(rm[1])
    const rowNo = rAttr.r ? Number(rAttr.r) - 1 : seq
    seq = rowNo + 1
    if (!rm[2] || rowNo > 100000) continue
    let colSeq = 0
    for (const cm of rm[2].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const a = attrsOf(cm[1])
      let col = colSeq
      if (a.r) {
        const ref = /^([A-Za-z]+)(\d+)$/.exec(a.r)
        if (ref) col = colIndex(ref[1])
      }
      colSeq = col + 1
      if (col > 700) continue
      const body = cm[2] || ""
      let value = ""
      const t = a.t || "n"
      if (t === "inlineStr") {
        value = textOf(body)
      } else {
        const v = /<v\b[^>]*>([\s\S]*?)<\/v>/.exec(body)
        if (v) {
          const raw = decode(v[1])
          if (t === "s") value = shared[Number(raw)] ?? ""
          else if (t === "str") value = raw
          else if (t === "b") value = raw === "1" ? "TRUE" : "FALSE"
          else if (t === "e") value = ""
          else {
            const num = Number(raw)
            value = raw.trim() !== "" && Number.isFinite(num) ? num : raw
          }
        }
      }
      if (value === "") continue
      ;(rows[rowNo] ||= [])[col] = value
      if (col + 1 > maxCol) maxCol = col + 1
    }
  }
  const out = []
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i] || []
    out.push(Array.from({ length: maxCol }, (_, c) => (r[c] === undefined ? "" : r[c])))
  }
  while (out.length && out[out.length - 1].every((c) => c === "")) out.pop()
  return out
}

/** -> [{ name, rows }] (visible sheets only). rows are arrays of "" | string | number. */
export async function readXlsx(buffer) {
  const d = new Uint8Array(buffer)
  const entries = zipEntries(d)
  const wb = await entryText(d, entries, "xl/workbook.xml")
  if (!wb) throw new SheetError("This file is not a valid .xlsx workbook.")
  const relsXml = (await entryText(d, entries, "xl/_rels/workbook.xml.rels")) || ""
  const rels = {}
  for (const m of relsXml.matchAll(/<Relationship\b([^>]*?)\/?>/g)) {
    const a = attrsOf(m[1])
    if (a.Id && a.Target) rels[a.Id] = a.Target.startsWith("/") ? a.Target.slice(1) : `xl/${a.Target}`
  }
  const shared = parseSharedStrings(await entryText(d, entries, "xl/sharedStrings.xml"))
  const sheets = []
  let i = 0
  for (const m of wb.matchAll(/<sheet\b([^>]*?)\/?>/g)) {
    i++
    const a = attrsOf(m[1])
    if (a.state === "hidden" || a.state === "veryHidden") continue
    const target = rels[a["r:id"]] || `xl/worksheets/sheet${i}.xml`
    const xml = await entryText(d, entries, target)
    if (xml == null) continue
    sheets.push({ name: a.name || `Sheet ${i}`, rows: parseSheet(xml, shared) })
  }
  if (!sheets.length) throw new SheetError("No sheets found in this workbook.")
  return sheets
}

// ---------------------------------------------------------------- csv
export function parseCsv(text) {
  const src = text.replace(/^\ufeff/, "")
  const firstLine = src.split(/\r?\n/, 1)[0] || ""
  const count = (ch) => firstLine.split(ch).length - 1
  const delim = count("\t") > Math.max(count(","), count(";")) ? "\t" : count(";") > count(",") ? ";" : ","
  const rows = []
  let row = []
  let cell = ""
  let quoted = false
  for (let i = 0; i < src.length; i++) {
    const ch = src[i]
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') { cell += '"'; i++ } else quoted = false
      } else cell += ch
    } else if (ch === '"' && cell === "") quoted = true
    else if (ch === delim) { row.push(cell); cell = "" }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++
      row.push(cell); cell = ""
      rows.push(row); row = []
    } else cell += ch
  }
  if (cell !== "" || row.length) { row.push(cell); rows.push(row) }
  const width = Math.max(0, ...rows.map((r) => r.length))
  const out = rows.map((r) => Array.from({ length: width }, (_, c) => (r[c] ?? "").trim()))
  while (out.length && out[out.length - 1].every((c) => c === "")) out.pop()
  return out
}

// ---------------------------------------------------------------- entry point
/** Reads a File (.xlsx, .xlsm, .csv, .tsv, .txt) -> [{ name, rows }]. Throws SheetError with a friendly message. */
export async function readSpreadsheet(file) {
  if (!file) throw new SheetError("Choose a file first.")
  if (file.size === 0) throw new SheetError("This file is empty.")
  if (file.size > MAX_FILE_BYTES) throw new SheetError("This file is larger than 5 MB. Split it into smaller files.")
  const buf = await file.arrayBuffer()
  const head = new Uint8Array(buf.slice(0, 4))
  if (head[0] === 0x50 && head[1] === 0x4b) return readXlsx(buf)
  if (head[0] === 0xd0 && head[1] === 0xcf && head[2] === 0x11 && head[3] === 0xe0) {
    throw new SheetError("Old .xls files are not supported. In Excel choose Save As → Excel Workbook (.xlsx), then upload that file.")
  }
  if (/\.(xlsx|xlsm)$/i.test(file.name)) throw new SheetError("This file is not a valid .xlsx workbook.")
  const text = utf8.decode(new Uint8Array(buf))
  if (text.includes("\u0000")) throw new SheetError("Unsupported file. Upload an .xlsx or .csv file.")
  return [{ name: file.name, rows: parseCsv(text) }]
}
