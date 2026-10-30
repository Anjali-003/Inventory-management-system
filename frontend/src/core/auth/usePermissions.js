import { useSyncExternalStore } from "react"
import { useGetMeQuery } from "@/core/auth/authApi"
import { ROLE_LABELS, canEdit, canView, getViewAs, homePathFor, subscribeViewAs } from "@/lib/permissions"

/*
  const { canEdit, canView, role, user } = usePermissions()
  {canEdit("inventory") && <Button>Stock in</Button>}

  role      the role the screens follow (for the Super Admin: the role picked in "View as", if any)
  realRole  the role the user is logged in as (what the server checks)
  viewingAs the picked role while the Super Admin views the app as it, else null
*/
export function usePermissions() {
  const { data: user, isLoading } = useGetMeQuery()
  const realRole = user?.role ?? null
  const picked = useSyncExternalStore(subscribeViewAs, getViewAs, () => null)
  // the Super Admin viewing the app as another role: every screen follows that role
  const viewingAs = realRole === "SUPER_ADMIN" ? picked : null
  const role = viewingAs || realRole

  return {
    user,
    role,
    realRole,
    viewingAs,
    roleLabel: ROLE_LABELS[String(role || "").toUpperCase()] || role || "",
    loading: isLoading,
    canView: (module) => canView(role, module),
    canEdit: (module) => canEdit(role, module),
    homePath: homePathFor(role),
  }
}














// http://localhost:5173/inventory?page=2&sort=price#details

// {
//   pathname: "/inventory",
//   search: "?page=2&sort=price",
//   hash: "#details",
//   state: null,
//   key: "some-key"
// }