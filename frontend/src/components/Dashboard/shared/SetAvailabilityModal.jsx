import React, { useEffect, useMemo, useState } from "react";
import PropTypes from "prop-types";
import { X, Clock, Search } from "lucide-react";
import Swal from "sweetalert2";
import { api, getUser } from "../../../utils/api";
import AvailabilityModal from "../doctor/AvailabilityModal";

const API = import.meta.env.VITE_BACKEND_URL || "http://localhost:8000";

function resolveRole(userRole) {
  const stored = getUser();
  const candidate =
    (userRole && userRole !== "guest" ? userRole : null) ||
    stored?.type ||
    stored?.role ||
    stored?.userType ||
    "receptionist";
  return String(candidate).toLowerCase().trim();
}

function isAdminRole(role) {
  return role === "admin" || role === "super_admin" || role === "superadmin" || role === "super-admin";
}

function getDoctorsEndpoint(role) {
  if (isAdminRole(role)) {
    return "/api/admin/doctors?page=1&limit=200";
  }
  return "/api/receptionist/doctors?page=1&limit=200";
}

function getDoctorDetailEndpoint(role, doctorId) {
  if (isAdminRole(role)) {
    return `/api/admin/doctors/${doctorId}`;
  }
  return `/api/receptionist/doctors/${doctorId}`;
}

function getAvailabilitySaveUrl(role, doctorId) {
  if (isAdminRole(role)) {
    return `${API}/api/admin/doctors/${doctorId}/availability`;
  }
  return `${API}/api/receptionist/doctors/${doctorId}/availability`;
}

function unwrapDoctor(json) {
  return json?.data?.doctor ?? json?.data ?? json?.doctor ?? json;
}

export default function SetAvailabilityModal({ open, onClose, userRole = "receptionist" }) {
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [doctors, setDoctors] = useState([]);
  const [selectedDoctor, setSelectedDoctor] = useState(null);
  const [availabilityOpen, setAvailabilityOpen] = useState(false);

  const role = useMemo(() => resolveRole(userRole), [userRole]);

  useEffect(() => {
    if (!open) return undefined;

    let alive = true;
    (async () => {
      try {
        setLoading(true);
        const res = await api.get(getDoctorsEndpoint(role));
        if (!alive) return;

        const list =
          res?.data?.doctors ??
          res?.data?.data?.doctors ??
          res?.data?.data ??
          res?.data ??
          [];

        setDoctors(Array.isArray(list) ? list : []);
      } catch (err) {
        console.warn("[SetAvailabilityModal] Failed to load doctors:", err);
        setDoctors([]);
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [open, role]);

  useEffect(() => {
    if (!open) {
      setSearch("");
      setSelectedDoctor(null);
      setAvailabilityOpen(false);
    }
  }, [open]);

  const filteredDoctors = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return doctors;
    return doctors.filter((d) => {
      const name = String(d.name || "").toLowerCase();
      const spec = String(d.specialization || "").toLowerCase();
      return name.includes(term) || spec.includes(term);
    });
  }, [doctors, search]);

  const handleSelectDoctor = async (doctor) => {
    try {
      setLoading(true);
      const res = await api.get(getDoctorDetailEndpoint(role, doctor._id));
      const detail = unwrapDoctor(res);
      setSelectedDoctor(detail);
      setAvailabilityOpen(true);
    } catch (err) {
      Swal.fire({
        icon: "error",
        title: "Could not load doctor",
        text: err?.message || "Failed to fetch doctor availability",
      });
    } finally {
      setLoading(false);
    }
  };

  if (!open) return null;

  if (availabilityOpen && selectedDoctor) {
    return (
      <AvailabilityModal
        isOpen
        showVipFields
        onClose={() => {
          setAvailabilityOpen(false);
          setSelectedDoctor(null);
        }}
        doctorId={selectedDoctor._id}
        doctorName={selectedDoctor.name}
        saveUrl={getAvailabilitySaveUrl(role, selectedDoctor._id)}
        currentAvailability={{
          availabilityMode: selectedDoctor.availabilityMode,
          dailyTimeRanges: selectedDoctor.dailyTimeRanges,
          availabilityRange: selectedDoctor.availabilityRange,
          appointmentDuration: selectedDoctor.appointmentDuration,
        }}
        onSuccess={() => {
          setAvailabilityOpen(false);
          setSelectedDoctor(null);
          onClose?.();
        }}
      />
    );
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50">
      <div
        role="dialog"
        aria-modal="true"
        className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <Clock className="w-5 h-5 text-[#134e97]" />
            <h2 className="text-lg font-semibold text-[#134e97]" style={{ fontFamily: "'mirador-medium', 'Outfit', sans-serif" }}>
              Set Availability
            </h2>
          </div>
          <button type="button" onClick={onClose} className="p-1 rounded-full hover:bg-slate-100">
            <X className="w-5 h-5 text-slate-500" />
          </button>
        </div>

        <div className="px-5 py-4 border-b border-slate-100">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search doctor by name or specialization"
              className="w-full pl-9 pr-3 py-2 border rounded-lg border-[#134e97]/30 text-sm"
            />
          </div>
        </div>

        <div className="overflow-y-auto flex-1 px-5 py-3">
          {loading ? (
            <p className="text-sm text-slate-500 py-6 text-center">Loading doctors...</p>
          ) : filteredDoctors.length === 0 ? (
            <p className="text-sm text-slate-500 py-6 text-center">No doctors found.</p>
          ) : (
            <ul className="space-y-2">
              {filteredDoctors.map((d) => (
                <li key={d._id}>
                  <button
                    type="button"
                    onClick={() => handleSelectDoctor(d)}
                    className="w-full text-left px-4 py-3 rounded-xl border border-slate-200 hover:border-[#134e97]/40 hover:bg-[#134e97]/5 transition">
                    <div className="font-medium text-slate-800">Dr. {d.name}</div>
                    {d.specialization && (
                      <div className="text-xs text-slate-500 mt-0.5">{d.specialization}</div>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="px-5 py-4 border-t border-slate-100 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-full bg-slate-100 text-slate-700 text-sm font-medium hover:bg-slate-200">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

SetAvailabilityModal.propTypes = {
  open: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  userRole: PropTypes.string,
};
