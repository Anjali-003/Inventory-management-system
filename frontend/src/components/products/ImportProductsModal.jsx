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
import { PRODUCT_TEMPLATE, pickSheet } from "../../lib/importSheet"
import { errorMessage } from "../../lib/stock"
import FileDrop from "./FileDrop"

const STATUS = {
  new: ["success", "New"],
  exists: ["neutral", "Already exists"],
  invalid: ["danger", "Invalid"],
}

/** Add many products from an Excel / CSV file. onImported(createdCount) */
export default function ImportProductsModal({ open, onClose, onImported }) {
  const [stage, setStage] = useState("choose")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [fileName, setFileName] = useState("")
  const [sheetName, setSheetName] = useState("")
  const [rows, setRows] = useState([])
  const [preview, setPreview] = useState(null)
  const lock = useRef(false)

  useEffect(() => {
    if (!open) return
    setStage("choose")
    setBusy(false)
    setError("")
    setFileName("")
    setSheetName("")
    setRows([])
    setPreview(null)
    lock.current = false
  }, [open])

  const payload = (list) => list.map((r) => ({ line: r.line, sku: r.sku, name: r.name, description: r.description }))

  const onFile = async (file) => {
    if (lock.current) return
    lock.current = true
    setBusy(true)
    setError("")
    try {
      const sheets = await readSpreadsheet(file)
      const { sheet, result } = pickSheet(sheets, "products")
      const { data } = await api.post("/products/import", { rows: payload(result.rows), dryRun: true })
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

  const confirm = async () => {
    if (lock.current) return
    lock.current = true
    setBusy(true)
    setError("")
    try {
      const { data } = await api.post("/products/import", { rows: payload(rows), dryRun: false })
      onImported(data.summary.new)
    } catch (err) {
      setError(errorMessage(err))
      lock.current = false
      setBusy(false)
    }
  }

  const summary = preview?.summary
  const backToFile = () => {
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
      title="Import products from Excel"
      description={stage === "choose" ? "Upload a sheet with one product per row." : `${fileName}${sheetName ? ` · sheet “${sheetName}”` : ""}`}
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
            <Button type="button" size="lg" onClick={confirm} disabled={busy || !summary || summary.new === 0} data-autofocus>
              {busy ? <Loader2 className="animate-spin" /> : <Upload />}
              {summary ? `Add ${summary.new} product${summary.new === 1 ? "" : "s"}` : "Add products"}
            </Button>
          </>
        )
      }
    >
      <div className="space-y-4">
        {error && <Notice title={stage === "choose" ? "Could not read this file" : "Could not add the products"}>{error}</Notice>}

        {stage === "choose" ? (
          <FileDrop
            onFile={onFile}
            busy={busy}
            onTemplate={() => downloadCsv(PRODUCT_TEMPLATE.filename, PRODUCT_TEMPLATE.headers, PRODUCT_TEMPLATE.rows)}
          >
            <p>
              Columns: <span className="font-medium text-foreground">Product Name</span> (required), <span className="font-medium text-foreground">SKU</span> and{" "}
              <span className="font-medium text-foreground">Description</span> (optional). A blank SKU is generated automatically. Products whose SKU already
              exists are skipped, never overwritten.
            </p>
          </FileDrop>
        ) : (
          summary && (
            <>
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <Badge variant="success">{summary.new} new</Badge>
                {summary.exists > 0 && <Badge variant="neutral">{summary.exists} already exist (skipped)</Badge>}
                {summary.invalid > 0 && <Badge variant="danger">{summary.invalid} invalid (skipped)</Badge>}
              </div>
              <div className="max-h-[50vh] overflow-auto rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-14">Row</TableHead>
                      <TableHead>SKU</TableHead>
                      <TableHead>Product</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead>Result</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {preview.rows.map((r) => {
                      const [variant, label] = STATUS[r.status] || STATUS.invalid
                      return (
                        <TableRow key={r.line}>
                          <TableCell className="tabular-nums text-muted-foreground">{r.line}</TableCell>
                          <TableCell className="font-medium tabular-nums">{r.sku || "—"}</TableCell>
                          <TableCell className="min-w-40 whitespace-normal font-medium">{r.name || "—"}</TableCell>
                          <TableCell className="min-w-40 max-w-xs whitespace-normal text-muted-foreground">{r.description}</TableCell>
                          <TableCell className="min-w-44 whitespace-normal">
                            <Badge variant={variant}>{label}</Badge>
                            {r.message && <p className="mt-1 text-xs text-muted-foreground">{r.message}</p>}
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
