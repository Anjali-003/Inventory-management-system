/** Download rows as a CSV file (opens cleanly in Excel: UTF-8 BOM, CRLF line endings). */
export function downloadCsv(filename, headers, rows) {
  const esc = (v) => {
    let s = v == null ? "" : String(v)
    if (/^[=@]/.test(s)) s = `'${s}` // stop spreadsheet apps treating text as a formula
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const csv = [headers, ...rows].map((r) => r.map(esc).join(",")).join("\r\n")
  const url = URL.createObjectURL(new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" }))
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
