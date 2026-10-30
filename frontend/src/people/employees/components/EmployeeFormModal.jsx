import { Modal } from "@/components/Modal";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import ErrorBanner from "@/components/ErrorBanner";
import { Field, TextInput, selectClass } from "@/components/FormField";
import { ActiveSwitch } from "./ActiveSwitch";

export default function EmployeeFormModal({
  closeModal,
  departments,
  errors,
  form,
  formError,
  isNew,
  modal,
  saving,
  set,
  setForm,
  submit,
}) {
  return (
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
  );
}
