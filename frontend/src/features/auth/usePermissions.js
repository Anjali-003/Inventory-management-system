import { useGetMeQuery } from "@/features/auth/authApi"
import { ROLE_LABELS, canEdit, canView, homePathFor } from "@/lib/permissions"

/*
  const { canEdit, canView, role, user } = usePermissions()
  {canEdit("inventory") && <Button>Stock in</Button>}
*/
export function usePermissions() {
  const { data: user, isLoading } = useGetMeQuery()
  const role = user?.role ?? null

  return {
    user,
    role,
    roleLabel: ROLE_LABELS[String(role || "").toUpperCase()] || role || "",
    loading: isLoading,
    canView: (module) => canView(role, module),
    canEdit: (module) => canEdit(role, module),
    homePath: homePathFor(role),
  }
}
