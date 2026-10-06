// Turns the raw rows of a spreadsheet into product rows or BOM rows for the import dialogs.
// It understands the printed BOM sheets used on the shop floor: a header row, a "Sr.No" column and
// full-width section rows such as "RESISTANCE" / "DIODE", which become the component category.
// The server validates everything again; these checks are only for instant feedback.

import { SheetError } from "./xlsx"

const compact = (v) => String(v ?? "").toLowerCase().replace(/[^a-z0-9]/g, "")
const text = (v) => String(v ?? "").trim().replace(/\s+/g, " ")

const ALIASES = {
  bom: {
    name: ["partno", "partnumber", "part", "component", "componentname", "item", "itemname", "material", "materialname", "description", "name"],
    size: ["size", "package", "footprint", "specification", "spec"],
    quantity: ["quantity", "qty", "qtyperunit", "quantityperunit", "qtyunit", "quantityrequired", "qtyrequired"],
    location: ["location", "loc", "pcblocation", "reference", "ref", "designator", "referencedesignator", "position"],
    category: ["category", "type", "group", "section"],
    srno: ["srno", "sno", "slno", "serialno", "serial", "sr"],
  },
  products: {
    sku: ["sku", "productsku", "productcode", "code", "productid"],
    name: ["productname", "name", "product", "title", "modelname", "model"],
    description: ["description", "desc", "details", "remarks", "notes"],
  },
}

export const SKU_RE = /^[A-Z0-9][A-Z0-9._-]{1,49}$/
export const QTY_RE = /^\d{1,10}(\.\d{1,2})?$/

function mapHeader(row, kind) {
  const map = {}
  row.forEach((cell, i) => {
    const k = compact(cell)
    if (!k && String(cell).trim() !== "#") return
    for (const [field, names] of Object.entries(ALIASES[kind])) {
      if (map[field] === undefined && (names.includes(k) || (field === "srno" && String(cell).trim() === "#"))) {
        map[field] = i
        break
      }
    }
  })
  return map
}

function findHeader(rows, kind) {
  const limit = Math.min(rows.length, 20)
  for (let i = 0; i < limit; i++) {
    const map = mapHeader(rows[i], kind)
    if (map.name === undefined) continue
    const others = kind === "bom" ? ["quantity", "size", "location"] : ["sku", "description"]
    if (kind === "products" || others.some((f) => map[f] !== undefined)) return { index: i, map }
  }
  return null
}

const looksNumeric = (v) => /^\d+(\.\d+)?$/.test(String(v).trim())

function cleanQty(raw) {
  if (raw === "" || raw == null) return { value: "" }
  let s = typeof raw === "number" ? String(Number(raw.toFixed(2))) : String(raw).trim().replace(/,/g, "")
  if (s === "") return { value: "" }
  if (!QTY_RE.test(s)) return { value: s, error: "Quantity must be a number with up to 2 decimals" }
  if (Number(s) <= 0) return { value: s, error: "Quantity must be greater than zero" }
  return { value: String(Number(s)) }
}

/** @returns {{ rows: object[], skipped: number }} BOM rows: { line, name, size, category, quantity, location, error? } */
export function toBomRows(table) {
  const head = findHeader(table, "bom")
  if (!head) {
    throw new SheetError('Could not find the column headings. The sheet needs a "Part No." (component name) column plus at least one of Size, Quantity or Location.')
  }
  const { index, map } = head
  const cell = (r, f) => (map[f] === undefined ? "" : r[map[f]] ?? "")
  const rows = []
  let skipped = 0
  let section = ""
  for (let i = index + 1; i < table.length; i++) {
    const r = table[i]
    if (r.every((c) => c === "")) continue
    const name = text(cell(r, "name"))
    const size = text(cell(r, "size"))
    const location = text(cell(r, "location"))
    const sr = text(cell(r, "srno"))
    const qtyRaw = cell(r, "quantity")
    const hasQty = qtyRaw !== "" && qtyRaw != null
    const ownCat = text(cell(r, "category"))

    // A full-width section row ("RESISTANCE"): no serial number, no size / quantity / location.
    if (map.srno !== undefined && !size && !location && !hasQty && (!sr || !looksNumeric(sr))) {
      const label = name || sr
      if (label && !(sr && looksNumeric(sr))) { section = label; continue }
    }
    if (!name) {
      if (sr || size || location || hasQty) rows.push({ line: i + 1, name: "", size, category: ownCat || section, quantity: "", location, error: "Part name is missing" })
      else skipped++
      continue
    }
    const q = cleanQty(qtyRaw)
    const row = { line: i + 1, name, size, category: ownCat || section, quantity: q.value, location }
    if (q.error) row.error = q.error
    if (name.length > 150) row.error = "Part name is longer than 150 characters"
    else if (size.length > 100) row.error = "Size is longer than 100 characters"
    else if (location.length > 255) row.error = "Location is longer than 255 characters"
    rows.push(row)
  }
  if (!rows.length) throw new SheetError("No component rows found below the headings.")
  if (rows.length > 1000) throw new SheetError("A BOM can have at most 1000 lines. Split the file.")
  return { rows, skipped }
}

/** @returns {{ rows: object[] }} product rows: { line, sku, name, description, error? } */
export function toProductRows(table) {
  const head = findHeader(table, "products")
  if (!head) throw new SheetError('Could not find the column headings. The sheet needs a "Product Name" column; "SKU" and "Description" are optional.')
  const { index, map } = head
  const cell = (r, f) => (map[f] === undefined ? "" : r[map[f]] ?? "")
  const rows = []
  for (let i = index + 1; i < table.length; i++) {
    const r = table[i]
    if (r.every((c) => c === "")) continue
    const name = text(cell(r, "name"))
    const sku = text(cell(r, "sku")).toUpperCase().replace(/\s+/g, "")
    const description = String(cell(r, "description") ?? "").trim()
    const row = { line: i + 1, sku, name, description }
    if (!name) row.error = "Product name is missing"
    else if (name.length > 150) row.error = "Product name is longer than 150 characters"
    else if (sku && !SKU_RE.test(sku)) row.error = "SKU can use letters, numbers, . _ - (2 to 50 characters)"
    else if (description.length > 2000) row.error = "Description is too long"
    rows.push(row)
  }
  if (!rows.length) throw new SheetError("No product rows found below the headings.")
  if (rows.length > 500) throw new SheetError("At most 500 products can be imported at once. Split the file.")
  return { rows }
}

/** Picks the first sheet that has usable headings. Returns { sheet, result } or throws the first error. */
export function pickSheet(sheets, kind) {
  let firstError = null
  for (const sheet of sheets) {
    try {
      return { sheet, result: kind === "bom" ? toBomRows(sheet.rows) : toProductRows(sheet.rows) }
    } catch (e) {
      if (!(e instanceof SheetError)) throw e
      firstError ||= e
    }
  }
  throw firstError || new SheetError("Nothing to import in this file.")
}

export const BOM_TEMPLATE = {
  filename: "bom-template.csv",
  headers: ["Part No.", "Size", "Category", "Quantity", "Location"],
  rows: [
    ["4K7", "1206(1%)", "RESISTANCE", 3, "R15, R18, R30"],
    ["M7", "SMT", "DIODE", 1, "D4"],
    ["CABINET", "(130*97*65)MM", "MISC", 1, ""],
  ],
}

export const PRODUCT_TEMPLATE = {
  filename: "products-template.csv",
  headers: ["SKU", "Product Name", "Description"],
  rows: [
    ["PRD-003", "Sample charger 12V 5A", "Optional description"],
    ["", "SKU can be left blank and will be generated", ""],
  ],
}
