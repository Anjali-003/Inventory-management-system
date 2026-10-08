import { useNavigate } from "react-router-dom"
import { ClipboardCheck, PackageCheck } from "lucide-react"
import { Button } from "../ui/button"

export default function OrderActions({ order, onCheck, onStart, className }) {
  const navigate = useNavigate()
  const baseClass = className ?? "flex flex-wrap justify-end gap-2"
  const status = order?.status
  const remainingToStart = Math.max(0, Number(order?.remaining_to_start ?? 0))
  const started = Number(order?.quantity_to_produce ?? 0)

  if (remainingToStart > 0 && ["PENDING", "IN_PRODUCTION", "TESTING"].includes(status)) {
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
