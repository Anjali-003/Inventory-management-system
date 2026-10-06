import { useNavigate } from "react-router-dom"
import { ClipboardCheck, PackageCheck } from "lucide-react"
import { Button } from "../ui/button"

export default function OrderActions({
  order,
  onCheck,
  onStart,
  className,
}) {
  const navigate = useNavigate()

  const baseClass =
    className ??
    "flex flex-wrap justify-end gap-2"

  const status = order?.status

  if (status === "PENDING") {
    return (
      <div className={baseClass}>
        <Button
          variant="outline"
          size="sm"
          onClick={() => onCheck(order)}
        >
          Check materials
        </Button>

        <Button
          size="sm"
          onClick={() => onStart(order)}
        >
          Start production
        </Button>
      </div>
    )
  }

  if (status === "IN_PRODUCTION") {
    return (
      <div className={baseClass}>
        <Button
          variant="outline"
          size="sm"
          onClick={() => onCheck(order)}
        >
          Check materials
        </Button>

        <Button
          size="sm"
          onClick={() => onStart(order)}
        >
          Start more
        </Button>
      </div>
    )
  }

  if (status === "TESTING") {
    return (
      <div className={baseClass}>
        <Button
          variant="outline"
          size="sm"
          onClick={() =>
            navigate("/quality-control")
          }
        >
          <ClipboardCheck className="size-4" />
          Open testing
        </Button>
      </div>
    )
  }

  if (status === "PACKAGING") {
    return (
      <div className={baseClass}>
        <Button
          variant="outline"
          size="sm"
          onClick={() =>
            navigate("/finished-goods")
          }
        >
          <PackageCheck className="size-4" />
          Open finished goods
        </Button>
      </div>
    )
  }

  if (status === "COMPLETED") {
    return (
      <div
        className={
          className ??
          "flex justify-end"
        }
      >
        <span className="text-sm text-muted-foreground">
          Completed
        </span>
      </div>
    )
  }

  /*
    Legacy / unexpected statuses.

    We deliberately do not show
    production actions for them.
  */
  return (
    <div
      className={
        className ??
        "flex justify-end"
      }
    >
      <span className="text-sm text-muted-foreground">
        No action
      </span>
    </div>
  )
}