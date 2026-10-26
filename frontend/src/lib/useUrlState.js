import { useLocation, useNavigate, useSearchParams } from "react-router-dom"

/*
  Filters and popups kept in the address (?status=..., ?order=5, ?bill=3), with a browser Back button that behaves:

    patch(changes, replace)  change filters (`replace` = no new history entry, e.g. while typing in a search box)
    openPopup(changes)       open a drawer / dialog: adds ONE history entry, so Back closes the popup
    closePopup(changes)      close it (Close / ✕ / Escape): steps back over that entry, so the next Back leaves the
                             page in one press and never opens the popup again. A popup reached from a link (no entry
                             of ours) just has its keys removed.

  `changes` is { key: value }; an empty value removes the key.
*/
const apply = (changes) => (prev) => {
  const next = new URLSearchParams(prev)
  for (const [k, v] of Object.entries(changes)) {
    if (v || v === 0) next.set(k, String(v))
    else next.delete(k)
  }
  return next
}

export function useUrlState() {
  const [params, setParams] = useSearchParams()
  const location = useLocation()
  const navigate = useNavigate()
  const openedHere = location.state?.popup === true

  // a replace keeps the "opened here" mark, so switching a drawer's tab does not break Back
  const patch = (changes, replace = false) => setParams(apply(changes), { replace, state: replace ? location.state : undefined })
  const openPopup = (changes) => setParams(apply(changes), { replace: openedHere, state: { popup: true } })
  const closePopup = (changes) => (openedHere ? navigate(-1) : setParams(apply(changes), { replace: true }))

  return { params, setParams, patch, openPopup, closePopup }
}
