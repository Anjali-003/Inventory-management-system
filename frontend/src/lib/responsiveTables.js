import { useEffect } from "react"

// Phones show every table row as a card (see the "table[data-rt]" block in index.css).
// A card needs to know which column each cell belongs to, so this copies the header text
// onto every cell as data-label. It watches the page, so tables that load later, change
// rows or open inside a modal are handled too. Opt out with <table data-cards="off">.

const clean = (th) => {
  if (th.dataset.label !== undefined) return th.dataset.label
  const copy = th.cloneNode(true)
  copy.querySelectorAll(".sr-only, svg, [aria-hidden='true']").forEach((n) => n.remove())
  return copy.textContent.replace(/\s+/g, " ").trim()
}

function enhance(table) {
  if (table.dataset.cards === "off") return
  const head = table.tHead
  if (!head || head.rows.length === 0) return

  const labels = []
  for (const th of head.rows[head.rows.length - 1].cells) {
    const text = clean(th)
    for (let i = 0; i < th.colSpan; i++) labels.push(text)
  }

  table.setAttribute("data-rt", "")
  for (const body of table.tBodies) {
    for (const tr of body.rows) {
      // one wide cell (empty or loading message) stays a plain block, not a labelled card
      tr.toggleAttribute("data-rt-span", tr.cells.length === 1 && tr.cells[0].colSpan > 1)
      let col = 0
      for (const td of tr.cells) {
        const text = labels[col]
        if (text) {
          if (td.getAttribute("data-label") !== text) td.setAttribute("data-label", text)
        } else if (td.hasAttribute("data-label")) {
          td.removeAttribute("data-label")
        }
        col += td.colSpan
      }
    }
  }
}

export function useResponsiveTables() {
  useEffect(() => {
    let frame = 0
    const run = () => {
      frame = 0
      document.querySelectorAll("table").forEach(enhance)
    }
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(run)
    }
    run()
    const observer = new MutationObserver(schedule)
    observer.observe(document.body, { childList: true, subtree: true, characterData: true })
    return () => {
      observer.disconnect()
      if (frame) cancelAnimationFrame(frame)
    }
  }, [])
}
