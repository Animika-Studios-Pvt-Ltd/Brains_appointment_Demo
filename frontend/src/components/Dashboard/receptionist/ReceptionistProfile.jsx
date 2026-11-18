// frontend/src/components/Dashboard/receptionist/ReceptionistProfile.jsx
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import Swal from "sweetalert2";
import Footer from "@/components/HomePage/Footer";

import { Card } from "../../ui/card";
import { Button } from "../../ui/button";
import {
  UploadCloud,
  Mail,
  Phone,
  User2,
  Shield,
  ArrowLeft,
} from "lucide-react";
import { getAuthToken } from "../../../utils/api";

const API = import.meta.env.VITE_BACKEND_URL || "http://localhost:8000";

/* ---------------------- small helpers ---------------------- */

async function tryEndpoints(endpoints, options = {}) {
  let lastErr = null;
  for (const url of endpoints) {
    try {
      const res = await fetch(url, options);
      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        lastErr = `HTTP ${res.status} ${res.statusText} — ${txt || url}`;
        continue;
      }
      const json = await res.json().catch(() => null);
      return { ok: true, url, json };
    } catch (err) {
      lastErr = err.message || String(err);
    }
  }
  return { ok: false, lastErr };
}

function unwrapReceptionist(json) {
  if (!json) return null;
  if (json.data && json.data.receptionist) return json.data.receptionist;
  if (json.data) return json.data;
  if (json.receptionist) return json.receptionist;
  if (json.user && (json.user.userType === "receptionist" || json.user.userType === "call_center")) return json.user;
  return json;
}

function statusBadgeClass(status) {
  const s = String(status || "").toLowerCase();
  if (s === "suspended") {
    return "bg-red-100 text-red-700 border border-red-200";
  }
  return "bg-emerald-100 text-emerald-700 border border-emerald-200";
}

/* ---------------------- component ---------------------- */

