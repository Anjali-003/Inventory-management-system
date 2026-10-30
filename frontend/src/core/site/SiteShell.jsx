import { MotionConfig } from "motion/react"
import SiteFooter from "./SiteFooter"
import SiteNav from "./SiteNav"

/* The frame of every public page: skip link, floating nav, the page itself in <main>, footer. */
export default function SiteShell({ signedIn = false, children }) {
  return (
    <MotionConfig reducedMotion="user">
      <div className="min-h-screen bg-lp-bg font-lp-head text-base text-lp-text antialiased">
        <a href="#main" className="sr-only z-50 rounded-lg bg-lp-green px-3 py-2 text-sm font-semibold text-white focus:not-sr-only focus:fixed focus:top-4 focus:left-4">
          Skip to content
        </a>
        <SiteNav signedIn={signedIn} />
        <main id="main">{children}</main>
        <SiteFooter />
      </div>
    </MotionConfig>
  )
}
