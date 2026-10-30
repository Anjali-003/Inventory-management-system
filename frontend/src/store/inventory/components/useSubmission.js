import { useEffect, useRef, useState } from "react"
import { errorMessage, newKey } from "@/lib/stock"
import { useChanged } from "@/lib/useChanged"

/* One idempotency key per opened dialog; every retry of the same submission reuses it. */
export function useSubmission(open, onDone) {
  const key = useRef(newKey())
  const lock = useRef(false)
  const [busy, setBusy] = useState(false)
  const [serverError, setServerError] = useState("")

  if (useChanged(open) && open) {
    setBusy(false)
    setServerError("")
  }
  useEffect(() => {
    if (open) {
      key.current = newKey()
      lock.current = false
    }
  }, [open])

  const run = async (request, onServerError) => {
    if (lock.current) return // blocks a double click before React re-renders
    lock.current = true
    setBusy(true)
    setServerError("")
    try {
      const { data } = await request(key.current)
      onDone(data)
    } catch (err) {
      // A definite rejection (4xx) means nothing was saved, so the next attempt gets a fresh key.
      // A network error / 5xx may have been saved, so the same key is kept: a retry then replays
      // the original result instead of posting the stock twice.
      if (err?.response && err.response.status < 500) key.current = newKey()
      setServerError(errorMessage(err))
      onServerError?.(err)
      lock.current = false
      setBusy(false)
    }
  }
  return { busy, serverError, run }
}
