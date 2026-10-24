import { useEffect, useState } from "react"
import { Link, useLocation } from "react-router-dom"
import { AnimatePresence, motion } from "motion/react"
import { EASE, ease, focusRing } from "./siteKit"

/*
  The floating glass pill on every public page (home, about, contact). On phones the hamburger morphs into an X and
  opens a full screen glass menu. The current page (or, on the home page, the section in view) is highlighted.
  "Log in" goes to the role login cards on the home page.
*/
const LINKS = [
  { label: "About", to: "/about" },
  { label: "FAQ", to: "/#faq", section: "faq" },
  { label: "Contact", to: "/contact" },
]

/* On the home page a section link only scrolls; from another page it opens the home page at that section. */
function NavLink({ item, onHome, className, children, onClick, ...rest }) {
  if (item.section && onHome) {
    return <a href={`#${item.section}`} className={className} onClick={onClick} {...rest}>{children}</a>
  }
  return <Link to={item.to} className={className} onClick={onClick} {...rest}>{children}</Link>
}

export default function SiteNav({ signedIn = false }) {
  const { pathname } = useLocation()
  const onHome = pathname === "/"
  const [open, setOpen] = useState(false)
  const [section, setSection] = useState(null)

  // home page: highlight the section that is in the middle of the screen
  useEffect(() => {
    if (!onHome) return
    const els = LINKS.filter((l) => l.section).map((l) => document.getElementById(l.section)).filter(Boolean)
    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => setSection((s) => (e.isIntersecting ? e.target.id : s === e.target.id ? null : s))),
      { rootMargin: "-45% 0px -50% 0px" }
    )
    els.forEach((el) => io.observe(el))
    return () => io.disconnect()
  }, [onHome])

  useEffect(() => {
    if (!open) return
    const onKey = (e) => e.key === "Escape" && setOpen(false)
    window.addEventListener("keydown", onKey)
    document.body.style.overflow = "hidden"
    return () => {
      window.removeEventListener("keydown", onKey)
      document.body.style.overflow = ""
    }
  }, [open])

  const isActive = (l) => (l.section ? onHome && section === l.section : pathname === l.to)
  const login = { label: signedIn ? "Open workspace" : "Log in", to: "/#login", section: "login" }

  return (
    <>
      <header className="fixed inset-x-0 top-0 z-40 px-4">
        <nav
          aria-label="Main"
          className="mx-auto mt-6 flex w-max max-w-full items-center gap-2 rounded-full border border-lp-line bg-white/75 py-2 pr-2 pl-4 shadow-[0_8px_32px_-12px_rgba(23,26,33,0.18)] backdrop-blur-xl"
        >
          <Link to="/" aria-label="Sensation Systems home" className={`mr-2 inline-flex items-center gap-2 rounded-full text-sm font-bold text-lp-ink ${focusRing}`}>
            <img src="/ss_logo.png" alt="" width="24" height="24" className="rounded-md" />
            <span>Sensation Systems</span>
          </Link>

          <div className="hidden items-center gap-1 md:flex">
            {LINKS.map((l) => {
              const active = isActive(l)
              return (
                <NavLink
                  key={l.label}
                  item={l}
                  onHome={onHome}
                  aria-current={active ? "page" : undefined}
                  className={`relative rounded-full px-3 py-2 text-sm font-medium ${ease} ${focusRing} ${active ? "text-lp-ink" : "text-lp-muted hover:text-lp-ink"}`}
                >
                  {active && <motion.span layoutId="nav-pill" className="absolute inset-0 rounded-full bg-lp-tint" transition={{ duration: 0.6, ease: EASE }} />}
                  <span className="relative">{l.label}</span>
                </NavLink>
              )
            })}
          </div>

          <NavLink
            item={login}
            onHome={onHome}
            className={`hidden rounded-full bg-lp-green px-4 py-2 text-sm font-semibold text-white md:inline-flex ${ease} hover:bg-lp-green-dark active:scale-[0.98] ${focusRing}`}
          >
            {login.label}
          </NavLink>

          <button
            type="button"
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
            onClick={() => setOpen((o) => !o)}
            className={`relative z-50 grid size-10 place-items-center rounded-full md:hidden ${ease} hover:bg-lp-tint ${focusRing}`}
          >
            <span className={`absolute h-0.5 w-5 rounded-full bg-lp-ink ${ease} ${open ? "rotate-45" : "-translate-y-1"}`} />
            <span className={`absolute h-0.5 w-5 rounded-full bg-lp-ink ${ease} ${open ? "-rotate-45" : "translate-y-1"}`} />
          </button>
        </nav>
      </header>

      <AnimatePresence>
        {open && (
          <motion.div
            key="menu"
            className="fixed inset-0 z-30 flex flex-col justify-center bg-white/80 px-8 backdrop-blur-3xl md:hidden"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.3 } }}
            transition={{ duration: 0.5, ease: EASE }}
          >
            <ul className="grid gap-6">
              {[{ label: "Home", to: "/" }, ...LINKS, login].map((l, i) => (
                <li key={l.label} className="overflow-hidden">
                  <motion.div initial={{ y: 48, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ duration: 0.7, ease: EASE, delay: 0.1 + i * 0.05 }}>
                    <NavLink item={l} onHome={onHome} onClick={() => setOpen(false)} className={`block rounded text-4xl font-semibold text-lp-ink ${focusRing}`}>
                      {l.label}
                    </NavLink>
                  </motion.div>
                </li>
              ))}
            </ul>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
