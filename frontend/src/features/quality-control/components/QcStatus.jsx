import { OrderStatus } from "@/components/feedback";

export function Status({ item }) {
  return <OrderStatus status={item.status} />
}
