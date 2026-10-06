import { useRef, useState } from "react"
import { Download, FileSpreadsheet, Loader2 } from "lucide-react"
import { cn } from "../../lib/utils"
import { Button } from "../ui/button"

/** Drop zone / file chooser shared by the product and BOM import dialogs. */
export default function FileDrop({ onFile, busy, onTemplate, children }) {
  const inputRef = useRef(null)
  const [over, setOver] = useState(false)
  const pick = (file) => {
    if (file && !busy) onFile(file)
  }

  return (
    <div className="space-y-3">
      <div
        onDragOver={(e) => {
          e.preventDefault()
          setOver(true)
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault()
          setOver(false)
          pick(e.dataTransfer.files?.[0])
        }}
        className={cn(
          "flex flex-col items-center rounded-lg border-2 border-dashed px-6 py-10 text-center transition-colors",
          over ? "border-primary bg-primary/5" : "border-input"
        )}
      >
        <span className="mb-3 grid size-10 place-items-center rounded-lg bg-muted text-muted-foreground">
          {busy ? <Loader2 className="size-5 animate-spin" /> : <FileSpreadsheet className="size-5" />}
        </span>
        <p className="text-sm font-medium">{busy ? "Reading file…" : "Drop an Excel (.xlsx) or CSV file here"}</p>
        <p className="mt-1 text-sm text-muted-foreground">or</p>
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx,.xlsm,.csv,.tsv,.txt"
          className="sr-only"
          tabIndex={-1}
          aria-label="Choose a spreadsheet file"
          onChange={(e) => {
            pick(e.target.files?.[0])
            e.target.value = ""
          }}
        />
        <Button type="button" variant="outline" size="lg" className="mt-2" disabled={busy} onClick={() => inputRef.current?.click()} data-autofocus>
          Choose file
        </Button>
      </div>
      <div className="flex flex-wrap items-start justify-between gap-2 text-sm text-muted-foreground">
        <div className="min-w-0 flex-1">{children}</div>
        <button
          type="button"
          onClick={onTemplate}
          className="inline-flex items-center gap-1.5 rounded font-medium text-primary outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring/50"
        >
          <Download className="size-4" />
          Download template
        </button>
      </div>
    </div>
  )
}
