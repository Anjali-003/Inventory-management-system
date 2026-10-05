import { AlertCircle, CheckCircle2 } from "lucide-react"
import { cn } from "../lib/utils"
import { Badge } from "./ui/badge"
import { Skeleton } from "./ui/skeleton"


/*
=========================================================
NOTICE
=========================================================
*/

export function Notice({
  tone = "error",
  title,
  children,
}) {
  const ok = tone === "success"

  const Icon =
    ok
      ? CheckCircle2
      : AlertCircle

  return (
    <div
      role={ok ? "status" : "alert"}
      className={cn(
        "flex gap-3 rounded-lg border px-4 py-3 text-sm",

        ok
          ? "border-success/25 bg-success/10 text-success"
          : "border-destructive/25 bg-destructive/10 text-destructive"
      )}
    >
      <Icon
        className="
          mt-0.5
          size-4
          shrink-0
        "
      />

      <div>
        {title && (
          <p className="font-medium">
            {title}
          </p>
        )}

        {children && (
          <p
            className={
              title
                ? "mt-0.5 opacity-90"
                : ""
            }
          >
            {children}
          </p>
        )}
      </div>
    </div>
  )
}


/*
=========================================================
EMPTY STATE
=========================================================
*/

export function EmptyState({
  icon: Icon,
  title,
  children,
}) {
  return (
    <div
      className="
        flex
        flex-col
        items-center
        px-6
        py-14
        text-center
      "
    >
      {Icon && (
        <span
          className="
            mb-4
            grid
            size-10
            place-items-center
            rounded-lg
            bg-muted
            text-muted-foreground
          "
        >
          <Icon className="size-5" />
        </span>
      )}

      <p className="font-medium">
        {title}
      </p>

      {children && (
        <p
          className="
            mt-1
            max-w-sm
            text-sm
            text-muted-foreground
          "
        >
          {children}
        </p>
      )}
    </div>
  )
}


/*
=========================================================
TABLE SKELETON
=========================================================
*/

export const TableSkeleton = ({
  rows = 5,
}) => (
  <div className="space-y-3 p-5">
    {Array.from(
      {
        length: rows,
      },
      (_, i) => (
        <Skeleton
          key={i}
          className="h-6 w-full"
        />
      )
    )}
  </div>
)


/*
=========================================================
ORDER STATUS
=========================================================

Main order workflow:

PENDING
    ↓
IN_PRODUCTION
    ↓
TESTING
    ↓
PACKAGING
    ↓
DISPATCHED
    ↓
COMPLETED

=========================================================
*/

const ORDER_STATUS = {

  /*
  -----------------------------------------------
  NEW ORDER
  -----------------------------------------------
  */

  PENDING: [
    "warning",
    "Pending",
  ],


  /*
  -----------------------------------------------
  PRODUCTION
  -----------------------------------------------
  */

  IN_PRODUCTION: [
    "info",
    "In production",
  ],


  /*
  -----------------------------------------------
  TESTING
  -----------------------------------------------
  */

  TESTING: [
    "info",
    "Testing",
  ],


  /*
  -----------------------------------------------
  PACKAGING
  -----------------------------------------------
  */

  PACKAGING: [
    "warning",
    "Packaging",
  ],


  /*
  -----------------------------------------------
  DISPATCHED
  -----------------------------------------------
  */

  DISPATCHED: [
    "success",
    "Dispatched",
  ],


  /*
  -----------------------------------------------
  COMPLETED
  -----------------------------------------------
  */

  COMPLETED: [
    "neutral",
    "Completed",
  ],


  /*
  =================================================
  LEGACY STATUSES
  =================================================

  Keep these because older orders may still contain
  these values in the database.
  */

  MATERIAL_SHORTAGE: [
    "danger",
    "Material shortage",
  ],

  READY_FOR_PRODUCTION: [
    "success",
    "Ready for production",
  ],
}


/*
=========================================================
ORDER STATUS COMPONENT
=========================================================
*/

export function OrderStatus({
  status,
}) {
  const [
    variant,
    label,
  ] =
    ORDER_STATUS[status] ?? [
      "neutral",

      String(
        status ?? "Unknown"
      )
        .replace(
          /_/g,
          " "
        )
        .toLowerCase()
        .replace(
          /^./,
          (c) =>
            c.toUpperCase()
        ),
    ]

  return (
    <Badge variant={variant}>
      {label}
    </Badge>
  )
}


/*
=========================================================
ATTENDANCE STATUS
=========================================================
*/

const ATTENDANCE_STATUS = {

  PRESENT: [
    "success",
    "Present",
  ],

  ABSENT: [
    "danger",
    "Absent",
  ],

  HALF_DAY: [
    "warning",
    "Half day",
  ],

  LEAVE: [
    "info",
    "Leave",
  ],
}


/*
=========================================================
ATTENDANCE STATUS COMPONENT
=========================================================
*/

export function AttendanceStatus({
  status,
}) {

  const [
    variant,
    label,
  ] =
    ATTENDANCE_STATUS[status] ?? [
      "neutral",
      "Unmarked",
    ]

  return (
    <Badge variant={variant}>
      {label}
    </Badge>
  )
}