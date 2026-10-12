import { EmptyState } from "@/components/feedback";
import { SearchX, Users, Plus, Pencil, Loader2, UserX, UserCheck, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import SortHeader from "@/components/SortHeader";
import { cn } from "@/lib/utils";
import Avatar from "@/components/Avatar";
import { shortDate } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { IconButton } from "./IconButton";

export default function EmployeeList({
  busyId,
  clearFilters,
  filtered,
  filtering,
  loading,
  onSort,
  openEdit,
  openNew,
  setActive,
  setSelectedEmployee,
  setToDelete,
  sort,
  visible,
}) {
  return (
    loading ? (
      <div
        className="space-y-4 p-5"
        aria-busy="true"
        aria-label="Loading employees"
      >
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="flex items-center gap-3">
            <div className="size-9 animate-pulse rounded-full bg-muted" />
            <div className="flex-1 space-y-2">
              <div className="h-3.5 w-40 animate-pulse rounded bg-muted" />
              <div className="h-3 w-56 animate-pulse rounded bg-muted" />
            </div>
          </div>
        ))}
      </div>
    ) : filtered.length === 0 ? (
      <div>
        <EmptyState
          icon={filtering ? SearchX : Users}
          title={filtering ? "No matching employees" : "No employees yet"}
        >
          {filtering
            ? "Try a different name, department or status."
            : "Add your first employee to start marking attendance."}
        </EmptyState>
        <div className="-mt-6 flex justify-center pb-10">
          {filtering ? (
            <Button variant="outline" size="lg" onClick={clearFilters}>
              Clear filters
            </Button>
          ) : (
            <Button size="lg" onClick={openNew}>
              <Plus /> Add employee
            </Button>
          )}
        </div>
      </div>
    ) : (
      <>
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-cf-head text-[10px] font-bold uppercase tracking-[0.5px] text-cf-faint">
                <SortHeader
                  label="Employee"
                  k="name"
                  sort={sort}
                  onSort={onSort}
                />
                <SortHeader
                  label="Department"
                  k="department"
                  sort={sort}
                  onSort={onSort}
                  className="hidden md:table-cell"
                />
                <th
                  scope="col"
                  className="hidden px-5 py-2.5 text-left lg:table-cell"
                >
                  Code
                </th>
                <th
                  scope="col"
                  className="hidden px-5 py-2.5 text-left xl:table-cell"
                >
                  Designation
                </th>
                <SortHeader
                  label="Joined"
                  k="joined_on"
                  sort={sort}
                  onSort={onSort}
                  className="hidden xl:table-cell"
                />
                <th
                  scope="col"
                  className="px-5 py-2.5 text-left"
                >
                  Status
                </th>
                <th
                  scope="col"
                  className="px-5 py-2.5 text-right font-medium"
                >
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {visible.map((e) => (
                <tr
                  key={e.id}
                  className={cn(
                    "border-t transition-colors first:border-t-0 hover:bg-muted/40",
                    !e.is_active && "bg-muted/25",
                  )}
                >
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-3">
                      <Avatar name={e.name} muted={!e.is_active} />
                      <div className="min-w-0">
                        <button
                          type="button"
                          onClick={() => setSelectedEmployee(e)}
                          className={cn(
                            "block max-w-full truncate text-left font-medium hover:text-primary",
                            !e.is_active && "text-muted-foreground",
                          )}
                        >
                          {e.name}
                        </button>
                        <p className="truncate text-xs text-muted-foreground">
                          {e.email || "No email"}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="hidden whitespace-nowrap px-5 py-3 md:table-cell">
                    {e.department || (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </td>
                  <td className="hidden whitespace-nowrap px-5 py-3 tabular-nums text-muted-foreground lg:table-cell">
                    {e.employee_code}
                  </td>
                  <td className="hidden whitespace-nowrap px-5 py-3 xl:table-cell">
                    {e.designation || (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </td>
                  <td className="hidden whitespace-nowrap px-5 py-3 text-muted-foreground xl:table-cell">
                    {shortDate(e.joined_on)}
                  </td>
                  <td className="px-5 py-3">
                    <Badge variant={e.is_active ? "success" : "neutral"}>
                      {e.is_active ? "Active" : "Inactive"}
                    </Badge>
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex items-center justify-end gap-0.5">
                      <IconButton
                        label={`Edit ${e.name}`}
                        onClick={() => openEdit(e)}
                      >
                        <Pencil className="size-4" />
                      </IconButton>
                      <IconButton
                        label={
                          e.is_active
                            ? `Deactivate ${e.name}`
                            : `Activate ${e.name}`
                        }
                        disabled={busyId === e.id}
                        onClick={() => setActive(e, !e.is_active)}
                      >
                        {busyId === e.id ? (
                          <Loader2 className="size-4 animate-spin" />
                        ) : e.is_active ? (
                          <UserX className="size-4" />
                        ) : (
                          <UserCheck className="size-4" />
                        )}
                      </IconButton>
                      <IconButton
                        label={`Delete ${e.name}`}
                        danger
                        onClick={() => setToDelete(e)}
                      >
                        <Trash2 className="size-4" />
                      </IconButton>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="grid gap-3 p-3 md:hidden">
          {visible.map((e) => (
            <div key={e.id} className="rounded-xl border bg-card p-4">
              <div className="flex items-start gap-3">
                <Avatar name={e.name} muted={!e.is_active} />
                <div className="min-w-0 flex-1">
                  <button
                    type="button"
                    onClick={() => setSelectedEmployee(e)}
                    className="block max-w-full truncate text-left font-medium hover:text-primary"
                  >
                    {e.name}
                  </button>
                  <p className="mt-0.5 break-words text-xs text-muted-foreground">
                    {e.email || "No email"}
                  </p>
                </div>
                <Badge variant={e.is_active ? "success" : "neutral"}>
                  {e.is_active ? "Active" : "Inactive"}
                </Badge>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-3 border-t pt-3 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground">
                    Department
                  </p>
                  <p className="mt-0.5 break-words">
                    {e.department || "-"}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">
                    Designation
                  </p>
                  <p className="mt-0.5 break-words">
                    {e.designation || "-"}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Code</p>
                  <p className="mt-0.5">{e.employee_code}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Joined</p>
                  <p className="mt-0.5">{shortDate(e.joined_on)}</p>
                </div>
              </div>

              <div className="mt-3 flex justify-end gap-1 border-t pt-2">
                <IconButton
                  label={`Edit ${e.name}`}
                  onClick={() => openEdit(e)}
                >
                  <Pencil className="size-4" />
                </IconButton>
                <IconButton
                  label={
                    e.is_active
                      ? `Deactivate ${e.name}`
                      : `Activate ${e.name}`
                  }
                  disabled={busyId === e.id}
                  onClick={() => setActive(e, !e.is_active)}
                >
                  {busyId === e.id ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : e.is_active ? (
                    <UserX className="size-4" />
                  ) : (
                    <UserCheck className="size-4" />
                  )}
                </IconButton>
                <IconButton
                  label={`Delete ${e.name}`}
                  danger
                  onClick={() => setToDelete(e)}
                >
                  <Trash2 className="size-4" />
                </IconButton>
              </div>
            </div>
          ))}
        </div>
      </>
    )
  );
}
