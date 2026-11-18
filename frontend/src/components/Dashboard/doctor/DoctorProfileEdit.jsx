// src/components/Dashboard/doctor/DoctorProfileEdit.jsx
import { useState, useEffect, useRef, useMemo } from "react";
import { useNavigate, Link } from "react-router-dom";
import Swal from "sweetalert2";
import "sweetalert2/dist/sweetalert2.min.css";
import { patchStoredUser } from "@/utils/authStorage";
import { getImageUrl } from "@/utils/imageUrl";
import { Button } from "../../ui/button";
import Footer from "@/components/HomePage/Footer";

import { Card, CardContent } from "../../ui/card";
import {
  Save,
  Loader2,
  User,
  Key,
  Building2,
  AlertTriangle,
  Award,
  IndianRupee,
  Heart,
  Stethoscope,
  Sparkles,
  ChevronRight,
  ShieldCheck,
  Plus,
  Minus,
  ArrowLeft,
  Eye,
  EyeOff,
} from "lucide-react";

const BACKEND = import.meta.env.VITE_BACKEND_URL || "http://localhost:8000";

function PasswordInput({ value, onChange, autoComplete, onClearError }) {
  const [show, setShow] = useState(false);

  return (
    <div className="relative">
      <input
        type={show ? "text" : "password"}
        autoComplete={autoComplete}
        value={value}
        onChange={(e) => {
          onChange(e);
          onClearError?.();
        }}
        className="w-full px-3 py-2 pr-10 border border-slate-200 rounded-xl focus:ring-2 focus:ring-[#134e97]/20 focus:border-[#134e97] outline-none text-xs font-body text-slate-800 font-normal"
      />
      <button
        type="button"
        tabIndex={-1}
        onClick={() => setShow((s) => !s)}
        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-[#134e97]"
        aria-label={show ? "Hide password" : "Show password"}
      >
        {show ? (
          <EyeOff className="h-4 w-4" strokeWidth={2} />
        ) : (
          <Eye className="h-4 w-4" strokeWidth={2} />
        )}
      </button>
    </div>
  );
}

export default function DoctorProfileEdit() {
  const [doctor, setDoctor] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);
  const navigate = useNavigate();
  const firstInputRef = useRef(null);
  const fileInputRef = useRef(null);

  // Tab management: "identity" | "hospital" | "security"
  const [activeTab, setActiveTab] = useState("identity");

  const [pwdCurrent, setPwdCurrent] = useState("");
  const [pwdNew, setPwdNew] = useState("");
  const [pwdConfirm, setPwdConfirm] = useState("");
  const [pwdLoading, setPwdLoading] = useState(false);
  const [pwdError, setPwdError] = useState(null);

  const [formData, setFormData] = useState({
    name: "",
    specialization: "",
    qualification: "",
    experience: "",
    fees: "",
    about: "",
    profileImage: "",
  });

  useEffect(() => {
    const fetchDoctorProfile = async () => {
      const token = localStorage.getItem("token");
      try {
        const res = await fetch(`${BACKEND}/api/doctor/profile`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        if (data.status === "success") {
          setDoctor(data.data);
          setFormData({
            name: data.data.name || "",
            specialization: data.data.specialization || "",
            qualification: data.data.qualification || "",
            experience: data.data.experience || "0",
            fees: data.data.fees || "0",
            about: data.data.about || "",
            profileImage: data.data.profileImage || "",
          });
        } else {
          setError("Failed to load profile");
          Swal.fire({
            icon: "error",
            title: "Failed",
            text: "Failed to load profile.",
            confirmButtonText: "OK",
            customClass: {
              popup: "rounded-3xl border border-[#134e97]/10 shadow-2xl p-6 sm:p-8 font-body",
              title: "text-lg sm:text-xl font-heading text-slate-800 tracking-tight mb-2 font-normal",
              htmlContainer: "text-xs sm:text-sm text-slate-500 font-body leading-relaxed mb-6 font-normal",
              confirmButton: "bg-gradient-to-r from-[#134e97] to-[#013473] text-white font-body text-xs rounded-full px-6 py-3 border-0 transition-all duration-300 hover:scale-102 cursor-pointer shadow-md shadow-[#134e97]/10 outline-none font-normal",
            },
            buttonsStyling: false,
            backdrop: "rgba(19, 78, 151, 0.15)",
          });
        }
      } catch (err) {
        setError("Failed to load profile");
        Swal.fire({
          icon: "error",
          title: "Failed",
          text: "Failed to load profile.",
          confirmButtonText: "OK",
          customClass: {
            popup: "rounded-3xl border border-[#134e97]/10 shadow-2xl p-6 sm:p-8 font-body",
            title: "text-lg sm:text-xl font-heading text-slate-800 tracking-tight mb-2 font-normal",
            htmlContainer: "text-xs sm:text-sm text-slate-500 font-body leading-relaxed mb-6 font-normal",
            confirmButton: "bg-gradient-to-r from-[#134e97] to-[#013473] text-white font-body text-xs rounded-full px-6 py-3 border-0 transition-all duration-300 hover:scale-102 cursor-pointer shadow-md shadow-[#134e97]/10 outline-none font-normal",
          },
          buttonsStyling: false,
          backdrop: "rgba(19, 78, 151, 0.15)",
        });
      } finally {
        setLoading(false);
      }
    };
    fetchDoctorProfile();
  }, []);

  // Compute profile completeness percentage
  const completeness = useMemo(() => {
    let score = 0;
    if (formData.name) score += 15;
    if (formData.specialization) score += 15;
    if (formData.qualification) score += 15;
    if (formData.experience && Number(formData.experience) > 0) score += 15;
    if (formData.fees && Number(formData.fees) > 0) score += 15;
    if (formData.about && formData.about.length > 20) score += 15;
    if (formData.profileImage) score += 10;
    return score;
  }, [formData]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const adjustNumeric = (field, amount) => {
    setFormData((prev) => {
      const current = Number(prev[field]) || 0;
      const nextVal = Math.max(0, current + amount);
      return { ...prev, [field]: String(nextVal) };
    });
  };

  const handleImageUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const maxBytes = 2 * 1024 * 1024; // 2MB
    if (file.size > maxBytes) {
      Swal.fire({
        icon: "error",
        title: "File too large",
        text: "Please choose an image under 2MB.",
        confirmButtonText: "OK",
        customClass: {
          popup: "rounded-3xl border border-[#134e97]/10 shadow-2xl p-6 sm:p-8 font-body",
          title: "text-lg sm:text-xl font-heading text-slate-800 tracking-tight mb-2 font-normal",
          htmlContainer: "text-xs sm:text-sm text-slate-500 font-body leading-relaxed mb-6 font-normal",
          confirmButton: "bg-gradient-to-r from-[#134e97] to-[#013473] text-white font-body text-xs rounded-full px-6 py-3 border-0 transition-all duration-300 hover:scale-102 cursor-pointer shadow-md shadow-[#134e97]/10 outline-none font-normal",
        },
        buttonsStyling: false,
        backdrop: "rgba(19, 78, 151, 0.15)",
      });
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }
    if (!file.type.startsWith("image/")) {
      Swal.fire({
        icon: "error",
        title: "Invalid file",
        text: "Please choose a valid image file.",
        confirmButtonText: "OK",
        customClass: {
          popup: "rounded-3xl border border-[#134e97]/10 shadow-2xl p-6 sm:p-8 font-body",
          title: "text-lg sm:text-xl font-heading text-slate-800 tracking-tight mb-2 font-normal",
          htmlContainer: "text-xs sm:text-sm text-slate-500 font-body leading-relaxed mb-6 font-normal",
          confirmButton: "bg-gradient-to-r from-[#134e97] to-[#013473] text-white font-body text-xs rounded-full px-6 py-3 border-0 transition-all duration-300 hover:scale-102 cursor-pointer shadow-md shadow-[#134e97]/10 outline-none font-normal",
        },
        buttonsStyling: false,
        backdrop: "rgba(19, 78, 151, 0.15)",
      });
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    const formDataUpload = new FormData();
    formDataUpload.append("image", file);
    formDataUpload.append("doctorId", doctor?._id);

    setSaving(true);
    setError(null);

    const token = localStorage.getItem("token");
    try {
      const res = await fetch(`${BACKEND}/api/doctor/profile-image`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formDataUpload,
      });
      const data = await res.json();

      if (data.status === "success") {
        setFormData((prev) => ({ ...prev, profileImage: data.imageUrl }));
        setDoctor((prev) => ({ ...prev, profileImage: data.imageUrl }));
        patchStoredUser({ profileImage: data.imageUrl });
        Swal.fire({
          icon: "success",
          title: "Uploaded!",
          text: "Your profile image has been updated successfully.",
          iconColor: "#10b981",
          showConfirmButton: false,
          timer: 1500,
          customClass: {
            popup: "rounded-3xl border border-[#134e97]/10 shadow-2xl p-6 sm:p-8 font-body",
            title: "text-lg sm:text-xl font-heading text-slate-800 tracking-tight mb-2 font-normal",
            htmlContainer: "text-xs sm:text-sm text-slate-500 font-body leading-relaxed mb-6 font-normal",
          },
          backdrop: "rgba(19, 78, 151, 0.15)",
        });
      } else {
        setError("Image upload failed");
        Swal.fire({
          icon: "error",
          title: "Upload Failed",
          text: data?.message || "Image upload failed.",
          confirmButtonText: "OK",
          customClass: {
            popup: "rounded-3xl border border-[#134e97]/10 shadow-2xl p-6 sm:p-8 font-body",
            title: "text-lg sm:text-xl font-heading text-slate-800 tracking-tight mb-2 font-normal",
            htmlContainer: "text-xs sm:text-sm text-slate-500 font-body leading-relaxed mb-6 font-normal",
            confirmButton: "bg-gradient-to-r from-[#134e97] to-[#013473] text-white font-body text-xs rounded-full px-6 py-3 border-0 transition-all duration-300 hover:scale-102 cursor-pointer shadow-md shadow-[#134e97]/10 outline-none font-normal",
          },
          buttonsStyling: false,
          backdrop: "rgba(19, 78, 151, 0.15)",
        });
      }
    } catch (err) {
      setError("Image upload failed");
      Swal.fire({
        icon: "error",
        title: "Upload Failed",
        text: "Image upload failed.",
        confirmButtonText: "OK",
        customClass: {
          popup: "rounded-3xl border border-[#134e97]/10 shadow-2xl p-6 sm:p-8 font-body",
          title: "text-lg sm:text-xl font-heading text-slate-800 tracking-tight mb-2 font-normal",
          htmlContainer: "text-xs sm:text-sm text-slate-500 font-body leading-relaxed mb-6 font-normal",
          confirmButton: "bg-gradient-to-r from-[#134e97] to-[#013473] text-white font-body text-xs rounded-full px-6 py-3 border-0 transition-all duration-300 hover:scale-102 cursor-pointer shadow-md shadow-[#134e97]/10 outline-none font-normal",
        },
        buttonsStyling: false,
        backdrop: "rgba(19, 78, 151, 0.15)",
      });
    } finally {
      setSaving(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(false);
    const token = localStorage.getItem("token");

    try {
      const res = await fetch(`${BACKEND}/api/doctor/profile`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(formData),
      });
      const data = await res.json();
      if (data.status === "success" && data.data) {
        const d = data.data;
        setDoctor(d);
        setFormData((prev) => ({
          ...prev,
          name: d.name ?? prev.name,
          specialization: d.specialization ?? prev.specialization,
          qualification: d.qualification ?? prev.qualification,
          experience: d.experience ?? prev.experience,
          fees: d.fees ?? prev.fees,
          about: d.about ?? prev.about,
          profileImage: d.profileImage ?? prev.profileImage,
        }));
        patchStoredUser({
          name: d.name,
          profileImage: d.profileImage,
        });
      }
      if (data.status === "success") {
        setSuccess(true);
        Swal.fire({
          icon: "success",
          title: "Profile Saved!",
          text: "Your profile has been updated successfully.",
          iconColor: "#10b981",
          timer: 1400,
          showConfirmButton: false,
          customClass: {
            popup: "rounded-3xl border border-[#134e97]/10 shadow-2xl p-6 sm:p-8 font-body",
            title: "text-lg sm:text-xl font-heading text-slate-800 tracking-tight mb-2 font-normal",
            htmlContainer: "text-xs sm:text-sm text-slate-500 font-body leading-relaxed mb-6 font-normal",
          },
          backdrop: "rgba(19, 78, 151, 0.15)",
        });
        setTimeout(() => navigate("/doctor/dashboard"), 1400);
      } else {
        setError(data.message || "Failed to update profile");
        Swal.fire({
          icon: "error",
          title: "Save Failed",
          text: data?.message || "Failed to update profile.",
          confirmButtonText: "OK",
          customClass: {
            popup: "rounded-3xl border border-[#134e97]/10 shadow-2xl p-6 sm:p-8 font-body",
            title: "text-lg sm:text-xl font-heading text-slate-800 tracking-tight mb-2 font-normal",
            htmlContainer: "text-xs sm:text-sm text-slate-500 font-body leading-relaxed mb-6 font-normal",
            confirmButton: "bg-gradient-to-r from-[#134e97] to-[#013473] text-white font-body text-xs rounded-full px-6 py-3 border-0 transition-all duration-300 hover:scale-102 cursor-pointer shadow-md shadow-[#134e97]/10 outline-none font-normal",
          },
          buttonsStyling: false,
          backdrop: "rgba(19, 78, 151, 0.15)",
        });
      }
    } catch (err) {
      setError("Failed to update profile");
      Swal.fire({
        icon: "error",
        title: "Save Failed",
        text: "Failed to update profile.",
        confirmButtonText: "OK",
        customClass: {
          popup: "rounded-3xl border border-[#134e97]/10 shadow-2xl p-6 sm:p-8 font-body",
          title: "text-lg sm:text-xl font-heading text-slate-800 tracking-tight mb-2 font-normal",
          htmlContainer: "text-xs sm:text-sm text-slate-500 font-body leading-relaxed mb-6 font-normal",
          confirmButton: "bg-gradient-to-r from-[#134e97] to-[#013473] text-white font-body text-xs rounded-full px-6 py-3 border-0 transition-all duration-300 hover:scale-102 cursor-pointer shadow-md shadow-[#134e97]/10 outline-none font-normal",
        },
        buttonsStyling: false,
        backdrop: "rgba(19, 78, 151, 0.15)",
      });
    } finally {
      setSaving(false);
    }
  };

  const handlePasswordChange = async (e) => {
    e.preventDefault();
    setPwdError(null);
    if (!pwdCurrent) {
      setPwdError("Enter your current password.");
      return;
    }
    if (pwdNew.length < 8) {
      setPwdError("New password must be at least 8 characters.");
      return;
    }
    if (pwdNew !== pwdConfirm) {
      setPwdError("New password and confirmation do not match.");
      return;
    }
    const token = localStorage.getItem("token");
    if (!token) {
      setPwdError("You are not signed in.");
      return;
    }
    setPwdLoading(true);
    try {
      const res = await fetch(`${BACKEND}/api/auth/change-password`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          currentPassword: pwdCurrent,
          newPassword: pwdNew,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        setPwdError(data.message || "Could not update password.");
        return;
      }
      await Swal.fire({
        icon: "success",
        title: "Password Updated!",
        text: "Your security credentials have been updated successfully.",
        iconColor: "#10b981",
        timer: 1800,
        showConfirmButton: false,
        customClass: {
          popup: "rounded-3xl border border-[#134e97]/10 shadow-2xl p-6 sm:p-8 font-body",
          title: "text-lg sm:text-xl font-heading text-slate-800 tracking-tight mb-2 font-normal",
          htmlContainer: "text-xs sm:text-sm text-slate-500 font-body leading-relaxed mb-6 font-normal",
        },
        backdrop: "rgba(19, 78, 151, 0.15)",
      });
      setPwdCurrent("");
      setPwdNew("");
      setPwdConfirm("");
    } catch {
      setPwdError("Could not reach server. Try again.");
    } finally {
      setPwdLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="text-center font-body">
          <Loader2 className="w-12 h-12 text-[#134e97] animate-spin mx-auto" />
          <p className="text-slate-500 mt-4 font-normal text-sm">
            Loading your clinical workspace...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-body">
      {/* Top Clinical Header */}
      <header className="z-40 bg-white border-b border-slate-100 shadow-xs sticky top-0">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3.5 sm:py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link to="/doctor/dashboard">
              <button
                type="button"
                className="w-10 h-10 rounded-full border border-slate-200 text-slate-600 flex items-center justify-center hover:bg-slate-50 transition-colors cursor-pointer"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
            </Link>
            <div>
              <h1 className="text-xl sm:text-2xl font-heading text-[#134e97] tracking-tight leading-tight font-normal">
                Edit Your Profile
              </h1>
              <p className="text-xxs sm:text-xs text-slate-500 mt-0.5 font-normal">
                Dr. {formData.name || "Doctor"} • Customize your visual profile badge and settings
              </p>
            </div>
          </div>
        </div>
      </header>

      {/* Main Interactive Container */}
      <main className="flex-grow max-w-7xl mx-auto w-full px-4 py-6 sm:py-8 flex flex-col lg:flex-row gap-8 items-start">
        {/* Left column: Edit Forms & Tab bar */}
        <div className="w-full lg:w-7/12 xl:w-8/12 space-y-6">
          {/* Dynamic Completeness Scale */}
          <div className="bg-white rounded-3xl border border-slate-100 p-5 shadow-sm shadow-[#134e97]/5 relative overflow-hidden">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-1.5 text-xs font-body text-slate-500 uppercase tracking-wide font-normal">
                <Sparkles className="w-4 h-4 text-[#134e97]" /> Profile Strength Meter
              </div>
              <span className="text-xs font-body text-[#134e97] font-normal">{completeness}% Complete</span>
            </div>
            {/* Animated bar */}
            <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-[#134e97] to-[#06adc6] transition-all duration-700 ease-out"
                style={{ width: `${completeness}%` }}
              />
            </div>
            <p className="text-xxs text-slate-400 mt-2 font-normal">
              {completeness === 100
                ? "Perfect! Your professional profile is completely optimized for patients."
                : "Fill out specialization, biography, and fees to complete your badge."}
            </p>
          </div>

          {/* Interactive Navigation tab pills */}
          <div className="bg-slate-100/50 p-2 rounded-2xl flex gap-1.5 max-w-md">
            <button
              type="button"
              onClick={() => setActiveTab("identity")}
              className={`flex-1 py-2 rounded-xl text-xs font-body transition-all text-center cursor-pointer font-normal border-0 ${activeTab === "identity"
                ? "bg-white text-[#134e97] shadow-xs"
                : "text-slate-500 hover:text-slate-800"
                }`}
            >
              Clinical Info
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("security")}
              className={`flex-1 py-2 rounded-xl text-xs font-body transition-all text-center cursor-pointer font-normal border-0 ${activeTab === "security"
                ? "bg-white text-[#134e97] shadow-xs"
                : "text-slate-500 hover:text-slate-800"
                }`}
            >
              Security Settings
            </button>
          </div>

          {/* Form contents */}
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Hidden Photo file input */}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleImageUpload}
              className="hidden"
            />

            {/* TAB 1: Clinical Info */}
            {activeTab === "identity" && (
              <div className="space-y-6 animate-fadeIn">
                <Card className="border-0 shadow-2xl shadow-[#134e97]/5 bg-white rounded-3xl p-5 sm:p-8">
                  <CardContent className="p-0 space-y-6">
                    <div className="flex flex-col sm:flex-row items-center gap-6 pb-6 border-b border-slate-100 w-full">
                      <div
                        className="w-24 h-24 rounded-2xl overflow-hidden bg-gradient-to-br from-slate-100 to-slate-200 border border-slate-200 flex items-center justify-center cursor-pointer shadow-inner hover:scale-103 transition-all relative group flex-shrink-0"
                        onClick={() => fileInputRef.current?.click()}
                      >
                        <img
                          src={getImageUrl(formData.profileImage, formData.name || "Doctor")}
                          alt="Profile"
                          className="w-full h-full object-cover aspect-square"
                        />
                        <div className="absolute inset-0 bg-slate-900/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white text-xxs font-normal">
                          Change Image
                        </div>
                      </div>

                      <div className="flex-1 w-full space-y-3">
                        <div className="flex items-center justify-between sm:justify-start gap-4">
                          <button
                            type="button"
                            onClick={() => fileInputRef.current?.click()}
                            className="text-xs bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-full px-4 py-2 transition-all cursor-pointer font-normal border-0"
                          >
                            Change Profile Photo
                          </button>
                        </div>
                        <div className="w-full">
                          <label className="block text-xs font-body uppercase tracking-wider text-slate-500 mb-2 font-normal">
                            Full Name <span className="text-red-500">*</span>
                          </label>
                          <input
                            ref={firstInputRef}
                            type="text"
                            name="name"
                            value={formData.name}
                            onChange={handleChange}
                            required
                            className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-[#134e97]/20 focus:border-[#134e97] outline-none text-xs font-body text-slate-800 font-normal"
                            placeholder="Dr. John Doe"
                          />
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-body uppercase tracking-wider text-slate-500 mb-2 font-normal">
                          Specialization <span className="text-red-500">*</span>
                        </label>
                        <select
                          name="specialization"
                          value={formData.specialization}
                          onChange={handleChange}
                          required
                          className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-[#134e97]/20 focus:border-[#134e97] outline-none text-xs font-body text-slate-800 font-normal bg-white"
                        >
                          <option value="">Select Specialization</option>
                          <option value="Neurologist">Neurologist</option>
                          <option value="General Physician">General Physician</option>
                          <option value="Clinical Psychologist">Clinical Psychologist</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-xs font-body uppercase tracking-wider text-slate-500 mb-2 font-normal">
                          Qualification <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="text"
                          name="qualification"
                          value={formData.qualification}
                          onChange={handleChange}
                          required
                          placeholder="e.g. MBBS, MD, MS"
                          className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-[#134e97]/20 focus:border-[#134e97] outline-none text-xs font-body text-slate-800 font-normal"
                        />
                      </div>

                      {/* Interactive Years of Experience incrementor */}
                      <div>
                        <label className="block text-xs font-body uppercase tracking-wider text-slate-500 mb-2 font-normal">
                          Years of Experience <span className="text-red-500">*</span>
                        </label>
                        <div className="flex items-center gap-2 border border-slate-200 rounded-xl px-2 py-1 bg-white">
                          <button
                            type="button"
                            onClick={() => adjustNumeric("experience", -1)}
                            className="w-8 h-8 rounded-lg bg-slate-50 text-slate-600 hover:bg-slate-100 flex items-center justify-center cursor-pointer transition-colors border-0"
                          >
                            <Minus className="w-3.5 h-3.5" />
                          </button>
                          <input
                            type="number"
                            name="experience"
                            value={formData.experience}
                            onChange={handleChange}
                            required
                            min="0"
                            className="flex-1 text-center bg-transparent border-0 outline-none text-xs font-body text-slate-800 font-normal py-1"
                          />
                          <button
                            type="button"
                            onClick={() => adjustNumeric("experience", 1)}
                            className="w-8 h-8 rounded-lg bg-slate-50 text-slate-600 hover:bg-slate-100 flex items-center justify-center cursor-pointer transition-colors border-0"
                          >
                            <Plus className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      {/* Consultation Fee - Typing input only */}
                      <div>
                        <label className="block text-xs font-body uppercase tracking-wider text-slate-500 mb-2 font-normal">
                          Consultation Fee (₹) <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="number"
                          name="fees"
                          value={formData.fees}
                          onChange={handleChange}
                          required
                          min="0"
                          placeholder="e.g. 500"
                          className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-[#134e97]/20 focus:border-[#134e97] outline-none text-xs font-body text-slate-800 font-normal"
                        />
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Card 2: Biography */}
                <Card className="border-0 shadow-2xl shadow-[#134e97]/5 bg-white rounded-3xl p-5 sm:p-8">
                  <CardContent className="p-0 space-y-4">
                    <label className="block text-xs font-body uppercase tracking-wider text-slate-500 mb-2 font-normal">
                      Doctor Biography / Profile Description
                    </label>
                    <textarea
                      name="about"
                      value={formData.about}
                      onChange={handleChange}
                      rows={4}
                      placeholder="Write a brief professional overview about your clinical specialties, medical background, and patient care philosophies..."
                      className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-[#134e97]/20 focus:border-[#134e97] outline-none text-xs font-body text-slate-800 font-normal resize-none"
                    />
                    <div className="flex justify-between items-center mt-1">
                      <span className="text-[10px] text-slate-400 font-normal">Minimum: 20 characters</span>
                      <span className="text-[10px] text-[#134e97] font-normal">{formData.about?.length || 0} characters</span>
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}



            {/* TAB 3: Security Panel */}
            {activeTab === "security" && (
              <div className="animate-fadeIn">
                <Card className="border-0 shadow-2xl shadow-[#134e97]/5 bg-white rounded-3xl p-5 sm:p-8">
                  <CardContent className="p-0 space-y-4">
                    <label className="text-xs font-body uppercase tracking-wider text-slate-500 mb-1 block font-normal flex items-center gap-2">
                      <Key className="w-4 h-4 text-slate-400" /> Change Security Password
                    </label>
                    <p className="text-xxs sm:text-xs text-slate-400 font-normal">
                      Update your login password. Password changes take effect instantly across active sessions.
                    </p>

                    <div className="space-y-4 pt-2">
                      {pwdError && (
                        <div className="p-3 bg-red-50 border border-red-100 rounded-xl text-red-700 text-xs font-normal">
                          {pwdError}
                        </div>
                      )}

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div>
                          <label className="block text-xs font-body uppercase tracking-wider text-slate-500 mb-2 font-normal">
                            Current Password
                          </label>
                          <PasswordInput
                            autoComplete="current-password"
                            value={pwdCurrent}
                            onChange={(e) => setPwdCurrent(e.target.value)}
                            onClearError={() => setPwdError(null)}
                          />
                        </div>

                        <div>
                          <label className="block text-xs font-body uppercase tracking-wider text-slate-500 mb-2 font-normal">
                            New Password
                          </label>
                          <PasswordInput
                            autoComplete="new-password"
                            value={pwdNew}
                            onChange={(e) => setPwdNew(e.target.value)}
                            onClearError={() => setPwdError(null)}
                          />
                        </div>

                        <div>
                          <label className="block text-xs font-body uppercase tracking-wider text-slate-500 mb-2 font-normal">
                            Confirm Password
                          </label>
                          <PasswordInput
                            autoComplete="new-password"
                            value={pwdConfirm}
                            onChange={(e) => setPwdConfirm(e.target.value)}
                            onClearError={() => setPwdError(null)}
                          />
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={handlePasswordChange}
                        disabled={pwdLoading}
                        className="w-full sm:w-auto px-6 py-2.5 rounded-full border border-[#134e97] text-[#134e97] bg-white hover:bg-slate-50 font-body text-xs transition-all duration-300 hover:scale-102 disabled:opacity-60 cursor-pointer font-normal mt-2 border-solid"
                      >
                        {pwdLoading ? (
                          <span className="inline-flex items-center gap-2">
                            <Loader2 className="w-4 h-4 animate-spin" />
                            Updating Password…
                          </span>
                        ) : (
                          "Update Password Now"
                        )}
                      </button>
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}

            {/* General submit footer bar */}
            <div className="flex flex-col sm:flex-row gap-3 pt-4 border-t border-slate-100">
              <Button
                type="submit"
                disabled={saving}
                className="w-full sm:w-1/2 bg-gradient-to-r from-[#134e97] to-[#013473] hover:from-[#0b5c9b] hover:to-[#134e97] text-white rounded-full font-body text-xs py-3 shadow-md shadow-[#134e97]/25 cursor-pointer transition-all duration-300 hover:scale-102 flex items-center justify-center font-normal"
              >
                {saving ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                    Saving Changes...
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4 mr-2" />
                    Save Profile Settings
                  </>
                )}
              </Button>

              <Button
                type="button"
                variant="outline"
                onClick={() => navigate("/doctor/dashboard")}
                className="w-full sm:w-1/2 border border-red-500 bg-white text-red-600 hover:bg-red-50 hover:text-red-700 rounded-full font-body text-xs py-3 cursor-pointer transition-all duration-300 hover:scale-102 font-normal"
              >
                Cancel
              </Button>
            </div>
          </form>
        </div>

        {/* Right column: Dynamic Live Clinical Profile Badge Preview */}
        <div className="w-full lg:w-5/12 xl:w-4/12 sticky top-24">
          <div className="text-center mb-3">
            <span className="text-[10px] font-body bg-[#134e97]/10 text-[#134e97] rounded-full px-3 py-1 font-normal tracking-wide uppercase">
              Live Profile Preview Card
            </span>
          </div>

          {/* Premium Glassmorphic Badge */}
          <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-950 text-white rounded-3xl p-6 shadow-2xl relative overflow-hidden border border-white/10 group">
            {/* Glowing background bubbles */}
            <div className="absolute top-[-20%] right-[-20%] w-48 h-48 rounded-full bg-[#134e97]/20 blur-3xl group-hover:scale-110 transition-transform duration-500" />
            <div className="absolute bottom-[-10%] left-[-10%] w-36 h-36 rounded-full bg-[#06adc6]/10 blur-2xl" />

            {/* Live badge watermarks */}
            <div className="absolute top-4 right-4 flex items-center gap-1 opacity-70">
              <Stethoscope className="w-4 h-4 text-[#06adc6] animate-pulse" />
              <span className="text-[8px] font-body uppercase tracking-wider text-slate-400">Brains Staff</span>
            </div>

            <div className="relative space-y-6">
              {/* Doctor Identity Block */}
              <div className="flex items-center gap-4">
                <div className="w-20 h-20 rounded-2xl overflow-hidden border-2 border-white/20 shadow-lg flex-shrink-0 bg-slate-700 flex items-center justify-center">
                  <img
                    src={getImageUrl(formData.profileImage, formData.name || "Doctor")}
                    alt="Doctor Live View"
                    className="w-full h-full object-cover aspect-square"
                  />
                </div>

                <div className="min-w-0">
                  <h3 className="text-lg font-heading tracking-tight truncate leading-snug font-normal text-white">
                    {formData.name || "Dr. Your Name"}
                  </h3>
                  <div className="text-xxs text-[#06adc6] mt-0.5 tracking-wide uppercase font-normal truncate">
                    {formData.specialization || "Clinical Specialty"}
                  </div>
                  <div className="text-xxs text-slate-400 mt-0.5 font-normal truncate">
                    {formData.qualification || "Credentials (e.g. MBBS)"}
                  </div>
                </div>
              </div>

              {/* Bio summary display */}
              <div className="bg-white/5 border border-white/5 rounded-2xl p-3.5">
                <div className="text-[10px] text-slate-400 uppercase tracking-wider mb-1 font-normal flex items-center gap-1">
                  <Heart className="w-3 h-3 text-red-400" /> Clinical Biography
                </div>
                <p className="text-xxs sm:text-xs text-slate-300 font-normal leading-relaxed italic line-clamp-3">
                  {formData.about || "No clinical biography provided yet. Add one in the biography field to optimize your patient view."}
                </p>
              </div>

              {/* Stat Counters */}
              <div className="grid grid-cols-2 gap-3.5">
                <div className="bg-white/5 border border-white/5 rounded-2xl p-3 text-center">
                  <div className="text-[10px] text-slate-400 uppercase tracking-wider mb-0.5 font-normal flex justify-center items-center gap-1">
                    <Award className="w-3 h-3 text-[#06adc6]" /> Experience
                  </div>
                  <div className="text-sm font-heading font-normal text-white">
                    {formData.experience || "0"} Years
                  </div>
                </div>

                <div className="bg-white/5 border border-white/5 rounded-2xl p-3 text-center">
                  <div className="text-[10px] text-slate-400 uppercase tracking-wider mb-0.5 font-normal flex justify-center items-center gap-1">
                    <IndianRupee className="w-3 h-3 text-emerald-400" /> Consult Fee
                  </div>
                  <div className="text-sm font-heading font-normal text-white">
                    ₹{formData.fees || "0"}
                  </div>
                </div>
              </div>

            </div>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
