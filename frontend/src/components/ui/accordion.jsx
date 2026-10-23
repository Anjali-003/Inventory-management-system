import { useId, useState } from "react"
import { ChevronDown } from "lucide-react"
import { cn } from "@/lib/utils"

/*
  The ONE accordion for the whole app. Do not hand-roll `useState(open)` + `aria-expanded` + a chevron anywhere else:
  use this, so keyboard, focus ring, aria and the chevron behave the same on every page.

  Closed it shows only `header`; click it (or press Enter / Space on it) to show `children`, click again to hide them.

  <Accordion header={<p>PO-1 · Acme</p>} meta={<Badge>12</Badge>} actions={<Button>Accept</Button>}>
    ...what opens...
  </Accordion>

  header        always visible, left side of the bar. May be a function of `open`: (open) => node
  meta          always visible, right side. Plain info: clicking it still toggles the accordion
  actions       always visible, right side. Buttons / links: clicking them NEVER toggles the accordion
  children      the panel; it is only mounted while open
  defaultOpen   start open (uncontrolled)
  open, onOpenChange   controlled mode, e.g. to keep one accordion open at a time
  as            root element or component: "div" (default), "li", or a component such as <Card> or motion.li
  rootProps     extra props for the root, e.g. { variants: rise } when `as` is motion.li
  headerAs      element or component for the bar: "div" (default) or e.g. CardHeader
  className / headerClassName / panelClassName / endClassName
                extra classes. headerClassName may be a function of `open`: (open) => string
  hideChevron   leave the chevron out
  disabled      cannot be toggled
*/
export function Accordion({
  as: Root = "div",
  headerAs: Header = "div",
  header,
  meta,
  actions,
  children,
  defaultOpen = false,
  open: openProp,
  onOpenChange,
  disabled = false,
  hideChevron = false,
  rootProps,
  className,
  headerClassName,
  panelClassName,
  endClassName,
}) {
  const uid = useId()
  const [innerOpen, setInnerOpen] = useState(defaultOpen)
  const controlled = openProp !== undefined
  const open = controlled ? openProp : innerOpen

  const toggle = () => {
    if (disabled) return
    const next = !open
    if (!controlled) setInnerOpen(next)
    onOpenChange?.(next)
  }
  // only react to keys pressed on the bar itself, never on a button inside it
  const onKeyDown = (e) => {
    if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) {
      e.preventDefault()
      toggle()
    }
  }
  const headerId = `${uid}-header`
  const panelId = `${uid}-panel`

  return (
    <Root {...rootProps} className={className}>
      <Header
        id={headerId}
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-expanded={open}
        aria-controls={panelId}
        aria-disabled={disabled || undefined}
        onClick={toggle}
        onKeyDown={onKeyDown}
        className={cn(
          "flex items-center justify-between gap-4 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/60",
          disabled ? "cursor-default" : "cursor-pointer hover:bg-muted/40",
          typeof headerClassName === "function" ? headerClassName(open) : headerClassName,
        )}
      >
        <div className="min-w-0">{typeof header === "function" ? header(open) : header}</div>
        {(meta || actions || !hideChevron) && (
          <div className={cn("flex max-w-full flex-wrap items-center gap-3 sm:shrink-0 sm:flex-nowrap", endClassName)}>
            {meta}
            {actions && <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>{actions}</div>}
            {!hideChevron && (
              <ChevronDown className={cn("size-5 text-muted-foreground transition-transform duration-200", open && "rotate-180")} aria-hidden />
            )}
          </div>
        )}
      </Header>
      {open && (
        <div id={panelId} role="region" aria-labelledby={headerId} className={panelClassName}>
          {children}
        </div>
      )}
    </Root>
  )
}
