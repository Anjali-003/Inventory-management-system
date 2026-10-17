import { useNavigate } from "react-router-dom"
import { ClipboardCheck, PackageCheck } from "lucide-react"
import { Button } from "@/components/ui/button"

export default function OrderActions({ order, onCheck, onStart, className }) {
  const navigate = useNavigate()
  const baseClass = className ?? "flex flex-wrap justify-end gap-2"
  const status = order?.status
  const remainingToStart = Math.max(0, Number(order?.remaining_to_start ?? 0))
  const started = Number(order?.quantity_to_produce ?? 0)

  // production starts only after the Operations Admin approved the order
  if (order?.approval_status && !["APPROVED", "PARTIALLY_APPROVED"].includes(order.approval_status)) {
    return (
      <div className={className ?? "flex justify-end"}>
        <span className="text-sm text-muted-foreground">
          {order.approval_status === "REJECTED" ? "Rejected by Operations Admin" : order.approval_status === "DRAFT" ? "Draft with Marketing" : "Waiting for Operations Admin approval"}
        </span>
      </div>
    )
  }

  // partly approved order: this product's units have not been approved yet (Operations approves the rest later)
  if (order?.approval_status === "PARTIALLY_APPROVED" && Number(order?.approved_quantity ?? 0) === 0) {
    return (
      <div className={className ?? "flex justify-end"}>
        <span className="text-sm text-muted-foreground">Not approved yet</span>
      </div>
    )
  }

  if (remainingToStart > 0 && ["PENDING", "IN_PRODUCTION", "TESTING", "PACKAGING", "DISPATCHED"].includes(status)) {
    return (
      <div className={baseClass}>
        <Button variant="outline" size="sm" onClick={() => onCheck(order)}>
          Check materials
        </Button>
        <Button size="sm" onClick={() => onStart(order)}>
          {started > 0 ? "Start more" : "Start production"}
        </Button>
      </div>
    )
  }

  if (status === "TESTING") {
    return (
      <div className={baseClass}>
        <Button variant="outline" size="sm" onClick={() => navigate("/quality-control")}>
          <ClipboardCheck className="size-4" />
          Open testing
        </Button>
      </div>
    )
  }

  if (status === "PACKAGING") {
    return (
      <div className={baseClass}>
        <Button variant="outline" size="sm" onClick={() => navigate("/finished-goods")}>
          <PackageCheck className="size-4" />
          Open finished goods
        </Button>
      </div>
    )
  }

  if (status === "IN_PRODUCTION" && remainingToStart === 0) {
    return (
      <div className={className ?? "flex justify-end"}>
        <span className="text-sm text-muted-foreground">Production in progress</span>
      </div>
    )
  }

  if (status === "COMPLETED") {
    return (
      <div className={className ?? "flex justify-end"}>
        <span className="text-sm text-muted-foreground">Completed</span>
      </div>
    )
  }

  return (
    <div className={className ?? "flex justify-end"}>
      <span className="text-sm text-muted-foreground">No action</span>
    </div>
  )
}
