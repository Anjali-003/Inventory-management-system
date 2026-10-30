import { Link, useLocation } from "react-router-dom"
import { ArrowLeft, Home, LayoutDashboard } from "lucide-react"
import { getActiveRole } from "@/lib/permissions"

/*
  Any URL that is not a page of the app. Works logged in or not: a tab already working as a role gets a way back to
  its dashboard, everyone gets the home page (with every role's login).
*/
export default function NotFound() {
  const { pathname } = useLocation()
  const signedIn = Boolean(getActiveRole())

  return (
    <main className="grid min-h-screen place-items-center bg-background px-4 py-16">
      <div className="w-full max-w-md text-center">
        <img src="/ss_logo.png" alt="Sensation Systems" width="48" height="48" className="mx-auto size-12 rounded-xl bg-white object-contain ring-1 ring-border" />
        <p className="mt-8 text-sm font-semibold text-primary">Error 404</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">Page not found</h1>
        <p className="mt-3 text-pretty text-muted-foreground">
          There is no page at <span className="break-all font-mono text-sm text-foreground">{pathname}</span>. The link may be
          old, or the address mistyped.
        </p>
        <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
          {signedIn && (
            <Link
              to="/dashboard"
              className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground outline-none transition-colors hover:bg-cf-green-hover focus-visible:ring-3 focus-visible:ring-primary/30"
            >
              <LayoutDashboard className="size-4" /> Go to your dashboard
            </Link>
          )}
          <Link
            to="/"
            className={
              signedIn
                ? "inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-cf-line-strong bg-card px-4 text-sm font-semibold text-foreground outline-none transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-primary/30"
                : "inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground outline-none transition-colors hover:bg-cf-green-hover focus-visible:ring-3 focus-visible:ring-primary/30"
            }
          >
            <Home className="size-4" /> Home page
          </Link>
        </div>
        <button
          type="button"
          onClick={() => window.history.back()}
          className="mt-6 inline-flex items-center gap-1.5 rounded text-sm font-medium text-muted-foreground outline-none hover:text-foreground focus-visible:text-foreground focus-visible:underline"
        >
          <ArrowLeft className="size-4" /> Back to the previous page
        </button>
      </div>
    </main>
  )
}
