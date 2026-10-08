import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Download,
  Loader2,
  Pencil,
  Plus,
  SearchX,
  Trash2,
  UserCheck,
  UserX,
  Users,
  X,
} from "lucide-react";
import api from "../api/api";
import PageHeader from "../components/PageHeader";
import SearchBar from "../components/SearchBar";
import Avatar from "../components/Avatar";
import ErrorBanner from "../components/ErrorBanner";
import Pagination from "../components/Pagination";
import SortHeader from "../components/SortHeader";
import StatStrip from "../components/StatStrip";
import { ConfirmDialog, Modal } from "../components/Modal";
import { Field, TextInput, selectClass } from "../components/FormField";
import { useToast } from "../components/toast";
import { EmptyState } from "../components/feedback";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Card } from "../components/ui/card";
import { downloadCsv } from "../lib/csv";
import { shortDate } from "../lib/format";
import { cn } from "../lib/utils";

const PAGE_SIZE = 10;
const EMPTY = {
  name: "",
  email: "",
  phone: "",
  department: "",
  designation: "",
  joinedOn: "",
  dateOfBirth: "",
  gender: "",
  address: "",
  emergencyContactName: "",
  emergencyContactRelationship: "",
  emergencyContactPhone: "",
  isActive: true,
};

function validate(f) {
  const e = {};
  if (!f.name.trim()) e.name = "Enter the employee's full name.";
  if (f.email.trim() && !/^\S+@\S+\.\S+$/.test(f.email.trim()))
    e.email = "Enter a valid email, like name@company.com.";
  if (f.phone.trim() && !/^\+?[\d\s\-()]{7,20}$/.test(f.phone.trim()))
    e.phone = "Use digits only, with an optional + and spaces or dashes.";
  if (f.dateOfBirth && !/^\d{4}-\d{2}-\d{2}$/.test(f.dateOfBirth))
    e.dateOfBirth = "Date of birth is not valid.";
  if (f.emergencyContactPhone.trim() && !/^\+?[\d\s\-()]{7,20}$/.test(f.emergencyContactPhone.trim()))
    e.emergencyContactPhone = "Use a valid emergency contact phone number.";
  return e;
}

const toPayload = (e, patch = {}) => ({
  name: e.name,
  email: e.email || "",
  phone: e.phone || "",
  department: e.department || "",
  designation: e.designation || "",
  joinedOn: e.joined_on || "",
  dateOfBirth: e.date_of_birth || "",
  gender: e.gender || "",
  address: e.address || "",
  emergencyContactName: e.emergency_contact_name || "",
  emergencyContactRelationship: e.emergency_contact_relationship || "",
  emergencyContactPhone: e.emergency_contact_phone || "",
  isActive: !!e.is_active,
  ...patch,
});

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
        danger
          ? "hover:bg-destructive/10 hover:text-destructive"
          : "hover:bg-muted hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
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
        checked ? "bg-primary" : "bg-input",
      )}
    >
      <span
        className={cn(
          "inline-block size-5 rounded-full bg-white shadow transition-transform",
          checked ? "translate-x-[22px]" : "translate-x-0.5",
        )}
      />
    </button>
  );
}

function DetailRow({ label, value }) {
  return (
    <div className="grid grid-cols-[110px_minmax(0,1fr)] gap-3 border-b py-3 last:border-b-0">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="min-w-0 break-words text-sm font-medium">
        {value || "Not provided"}
      </p>
    </div>
  );
}

function DetailSection({ title, children }) {
  return (
    <section>
      <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h3>
      <div className="rounded-xl border bg-card px-4">{children}</div>
    </section>
  );
}

