export const EMPTY = {
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

export function validate(f) {
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

export const toPayload = (e, patch = {}) => ({
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
