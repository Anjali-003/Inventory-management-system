import { Button } from "../ui/button"

/** Check materials / start (or start more) buttons for one order. Shared by the table row and the mobile card. */
export default function OrderActions({ order, onCheck, onStart, className }) {
  return (
    <div className={className ?? "flex flex-wrap justify-end gap-2"}>
      <Button variant="outline" size="sm" onClick={() => onCheck(order)}>Check materials</Button>
      {order.status !== "COMPLETED" && (
        <Button size="sm" onClick={() => onStart(order)}>
          {order.status === "IN_PRODUCTION" ? "Start more" : "Start production"}
        </Button>
      )}
    </div>
  )
}
