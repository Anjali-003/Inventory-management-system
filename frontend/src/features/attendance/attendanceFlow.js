/* ------------------------------------------------------------------ */
/* Flow                                                                */
/*   initial -> checkedIn -> checkedOut (PRESENT) -> halfDay           */
/*   initial -> closed (ABSENT / LEAVE)                                */
/* ------------------------------------------------------------------ */
export const stageOf = (e) => {
  if (e.status === "ABSENT" || e.status === "LEAVE") return "closed"
  if (e.status === "HALF_DAY") return "halfDay"
  if (e.check_out) return "checkedOut"
  if (e.check_in) return "checkedIn"
  return "initial"
}

// Which summary bucket an employee falls into for the day
export const bucketOf = (e) => e.status || (e.check_in ? "CHECKED_IN" : "NONE")

export const DONE = {
  "check-in": (n) => `${n} checked in`,
  "check-out": (n) => `${n} checked out`,
  "half-day": (n) => `${n} marked as half day`,
  ABSENT: (n) => `${n} marked absent`,
  LEAVE: (n) => `${n} marked on leave`,
}

export const CONFIRMS = {
  "half-day": {
    title: "Mark as half day?",
    label: "Mark half day",
    tone: "default",
    body: (n, d) => `${n} is marked present for ${d}. Changing it to half day is final and can't be undone.`,
  },
  ABSENT: {
    title: "Mark as absent?",
    label: "Mark absent",
    tone: "danger",
    body: (n, d) => `${n} will be recorded as absent for ${d}. Attendance can't be changed once it's saved.`,
  },
  LEAVE: {
    title: "Mark as on leave?",
    label: "Mark leave",
    tone: "default",
    body: (n, d) => `${n} will be recorded as on leave for ${d}. Attendance can't be changed once it's saved.`,
  },
}

export const CELLS = [
  { key: "PRESENT", label: "Present", tone: "success" },
  { key: "HALF_DAY", label: "Half day", tone: "warning" },
  { key: "ABSENT", label: "Absent", tone: "danger" },
  { key: "LEAVE", label: "On leave", tone: "info" },
  { key: "CHECKED_IN", label: "Checked in", tone: "info" },
  { key: "NONE", label: "Not marked", tone: "neutral" },
]
