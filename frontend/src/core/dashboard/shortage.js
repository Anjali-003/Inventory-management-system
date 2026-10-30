const EMPTY = []

/* only the components of an approved order that are still to be ordered (lines already on a purchase order are done) */
export const shortageOf = (o) => (o.purchase_request?.items || EMPTY).filter((c) => c.purchase_order_id == null)
