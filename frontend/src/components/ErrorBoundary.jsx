import { Component } from "react"
import { AlertCircle, RotateCw } from "lucide-react"

/*
  Catches a crash while a page renders, so one broken screen shows a message instead of a blank white app.
  API errors are not caught here: RTK Query / services return them and pages show <ErrorBanner>.

    <ErrorBoundary resetKey={pathname}>...</ErrorBoundary>   a new resetKey (another page) clears the error

  After a new release the browser may still ask for an old page file that no longer exists ("Failed to fetch
  dynamically imported module"); only a full reload fixes that, so that case offers "Reload" instead of "Try again".
*/
const isStaleChunk = (error) =>
  /dynamically imported module|Importing a module script failed|Loading chunk/i.test(String(error?.message))

export default class ErrorBoundary extends Component {
  state = { error: null }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    console.error("Page crashed:", error, info.componentStack)
  }

  componentDidUpdate(prev) {
    if (this.state.error && prev.resetKey !== this.props.resetKey) this.setState({ error: null })
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children

    const stale = isStaleChunk(error)
    return (
      <div role="alert" className="mx-auto my-16 max-w-md px-4 text-center">
        <AlertCircle className="mx-auto size-8 text-destructive" aria-hidden />
        <h1 className="mt-4 text-xl font-bold tracking-tight text-foreground">
          {stale ? "A new version is available" : "This page could not be shown"}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {stale
            ? "The app was updated while it was open. Reload to get the latest version."
            : "Something went wrong on this screen. Your data is safe; try again, or open another page from the menu."}
        </p>
        <button
          type="button"
          onClick={() => (stale ? window.location.reload() : this.setState({ error: null }))}
          className="mt-6 inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground outline-none transition-colors hover:bg-cf-green-hover focus-visible:ring-3 focus-visible:ring-primary/30"
        >
          <RotateCw className="size-4" aria-hidden /> {stale ? "Reload" : "Try again"}
        </button>
      </div>
    )
  }
}