export default function Employees() {
  const toast = useToast();
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [query, setQuery] = useState("");
  const [dept, setDept] = useState("");
  const [status, setStatus] = useState("all"); // all | active | inactive
  const [sort, setSort] = useState({ key: "name", dir: "asc" });
  const [page, setPage] = useState(1);

  const [modal, setModal] = useState(null); // null | { mode: "new" } | { mode: "edit", employee }
  const [form, setForm] = useState(EMPTY);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);

  const [toDelete, setToDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [selectedEmployee, setSelectedEmployee] = useState(null);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get("/employees");
      setEmployees(data);
      setError("");
    } catch (err) {
      console.error(err);
      setError("Could not load employees. Check that the server is running.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);
  useEffect(() => {
    setPage(1);
  }, [query, dept, status, sort]);

  useEffect(() => {
    document.body.style.overflow = selectedEmployee ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [selectedEmployee]);

  const departments = useMemo(
    () =>
      [...new Set(employees.map((e) => e.department).filter(Boolean))].sort(
        (a, b) => a.localeCompare(b),
      ),
    [employees],
  );

  const stats = useMemo(() => {
    const active = employees.filter((e) => e.is_active).length;
    return {
      total: employees.length,
      active,
      inactive: employees.length - active,
      departments: departments.length,
    };
  }, [employees, departments]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = employees.filter((e) => {
      if (status === "active" && !e.is_active) return false;
      if (status === "inactive" && e.is_active) return false;
      if (dept && e.department !== dept) return false;
      if (!q) return true;
      return `${e.name} ${e.employee_code} ${e.email || ""} ${e.department || ""} ${e.designation || ""}`
        .toLowerCase()
        .includes(q);
    });
    const sign = sort.dir === "asc" ? 1 : -1;
    return list.sort((a, b) => {
      const av = a[sort.key] ?? "";
      const bv = b[sort.key] ?? "";
      if (!av && !bv) return 0;
      if (!av) return 1; // empty values always sink to the bottom
      if (!bv) return -1;
      return (
        String(av).localeCompare(String(bv), undefined, {
          sensitivity: "base",
        }) * sign
      );
    });
  }, [employees, query, dept, status, sort]);

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pages);
  const visible = filtered.slice(
    (safePage - 1) * PAGE_SIZE,
    safePage * PAGE_SIZE,
  );
  const filtering = !!(query || dept || status !== "all");

  const onSort = (key) =>
    setSort((s) =>
      s.key === key
        ? { key, dir: s.dir === "asc" ? "desc" : "asc" }
        : { key, dir: "asc" },
    );
  const clearFilters = () => {
    setQuery("");
    setDept("");
    setStatus("all");
  };

  const openNew = () => {
    setForm(EMPTY);
    setErrors({});
    setFormError("");
    setModal({ mode: "new" });
  };
  const openEdit = (e) => {
    setForm({
      name: e.name,
      email: e.email || "",
      phone: e.phone || "",
      department: e.department || "",
      designation: e.designation || "",
      joinedOn: e.joined_on || "",
      dateOfBirth: e.date_of_birth || "",
      gender: e.gender || "",
      address: e.address || "",
      emergencyContactName: e.emergency_contact_name || "",
      emergencyContactRelationship: e.emergency_contact_relationship || "",
      emergencyContactPhone: e.emergency_contact_phone || "",
      isActive: !!e.is_active,
    });
    setErrors({});
    setFormError("");
    setModal({ mode: "edit", employee: e });
  };
  const closeModal = () => {
    if (!saving) setModal(null);
  };

  const set = (key) => (ev) => {
    const value = ev.target.value;
    setForm((f) => ({ ...f, [key]: value }));
    if (errors[key]) setErrors((x) => ({ ...x, [key]: undefined }));
  };

  const submit = async (ev) => {
    ev.preventDefault();
    const found = validate(form);
    setErrors(found);
    const firstBad = Object.keys(found)[0];
    if (firstBad) {
      requestAnimationFrame(() =>
        document.getElementById(`emp-${firstBad}`)?.focus(),
      );
      return;
    }
    const isNew = modal.mode === "new";
    setSaving(true);
    setFormError("");
    try {
      if (isNew) await api.post("/employees", form);
      else await api.put(`/employees/${modal.employee.id}`, form);
      toast.success(isNew ? "Employee added" : "Changes saved");
      setModal(null);
      await load();
    } catch (err) {
      console.error(err);
      setFormError(
        err.response?.data?.message ||
          "Could not save the employee. Try again.",
      );
    } finally {
      setSaving(false);
    }
  };

  const setActive = async (e, isActive) => {
    setBusyId(e.id);
    try {
      await api.put(`/employees/${e.id}`, toPayload(e, { isActive }));
      toast.success(isActive ? `${e.name} activated` : `${e.name} deactivated`);
      await load();
    } catch (err) {
      console.error(err);
      toast.error(
        err.response?.data?.message || "Could not update the employee",
      );
    } finally {
      setBusyId(null);
    }
  };

  const doDelete = async () => {
    const target = toDelete;
    setDeleting(true);
    try {
      await api.delete(`/employees/${target.id}`);
      toast.success(`${target.name} deleted`);
      setToDelete(null);
      await load();
    } catch (err) {
      console.error(err);
      toast.error(
        err.response?.data?.message || "Could not delete the employee",
      );
    } finally {
      setDeleting(false);
    }
  };

  const exportCsv = () =>
    downloadCsv(
      "employees.csv",
      [
        "Code",
        "Name",
        "Email",
        "Phone",
        "Department",
        "Designation",
        "Joined",
        "Status",
        "Date of Birth",
        "Gender",
        "Address",
        "Emergency Contact Name",
        "Emergency Contact Relationship",
        "Emergency Contact Phone",
      ],
      filtered.map((e) => [
        e.employee_code,
        e.name,
        e.email,
        e.phone,
        e.department,
        e.designation,
        e.joined_on,
        e.is_active ? "Active" : "Inactive",
        e.date_of_birth,
        e.gender,
        e.address,
        e.emergency_contact_name,
        e.emergency_contact_relationship,
        e.emergency_contact_phone,
      ]),
    );

  const isNew = modal?.mode === "new";

  return (
    <>
      <PageHeader
        title="Employees"
        description="Manage the people who appear on the attendance sheet."
      >
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="lg"
            onClick={exportCsv}
            disabled={loading || filtered.length === 0}
          >
            <Download /> Export
          </Button>
          <Button size="lg" onClick={openNew}>
            <Plus /> Add employee
          </Button>
        </div>
      </PageHeader>

      {error && (
        <div className="mb-4">
          <ErrorBanner
            onRetry={() => {
              setLoading(true);
              load();
            }}
          >
            {error}
          </ErrorBanner>
        </div>
      )}

      <Card className="mb-4 overflow-hidden">
        <StatStrip
          layoutId="emp-stat"
          cols="grid-cols-2 lg:grid-cols-4"
          items={[
            {
              key: "all",
              label: "Total employees",
              value: stats.total,
              tone: "neutral",
              active: status === "all",
              onClick: () => setStatus("all"),
            },
            {
              key: "active",
              label: "Active",
              value: stats.active,
              tone: "success",
              active: status === "active",
              onClick: () => setStatus(status === "active" ? "all" : "active"),
            },
            {
              key: "inactive",
              label: "Inactive",
              value: stats.inactive,
              tone: "danger",
              active: status === "inactive",
              onClick: () =>
                setStatus(status === "inactive" ? "all" : "inactive"),
            },
            {
              key: "depts",
              label: "Departments",
              value: stats.departments,
              tone: "info",
            },
          ]}
        />
      </Card>

      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center gap-2 border-b px-5 py-3">
          <SearchBar
            value={query}
            onChange={setQuery}
            placeholder="Search name, code or email"
          />
          <select
            aria-label="Filter by department"
            value={dept}
            onChange={(e) => setDept(e.target.value)}
            className={cn(selectClass, "w-full sm:w-auto")}
          >
            <option value="">All departments</option>
            {departments.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
          {filtering && (
            <Button variant="ghost" size="lg" onClick={clearFilters}>
              Clear filters
            </Button>
          )}
          <p className="ml-auto text-sm text-muted-foreground tabular-nums">
            {filtered.length} {filtered.length === 1 ? "employee" : "employees"}
          </p>
        </div>

        {loading ? (
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
                  <tr className="border-b bg-muted/60 text-xs text-muted-foreground">
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
                      className="hidden px-5 py-2.5 text-left font-medium lg:table-cell"
                    >
                      Code
                    </th>
                    <th
                      scope="col"
                      className="hidden px-5 py-2.5 text-left font-medium xl:table-cell"
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
                      className="px-5 py-2.5 text-left font-medium"
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
        )}
        {!loading && (
          <Pagination
            page={safePage}
            pageSize={PAGE_SIZE}
            total={filtered.length}
            onPage={setPage}
            noun="employees"
          />
        )}
      </Card>

      <Modal
        open={!!modal}
        onClose={closeModal}
        busy={saving}
        title={isNew ? "Add employee" : "Edit employee"}
        description={
          isNew
            ? "The employee code is generated automatically."
            : `Employee code ${modal?.employee?.employee_code ?? ""}`
        }
        onSubmit={submit}
        footer={
          <>
            <Button
              type="button"
              variant="outline"
              size="lg"
              onClick={closeModal}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button type="submit" size="lg" disabled={saving}>
              {saving && <Loader2 className="animate-spin" />}
              {isNew ? "Add employee" : "Save changes"}
            </Button>
          </>
        }
      >
        <div className="space-y-5">
          {formError && (
            <ErrorBanner title="Could not save">{formError}</ErrorBanner>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              className="sm:col-span-2"
              label="Full name"
              htmlFor="emp-name"
              required
              error={errors.name}
            >
              <TextInput
                id="emp-name"
                value={form.name}
                onChange={set("name")}
                error={errors.name}
                placeholder="e.g. Priya Verma"
                autoComplete="off"
                aria-describedby={errors.name ? "emp-name-error" : undefined}
              />
            </Field>
            <Field label="Email" htmlFor="emp-email" error={errors.email}>
              <TextInput
                id="emp-email"
                type="email"
                value={form.email}
                onChange={set("email")}
                error={errors.email}
                placeholder="name@company.com"
                autoComplete="off"
                aria-describedby={errors.email ? "emp-email-error" : undefined}
              />
            </Field>
            <Field label="Phone" htmlFor="emp-phone" error={errors.phone}>
              <TextInput
                id="emp-phone"
                type="tel"
                value={form.phone}
                onChange={set("phone")}
                error={errors.phone}
                placeholder="+91 98765 43210"
                autoComplete="off"
                aria-describedby={errors.phone ? "emp-phone-error" : undefined}
              />
            </Field>
            <Field label="Department" htmlFor="emp-department">
              <TextInput
                id="emp-department"
                list="emp-department-options"
                value={form.department}
                onChange={set("department")}
                placeholder="e.g. Assembly"
                autoComplete="off"
              />
              <datalist id="emp-department-options">
                {departments.map((d) => (
                  <option key={d} value={d} />
                ))}
              </datalist>
            </Field>
            <Field label="Designation" htmlFor="emp-designation">
              <TextInput
                id="emp-designation"
                value={form.designation}
                onChange={set("designation")}
                placeholder="e.g. QC Inspector"
                autoComplete="off"
              />
            </Field>
            <Field label="Joined on" htmlFor="emp-joinedOn">
              <TextInput
                id="emp-joinedOn"
                type="date"
                value={form.joinedOn}
                onChange={set("joinedOn")}
              />
            </Field>
            <Field label="Date of birth" htmlFor="emp-dateOfBirth" error={errors.dateOfBirth}>
              <TextInput
                id="emp-dateOfBirth"
                type="date"
                value={form.dateOfBirth}
                onChange={set("dateOfBirth")}
                error={errors.dateOfBirth}
              />
            </Field>
            <Field label="Gender" htmlFor="emp-gender">
              <select
                id="emp-gender"
                value={form.gender}
                onChange={set("gender")}
                className={selectClass}
              >
                <option value="">Select gender</option>
                <option value="Male">Male</option>
                <option value="Female">Female</option>
                <option value="Other">Other</option>
              </select>
            </Field>
            <Field className="sm:col-span-2" label="Address" htmlFor="emp-address">
              <TextInput
                id="emp-address"
                value={form.address}
                onChange={set("address")}
                placeholder="e.g. Delhi, India"
              />
            </Field>
          </div>

          <div className="rounded-xl border p-4">
            <p className="mb-3 text-sm font-semibold">Emergency contact</p>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Contact name" htmlFor="emp-emergencyContactName">
                <TextInput
                  id="emp-emergencyContactName"
                  value={form.emergencyContactName}
                  onChange={set("emergencyContactName")}
                  placeholder="e.g. Rajesh Sharma"
                />
              </Field>
              <Field label="Relationship" htmlFor="emp-emergencyContactRelationship">
                <TextInput
                  id="emp-emergencyContactRelationship"
                  value={form.emergencyContactRelationship}
                  onChange={set("emergencyContactRelationship")}
                  placeholder="e.g. Father"
                />
              </Field>
              <Field className="sm:col-span-2" label="Phone" htmlFor="emp-emergencyContactPhone" error={errors.emergencyContactPhone}>
                <TextInput
                  id="emp-emergencyContactPhone"
                  type="tel"
                  value={form.emergencyContactPhone}
                  onChange={set("emergencyContactPhone")}
                  error={errors.emergencyContactPhone}
                  placeholder="+91 98765 43210"
                />
              </Field>
            </div>
          </div>

          {!isNew && (
            <div className="flex items-center justify-between gap-4 rounded-lg border bg-muted/40 px-4 py-3">
              <div>
                <p className="text-sm font-medium">Active</p>
                <p className="text-xs text-muted-foreground">
                  Active employees appear on the daily attendance sheet. Turn
                  this off for people who have left.
                </p>
              </div>
              <ActiveSwitch
                checked={form.isActive}
                onChange={(v) => setForm((f) => ({ ...f, isActive: v }))}
              />
            </div>
          )}
        </div>
      </Modal>

      <Modal
        open={!!selectedEmployee}
        onClose={() => setSelectedEmployee(null)}
        title="Employee Details"
        description={selectedEmployee ? `${selectedEmployee.employee_code} · ${selectedEmployee.department || "Employee"}` : ""}
        size="xl"
        footer={
          <Button type="button" variant="outline" size="lg" onClick={() => setSelectedEmployee(null)}>
            Close
          </Button>
        }
      >
        {selectedEmployee && (
          <div className="space-y-5">
            <div className="flex items-center gap-3">
              <Avatar name={selectedEmployee.name} muted={!selectedEmployee.is_active} />
              <div className="min-w-0">
                <h3 className="text-lg font-semibold">{selectedEmployee.name}</h3>
                <p className="text-sm text-muted-foreground">{selectedEmployee.email || "No email provided"}</p>
              </div>
              <Badge className="ml-auto" variant={selectedEmployee.is_active ? "success" : "neutral"}>
                {selectedEmployee.is_active ? "Active" : "Inactive"}
              </Badge>
            </div>

            <DetailSection title="Personal details">
              <div className="grid gap-x-8 sm:grid-cols-2">
                <DetailRow label="Full Name" value={selectedEmployee.name} />
                <DetailRow
                  label="Date of Birth"
                  value={selectedEmployee.date_of_birth ? shortDate(selectedEmployee.date_of_birth) : "Not provided"}
                />
                <DetailRow label="Gender" value={selectedEmployee.gender} />
                <DetailRow label="Email" value={selectedEmployee.email} />
                <DetailRow label="Phone" value={selectedEmployee.phone} />
                <DetailRow label="Address" value={selectedEmployee.address} />
              </div>
            </DetailSection>

            <DetailSection title="Employment details">
              <div className="grid gap-x-8 sm:grid-cols-2">
                <DetailRow label="Department" value={selectedEmployee.department} />
                <DetailRow label="Code" value={selectedEmployee.employee_code} />
                <DetailRow label="Designation" value={selectedEmployee.designation} />
                <DetailRow label="Joined" value={selectedEmployee.joined_on ? shortDate(selectedEmployee.joined_on) : "Not provided"} />
                <DetailRow label="Status" value={selectedEmployee.is_active ? "Active" : "Inactive"} />
              </div>
            </DetailSection>

            <DetailSection title="Emergency contact">
              <div className="grid gap-x-8 sm:grid-cols-2">
                <DetailRow label="Contact Name" value={selectedEmployee.emergency_contact_name} />
                <DetailRow label="Relationship" value={selectedEmployee.emergency_contact_relationship} />
                <DetailRow label="Phone" value={selectedEmployee.emergency_contact_phone} />
              </div>
            </DetailSection>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={!!toDelete}
        onClose={() => {
          if (!deleting) setToDelete(null);
        }}
        onConfirm={doDelete}
        busy={deleting}
        tone="danger"
        title={`Delete ${toDelete?.name ?? "employee"}?`}
        confirmLabel="Delete employee"
        extra={
          toDelete?.is_active ? (
            <Button
              type="button"
              variant="ghost"
              size="lg"
              disabled={deleting}
              onClick={() => {
                const t = toDelete;
                setToDelete(null);
                setActive(t, false);
              }}
              className="sm:mr-auto"
            >
              Deactivate instead
            </Button>
          ) : null
        }
      >
        <p>
          This permanently removes the employee and all of their attendance
          records. It can't be undone.
        </p>
        <p>
          To keep their history, deactivate them instead. They're hidden from
          the attendance sheet and reports, but their records are kept.
        </p>
      </ConfirmDialog>
    </>
  );
}
