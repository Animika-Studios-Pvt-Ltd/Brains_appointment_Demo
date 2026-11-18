// frontend/src/components/Dashboard/receptionist/ReceptionistDashboardHeader.jsx
import React, { useEffect, useState, useMemo } from "react";
import { Bell, Power } from "lucide-react";
import Swal from "sweetalert2";
import { performLogout } from "../../../utils/api";
import ReceptionistActivityPanel from "./ReceptionistActivityPanel";

function formatWithOrdinal(date) {
  if (!date || !(date instanceof Date)) return "";
  const day = date.getDate();
  const suffix =
    day % 10 === 1 && day !== 11
      ? "st"
      : day % 10 === 2 && day !== 12
        ? "nd"
        : day % 10 === 3 && day !== 13
          ? "rd"
          : "th";
  const month = date.toLocaleString("en-GB", { month: "short" });
  return `${day}${suffix} ${month}, ${date.getFullYear()}`;
}

function formatTime(date) {
  if (!date || !(date instanceof Date)) return "";
  return date.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });
}

function ClockDisplay({ now, size = "desktop" }) {
  const isMobile = size === "mobile";
  return (
    <div
      className="flex flex-col items-center text-center"
      role="status"
      aria-live="polite"
      style={{ fontFamily: "'roboto-regular', 'Roboto', sans-serif" }}>
      <p
        className={`font-bold text-white tracking-wide tabular-nums ${
          isMobile
            ? "text-base leading-normal"
            : "text-lg md:text-xl lg:text-2xl leading-normal"
        }`}>
        {formatTime(now)}
      </p>
      <p
        className={`text-blue-100 ${
          isMobile
            ? "text-xs mt-2 leading-normal"
            : "text-xs md:text-sm mt-2 leading-normal"
        }`}>
        {formatWithOrdinal(now)}
      </p>
    </div>
  );
}

