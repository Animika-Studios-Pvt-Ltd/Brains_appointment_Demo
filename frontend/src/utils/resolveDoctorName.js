const BACKEND = import.meta.env.VITE_BACKEND_URL || "http://localhost:8000";

function nameFromDoctorRef(ref) {
  if (!ref) return null;
  if (typeof ref === "object") {
    return ref.name || ref.fullName || null;
  }
  return null;
}

/** Resolve display name from an appointment payload (raw API shape). */
export function resolveDoctorName(appointment) {
  if (!appointment) return null;

  const a = appointment;
  const lastReassign = Array.isArray(a.reassignHistory)
    ? a.reassignHistory[a.reassignHistory.length - 1]
    : null;

  return (
    a.assignedDoctorName ||
    a.newDoctorName ||
    (a.reassignedTo && a.reassignedTo.name) ||
    a.doctorName ||
    nameFromDoctorRef(a.doctorId) ||
    nameFromDoctorRef(a.doctor) ||
    nameFromDoctorRef(a.previousDoctorId) ||
    nameFromDoctorRef(lastReassign?.toDoctor) ||
    null
  );
}

/** Fill missing doctor names using the public doctors list when populate did not return a name. */
export async function enrichAppointmentsWithDoctorNames(apptsRaw, token) {
  if (!Array.isArray(apptsRaw) || apptsRaw.length === 0) return apptsRaw;

  const missingIds = new Set();
  for (const a of apptsRaw) {
    if (resolveDoctorName(a)) continue;
    const id = a.doctorId?._id || a.doctorId || a.previousDoctorId?._id || a.previousDoctorId;
    if (id) missingIds.add(String(id));
  }
  if (missingIds.size === 0) return apptsRaw;

  try {
    const res = await fetch(`${BACKEND}/api/patient/doctors?limit=200`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) return apptsRaw;
    const json = await res.json();
    const doctors = json?.data?.doctors ?? json?.doctors ?? json?.data ?? [];
    const nameById = new Map(
      (Array.isArray(doctors) ? doctors : [])
        .filter((d) => d?._id && d?.name)
        .map((d) => [String(d._id), d.name])
    );

    return apptsRaw.map((a) => {
      if (resolveDoctorName(a)) return a;
      const id = String(a.doctorId?._id || a.doctorId || "");
      const name = nameById.get(id);
      if (!name) return a;
      const doctorId =
        a.doctorId && typeof a.doctorId === "object"
          ? { ...a.doctorId, name }
          : { _id: a.doctorId || id, name };
      return { ...a, doctorId };
    });
  } catch {
    return apptsRaw;
  }
}

export function formatDoctorLabel(name) {
  const trimmed = String(name || "").trim();
  if (!trimmed || trimmed === "?") return "Doctor unavailable";
  return trimmed.startsWith("Dr.") ? trimmed : `Dr. ${trimmed}`;
}
