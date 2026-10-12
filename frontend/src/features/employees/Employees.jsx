import { useEffect, useMemo, useState } from "react";
import { Download, Plus } from "lucide-react";
import api from "@/api/api";
import PageHeader from "@/components/PageHeader";
import ErrorBanner from "@/components/ErrorBanner";
import Pagination from "@/components/Pagination";
import { useToast } from "@/components/toast";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { downloadCsv } from "@/lib/csv";
import useEmployees from "./hooks/useEmployees";
import { EMPTY, validate, toPayload } from "./employeeForm";
import DeleteEmployeeDialog from "./components/DeleteEmployeeDialog";
import EmployeeDetailModal from "./components/EmployeeDetailModal";
import EmployeeFormModal from "./components/EmployeeFormModal";
import EmployeeList from "./components/EmployeeList";
import EmployeeFilters from "./components/EmployeeFilters";
import EmployeeStats from "./components/EmployeeStats";

const PAGE_SIZE = 10;

export default function Employees() {
  const toast = useToast();
  const { employees, loading, error, load, reload } = useEmployees();

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
            onRetry={reload}
          >
            {error}
          </ErrorBanner>
        </div>
      )}

      <Card className="mb-4 overflow-hidden">
        <EmployeeStats setStatus={setStatus} stats={stats} status={status} />
      </Card>

      <Card className="overflow-hidden">
        <EmployeeFilters clearFilters={clearFilters} departments={departments} dept={dept} filtered={filtered} filtering={filtering} query={query} setDept={setDept} setQuery={setQuery} />

        {<EmployeeList busyId={busyId} clearFilters={clearFilters} filtered={filtered} filtering={filtering} loading={loading} onSort={onSort} openEdit={openEdit} openNew={openNew} setActive={setActive} setSelectedEmployee={setSelectedEmployee} setToDelete={setToDelete} sort={sort} visible={visible} />}
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

      <EmployeeFormModal closeModal={closeModal} departments={departments} errors={errors} form={form} formError={formError} isNew={isNew} modal={modal} saving={saving} set={set} setForm={setForm} submit={submit} />

      <EmployeeDetailModal selectedEmployee={selectedEmployee} setSelectedEmployee={setSelectedEmployee} />

      <DeleteEmployeeDialog deleting={deleting} doDelete={doDelete} setActive={setActive} setToDelete={setToDelete} toDelete={toDelete} />
    </>
  );
}