export default function ReceptionistDashboardHeader({
  receptionistFromStorage: propReceptionist,
  onLogout,
}) {
  const [now, setNow] = useState(new Date());
  const [activityOpen, setActivityOpen] = useState(false);
  const [onlineLive, setOnlineLive] = useState(true);
  const [updatingLive, setUpdatingLive] = useState(false);

  const receptionistFromStorage = useMemo(() => {
    if (propReceptionist) return propReceptionist;
    try {
      const raw = localStorage.getItem("user");
      if (!raw) return null;
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }, [propReceptionist]);

  const roleKey = useMemo(() => {
    return (
      receptionistFromStorage?.type ||
      receptionistFromStorage?.userType ||
      receptionistFromStorage?.role ||
      "receptionist"
    );
  }, [receptionistFromStorage]);

  const dashboardTitle = useMemo(() => {
    return roleKey === "call_center"
      ? "Call Center Dashboard"
      : "Receptionist Dashboard";
  }, [roleKey]);

  const activityRoleLabel = useMemo(() => {
    return roleKey === "call_center" ? "Call Center" : "Receptionist";
  }, [roleKey]);

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    async function fetchOnlineStatus() {
      try {
        const token = localStorage.getItem("token");
        const headers = {};
        if (token) headers["Authorization"] = `Bearer ${token}`;
        
        const res = await fetch(`${import.meta.env.VITE_BACKEND_URL || "http://localhost:8000"}/api/system-settings/online-booking`, {
          headers
        });
        const json = await res.json();
        if (json.status === "success") {
          setOnlineLive(json.onlineBookingLive);
        }
      } catch (err) {
        console.error("Failed to load online booking status:", err);
      }
    }
    fetchOnlineStatus();
  }, []);

  const handleToggleOnlineLive = async () => {
    if (updatingLive) return;

    const targetState = !onlineLive;
    const result = await Swal.fire({
      icon: "question",
      title: targetState ? "Enable Online Booking?" : "Disable Online Booking?",
      text: targetState
        ? "Note: Mobile app has offline mode enabled for testing. Do you want to enable global online booking?"
        : "Are you sure you want to disable global online booking?",
      showCancelButton: true,
      confirmButtonText: targetState ? "Yes, Enable" : "Yes, Disable",
      cancelButtonText: "Cancel",
      customClass: {
        confirmButton: "swal-round-btn",
        cancelButton: "swal-round-btn swal2-cancel",
      },
      buttonsStyling: false,
    });

    if (!result.isConfirmed) return;

    setUpdatingLive(true);
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`${import.meta.env.VITE_BACKEND_URL || "http://localhost:8000"}/api/system-settings/online-booking`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({ onlineBookingLive: targetState })
      });
      const json = await res.json();
      if (json.status === "success") {
        setOnlineLive(json.onlineBookingLive);
        Swal.fire({
          icon: "success",
          title: "Status Updated",
          text: `Online booking is now ${json.onlineBookingLive ? "enabled (Live)" : "disabled (Off)"}.`,
          confirmButtonText: "OK",
          customClass: {
            confirmButton: "swal-round-btn",
          },
          buttonsStyling: false,
        });
      }
    } catch (err) {
      console.error("Failed to toggle online booking status:", err);
      Swal.fire({
        icon: "error",
        title: "Error",
        text: "Failed to update online booking status.",
        confirmButtonText: "OK",
        customClass: {
          confirmButton: "swal-round-btn",
        },
        buttonsStyling: false,
      });
    } finally {
      setUpdatingLive(false);
    }
  };

  const emailOrFallback =
    receptionistFromStorage?.email ||
    receptionistFromStorage?.userName ||
    receptionistFromStorage?.name ||
    "receptionist@example.com";

  const handleLogout = onLogout || (() => performLogout());

  return (
    <>
      <header className="w-full bg-gradient-to-r from-[#134e97] via-[#0b5c9b] to-[#06adc6] shadow-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Mobile layout */}
          <div className="sm:hidden py-3">
            <div className="flex flex-col items-center text-center">
              <div
                className="text-white font-bold text-lg leading-tight"
                style={{ fontFamily: "'mirador-medium', 'Outfit', sans-serif" }}>
                {dashboardTitle}
              </div>
              <div className="text-blue-100 text-sm truncate max-w-[90%] opacity-95 mt-0.5">
                {emailOrFallback}
              </div>
            </div>

            <div className="mt-4 relative flex items-center justify-center min-h-[52px]">
              <ClockDisplay now={now} size="mobile" />
              <div className="absolute right-0 top-1/2 -translate-y-1/2 flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setActivityOpen(true)}
                  aria-label="Open activity"
                  className="relative flex items-center justify-center bg-white/10 text-white rounded-full p-2 hover:bg-white/20 transition">
                  <Bell className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={handleLogout}
                  aria-label="Logout"
                  className="flex items-center justify-center bg-white/10 text-white rounded-full p-2 hover:bg-white/20 transition">
                  <Power className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>

          {/* Desktop layout — grid avoids transform clipping on clock */}
          <div className="hidden sm:grid sm:grid-cols-3 sm:items-center py-3 sm:py-4">
            <div className="flex flex-col items-start min-w-0">
              <div
                className="text-white font-bold text-base md:text-lg lg:text-2xl leading-tight"
                style={{ fontFamily: "'mirador-medium', 'Outfit', sans-serif" }}>
                {dashboardTitle}
              </div>
              <div className="text-blue-100 mt-1 text-xs md:text-sm truncate max-w-[36ch]">
                {emailOrFallback}
              </div>
            </div>

            <div className="flex justify-center">
              <ClockDisplay now={now} size="desktop" />
            </div>

            <div className="flex justify-end items-center gap-2">
              <button
                type="button"
                onClick={() => setActivityOpen(true)}
                aria-label="Open activity"
                className="inline-flex items-center justify-center bg-white/10 text-white border border-white/20 hover:bg-white/20 p-2.5 rounded-full transition"
                title="Activity">
                <Bell className="w-4 h-4 md:w-5 md:h-5" />
              </button>
              <button
                type="button"
                onClick={handleLogout}
                className="inline-flex items-center gap-2 bg-white/10 text-white border border-white/20 hover:bg-white/20 px-3 py-1.5 rounded-full transition text-sm md:text-base">
                <Power className="w-3 h-3 md:w-5 md:h-5" />
                <span className="font-medium font-body">Logout</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      <ReceptionistActivityPanel
        open={activityOpen}
        onClose={() => setActivityOpen(false)}
        roleLabel={activityRoleLabel}
      />
    </>
  );
}
