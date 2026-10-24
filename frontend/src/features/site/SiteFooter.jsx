import { Link } from "react-router-dom"
import { ArrowUp } from "lucide-react"
import { COMPANY, CONTACT } from "./siteContent"
import { focusRing, wrap } from "./siteKit"

/* Footer of every public page: company, the page links, contact, back to top. */
const PAGES = [
  ["Home", "/"],
  ["About", "/about"],
  ["Contact", "/contact"],
  ["FAQ", "/#faq"],
  ["Log in", "/#login"],
]

export default function SiteFooter() {
  const link = `rounded hover:text-lp-green ${focusRing}`
  return (
    <footer className="border-t border-lp-line bg-white">
      <div className={`${wrap} grid gap-10 py-12 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1.5fr]`}>
        <div>
          <Link to="/" className={`inline-flex items-center gap-2 text-base font-bold text-lp-ink ${focusRing}`}>
            <img src="/ss_logo.png" alt="" width="28" height="28" className="rounded-md" /> {COMPANY.name}
          </Link>
          <p className="mt-3 max-w-sm text-sm text-pretty text-lp-muted">{COMPANY.tagline}</p>
        </div>

        <nav aria-label="Footer">
          <h2 className="text-sm font-semibold text-lp-ink">Pages</h2>
          <ul className="mt-3 grid gap-2 text-sm text-lp-muted">
            {PAGES.map(([label, to]) => (
              <li key={label}>
                <Link to={to} className={link}>{label}</Link>
              </li>
            ))}
          </ul>
        </nav>

        <div>
          <h2 className="text-sm font-semibold text-lp-ink">Contact</h2>
          <ul className="mt-3 grid gap-2 text-sm text-lp-muted">
            <li><a href={`mailto:${CONTACT.email}`} className={link}>{CONTACT.email}</a></li>
            <li><a href={`tel:${CONTACT.phone.replace(/\s+/g, "")}`} className={link}>{CONTACT.phone}</a></li>
            <li>{CONTACT.address.join(", ")}</li>
          </ul>
        </div>
      </div>

      <div className="border-t border-lp-line">
        <div className={`${wrap} flex flex-wrap items-center justify-between gap-4 py-5 text-sm text-lp-muted`}>
          <span>&copy; {new Date().getFullYear()} {COMPANY.legalName} · EPIMS, Electronics Production and Inventory Management System</span>
          <a href="#main" className={`inline-flex items-center gap-1 font-medium ${link}`}>
            Back to top <ArrowUp className="size-4" />
          </a>
        </div>
      </div>
    </footer>
  )
}
