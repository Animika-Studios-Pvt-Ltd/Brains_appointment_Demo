/** Canonical stored/display status (replaces legacy "No Show") */
export const APPOINTMENT_STATUS_MISSED = "Missed";

export function isMissedAppointmentStatus(status) {
  const s = String(status || "")
    .toLowerCase()
    .trim()
    .replace(/_/g, " ");
  const compact = s.replace(/\s+/g, "");
  return (
    compact === "noshow" ||
    s === "no show" ||
    s === "no-show" ||
    s === "missed" ||
    s === "expired"
  );
}

/** User-facing label for appointment status */
export function formatAppointmentStatusLabel(status) {
  if (isMissedAppointmentStatus(status)) return APPOINTMENT_STATUS_MISSED;
  const raw = String(status || "").trim();
  if (!raw) return "—";
  return raw;
}

export const getStatusColor = (status) => {
  const s = String(status || "").toLowerCase();

  if (s === "scheduled") return "bg-blue-100 text-blue-700";
  if (s === "in progress") return "bg-yellow-100 text-yellow-700";
  if (s === "completed") return "bg-emerald-100 text-emerald-700";
  if (s === "cancelled") return "bg-red-100 text-red-700";
  if (s === "rescheduled") return "bg-amber-100 text-amber-800";
  if (s === "reassigned") return "bg-purple-100 text-purple-700";
  if (isMissedAppointmentStatus(status)) return "bg-orange-100 text-orange-700";

  return "bg-gray-100 text-gray-700";
};

/** Hex colors for charts (Recharts, etc.) — one distinct color per appointment status */
const APPOINTMENT_STATUS_CHART_COLORS = {
  scheduled: "#2563eb",
  pending: "#64748b",
  "in progress": "#ca8a04",
  in_progress: "#ca8a04",
  completed: "#16a34a",
  cancelled: "#dc2626",
  canceled: "#dc2626",
  rescheduled: "#f59e0b",
  reassigned: "#9333ea",
  "no show": "#ea580c",
  "no-show": "#ea580c",
  noshow: "#ea580c",
  missed: "#ea580c",
  expired: "#ea580c",
};

export function getAppointmentStatusChartColor(status) {
  if (isMissedAppointmentStatus(status)) {
    return APPOINTMENT_STATUS_CHART_COLORS.missed;
  }
  const s = String(status || "")
    .toLowerCase()
    .trim()
    .replace(/_/g, " ");
  return APPOINTMENT_STATUS_CHART_COLORS[s] || "#64748b";
}

/** Distinct categorical palette for non-status charts (e.g. specialties) */
export const CHART_CATEGORY_COLORS = [
  "#2563eb",
  "#16a34a",
  "#dc2626",
  "#9333ea",
  "#f59e0b",
  "#06b6d4",
  "#ec4899",
  "#84cc16",
  "#134e97",
  "#7c3aed",
];


export const specializations = [
  "Neurologist",
  "General Physician",
  "Clinical Psychologist",
];
