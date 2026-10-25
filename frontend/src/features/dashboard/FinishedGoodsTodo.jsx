import { PackageCheck } from "lucide-react"
import { usePermissions } from "@/features/auth/usePermissions"
import { useGetFinishedGoodsQuery } from "@/features/finished-goods/finishedGoodsApi"
import { myFgStep } from "@/features/finished-goods/fgFlow"
import { ListPanel, useDrill } from "./DashboardKit"
import { finishedRow } from "./rows"

/* Dashboard panel: the finished-goods orders where the NEXT step belongs to this role (pack, hand over, bill ...) */
export default function FinishedGoodsTodo({ className, title = "Finished goods waiting for you" }) {
  const drill = useDrill()
  const { role } = usePermissions()
  const { data = [], isLoading } = useGetFinishedGoodsQuery()
  const rows = data
    .filter((item) => myFgStep(item, role))
    .map((item) => ({ ...finishedRow(item), title: item.orderNumber, sub: myFgStep(item, role).todo, to: "/finished-goods" }))

  return (
    <>
      <ListPanel drill={drill} loading={isLoading} className={className} title={title}
        description="After Quality Control: each step has one owner. These are yours."
        rows={rows} to="/finished-goods" toLabel="Open Finished Goods" emptyIcon={PackageCheck} empty="Nothing waiting for you" />
      {drill.host}
    </>
  )
}
