import { Modal } from "@/components/Modal";
import { Button } from "@/components/ui/button";
import Avatar from "@/components/Avatar";
import { Badge } from "@/components/ui/badge";
import { DetailSection, DetailRow } from "./DetailSection";
import { shortDate } from "@/lib/format";

export default function EmployeeDetailModal({
  selectedEmployee,
  setSelectedEmployee,
}) {
  return (
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
  );
}