export default function ReceptionistProfile() {
  const navigate = useNavigate();

  const token = useMemo(
    () => getAuthToken?.() || localStorage.getItem("token"),
    []
  );

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const [receptionist, setReceptionist] = useState(null);

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState("");
  const [profileImage, setProfileImage] = useState("");
  const [previewUrl, setPreviewUrl] = useState("");
  const [file, setFile] = useState(null);

  // ---------- Fetch current receptionist profile ----------
  useEffect(() => {
    let isMounted = true;

    async function fetchProfile() {
      if (!token) {
        setError("Not authenticated");
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);

      const endpoints = [
        `${API}/api/receptionist/profile`,
        `${API}/api/receptionists/me`,
      ];

      const result = await tryEndpoints(endpoints, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!isMounted) return;

      if (!result.ok) {
        console.error("Receptionist profile fetch failed:", result.lastErr);
        setError("Failed to load profile. Please try again.");
        setLoading(false);
        return;
      }

      const rec = unwrapReceptionist(result.json);
      if (!rec || !rec._id) {
        setError("Invalid profile data received");
        setLoading(false);
        return;
      }

      setReceptionist(rec);
      setName(rec.name || "");
      setPhone(rec.phone || rec.mobile || "");
      setEmail(rec.email || "");
      setStatus(rec.status || (rec.isActive ? "active" : "suspended") || "");

      const img = rec.profileImage || "";
      setProfileImage(img);
      if (img) {
        if (img.startsWith("http")) setPreviewUrl(img);
        else setPreviewUrl(`${API}${img}`);
      }

      setLoading(false);
    }

    fetchProfile();

    return () => {
      isMounted = false;
      if (previewUrl && previewUrl.startsWith("blob:")) {
        URL.revokeObjectURL(previewUrl);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  // ---------- file change ----------
  function handleFileChange(e) {
    const f = e.target.files?.[0];
    if (!f) return;

    if (!f.type.startsWith("image/")) {
      Swal.fire({
        icon: "error",
        title: "Invalid file",
        text: "Only image files are allowed.",
      });
      return;
    }

    setFile(f);
    const url = URL.createObjectURL(f);
    setPreviewUrl((old) => {
      if (old && old.startsWith("blob:")) URL.revokeObjectURL(old);
      return url;
    });
  }

  // ---------- submit ----------
  async function handleSubmit(e) {
    e.preventDefault();
    if (!receptionist || !receptionist._id) return;

    if (!name.trim()) {
      Swal.fire({
        icon: "warning",
        title: "Name required",
        text: "Please enter your name.",
      });
      return;
    }

    setSaving(true);
    setError(null);

    const formData = new FormData();
    formData.append("name", name.trim());
    if (phone) formData.append("phone", phone.trim());
    if (file) formData.append("profileImage", file);

    const endpoints = [
      `${API}/api/receptionist/profile`,
      `${API}/api/receptionists/${receptionist._id}`,
    ];

    const result = await tryEndpoints(endpoints, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        // DO NOT set Content-Type manually for FormData
      },
      body: formData,
    });

    if (!result.ok) {
      console.error("Receptionist profile update failed:", result.lastErr);
      setSaving(false);
      Swal.fire({
        icon: "error",
        title: "Update failed",
        text: "Could not update your profile. Please try again.",
      });
      return;
    }

    const updated = unwrapReceptionist(result.json);
    setReceptionist(updated);
    setName(updated.name || "");
    setPhone(updated.phone || updated.mobile || "");

    const img = updated.profileImage || "";
    setProfileImage(img);
    if (img) {
      if (img.startsWith("http")) setPreviewUrl(img);
      else setPreviewUrl(`${API}${img}`);
    }

    // Update localStorage user (if stored)
    try {
      const stored = JSON.parse(localStorage.getItem("user") || "null");
      if (stored && (stored.userType === "receptionist" || stored.userType === "call_center")) {
        const merged = {
          ...stored,
          name: updated.name || stored.name,
          phone: updated.phone || stored.phone,
          profileImage: updated.profileImage || stored.profileImage,
        };
        localStorage.setItem("user", JSON.stringify(merged));
      }
    } catch {
      // ignore
    }

    setSaving(false);
    Swal.fire({
      icon: "success",
      title: "Profile updated",
      text: "Your profile has been updated successfully.",
    });
  }

  // ---------- UI ----------
  const statusLabel =
    String(status || "").toLowerCase() === "suspended" ? "Suspended" : "Active";

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-slate-50 via-[#134e97]/5 to-[#06adc6]/5" style={{ fontFamily: "'roboto-regular', 'Roboto', sans-serif" }}>
      {/* HEADER – responsive: stack on xs, inline on sm+ */}
      <header className="w-full bg-gradient-to-r from-[#134e97] via-[#0b5c9b] to-[#06adc6] shadow-md py-4 px-4 sm:px-6">
        <div className="max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 flex flex-row items-center justify-between gap-3">
          {/* Left: Back button */}
          <div className="flex items-center">
            <Button
              type="button"
              variant="outline"
              onClick={() => navigate(-1)}
              className="flex items-center gap-2 bg-white/10 border-white/40 text-white rounded-full px-3 py-1.5 text-xs sm:text-sm hover:bg-white/20">
              <ArrowLeft className="w-4 h-4" />
              <span className="hidden sm:inline">Back</span>
            </Button>
          </div>

          {/* Center: Heading */}
          <div className="flex-1 text-center">
            <h1 className="text-xl sm:text-2xl md:text-3xl font-bold text-white" style={{ fontFamily: "'mirador-medium', 'Outfit', sans-serif" }}>
              My Profile
            </h1>
            <p className="hidden sm:block text-sm text-blue-100 mt-1 max-w-xl mx-auto">
              View and update your personal details. Email & status are managed
              by Admin / Super Admin.
            </p>
          </div>

          {/* Right: Status pill */}
          <div className="flex items-center justify-end">
            {receptionist && (
              <div className="flex flex-col items-end text-xs sm:text-sm">
                <div className="inline-flex items-center px-3 py-1 rounded-full text-[11px] font-medium gap-1 bg-white/15 text-white border border-white/40">
                  <Shield className="w-3 h-3" />
                  <span className="text-xs sm:text-sm">{statusLabel}</span>
                </div>
                <span className="mt-1 text-[11px] text-blue-100 uppercase tracking-wide hidden sm:block">
                  Receptionist
                </span>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* MAIN CONTENT */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-6 space-y-6">
        {/* SUMMARY STRIP */}
        {receptionist && !loading && !error && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Card className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 flex items-center gap-3">
              <div className="w-10 h-10 sm:w-9 sm:h-9 md:w-11 md:h-11 rounded-full bg-[#134e97]/5 flex items-center justify-center text-[#134e97] text-sm font-semibold">
                {name ? name.charAt(0).toUpperCase() : "R"}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[11px] sm:text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  Name
                </p>
                <p className="text-sm sm:text-base font-medium text-gray-900 truncate">
                  {name || "—"}
                </p>
              </div>
            </Card>

            <Card className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
              <p className="text-[11px] sm:text-xs font-semibold text-gray-500 uppercase tracking-wide">
                Email
              </p>
              <p className="text-sm sm:text-base font-medium text-gray-900 truncate">
                {email || "—"}
              </p>
              <p className="mt-1 text-[11px] text-gray-400">
                Managed by Admin / Super Admin
              </p>
            </Card>

            <Card className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
              <p className="text-[11px] sm:text-xs font-semibold text-gray-500 uppercase tracking-wide">
                Last Updated
              </p>
              <p className="text-sm sm:text-base font-medium text-gray-900">
                {receptionist.updatedAt
                  ? new Date(receptionist.updatedAt).toLocaleString()
                  : "—"}
              </p>
            </Card>
          </div>
        )}

        {/* MAIN PROFILE CARD */}
        <Card className="border border-slate-100 shadow-sm rounded-2xl p-4 md:p-6 bg-white">
          {loading ? (
            <div className="py-12 flex flex-col items-center justify-center gap-2">
              <div className="w-8 h-8 border-2 border-gray-300 border-t-transparent rounded-full animate-spin" />
              <p className="text-xs text-gray-500">Loading profile…</p>
            </div>
          ) : error ? (
            <div className="py-10 flex flex-col items-center gap-3">
              <p className="text-sm text-red-600 text-center">{error}</p>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="rounded-full px-4"
                onClick={() => window.location.reload()}>
                Retry
              </Button>
            </div>
          ) : !receptionist ? (
            <div className="py-10 text-center text-sm text-gray-500">
              Profile not found.
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Top section: image + basic info */}
              <div className="flex flex-col md:flex-row gap-6 md:gap-10 items-start">
                {/* Avatar + upload */}
                <div className="flex flex-col items-center gap-3 w-full md:w-auto">
                  <div className="relative">
                    {previewUrl ? (
                      <img
                        src={previewUrl}
                        alt="Profile"
                        className="w-24 h-24 sm:w-28 sm:h-28 md:w-32 md:h-32 rounded-full object-cover border border-gray-200 shadow-sm"
                      />
                    ) : (
                      <div className="w-24 h-24 sm:w-28 sm:h-28 md:w-32 md:h-32 rounded-full bg-[#134e97]/5 border border-gray-200 flex items-center justify-center text-[#134e97]/60 text-3xl font-semibold">
                        {name ? name.charAt(0).toUpperCase() : "R"}
                      </div>
                    )}
                    <label className="absolute bottom-0 right-0 inline-flex items-center justify-center w-8 h-8 rounded-full bg-[#134e97] text-white shadow cursor-pointer hover:bg-[#013473] transition">
                      <UploadCloud className="w-4 h-4" />
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={handleFileChange}
                      />
                    </label>
                  </div>
                  <p className="text-[11px] text-gray-500 text-center max-w-[220px]">
                    Upload a clear picture of yourself (max 5MB).
                  </p>
                </div>

                {/* Editable fields */}
                <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-4 w-full">
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-gray-700 flex items-center gap-1.5">
                      <User2 className="w-4 h-4" />
                      <span className="text-xs sm:text-sm">Full Name</span>
                    </label>
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#134e97]/20 focus:border-[#134e97] bg-white"
                      placeholder="Your name"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-gray-700 flex items-center gap-1.5">
                      <Phone className="w-4 h-4" />
                      <span className="text-xs sm:text-sm">Mobile Number</span>
                    </label>
                    <input
                      type="text"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#134e97]/20 focus:border-[#134e97] bg-white"
                      placeholder="Enter mobile number"
                    />
                  </div>

                  <div className="space-y-1.5 md:col-span-2">
                    <label className="text-xs font-medium text-gray-700 flex items-center gap-1.5">
                      <Mail className="w-4 h-4" />
                      <span className="text-xs sm:text-sm">Email (login)</span>
                    </label>
                    <input
                      type="email"
                      value={email}
                      disabled
                      className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm bg-gray-50 text-gray-500 cursor-not-allowed"
                    />
                    <p className="text-[11px] text-gray-400 mt-1">
                      Email is set by Admin / Super Admin and cannot be changed
                      here.
                    </p>
                  </div>
                </div>
              </div>

              {/* Status & meta info */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 border-t border-gray-100 pt-4">
                <div className="space-y-1">
                  <p className="text-[11px] sm:text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    Account Status
                  </p>
                  <div
                    className={
                      "inline-flex items-center px-3 py-1 rounded-full text-[11px] font-medium gap-1 " +
                      statusBadgeClass(status)
                    }>
                    <Shield className="w-3 h-3" />
                    <span className="text-xs sm:text-sm">{statusLabel}</span>
                  </div>
                  <p className="text-[11px] text-gray-400 mt-1">
                    Status is managed by Admin / Super Admin.
                  </p>
                </div>

                <div className="space-y-1">
                  <p className="text-[11px] sm:text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    User Type
                  </p>
                  <p className="text-sm sm:text-base text-gray-800">
                    Receptionist
                  </p>
                </div>

                <div className="space-y-1">
                  <p className="text-[11px] sm:text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    Last Updated
                  </p>
                  <p className="text-sm sm:text-base text-gray-800">
                    {receptionist.updatedAt
                      ? new Date(receptionist.updatedAt).toLocaleString()
                      : "—"}
                  </p>
                </div>
              </div>

              {/* Actions – responsive buttons: stack on xs, inline on sm+ */}
              <div className="flex flex-col sm:flex-row sm:justify-end gap-3 pt-4 border-t border-gray-100 mt-2">
                <Button
                  type="button"
                  variant="outline"
                  className="w-full sm:w-auto text-sm rounded-full px-5 py-2 border-gray-300 text-gray-700 bg-white hover:bg-gray-50 hover:border-gray-400 shadow-sm"
                  onClick={() => {
                    if (!receptionist) return;
                    setName(receptionist.name || "");
                    setPhone(receptionist.phone || receptionist.mobile || "");
                    setFile(null);
                    const img = receptionist.profileImage || "";
                    setProfileImage(img);
                    if (img) {
                      if (img.startsWith("http")) setPreviewUrl(img);
                      else setPreviewUrl(`${API}${img}`);
                    } else {
                      setPreviewUrl("");
                    }
                  }}
                  disabled={saving}>
                  Reset
                </Button>
                <Button
                  type="submit"
                  className="w-full sm:w-auto text-sm rounded-full px-6 py-2 bg-gradient-to-r from-[#134e97] to-[#013473] text-white font-semibold shadow-md hover:from-[#013473] hover:to-[#0c2340] disabled:opacity-70 disabled:cursor-not-allowed"
                  disabled={saving}>
                  {saving ? "Saving…" : "Save Changes"}
                </Button>
              </div>
            </form>
          )}
        </Card>
      </main>
      <Footer />
    </div>
  );
}
