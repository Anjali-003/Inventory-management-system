import { useCallback, useEffect, useMemo, useState } from "react"
import { Download, Loader2, Pencil, Plus, SearchX, Trash2, UserCheck, UserX, Users } from "lucide-react"
import api from "../api/api"
import PageHeader from "../components/PageHeader"
import SearchBar from "../components/SearchBar"
import Avatar from "../components/Avatar"
import ErrorBanner from "../components/ErrorBanner"
import Pagination from "../components/Pagination"
import SortHeader from "../components/SortHeader"
import StatStrip from "../components/StatStrip"
import { ConfirmDialog, Modal } from "../components/Modal"
import { Field, TextInput, selectClass } from "../components/FormField"
import { useToast } from "../components/toast"
import { EmptyState } from "../components/feedback"
import { Badge } from "../components/ui/badge"
import { Button } from "../components/ui/button"
import { Card } from "../components/ui/card"
import { downloadCsv } from "../lib/csv"
import { shortDate } from "../lib/format"
import { cn } from "../lib/utils"

const PAGE_SIZE = 10
const EMPTY = { name: "", email: "", phone: "", department: "", designation: "", joinedOn: "", isActive: true }

function validate(f) {
  const e = {}
  if (!f.name.trim()) e.name = "Enter the employee's full name."
  if (f.email.trim() && !/^\S+@\S+\.\S+$/.test(f.email.trim())) e.email = "Enter a valid email, like name@company.com."
  if (f.phone.trim() && !/^\+?[\d\s\-()]{7,20}$/.test(f.phone.trim())) e.phone = "Use digits only, with an optional + and spaces or dashes."
  return e
}

const toPayload = (e, patch = {}) => ({
  name: e.name,
  email: e.email || "",
  phone: e.phone || "",
  department: e.department || "",
  designation: e.designation || "",
  joinedOn: e.joined_on || "",
  isActive: !!e.is_active,
  ...patch,
})

function IconButton({ label, onClick, disabled, danger, children }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "grid size-8 place-items-center rounded-md text-muted-foreground outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-40",
        danger ? "hover:bg-destructive/10 hover:text-destructive" : "hover:bg-muted hover:text-foreground"
      )}
    >
      {children}
    </button>
  )
}

function ActiveSwitch({ checked, onChange }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label="Active employee"
      onClick={() => onChange(!checked)}
      className={cn(
        "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/40",
        checked ? "bg-primary" : "bg-input"
      )}
    >
      <span className={cn("inline-block size-5 rounded-full bg-white shadow transition-transform", checked ? "translate-x-[22px]" : "translate-x-0.5")} />
    </button>
  )
}

