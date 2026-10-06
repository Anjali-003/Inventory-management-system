import { useEffect, useRef, useState } from "react"
import { ArrowLeft, Loader2, Upload } from "lucide-react"
import api from "../../api/api"
import { Modal } from "../Modal"
import { Button } from "../ui/button"
import { Badge } from "../ui/badge"
import { Notice } from "../feedback"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table"
import { downloadCsv } from "../../lib/csv"
import { SheetError, readSpreadsheet } from "../../lib/xlsx"
import { BOM_TEMPLATE, pickSheet } from "../../lib/importSheet"
import { errorMessage, fmtQty } from "../../lib/stock"
import FileDrop from "./FileDrop"

const STATUS = {
  matched: ["success", "Found"],
  new: ["info", "New component"],
  missing: ["warning", "Not found"],
  invalid: ["danger", "Invalid"],
}

/** Fill a product's BOM from an Excel / CSV file. onImported(bom, createdComponents) */
export default function ImportBomModal({ open, product, onClose, onImported }) {
  const [stage, setStage] = useState("choose")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [fileName, setFileName] = useState("")
  const [sheetName, setSheetName] = useState("")
  const [rows, setRows] = useState([])
  const [mode, setMode] = useState("replace")
  const [createMissing, setCreateMissing] = useState(false)
  const [preview, setPreview] = useState(null)
  const lock = useRef(false)
  const seq = useRef(0)

  useEffect(() => {
    if (!open) return
    setStage("choose")
    setBusy(false)
    setError("")
    setFileName("")
    setSheetName("")
    setRows([])
    setMode("replace")
    setCreateMissing(false)
    setPreview(null)
    lock.current = false
  }, [open])

  const payload = (list) =>
    list.map((r) => ({ line: r.line, name: r.name, size: r.size, category: r.category, quantity: r.quantity, location: r.location }))

  const request = (list, nextMode, nextCreate, dryRun) =>
    api.post(`/products/${product.id}/bom/import`, { rows: payload(list), mode: nextMode, createMissing: nextCreate, dryRun })

  const onFile = async (file) => {
    if (lock.current) return
    lock.current = true
    setBusy(true)
    setError("")
    try {
      const sheets = await readSpreadsheet(file)
      const { sheet, result } = pickSheet(sheets, "bom")
      const { data } = await request(result.rows, mode, createMissing, true)
      setRows(result.rows)
      setFileName(file.name)
      setSheetName(sheets.length > 1 ? sheet.name : "")
      setPreview(data)
      setStage("preview")
    } catch (err) {
      setError(err instanceof SheetError ? err.message : errorMessage(err, "Could not read this file."))
    } finally {
      lock.current = false
      setBusy(false)
    }
  }

  // changing an option re-checks the same rows on the server
  const changeOptions = async (nextMode, nextCreate) => {
    setMode(nextMode)
    setCreateMissing(nextCreate)
    const mine = ++seq.current
    setError("")
    try {
      const { data } = await request(rows, nextMode, nextCreate, true)
      if (mine === seq.current) setPreview(data)
    } catch (err) {
      if (mine === seq.current) setError(errorMessage(err))
    }
  }

  const confirm = async () => {
    if (lock.current) return
    lock.current = true
    setBusy(true)
    setError("")
    try {
      const { data } = await request(rows, mode, createMissing, false)
      onImported(data.bom, data.createdComponents)
    } catch (err) {
      setError(errorMessage(err))
      lock.current = false
      setBusy(false)
    }
  }

  const s = preview?.summary
  const ready = s ? s.matched + s.new : 0
  const blocked = !s ? "" : s.invalid > 0
    ? `${s.invalid} row${s.invalid === 1 ? " is" : "s are"} invalid. Fix them in your file and upload it again.`
    : s.missing > 0
      ? `${s.missing} part${s.missing === 1 ? " was" : "s were"} not found. Tick “Create missing components” to add them, or fix the names in your file.`
      : ""
  const backToFile = () => {
    seq.current++
    setStage("choose")
    setPreview(null)
    setError("")
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      busy={busy}
      size="xl"
      title={product ? `Import BOM · ${product.name}` : "Import BOM"}
      description={stage === "choose" ? `${product?.sku ?? ""} · upload the bill of materials from Excel or CSV` : `${fileName}${sheetName ? ` · sheet “${sheetName}”` : ""}`}
      footer={
        stage === "choose" ? (
          <Button type="button" variant="outline" size="lg" onClick={onClose} disabled={busy}>Cancel</Button>
        ) : (
          <>
            <Button type="button" variant="ghost" size="lg" onClick={backToFile} disabled={busy} className="sm:mr-auto">
              <ArrowLeft />
              Choose another file
            </Button>
            <Button type="button" variant="outline" size="lg" onClick={onClose} disabled={busy}>Cancel</Button>
            <Button type="button" size="lg" onClick={confirm} disabled={busy || !s || !!blocked || ready === 0} data-autofocus>
              {busy ? <Loader2 className="animate-spin" /> : <Upload />}
              {mode === "replace" ? "Replace BOM" : "Merge into BOM"}
              {ready > 0 && ` (${ready} line${ready === 1 ? "" : "s"})`}
            </Button>
          </>
        )
      }
    >
      <div className="space-y-4">
        {error && <Notice title={stage === "choose" ? "Could not read this file" : "Could not import the BOM"}>{error}</Notice>}

        {stage === "choose" ? (
          <FileDrop onFile={onFile} busy={busy} onTemplate={() => downloadCsv(BOM_TEMPLATE.filename, BOM_TEMPLATE.headers, BOM_TEMPLATE.rows)}>
            <p>
              Columns: <span className="font-medium text-foreground">Part No.</span> (component name), <span className="font-medium text-foreground">Size</span>,{" "}
              <span className="font-medium text-foreground">Quantity</span> per unit and <span className="font-medium text-foreground">Location</span> on the PCB;{" "}
              <span className="font-medium text-foreground">Category</span> is optional. Your printed BOM sheet works as it is: section rows such as
              “RESISTANCE” become the category, and extra columns (like Sr.No or stock) are ignored. A blank quantity is saved as not specified.
            </p>
          </FileDrop>
        ) : (
          s && (
            <>
              <fieldset className="grid gap-3 sm:grid-cols-2">
                <legend className="sr-only">Import options</legend>
                {[
                  ["replace", "Replace the whole BOM", "The BOM becomes exactly what is in the file."],
                  ["merge", "Add and update only", "Lines in the file are added or updated. Other lines stay. A blank quantity or location keeps the current value."],
                ].map(([value, title, text]) => (
                  <label key={value} className={`flex cursor-pointer gap-3 rounded-lg border p-3 text-sm ${mode === value ? "border-primary bg-primary/5" : "border-input"}`}>
                    <input type="radio" name="bom-import-mode" className="mt-1" checked={mode === value} disabled={busy} onChange={() => changeOptions(value, createMissing)} />
                    <span>
                      <span className="block font-medium">{title}</span>
                      <span className="block text-muted-foreground">{text}</span>
                    </span>
                  </label>
                ))}
              </fieldset>

              <label className="flex cursor-pointer items-start gap-3 text-sm">
                <input type="checkbox" className="mt-1" checked={createMissing} disabled={busy} onChange={(e) => changeOptions(mode, e.target.checked)} />
                <span>
                  <span className="block font-medium">Create missing components</span>
                  <span className="block text-muted-foreground">
                    Parts with no match by name and size are added to Inventory with 0 stock. Leave this off to catch spelling mistakes first.
                  </span>
                </span>
              </label>

              {mode === "replace" && s.existingLines > 0 && (
                <div className="rounded-lg border border-warning/25 bg-warning/10 px-4 py-3 text-sm text-warning">
                  This will replace the current BOM, which has {s.existingLines} line{s.existingLines === 1 ? "" : "s"}.
                </div>
              )}

              <div className="flex flex-wrap items-center gap-2 text-sm">
                <Badge variant="success">{s.matched} found</Badge>
                {s.new > 0 && <Badge variant="info">{s.new} new components</Badge>}
                {s.missing > 0 && <Badge variant="warning">{s.missing} not found</Badge>}
                {s.invalid > 0 && <Badge variant="danger">{s.invalid} invalid</Badge>}
                {mode === "merge" && s.updated > 0 && <Badge variant="neutral">{s.updated} will be updated</Badge>}
              </div>
              {blocked && <Notice title="Cannot import yet">{blocked}</Notice>}

              <div className="max-h-[45vh] overflow-auto rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-14">Row</TableHead>
                      <TableHead>Part No.</TableHead>
                      <TableHead>Size</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead className="text-right">Qty</TableHead>
                      <TableHead>Location</TableHead>
                      <TableHead>Result</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {preview.rows.map((r) => {
                      const [variant, label] = STATUS[r.status] || STATUS.invalid
                      return (
                        <TableRow key={r.line}>
                          <TableCell className="tabular-nums text-muted-foreground">{r.line}</TableCell>
                          <TableCell className="min-w-32 whitespace-normal font-medium">{r.name || "—"}</TableCell>
                          <TableCell className="text-muted-foreground">{r.size || "—"}</TableCell>
                          <TableCell className="text-muted-foreground">{r.category || "—"}</TableCell>
                          <TableCell className="text-right tabular-nums">{r.quantity === "" ? <span className="text-muted-foreground">—</span> : Number.isFinite(Number(r.quantity)) ? fmtQty(r.quantity) : r.quantity}</TableCell>
                          <TableCell className="min-w-32 whitespace-normal">{r.location || <span className="text-muted-foreground">—</span>}</TableCell>
                          <TableCell className="min-w-44 whitespace-normal">
                            <Badge variant={variant}>{label}</Badge>
                            {r.status === "matched" && r.component && <span className="ml-2 text-xs tabular-nums text-muted-foreground">{r.component.sku}</span>}
                            {r.status !== "matched" && r.message && <p className="mt-1 text-xs text-muted-foreground">{r.message}</p>}
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>
            </>
          )
        )}
      </div>
    </Modal>
  )
}
