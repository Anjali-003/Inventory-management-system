import { Navigate } from "react-router-dom"
import { Notice } from "@/components/feedback"
import { usePermissions } from "./usePermissions"

/* Wrap a page's route: <RequireAccess module="inventory"><Inventory /></RequireAccess> */
export default function RequireAccess({ module, children }) {
  const { loading, canView, homePath } = usePermissions()

  if (loading) return null
  if (canView(module)) return children

  // no access to this page -> send the user to the first page their role can open
  if (homePath) return <Navigate to={homePath} replace />

  return (
    <Notice title="No access">
      Your account has no modules assigned yet. Please contact the administrator.
    </Notice>
  )
}