export default function Employees() {
  const toast = useToast()
  const [employees, setEmployees] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  const [query, setQuery] = useState("")
  const [dept, setDept] = useState("")
  const [status, setStatus] = useState("all") // all | active | inactive
  const [sort, setSort] = useState({ key: "name", dir: "asc" })
  const [page, setPage] = useState(1)

  const [modal, setModal] = useState(null) // null | { mode: "new" } | { mode: "edit", employee }
  const [form, setForm] = useState(EMPTY)
  const [errors, setErrors] = useState({})
  const [formError, setFormError] = useState("")
  const [saving, setSaving] = useState(false)

  const [toDelete, setToDelete] = useState(null)
  const [deleting, setDeleting] = useState(false)
  const [busyId, setBusyId] = useState(null)

  const load = useCallback(async () => {
    try {
      const { data } = await api.get("/employees")
      setEmployees(data)
      setError("")
    } catch (err) {
      console.error(err)
      setError("Could not load employees. Check that the server is running.")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])
  useEffect(() => { setPage(1) }, [query, dept, status, sort])

  const departments = useMemo(
    () => [...new Set(employees.map((e) => e.department).filter(Boolean))].sort((a, b) => a.localeCompare(b)),
    [employees]
  )

  const stats = useMemo(() => {
    const active = employees.filter((e) => e.is_active).length
    return { total: employees.length, active, inactive: employees.length - active, departments: departments.length }
  }, [employees, departments])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const list = employees.filter((e) => {
      if (status === "active" && !e.is_active) return false
      if (status === "inactive" && e.is_active) return false
      if (dept && e.department !== dept) return false
      if (!q) return true
      return `${e.name} ${e.employee_code} ${e.email || ""} ${e.department || ""} ${e.designation || ""}`.toLowerCase().includes(q)
    })
    const sign = sort.dir === "asc" ? 1 : -1
    return list.sort((a, b) => {
      const av = a[sort.key] ?? ""
      const bv = b[sort.key] ?? ""
      if (!av && !bv) return 0
      if (!av) return 1 // empty values always sink to the bottom
      if (!bv) return -1
      return String(av).localeCompare(String(bv), undefined, { sensitivity: "base" }) * sign
    })
  }, [employees, query, dept, status, sort])

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const safePage = Math.min(page, pages)
  const visible = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)
  const filtering = !!(query || dept || status !== "all")

  const onSort = (key) => setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" }))
  const clearFilters = () => { setQuery(""); setDept(""); setStatus("all") }

  const openNew = () => { setForm(EMPTY); setErrors({}); setFormError(""); setModal({ mode: "new" }) }
  const openEdit = (e) => {
    setForm({ name: e.name, email: e.email || "", phone: e.phone || "", department: e.department || "", designation: e.designation || "", joinedOn: e.joined_on || "", isActive: !!e.is_active })
    setErrors({})
    setFormError("")
    setModal({ mode: "edit", employee: e })
  }
  const closeModal = () => { if (!saving) setModal(null) }

  const set = (key) => (ev) => {
    const value = ev.target.value
    setForm((f) => ({ ...f, [key]: value }))
    if (errors[key]) setErrors((x) => ({ ...x, [key]: undefined }))
  }

  const submit = async (ev) => {
    ev.preventDefault()
    const found = validate(form)
    setErrors(found)
    const firstBad = Object.keys(found)[0]
    if (firstBad) {
      requestAnimationFrame(() => document.getElementById(`emp-${firstBad}`)?.focus())
      return
    }
    const isNew = modal.mode === "new"
    setSaving(true)
    setFormError("")
    try {
      if (isNew) await api.post("/employees", form)
      else await api.put(`/employees/${modal.employee.id}`, form)
      toast.success(isNew ? "Employee added" : "Changes saved")
      setModal(null)
      await load()
    } catch (err) {
      console.error(err)
      setFormError(err.response?.data?.message || "Could not save the employee. Try again.")
    } finally {
      setSaving(false)
    }
  }

  const setActive = async (e, isActive) => {
    setBusyId(e.id)
    try {
      await api.put(`/employees/${e.id}`, toPayload(e, { isActive }))
      toast.success(isActive ? `${e.name} activated` : `${e.name} deactivated`)
      await load()
    } catch (err) {
      console.error(err)
      toast.error(err.response?.data?.message || "Could not update the employee")
    } finally {
      setBusyId(null)
    }
  }

  const doDelete = async () => {
    const target = toDelete
    setDeleting(true)
    try {
      await api.delete(`/employees/${target.id}`)
      toast.success(`${target.name} deleted`)
      setToDelete(null)
      await load()
    } catch (err) {
      console.error(err)
      toast.error(err.response?.data?.message || "Could not delete the employee")
    } finally {
      setDeleting(false)
    }
  }

  const exportCsv = () =>
    downloadCsv(
      "employees.csv",
      ["Code", "Name", "Email", "Phone", "Department", "Designation", "Joined", "Status"],
      filtered.map((e) => [e.employee_code, e.name, e.email, e.phone, e.department, e.designation, e.joined_on, e.is_active ? "Active" : "Inactive"])
    )

  const isNew = modal?.mode === "new"

  return (
    <>
      <PageHeader title="Employees" description="Manage the people who appear on the attendance sheet.">
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="lg" onClick={exportCsv} disabled={loading || filtered.length === 0}><Download /> Export</Button>
          <Button size="lg" onClick={openNew}><Plus /> Add employee</Button>
        </div>
      </PageHeader>

      {error && <div className="mb-4"><ErrorBanner onRetry={() => { setLoading(true); load() }}>{error}</ErrorBanner></div>}

      <Card className="mb-4 overflow-hidden">
        <StatStrip
          layoutId="emp-stat"
          cols="grid-cols-2 lg:grid-cols-4"
          items={[
            { key: "all", label: "Total employees", value: stats.total, tone: "neutral", active: status === "all", onClick: () => setStatus("all") },
            { key: "active", label: "Active", value: stats.active, tone: "success", active: status === "active", onClick: () => setStatus(status === "active" ? "all" : "active") },
            { key: "inactive", label: "Inactive", value: stats.inactive, tone: "danger", active: status === "inactive", onClick: () => setStatus(status === "inactive" ? "all" : "inactive") },
            { key: "depts", label: "Departments", value: stats.departments, tone: "info" },
          ]}
        />
      </Card>

      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center gap-2 border-b px-5 py-3">
          <SearchBar value={query} onChange={setQuery} placeholder="Search name, code or email" />
          <select aria-label="Filter by department" value={dept} onChange={(e) => setDept(e.target.value)} className={cn(selectClass, "w-full sm:w-auto")}>
            <option value="">All departments</option>
            {departments.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
          {filtering && <Button variant="ghost" size="lg" onClick={clearFilters}>Clear filters</Button>}
          <p className="ml-auto text-sm text-muted-foreground tabular-nums">{filtered.length} {filtered.length === 1 ? "employee" : "employees"}</p>
        </div>

        {loading ? (
          <div className="space-y-4 p-5" aria-busy="true" aria-label="Loading employees">
            {Array.from({ length: 6 }, (_, i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="size-9 animate-pulse rounded-full bg-muted" />
                <div className="flex-1 space-y-2"><div className="h-3.5 w-40 animate-pulse rounded bg-muted" /><div className="h-3 w-56 animate-pulse rounded bg-muted" /></div>
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div>
            <EmptyState icon={filtering ? SearchX : Users} title={filtering ? "No matching employees" : "No employees yet"}>
              {filtering ? "Try a different name, department or status." : "Add your first employee to start marking attendance."}
            </EmptyState>
            <div className="-mt-6 flex justify-center pb-10">
              {filtering ? <Button variant="outline" size="lg" onClick={clearFilters}>Clear filters</Button> : <Button size="lg" onClick={openNew}><Plus /> Add employee</Button>}
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/60 text-xs text-muted-foreground">
                  <SortHeader label="Employee" k="name" sort={sort} onSort={onSort} />
                  <SortHeader label="Department" k="department" sort={sort} onSort={onSort} className="hidden md:table-cell" />
                  <th scope="col" className="hidden px-5 py-2.5 text-left font-medium lg:table-cell">Code</th>
                  <th scope="col" className="hidden px-5 py-2.5 text-left font-medium xl:table-cell">Designation</th>
                  <SortHeader label="Joined" k="joined_on" sort={sort} onSort={onSort} className="hidden xl:table-cell" />
                  <th scope="col" className="px-5 py-2.5 text-left font-medium">Status</th>
                  <th scope="col" className="px-5 py-2.5 text-right font-medium"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {visible.map((e) => (
                  <tr key={e.id} className={cn("border-t transition-colors first:border-t-0 hover:bg-muted/40", !e.is_active && "bg-muted/25")}>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3">
                        <Avatar name={e.name} muted={!e.is_active} />
                        <div className="min-w-0">
                          <p className={cn("truncate font-medium", !e.is_active && "text-muted-foreground")}>{e.name}</p>
                          <p className="truncate text-xs text-muted-foreground">{e.email || "No email"}</p>
                        </div>
                      </div>
                    </td>
                    <td className="hidden whitespace-nowrap px-5 py-3 md:table-cell">{e.department || <span className="text-muted-foreground">-</span>}</td>
                    <td className="hidden whitespace-nowrap px-5 py-3 tabular-nums text-muted-foreground lg:table-cell">{e.employee_code}</td>
                    <td className="hidden whitespace-nowrap px-5 py-3 xl:table-cell">{e.designation || <span className="text-muted-foreground">-</span>}</td>
                    <td className="hidden whitespace-nowrap px-5 py-3 text-muted-foreground xl:table-cell">{shortDate(e.joined_on)}</td>
                    <td className="px-5 py-3"><Badge variant={e.is_active ? "success" : "neutral"}>{e.is_active ? "Active" : "Inactive"}</Badge></td>
                    <td className="px-3 py-3">
                      <div className="flex items-center justify-end gap-0.5">
                        <IconButton label={`Edit ${e.name}`} onClick={() => openEdit(e)}><Pencil className="size-4" /></IconButton>
                        <IconButton label={e.is_active ? `Deactivate ${e.name}` : `Activate ${e.name}`} disabled={busyId === e.id} onClick={() => setActive(e, !e.is_active)}>
                          {busyId === e.id ? <Loader2 className="size-4 animate-spin" /> : e.is_active ? <UserX className="size-4" /> : <UserCheck className="size-4" />}
                        </IconButton>
                        <IconButton label={`Delete ${e.name}`} danger onClick={() => setToDelete(e)}><Trash2 className="size-4" /></IconButton>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {!loading && <Pagination page={safePage} pageSize={PAGE_SIZE} total={filtered.length} onPage={setPage} noun="employees" />}
      </Card>

      <Modal
        open={!!modal}
        onClose={closeModal}
        busy={saving}
        title={isNew ? "Add employee" : "Edit employee"}
        description={isNew ? "The employee code is generated automatically." : `Employee code ${modal?.employee?.employee_code ?? ""}`}
        onSubmit={submit}
        footer={
          <>
            <Button type="button" variant="outline" size="lg" onClick={closeModal} disabled={saving}>Cancel</Button>
            <Button type="submit" size="lg" disabled={saving}>
              {saving && <Loader2 className="animate-spin" />}
              {isNew ? "Add employee" : "Save changes"}
            </Button>
          </>
        }
      >
        <div className="space-y-5">
          {formError && <ErrorBanner title="Could not save">{formError}</ErrorBanner>}

          <div className="grid gap-4 sm:grid-cols-2">
            <Field className="sm:col-span-2" label="Full name" htmlFor="emp-name" required error={errors.name}>
              <TextInput id="emp-name" value={form.name} onChange={set("name")} error={errors.name} placeholder="e.g. Priya Verma" autoComplete="off" aria-describedby={errors.name ? "emp-name-error" : undefined} />
            </Field>
            <Field label="Email" htmlFor="emp-email" error={errors.email}>
              <TextInput id="emp-email" type="email" value={form.email} onChange={set("email")} error={errors.email} placeholder="name@company.com" autoComplete="off" aria-describedby={errors.email ? "emp-email-error" : undefined} />
            </Field>
            <Field label="Phone" htmlFor="emp-phone" error={errors.phone}>
              <TextInput id="emp-phone" type="tel" value={form.phone} onChange={set("phone")} error={errors.phone} placeholder="+91 98765 43210" autoComplete="off" aria-describedby={errors.phone ? "emp-phone-error" : undefined} />
            </Field>
            <Field label="Department" htmlFor="emp-department">
              <TextInput id="emp-department" list="emp-department-options" value={form.department} onChange={set("department")} placeholder="e.g. Assembly" autoComplete="off" />
              <datalist id="emp-department-options">{departments.map((d) => <option key={d} value={d} />)}</datalist>
            </Field>
            <Field label="Designation" htmlFor="emp-designation">
              <TextInput id="emp-designation" value={form.designation} onChange={set("designation")} placeholder="e.g. QC Inspector" autoComplete="off" />
            </Field>
            <Field label="Joined on" htmlFor="emp-joinedOn">
              <TextInput id="emp-joinedOn" type="date" value={form.joinedOn} onChange={set("joinedOn")} />
            </Field>
          </div>

          {!isNew && (
            <div className="flex items-center justify-between gap-4 rounded-lg border bg-muted/40 px-4 py-3">
              <div>
                <p className="text-sm font-medium">Active</p>
                <p className="text-xs text-muted-foreground">Active employees appear on the daily attendance sheet. Turn this off for people who have left.</p>
              </div>
              <ActiveSwitch checked={form.isActive} onChange={(v) => setForm((f) => ({ ...f, isActive: v }))} />
            </div>
          )}
        </div>
      </Modal>

      <ConfirmDialog
        open={!!toDelete}
        onClose={() => { if (!deleting) setToDelete(null) }}
        onConfirm={doDelete}
        busy={deleting}
        tone="danger"
        title={`Delete ${toDelete?.name ?? "employee"}?`}
        confirmLabel="Delete employee"
        extra={
          toDelete?.is_active ? (
            <Button type="button" variant="ghost" size="lg" disabled={deleting} onClick={() => { const t = toDelete; setToDelete(null); setActive(t, false) }} className="sm:mr-auto">
              Deactivate instead
            </Button>
          ) : null
        }
      >
        <p>This permanently removes the employee and all of their attendance records. It can't be undone.</p>
        <p>To keep their history, deactivate them instead. They're hidden from the attendance sheet and reports, but their records are kept.</p>
      </ConfirmDialog>
    </>
  )
}
