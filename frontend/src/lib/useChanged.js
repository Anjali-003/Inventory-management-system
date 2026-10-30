import { useState } from "react"

/*
  True on the render where `value` differs from the last render (and on the first render). Lets a component reset
  its own state the moment a prop changes, during render, instead of in a useEffect that first paints the stale
  values and then renders a second time:

    if (useChanged(open) && open) { setQty(""); setErrors({}) }      // a dialog's form starts empty on every open
    if (useChanged(`${query}|${sort}`)) setPage(1)                    // back to page 1 when a filter changes

  Compare primitives (or join several into a string): objects are compared by identity.
  See https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes
*/
const FIRST = Symbol("first render")

export function useChanged(value) {
  const [prev, setPrev] = useState(FIRST)
  if (Object.is(prev, value)) return false
  setPrev(value)
  return true
}
