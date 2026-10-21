import { useRef } from "react"
import { newKey } from "@/lib/stock"

/*
  Guards a stock-moving submit against double clicks and retries.
  - `lock` blocks a second click before React re-renders.
  - One idempotency key is reused for every retry of the same submission, so the backend applies it once.
  - A definite rejection (4xx) means nothing was saved: the next attempt gets a fresh key.
    A network error / 5xx may have been saved: the key is kept so a retry replays the first result.
*/
export function useIdempotentSubmit() {
  const key = useRef(newKey())
  const lock = useRef(false)
  return async (send) => {
    if (lock.current) return undefined
    lock.current = true
    try {
      const result = await send(key.current)
      key.current = newKey() // applied: a later, separate action is a new request
      return result
    } catch (err) {
      const status = err?.response?.status
      if (status && status < 500) key.current = newKey()
      throw err
    } finally {
      lock.current = false
    }
  }
}
