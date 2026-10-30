import { createElement } from "react"
import { iconOf } from "./notificationStyle"

/* The icon of a notification (by type, else by severity). */
export default function NotificationIcon({ n, className }) {
  return createElement(iconOf(n), { className })
}
