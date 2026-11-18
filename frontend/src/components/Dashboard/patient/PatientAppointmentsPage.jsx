import Footer from "@/components/HomePage/Footer";
import Header from "@/components/HomePage/Header";
import React, { useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import PageBackButton from "@/components/common/PageBackButton";
import { BRAND_PAGE_BG_CLASS } from "@/config/doctorPublicPageLayout";
import { getImageUrl } from "@/utils/imageUrl";
import Swal from "sweetalert2";
import {
  BadgeCheck,
  Calendar,
  CalendarDays,
  CheckCircle2,
  Clock,
  FileText,
  Hourglass,
  Stethoscope,
  Trash2,
} from "lucide-react";
import {
  enrichAppointmentsWithDoctorNames,
  formatDoctorLabel,
  resolveDoctorName,
} from "@/utils/resolveDoctorName";
import "./PatientAppointmentsPage.css";
import {
  formatAppointmentStatusLabel,
  isMissedAppointmentStatus,
} from "@/lib/constant";

const BACKEND = import.meta.env.VITE_BACKEND_URL || "http://localhost:8000";

async function safeJson(res) {
  const txt = await res.text();
  try {
    return JSON.parse(txt);
  } catch {
    throw new Error(txt || `HTTP ${res.status}`);
  }
}

function formatSlotTime12h(isoOrDate) {
  if (!isoOrDate) return "";
  const d = new Date(isoOrDate);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

function hasRealDoctorPhoto(path) {
  if (!path || typeof path !== "string") return false;
  const p = path.trim();
  return p && !p.includes("ui-avatars.com") && !p.includes("avatar-placeholder");
}

function doctorInitials(name) {
  return (
    (name || "DR")
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .map((w) => w[0])
      .join("")
      .toUpperCase()
      .slice(0, 2) || "DR"
  );
}

function resolveDoctorProfileImage(appt) {
  const o = appt?.__orig || appt?.original || appt;
  return (
    o?.doctorId?.profileImage ||
    o?.doctor?.profileImage ||
    o?.assignedDoctorProfileImage ||
    o?.newDoctorProfileImage ||
    null
  );
}

function resolveDoctorId(appt) {
  const o = appt?.__orig || appt;
  return o?.doctorId?._id || o?.doctorId || o?.doctor?._id || null;
}

function formatStatusLabel(status) {
  const label = formatAppointmentStatusLabel(status);
  return label === "—" ? "Unknown" : label;
}

function StatusBadge({ status }) {
  const s = String(status || "").toLowerCase();
  if (isMissedAppointmentStatus(status)) {
    return (
      <span className="patient-appt-row__status patient-appt-row__status--default">
        Missed
      </span>
    );
  }
  if (s.includes("resched")) {
    return (
      <span className="patient-appt-row__status patient-appt-row__status--rescheduled">
        <Hourglass className="h-3.5 w-3.5" aria-hidden />
        Rescheduled
      </span>
    );
  }
  if (s.includes("sched") || s.includes("confirm") || s.includes("book")) {
    return (
      <span className="patient-appt-row__status patient-appt-row__status--scheduled">
        <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
        Scheduled
      </span>
    );
  }
  return (
    <span className="patient-appt-row__status patient-appt-row__status--default">
      {formatStatusLabel(status)}
    </span>
  );
}

/* Helper: show reschedule limit Swal */
function showRescheduleLimitSwal(currentCount, limit) {
  return Swal.fire({
    icon: "info",
    title: "Reschedule Limit Reached",
    html: `You have reached the maximum allowed (${limit}) reschedules.
    Please contact the support team / receptionist for further changes.
    <div style="margin-top:10px; font-size:0.9em; color:#374151;">
        Call: <strong>+91 9148080000</strong><br/>
        Email: <strong>callcenter@brains.org.in</strong>
      </div>`,
    showCloseButton: true,
    showCancelButton: false,
    confirmButtonText: "OK",
    width: 520,
  });
}

// ✅ Safe read of logged-in user role from localStorage
const _storedUser = (() => {
  try {
    const raw = localStorage.getItem("user");
    if (!raw || raw === "null" || raw === "undefined") {
      return { type: "patient", role: "patient", userType: "patient" };
    }
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') {
      return { type: "patient", role: "patient", userType: "patient" };
    }
    return parsed;
  } catch (e) {
    console.warn("Failed to parse user from localStorage:", e);
    return { type: "patient", role: "patient", userType: "patient" };
  }
})();

const CURRENT_USER_ROLE = (
  _storedUser?.type ||
  _storedUser?.role ||
  _storedUser?.userType ||
  "patient"
)
  .toString()
  .toLowerCase();

function AppointmentListRow({
  appointment: a,
  isRecentPage,
  onReschedule,
  onCancel,
  showRescheduleLimitSwal,
  userRole,
}) {
  const isRescheduled =
    String(a.status || "").toLowerCase().includes("resched") ||
    Number(a.__orig?.rescheduleCount || 0) > 0;
  const showPhoto = hasRealDoctorPhoto(a.doctorProfileImage);
  const initials = doctorInitials(a.doctorName);
  const imgSrc = getImageUrl(a.doctorProfileImage, a.doctorName);

  const s = String(a.status || "").toLowerCase();
  const canManage =
    !isRecentPage &&
    ["scheduled", "in progress", "rescheduled", "reassigned"].includes(s);

  const currentRescheduleCount = Number(a.__orig?.rescheduleCount || 0);
  const rescheduleLimit = 3;
  const isPatient = userRole === "patient";
  const rescheduleExhausted =
    isPatient && currentRescheduleCount >= rescheduleLimit;

  const stored = (() => {
    try {
      return JSON.parse(localStorage.getItem("user") || "{}");
    } catch {
      return {};
    }
  })();
  const cancelLimit = 3;
  const currentCancelCount = Number(stored?.cancelCount ?? 0);
  const cancelExceeded = isPatient && currentCancelCount >= cancelLimit;

  return (
    <li className="patient-appt-row">
      <div className="patient-appt-row__avatar-wrap">
        {showPhoto ? (
          <img
            src={imgSrc}
            alt=""
            className="patient-appt-row__avatar"
          />
        ) : (
          <span className="patient-appt-row__avatar-fallback" aria-hidden>
            {initials}
          </span>
        )}
      </div>

      <div className="patient-appt-row__body">
        <div className="patient-appt-row__name-row">
          <span className="patient-appt-row__name">
            {formatDoctorLabel(a.doctorName)}
          </span>
          <BadgeCheck
            className="patient-appt-row__verified h-4 w-4"
            aria-label="Verified"
          />
        </div>

        {a.doctorSpecialization && (
          <span className="patient-appt-row__specialty">
            <Stethoscope className="h-3 w-3" aria-hidden />
            {a.doctorSpecialization}
          </span>
        )}

        <div className="patient-appt-row__meta-line">
          <span className="patient-appt-row__meta-item">
            <Calendar className="patient-appt-row__meta-icon h-3.5 w-3.5" />
            {a.dateDisplay}
          </span>
          {a.time && (
            <span className="patient-appt-row__meta-item">
              <Clock className="patient-appt-row__meta-icon h-3.5 w-3.5" />
              {a.time}
            </span>
          )}
        </div>

        {a.symptoms && (
          <p className="patient-appt-row__symptoms">
            <FileText className="patient-appt-row__meta-icon h-3.5 w-3.5 shrink-0 mt-0.5" />
            <span>{a.symptoms}</span>
          </p>
        )}

        {!isRecentPage && isRescheduled && (
          <p className="patient-appt-row__rescheduled-note">
            This appointment was rescheduled
          </p>
        )}

        {canManage && (
          <div className="patient-appt-row__actions">
            <button
              type="button"
              onClick={() => {
                if (rescheduleExhausted) {
                  showRescheduleLimitSwal(
                    currentRescheduleCount,
                    rescheduleLimit
                  );
                  return;
                }
                onReschedule(a);
              }}
              className={`patient-appt-row__btn patient-appt-row__btn--reschedule ${rescheduleExhausted ? "is-muted" : ""
                }`}>
              <CalendarDays className="h-3.5 w-3.5" aria-hidden />
              Reschedule
            </button>
            <button
              type="button"
              onClick={() => {
                if (cancelExceeded) {
                  Swal.fire({
                    icon: "info",
                    title: "Cancellation Limit Reached",
                    html: `
                      You have reached the maximum allowed (${cancelLimit}) cancellations.
                      Please contact the support team/receptionist for further assistance.
                      <div style="margin-top:10px; font-size:0.9em; color:#374151;">
                        Call: <strong>+91 9148080000</strong><br/>
                        Email: <strong>callcenter@brains.org.in</strong>
                      </div>
                    `,
                    showCloseButton: true,
                    confirmButtonText: "OK",
                    width: 520,
                  });
                  return;
                }
                onCancel(a._id);
              }}
              className="patient-appt-row__btn patient-appt-row__btn--cancel">
              <Trash2 className="h-3.5 w-3.5" aria-hidden />
              Cancel
            </button>
          </div>
        )}
      </div>

      <StatusBadge status={a.status} />
    </li>
  );
}

export default function PatientAppointmentsPage() {
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) {
      navigate("/login");
      return;
    }

    (async () => {
      try {
        setLoading(true);
        const endpoints = [
          `${BACKEND}/api/patient/appointments`,
          `${BACKEND}/api/appointment/patient`,
          `${BACKEND}/api/appointments?scope=patient`,
        ];
        let result = [];
        for (const url of endpoints) {
          try {
            const res = await fetch(url, {
              headers: { Authorization: `Bearer ${token}` },
            });
            if (!res.ok) continue;
            const json = await safeJson(res);
            result =
              json?.data?.appointments ??
              json?.data ??
              json?.appointments ??
              (Array.isArray(json) ? json : []);
            break;
          } catch { }
        }

        result = await enrichAppointmentsWithDoctorNames(result, token);

        const mapped = (result || []).map((a) => {
          const dateRaw =
            a.date || a.appointmentDate || a.startsAt || a.start || null;
          const slotStart =
            a.slotStartIso || a.startTime || a.slot?.start || null;
          const slotEnd = a.slotEndIso || a.endTime || a.slot?.end || null;
          const time =
            a.time ||
            (slotStart && slotEnd
              ? `${new Date(slotStart).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })} - ${new Date(slotEnd).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })}`
              : "");

          const rawDateObj = slotStart
            ? new Date(slotStart)
            : dateRaw
              ? new Date(dateRaw)
              : null;

          // <-- Add these defensive lookups here
          const doctorName = resolveDoctorName(a);

          const doctorSpecialization =
            a.assignedDoctorSpecialization ||
            a.newDoctorSpecialization ||
            a.doctor?.specialization ||
            a.doctorId?.specialization ||
            "General Physician";

          const timeRange =
            slotStart && slotEnd
              ? `${formatSlotTime12h(slotStart)} – ${formatSlotTime12h(slotEnd)}`
              : time;

          return {
            _id: a._id || a.id,
            doctorName: doctorName,
            doctorSpecialization: doctorSpecialization,
            doctorProfileImage: resolveDoctorProfileImage(a),
            symptoms: (a.symptoms || a.reason || "").trim(),
            dateDisplay: rawDateObj
              ? rawDateObj.toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
                year: "numeric",
              })
              : "—",
            rawDate: rawDateObj,
            slotStartIso: slotStart ? new Date(slotStart).toISOString() : null,
            time: timeRange,
            status: a.status || "unknown",
            __orig: a,
          };
        });

        setAppointments(mapped);
        setLoading(false);
      } catch (e) {
        setError(e?.message || "Failed to load appointments");
        setLoading(false);
      }
    })();
  }, [navigate]);

  const query = new URLSearchParams(location.search || "");
  const isRecentPage =
    query.get("filter") === "recent" || query.get("filter") === "all";
  const activeStatuses = new Set([
    "scheduled",
    "in progress",
    "rescheduled",
    "reassigned",
  ]);
  let filteredAppointments = appointments.slice();

  if (isRecentPage) {
    const recentStatuses = new Set([
      "completed",
      "cancelled",
      "no show",
      "noshow",
      "missed",
      "expired",
    ]);
    filteredAppointments = filteredAppointments
      .filter((a) => recentStatuses.has(String(a.status || "").toLowerCase()))
      .sort((a, b) => {
        const da = a.rawDate ? a.rawDate.getTime() : 0;
        const db = b.rawDate ? b.rawDate.getTime() : 0;
        return db - da; // most recent first
      });
  } else {
    const now = new Date();
    const startOfToday = new Date(now);
    startOfToday.setHours(0, 0, 0, 0);

    filteredAppointments = filteredAppointments
      .filter((a) => {
        const statusOk = activeStatuses.has(
          String(a.status || "").toLowerCase()
        );
        if (!statusOk) return false;
        if (!a.rawDate) return true;
        return a.rawDate.getTime() >= startOfToday.getTime();
      })
      .sort((a, b) => {
        const da = a.slotStartIso
          ? new Date(a.slotStartIso).getTime()
          : a.rawDate
            ? a.rawDate.getTime()
            : Infinity;
        const db = b.slotStartIso
          ? new Date(b.slotStartIso).getTime()
          : b.rawDate
            ? b.rawDate.getTime()
            : Infinity;
        return da - db;
      });
  }

  async function handleCancel(apptId) {
    const stored = (() => {
      try {
        return JSON.parse(localStorage.getItem("user") || "{}");
      } catch {
        return {};
      }
    })();
    const cancelLimit = 3;
    const isPatient = CURRENT_USER_ROLE === "patient";
    const currentCancelCount = Number(stored?.cancelCount ?? 0);

    if (isPatient && currentCancelCount >= cancelLimit) {
      await Swal.fire({
        icon: "info",
        title: "Cancellation Limit Reached",
        html: `
        You have reached the maximum allowed (${cancelLimit}) cancellations.
        Please contact the support team / receptionist for further assistance.
        <div style="margin-top:10px; font-size:0.9em; color:#374151;">
          Call: <strong>+91 9148080000</strong><br/>
          Email: <strong>callcenter@brains.org.in</strong>
        </div>
      `,
        showCloseButton: true,
        showCancelButton: false,
        confirmButtonText: "OK",
        width: 520,
        customClass: { popup: "rounded-xl shadow-lg" },
      });
      return;
    }

    // fixed cancel reasons (key -> label)
    const cancelReasons = {
      feeling_better: "Feeling better",
      schedule_conflict: "Scheduling conflict",
      unable_to_visit: "Unable to visit clinic today",
      found_alternative: "Found another time/doctor",
      cost_issue: "Cost / fee concerns",
      others: "Others",
    };

    // NICE-LOOKING REASON PICKER (radio cards with border)
    const { value: reasonKey, isDismissed } = await Swal.fire({
      title: "Why are you cancelling?",
      html: `
    <style>
      .reason-pill-group {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
        margin-top: 0.5rem;
      }
      .reason-option input[type="radio"] {
        display: none;
      }
      .reason-option label {
        display: flex;
        align-items: flex-start;
        gap: 0.5rem;
        padding: 0.55rem 0.9rem;
        border-radius: 9999px;
        border: 1px solid #e5e7eb;
        background: #ffffff;
        cursor: pointer;
        font-size: 0.875rem;
        transition: all 0.15s ease;
      }
      .reason-option label:hover {
        border-color: #2563eb;
        background: #eff6ff;
      }
      .reason-option input[type="radio"]:checked + label {
        border-color: #2563eb;
        background: #2563eb;
        color: #ffffff;
        box-shadow: 0 0 0 2px rgba(37, 99, 235, 0.25);
      }
      .reason-dot {
        width: 10px;
        height: 10px;
        border-radius: 9999px;
        border: 2px solid currentColor;
        margin-top: 4px;
      }
      .reason-option-title {
        font-weight: 600;
      }

      /* 🔵 ROUND SWEETALERT BUTTONS */
      .swal2-confirm,
      .swal2-cancel {
        border-radius: 9999px !important;
        padding: 10px 22px !important;
        font-size: 0.9rem !important;
        font-weight: 600 !important;
      }
      .swal2-confirm {
        background-color: #2563eb !important;
        color: white !important;
        border: none !important;
      }
      .swal2-confirm:hover {
        background-color: #1e4fcf !important;
      }
      .swal2-cancel {
        background-color: #f3f4f6 !important;
        color: #374151 !important;
        border: 1px solid #d1d5db !important;
      }
      .swal2-cancel:hover {
        background-color: #e5e7eb !important;
      }
    </style>

    <div class="text-left">
      <p class="text-gray-600 text-sm mb-2">
        Please select a reason for cancelling your appointment.
      </p>

      <div class="reason-pill-group">

        <div class="reason-option">
          <input type="radio" id="reason_feeling_better" name="cancel_reason" value="feeling_better" />
          <label for="reason_feeling_better">
            <span class="reason-dot"></span>
            <div><div class="reason-option-title">Feeling better</div></div>
          </label>
        </div>

        <div class="reason-option">
          <input type="radio" id="reason_schedule_conflict" name="cancel_reason" value="schedule_conflict" />
          <label for="reason_schedule_conflict">
            <span class="reason-dot"></span>
            <div><div class="reason-option-title">Scheduling conflict</div></div>
          </label>
        </div>

        <div class="reason-option">
          <input type="radio" id="reason_unable_to_visit" name="cancel_reason" value="unable_to_visit" />
          <label for="reason_unable_to_visit">
            <span class="reason-dot"></span>
            <div><div class="reason-option-title">Unable to visit today</div></div>
          </label>
        </div>

        <div class="reason-option">
          <input type="radio" id="reason_found_alternative" name="cancel_reason" value="found_alternative" />
          <label for="reason_found_alternative">
            <span class="reason-dot"></span>
            <div><div class="reason-option-title">Found another time/doctor</div></div>
          </label>
        </div>

        <div class="reason-option">
          <input type="radio" id="reason_cost_issue" name="cancel_reason" value="cost_issue" />
          <label for="reason_cost_issue">
            <span class="reason-dot"></span>
            <div><div class="reason-option-title">Cost / fee concerns</div></div>
          </label>
        </div>

        <div class="reason-option">
          <input type="radio" id="reason_others" name="cancel_reason" value="others" />
          <label for="reason_others">
            <span class="reason-dot"></span>
            <div><div class="reason-option-title">Others</div></div>
          </label>
        </div>

      </div>
    </div>
  `,
      showCancelButton: true,
      confirmButtonText: "Continue",
      cancelButtonText: "Cancel",
      focusConfirm: false,
      width: 520,
      customClass: {
        popup: "rounded-2xl shadow-xl",
      },

      preConfirm: () => {
        const selected = document.querySelector(
          'input[name="cancel_reason"]:checked'
        );
        if (!selected) {
          Swal.showValidationMessage("Please select a reason to continue.");
          return false;
        }
        return selected.value;
      },
    });

    if (isDismissed || !reasonKey) return;
    const reason = cancelReasons[reasonKey] || reasonKey;

    const confirm = await Swal.fire({
      title: "Confirm cancellation",
      text: "Are you sure you want to cancel this appointment?",
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Yes, cancel it",
      cancelButtonText: "No, keep it",
      width: 480,

      html: `
    <style>
      /* Rounded SweetAlert Buttons */
      .swal2-confirm,
      .swal2-cancel {
        border-radius: 9999px !important;
        padding: 10px 22px !important;
        font-size: 0.9rem !important;
        font-weight: 600 !important;
      }

      .swal2-confirm {
        background-color: #dc2626 !important; /* red for delete */
        color: white !important;
        border: none !important;
      }
      .swal2-confirm:hover {
        background-color: #b91c1c !important;
      }

      .swal2-cancel {
        background-color: #f3f4f6 !important;
        color: #374151 !important;
        border: 1px solid #d1d5db !important;
      }
      .swal2-cancel:hover {
        background-color: #e5e7eb !important;
      }
    </style>
  `,

      customClass: {
        popup: "rounded-xl shadow-lg",
      },
    });


    if (!confirm.isConfirmed) return;

    const token = localStorage.getItem("token");
    try {
      const res = await fetch(`${BACKEND}/api/appointment/cancel/${apptId}`, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ reason }),
      });
      const json = await safeJson(res);

      if (!res.ok) {
        throw new Error(json?.message || "Cancel failed");
      }

      // remove cancelled appt from appointments state
      setAppointments((prev) => prev.filter((p) => p._id !== apptId));

      // update localStorage user cancelCount if backend returned it
      const patientCancelCount =
        json?.data?.patientCancelCount ??
        json?.data?.appointment?.patientId?.cancelCount ??
        null;
      if (patientCancelCount !== null) {
        try {
          const storedUser = JSON.parse(localStorage.getItem("user") || "{}");
          storedUser.cancelCount = Number(patientCancelCount);
          localStorage.setItem("user", JSON.stringify(storedUser));
        } catch (e) {
          /* ignore */
        }
      }

      await Swal.fire({
        icon: "success",
        title: "Cancelled",
        text: "Appointment cancelled successfully.",
        timer: 1600,
        showConfirmButton: false,
        customClass: { popup: "rounded-xl shadow-lg" },
      });
    } catch (e) {
      await Swal.fire({
        icon: "error",
        title: "Unable to cancel",
        text: e?.message || "Cancel failed",
        width: 520,
        customClass: { popup: "rounded-xl shadow-lg" },
      });
    }
  }

  function handleReschedule(a) {
    const doctorId = resolveDoctorId(a);
    if (!doctorId) {
      alert("Doctor information not available for reschedule.");
      return;
    }
    navigate(`/doctor/${doctorId}`, {
      state: { rescheduleAppointment: a.__orig || a },
    });
  }

  const pageTitle = isRecentPage ? "Recent Appointments" : "Upcoming Appointments";

  return (
    <div className={`min-h-screen flex flex-col ${BRAND_PAGE_BG_CLASS}`}>
      <Header />
      <main className="flex-1 w-full px-3 sm:px-4 md:px-6 lg:px-8 py-4 sm:py-5 md:py-6 lg:py-8">
        <div className="patient-appts-page__shell">
          <PageBackButton className="mb-4 sm:mb-5" onClick={() => navigate(-1)} />

          <div className="patient-appts-page__title-card">
            <div className="patient-appts-page__title-row">
              <Calendar className="h-6 w-6 sm:h-7 sm:w-7 text-[#134e97]" strokeWidth={2} />
              <h1 className="patient-appts-page__title">{pageTitle}</h1>
            </div>
          </div>

          <div className="patient-appts-page__list-card">
            {loading ? (
              <div className="py-12 text-center text-slate-600">
                Loading appointments…
              </div>
            ) : error ? (
              <div className="py-12 text-center text-rose-600">{error}</div>
            ) : filteredAppointments.length === 0 ? (
              <div className="py-12 text-center text-slate-600">
                No{" "}
                {isRecentPage
                  ? "recent appointments"
                  : "upcoming active appointments"}{" "}
                found.
              </div>
            ) : (
              <ul className="patient-appts-page__list">
                {filteredAppointments.map((a) => (
                  <AppointmentListRow
                    key={a._id}
                    appointment={a}
                    isRecentPage={isRecentPage}
                    onReschedule={handleReschedule}
                    onCancel={handleCancel}
                    showRescheduleLimitSwal={showRescheduleLimitSwal}
                    userRole={CURRENT_USER_ROLE}
                  />
                ))}
              </ul>
            )}
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
