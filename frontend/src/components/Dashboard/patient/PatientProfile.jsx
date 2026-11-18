// src/pages/patient/PatientProfile.jsx
import Footer from "@/components/HomePage/Footer";
import Header from "@/components/HomePage/Header";
import { patchStoredUser } from "@/utils/authStorage";
import {
  Calendar,
  Camera,
  Check,
  Eye,
  EyeOff,
  Heart,
  Lock,
  Phone,
  User,
} from "lucide-react";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import Swal from "sweetalert2";
import { getImageUrl } from "@/utils/imageUrl";
import PageBackButton from "@/components/common/PageBackButton";

const BACKEND = import.meta.env.VITE_BACKEND_URL || "http://localhost:8000";

/** Downscale large camera photos before upload — less data, faster Cloudinary. */
async function shrinkImageForAvatar(file, maxSide = 960, quality = 0.86) {
  if (!file.type.startsWith("image/") || typeof createImageBitmap !== "function") {
    return file;
  }
  try {
    const bmp = await createImageBitmap(file);
    const w = bmp.width;
    const h = bmp.height;
    const scale = Math.min(1, maxSide / Math.max(w, h));
    if (scale >= 1 && file.size < 450000) {
      bmp.close();
      return file;
    }
    const tw = Math.max(1, Math.round(w * scale));
    const th = Math.max(1, Math.round(h * scale));
    const canvas = document.createElement("canvas");
    canvas.width = tw;
    canvas.height = th;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      bmp.close();
      return file;
    }
    ctx.drawImage(bmp, 0, 0, tw, th);
    bmp.close();
    const blob = await new Promise((resolve) =>
      canvas.toBlob((b) => resolve(b), "image/jpeg", quality)
    );
    if (!blob || blob.size >= file.size * 0.92) return file;
    return new File([blob], "avatar.jpg", { type: "image/jpeg" });
  } catch {
    return file;
  }
}

function calculateAgeInFrontend(dobString) {
  if (!dobString) return "";
  const birthDate = new Date(dobString);
  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const m = today.getMonth() - birthDate.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }
  return age >= 0 ? age : "";
}

const INPUT =
  "w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-[#134e97] outline-none transition placeholder:text-slate-400 focus:border-[#06adc6]/60 focus:ring-2 focus:ring-[#06adc6]/15";
const INPUT_READONLY = `${INPUT} cursor-not-allowed border-slate-200 bg-slate-50 text-[#134e97]/70`;
const INPUT_ERROR = "border-rose-400 bg-rose-50/70 focus:border-rose-400 focus:ring-rose-100/80";

function FormField({ label, required, error, children, className = "" }) {
  return (
    <div className={`space-y-1.5 ${className}`}>
      <label className="text-sm font-medium text-[#134e97]">
        {label}
        {required ? <span className="ml-0.5 text-rose-500">*</span> : null}
      </label>
      {children}
      {error ? <p className="text-xs text-rose-600">{error}</p> : null}
    </div>
  );
}

function SectionHeading({ icon, iconWrap, title, subtitle }) {
  return (
    <div className="mb-5 flex items-center gap-2.5">
      <span
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${iconWrap}`}>
        {icon}
      </span>
      <div className="flex min-h-8 flex-col justify-center">
        <h2 className="text-base font-bold leading-tight text-[#134e97]">{title}</h2>
        {subtitle ? <p className="mt-0.5 text-xs leading-snug text-slate-500">{subtitle}</p> : null}
      </div>
    </div>
  );
}

function PasswordInput({ id, value, onChange, autoComplete }) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <input
        id={id}
        type={show ? "text" : "password"}
        autoComplete={autoComplete}
        value={value}
        onChange={onChange}
        className={`${INPUT} pr-10`}
      />
      <button
        type="button"
        tabIndex={-1}
        onClick={() => setShow((s) => !s)}
        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-[#134e97]"
        aria-label={show ? "Hide password" : "Show password"}>
        {show ? <EyeOff className="h-4 w-4" strokeWidth={2} /> : <Eye className="h-4 w-4" strokeWidth={2} />}
      </button>
    </div>
  );
}

export default function PatientProfile() {
  const navigate = useNavigate();
  const [token] = useState(() => localStorage.getItem("token"));
  const [saving, setSaving] = useState(false);
  const [photoSaving, setPhotoSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [err, setErr] = useState(null);

  // inline field errors: { name: 'msg', phone: 'msg', ... }
  const [fieldErrors, setFieldErrors] = useState({});

  const [data, setData] = useState({
    name: "",
    email: "",
    profileImage: "",
    phone: "",
    dob: "",
    age: "",
    gender: "",
    bloodGroup: "",
    emergencyContact: { name: "", phone: "", relationship: "" },
    medicalHistory: {
      allergies: "",
      currentMedications: "",
      chronicConditions: "",
    },
    createdAt: "",
  });

  const [preview, setPreview] = useState(null);
  const fileRef = useRef(null);

  const [pwdCurrent, setPwdCurrent] = useState("");
  const [pwdNew, setPwdNew] = useState("");
  const [pwdConfirm, setPwdConfirm] = useState("");
  const [pwdErr, setPwdErr] = useState(null);
  const [pwdSaving, setPwdSaving] = useState(false);

  // Compute profile completion percentage dynamically
  const completionPercentage = useMemo(() => {
    let filledCount = 0;
    if (data.name?.trim()) filledCount++;
    if (data.phone?.trim()) filledCount++;
    if (data.dob) filledCount++;
    if (data.age !== undefined && data.age !== null && String(data.age).trim() !== "") filledCount++;
    if (data.gender) filledCount++;
    if (data.bloodGroup) filledCount++;

    if (data.emergencyContact?.name?.trim()) filledCount++;
    if (data.emergencyContact?.phone?.trim()) filledCount++;
    if (data.emergencyContact?.relationship) filledCount++;

    const med = data.medicalHistory;
    const hasMed = med?.allergies?.trim() || med?.currentMedications?.trim() || med?.chronicConditions?.trim();

    const total = 10;
    const filled = filledCount + (hasMed ? 1 : 0);
    return Math.round((filled / total) * 100);
  }, [data]);

  /* Redirect guard */
  useEffect(() => {
    if (!token) navigate("/login", { replace: true });
  }, [token, navigate]);

  /* Load profile data */
  useEffect(() => {
    if (!token) return;
    (async () => {
      try {
        setErr(null);
        const res = await fetch(`${BACKEND}/api/patient/me`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.status === 401) {
          navigate("/login", { replace: true });
          return;
        }
        const json = await res.json();
        const p = json?.data || {};
        setData({
          name: p.name || "",
          email: p.email || "",
          profileImage: p.profileImage || "",
          phone: p.phone || "",
          dob: p.dob ? new Date(p.dob).toISOString().slice(0, 10) : "",
          age: p.age !== undefined && p.age !== null ? String(p.age) : "",
          gender: p.gender || "",
          bloodGroup: p.bloodGroup || "",
          emergencyContact: {
            name: p.emergencyContact?.name || "",
            phone: p.emergencyContact?.phone || "",
            relationship: p.emergencyContact?.relationship || "",
          },
          medicalHistory: {
            allergies: p.medicalHistory?.allergies || "",
            currentMedications: p.medicalHistory?.currentMedications || "",
            chronicConditions: p.medicalHistory?.chronicConditions || "",
          },
          createdAt: p.createdAt || "",
        });
        setLoaded(true);
      } catch (e) {
        setErr(e.message || "Failed to load profile");
        setLoaded(true);
      }
    })();
  }, [token, navigate]);

  /* Cleanup preview URL */
  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  const imageUrl = useMemo(() => {
    if (preview) return preview;
    return getImageUrl(data.profileImage, data.name);
  }, [data.profileImage, data.name, preview]);

  function setField(key, val) {
    setData((d) => ({ ...d, [key]: val }));
    // Clear related field error as user types
    setFieldErrors((fe) => ({ ...fe, [key]: undefined }));
  }
  function setEC(key, val) {
    setData((d) => ({
      ...d,
      emergencyContact: { ...d.emergencyContact, [key]: val },
    }));
  }
  function setMH(key, val) {
    setData((d) => ({
      ...d,
      medicalHistory: { ...d.medicalHistory, [key]: val },
    }));
  }

  // Client-side required-fields check (name + phone + age)
  function validateRequired() {
    const errs = {};
    if (!data.name || String(data.name).trim() === "") {
      errs.name = "Please enter your full name";
    }
    if (!data.phone || String(data.phone).trim() === "") {
      errs.phone = "Please enter your mobile number";
    }
    if (data.age === undefined || data.age === null || String(data.age).trim() === "") {
      errs.age = "Please enter your age";
    }
    // optional: simple phone pattern (very permissive)
    // if (data.phone && !/^\+?\d[\d\s-]{6,}$/.test(data.phone)) {
    //   errs.phone = "Enter a valid phone number";
    // }
    setFieldErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function saveProfile(e) {
    e.preventDefault();
    setErr(null);

    // client-side required validation first
    if (!validateRequired()) {
      // Do not show Swal; inline errors will show
      return;
    }

    setSaving(true);
    setFieldErrors({}); // clear previous
    try {
      const res = await fetch(`${BACKEND}/api/patient/profile`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(data),
      });

      if (!res.ok) {
        // parse server response for friendly messages
        let j;
        try {
          j = await res.json();
        } catch (parseErr) {
          throw new Error("Failed to save profile");
        }

        // If backend returned missingFields, map to inline errors (no Swal)
        if (j?.missingFields && Array.isArray(j.missingFields) && j.missingFields.length > 0) {
          const fe = {};
          for (const k of j.missingFields) {
            if (k === "name") fe.name = "Please enter your full name";
            else if (k === "phone") fe.phone = "Please enter your mobile number";
            else if (k === "age") fe.age = "Please enter your age";
            else fe[k] = "Required";
          }
          setFieldErrors(fe);
          setSaving(false);
          return; // don't show Swal
        }

        // If express-validator returned errors array
        if (j?.errors && Array.isArray(j.errors) && j.errors.length > 0) {
          const fe = {};
          // j.errors might be an array of { field, message } or strings
          for (const item of j.errors) {
            if (typeof item === "string") {
              // generic - show top-level toast
              // fallback to show Swal
            } else if (item.field && item.message) {
              fe[item.field] = item.message;
            } else if (item.param && item.msg) {
              fe[item.param] = item.msg;
            }
          }
          if (Object.keys(fe).length > 0) {
            setFieldErrors(fe);
            setSaving(false);
            return;
          }
        }

        // fallback: show a Swal for unexpected errors
        const msg = j?.message || "Failed to save profile";
        throw new Error(msg);
      }

      const saved = await res.json();
      const doc = saved?.data;
      if (doc) {
        setData((prev) => ({
          ...prev,
          name: doc.name ?? prev.name,
          email: doc.email ?? prev.email,
          profileImage: doc.profileImage ?? prev.profileImage,
          phone: doc.phone ?? prev.phone,
          dob: doc.dob ? new Date(doc.dob).toISOString().slice(0, 10) : prev.dob,
          age: doc.age !== undefined && doc.age !== null ? String(doc.age) : prev.age,
          gender: doc.gender ?? prev.gender,
          bloodGroup: doc.bloodGroup ?? prev.bloodGroup,
          emergencyContact: {
            name: doc.emergencyContact?.name ?? prev.emergencyContact.name,
            phone: doc.emergencyContact?.phone ?? prev.emergencyContact.phone,
            relationship:
              doc.emergencyContact?.relationship ?? prev.emergencyContact.relationship,
          },
          medicalHistory: {
            allergies: doc.medicalHistory?.allergies ?? prev.medicalHistory.allergies,
            currentMedications:
              doc.medicalHistory?.currentMedications ?? prev.medicalHistory.currentMedications,
            chronicConditions:
              doc.medicalHistory?.chronicConditions ?? prev.medicalHistory.chronicConditions,
          },
          createdAt: doc.createdAt || prev.createdAt,
        }));
        setPreview(null);
        patchStoredUser({
          name: doc.name,
          profileImage: doc.profileImage,
        });
      }

      await Swal.fire({
        icon: "success",
        title: "Profile updated",
        text: "Profile updated successfully.",
        showConfirmButton: false,
        timer: 1400,
        allowOutsideClick: false,
      });

      setTimeout(() => navigate("/patient/dashboard"), 100);
    } catch (e) {
      setErr(e.message);
      // Only show Swal for unexpected server-side failures (not validation)
      await Swal.fire({
        icon: "error",
        title: "Unable to save",
        text: e.message || "Failed to save profile",
      });
    } finally {
      setSaving(false);
    }
  }

  async function changePassword() {
    setPwdErr(null);
    if (!pwdCurrent) {
      setPwdErr("Enter your current password.");
      return;
    }
    if (pwdNew.length < 8) {
      setPwdErr("New password must be at least 8 characters.");
      return;
    }
    if (pwdNew !== pwdConfirm) {
      setPwdErr("New password and confirmation do not match.");
      return;
    }
    setPwdSaving(true);
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
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j.success) {
        setPwdErr(j.message || "Could not update password.");
        return;
      }
      await Swal.fire({
        icon: "success",
        title: "Password updated",
        text: "Use your new password the next time you sign in.",
        timer: 2000,
        showConfirmButton: false,
      });
      setPwdCurrent("");
      setPwdNew("");
      setPwdConfirm("");
    } catch {
      setPwdErr("Could not reach server. Try again.");
    } finally {
      setPwdSaving(false);
    }
  }

  async function uploadPhoto(f) {
    if (!f) return;
    setErr(null);
    setPhotoSaving(true);
    try {
      const toSend = await shrinkImageForAvatar(f);
      setPreview(URL.createObjectURL(toSend));

      const form = new FormData();
      form.append("profileImage", toSend);
      const res = await fetch(`${BACKEND}/api/patient/profile/avatar`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });

      if (!res.ok) {
        let j;
        try { j = await res.json(); } catch { }
        // check missingFields from backend
        if (j?.missingFields && Array.isArray(j.missingFields) && j.missingFields.length > 0) {
          const fe = {};
          for (const k of j.missingFields) {
            if (k === "name") fe.name = "Please enter your full name";
            else if (k === "phone") fe.phone = "Please enter your mobile number";
            else fe[k] = "Required";
          }
          setFieldErrors(fe);
          return;
        }
        const msg = (j && (j.message || (Array.isArray(j.errors) ? j.errors.join(", ") : null))) || "Failed to upload photo";
        throw new Error(msg);
      }

      const json = await res.json();
      setData((d) => ({
        ...d,
        profileImage: json?.data?.profileImage || d.profileImage,
      }));
      const img = json?.data?.profileImage;
      if (img) {
        patchStoredUser({
          profileImage: img,
          name: json?.data?.name ?? data.name,
        });
      }
      await Swal.fire({
        icon: "success",
        title: "Photo updated",
        timer: 1200,
        showConfirmButton: false,
      });
    } catch (e) {
      setErr(e.message || "Failed to upload");
      await Swal.fire({
        icon: "error",
        title: "Upload failed",
        text: e.message || "Failed to upload photo",
      });
    } finally {
      setPhotoSaving(false);
      setPreview(null);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function handlePhotoChange(e) {
    const f = e.target.files?.[0];
    if (!f) return;
    if (!f.type.startsWith("image/")) {
      await Swal.fire({
        icon: "error",
        title: "Invalid file",
        text: "Please choose a valid image file.",
      });
      if (fileRef.current) fileRef.current.value = "";
      return;
    }
    const maxBytes = 2 * 1024 * 1024;
    if (f.size > maxBytes) {
      await Swal.fire({
        icon: "error",
        title: "File too large",
        text: "Please choose an image under 2MB.",
      });
      if (fileRef.current) fileRef.current.value = "";
      return;
    }
    await uploadPhoto(f);
  }

  if (!loaded) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F5F7FF]">
        <p className="text-sm text-[#134e97]/60">Loading…</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F5F7FF]">
      <Header />

      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
        <PageBackButton className="mb-5" onClick={() => navigate(-1)} />

        {err ? (
          <div
            className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700"
            role="alert">
            {err}
          </div>
        ) : null}

        <form
          onSubmit={saveProfile}
          className="overflow-hidden rounded-2xl border-2 border-[#134e97]/30 bg-white shadow-md">
          {/* Card header */}
          <div className="px-6 py-6 sm:px-8">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h1 className="text-xl font-bold text-[#134e97] sm:text-2xl">Edit Profile</h1>
                <p className="mt-1 text-sm text-slate-500">
                  Update your personal, emergency, and medical information.
                </p>
              </div>

              {/* Progress Bar Indicator */}
              <div className="shrink-0 flex flex-col w-full sm:w-64 space-y-1.5 p-3.5 rounded-2xl bg-[#06adc6]/8 border border-[#06adc6]/25">
                <div className="flex justify-between text-xs font-bold text-[#134e97]">
                  <span>Profile Completion</span>
                  <span>{completionPercentage}%</span>
                </div>
                <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500 ease-out"
                    style={{
                      width: `${completionPercentage}%`,
                      backgroundColor: completionPercentage === 100 ? "#10b981" : "#06adc6",
                    }}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Premium percentage line */}
          <div className="relative h-2 w-full bg-slate-100">
            <div
              className="h-full transition-all duration-700 ease-out"
              style={{
                width: `${completionPercentage}%`,
                backgroundImage: "linear-gradient(to right, #06adc6, #134e97)",
              }}
            />
          </div>

          {/* Single border around all form fields + actions */}
          <div className="mx-4 mb-4 overflow-hidden rounded-xl  sm:mx-6 sm:mb-6">
            {/* Personal information */}
            <div className="border-b border-[#134e97]/10 px-5 py-6 sm:px-7">
              <div className="mb-6 flex items-center gap-4 rounded-xl border border-slate-100 bg-slate-50/50 p-4">
                <div className="relative shrink-0">
                  <img
                    key={data.profileImage || "avatar"}
                    src={imageUrl}
                    alt=""
                    className="h-16 w-16 rounded-full object-cover ring-2 ring-white shadow-sm"
                  />
                  <label
                    htmlFor="photo-input"
                    className={`absolute -bottom-0.5 -right-0.5 flex h-7 w-7 cursor-pointer items-center justify-center rounded-full bg-[#134e97] text-white shadow ring-2 ring-white ${photoSaving ? "pointer-events-none opacity-70" : "hover:bg-[#013473]"}`}
                    aria-label="Change profile photo">
                    {photoSaving ? (
                      <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                    ) : (
                      <Camera className="h-3.5 w-3.5" />
                    )}
                  </label>
                  <input
                    id="photo-input"
                    ref={fileRef}
                    type="file"
                    accept="image/*"
                    disabled={photoSaving}
                    className="hidden"
                    onChange={handlePhotoChange}
                  />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-[#134e97]">{data.name || "Your name"}</p>
                  <p className="truncate text-xs text-slate-500">{data.email}</p>
                  {data.createdAt ? (
                    <p className="mt-1 text-xs text-slate-400">
                      Member since{" "}
                      {new Date(data.createdAt).toLocaleDateString(undefined, {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                      })}
                    </p>
                  ) : null}
                </div>
              </div>

              <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                <FormField label="Full Name" required error={fieldErrors.name}>
                  <input
                    value={data.name}
                    onChange={(e) => setField("name", e.target.value)}
                    className={`${INPUT} ${fieldErrors.name ? INPUT_ERROR : ""}`}
                  />
                </FormField>

                <FormField label="Email">
                  <input value={data.email} readOnly className={INPUT_READONLY} />
                </FormField>

                <FormField label="Phone" required error={fieldErrors.phone}>
                  <input
                    value={data.phone}
                    onChange={(e) => setField("phone", e.target.value)}
                    placeholder="Enter phone number"
                    className={`${INPUT} ${fieldErrors.phone ? INPUT_ERROR : ""}`}
                  />
                </FormField>

                <FormField label="Date of Birth">
                  <div className="relative">
                    <input
                      type="date"
                      value={data.dob}
                      onChange={(e) => {
                        const val = e.target.value;
                        setField("dob", val);
                        if (val) {
                          const calculated = calculateAgeInFrontend(val);
                          if (calculated !== "") {
                            setField("age", calculated);
                          }
                        }
                      }}
                      className={`${INPUT} pr-10 [color-scheme:light]`}
                    />
                    <Calendar
                      className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
                      strokeWidth={2}
                    />
                  </div>
                </FormField>

                <div className="md:col-span-2 grid grid-cols-1 md:grid-cols-3 gap-5">
                  <FormField label="Gender">
                    <select
                      value={data.gender}
                      onChange={(e) => setField("gender", e.target.value)}
                      className={INPUT}>
                      <option value="">Select gender</option>
                      <option value="male">Male</option>
                      <option value="female">Female</option>
                      <option value="other">Other</option>
                    </select>
                  </FormField>

                  <FormField label="Blood Group">
                    <select
                      value={data.bloodGroup}
                      onChange={(e) => setField("bloodGroup", e.target.value)}
                      className={INPUT}>
                      <option value="">Select blood group</option>
                      {["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"].map((bg) => (
                        <option key={bg} value={bg}>
                          {bg}
                        </option>
                      ))}
                    </select>
                  </FormField>

                  <FormField label="Age" required error={fieldErrors.age}>
                    <input
                      type="number"
                      min="0"
                      max="120"
                      placeholder="Enter age"
                      value={data.age}
                      onChange={(e) => setField("age", e.target.value)}
                      className={`${INPUT} ${fieldErrors.age ? INPUT_ERROR : ""}`}
                    />
                  </FormField>
                </div>
              </div>
            </div>

            {/* Change password */}
            <div className="border-b border-[#134e97]/10 px-5 py-6 sm:px-7">
              <SectionHeading
                icon={<Lock className="h-4 w-4" strokeWidth={2.5} />}
                iconWrap="bg-[#06adc6]/12 text-[#134e97]"
                title="Change Password"
                subtitle="Leave unchanged if you only want to update your profile below."
              />
              {pwdErr ? (
                <p className="mb-4 text-sm text-rose-600" role="alert">
                  {pwdErr}
                </p>
              ) : null}
              <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
                <FormField label="Current password">
                  <PasswordInput
                    id="pwd-current"
                    autoComplete="current-password"
                    value={pwdCurrent}
                    onChange={(e) => {
                      setPwdCurrent(e.target.value);
                      setPwdErr(null);
                    }}
                  />
                </FormField>
                <FormField label="New password">
                  <PasswordInput
                    id="pwd-new"
                    autoComplete="new-password"
                    value={pwdNew}
                    onChange={(e) => {
                      setPwdNew(e.target.value);
                      setPwdErr(null);
                    }}
                  />
                </FormField>
                <FormField label="Confirm new password">
                  <PasswordInput
                    id="pwd-confirm"
                    autoComplete="new-password"
                    value={pwdConfirm}
                    onChange={(e) => {
                      setPwdConfirm(e.target.value);
                      setPwdErr(null);
                    }}
                  />
                </FormField>
              </div>
              <div className="mt-5 flex justify-end">
                <button
                  type="button"
                  onClick={changePassword}
                  disabled={pwdSaving}
                  className="inline-flex items-center gap-2 rounded-lg border-2 border-[#134e97]/30 bg-white px-5 py-2.5 text-sm font-semibold text-[#134e97] transition hover:border-[#134e97]/50 hover:bg-[#134e97]/5 disabled:opacity-60">
                  <Lock className="h-4 w-4" strokeWidth={2} />
                  {pwdSaving ? "Updating…" : "Update Password"}
                </button>
              </div>
            </div>

            {/* Emergency contact */}
            <div className="border-b border-[#134e97]/10 px-5 py-6 sm:px-7">
              <SectionHeading
                icon={<Phone className="h-4 w-4" strokeWidth={2.5} />}
                iconWrap="bg-emerald-50 text-emerald-600"
                title="Emergency Contact"
              />
              <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
                <FormField label="Name">
                  <input
                    placeholder="Enter name"
                    value={data.emergencyContact.name}
                    onChange={(e) => setEC("name", e.target.value)}
                    className={INPUT}
                  />
                </FormField>
                <FormField label="Phone">
                  <input
                    placeholder="Enter phone number"
                    value={data.emergencyContact.phone}
                    onChange={(e) => setEC("phone", e.target.value)}
                    className={INPUT}
                  />
                </FormField>
                <FormField label="Relationship">
                  <select
                    value={data.emergencyContact.relationship}
                    onChange={(e) => setEC("relationship", e.target.value)}
                    className={INPUT}>
                    <option value="">Select relationship</option>
                    <option value="spouse">Spouse</option>
                    <option value="parent">Parent</option>
                    <option value="child">Child</option>
                    <option value="sibling">Sibling</option>
                    <option value="friend">Friend</option>
                    <option value="relative">Relative</option>
                    <option value="other">Other</option>
                  </select>
                </FormField>
              </div>
            </div>

            {/* Medical information */}
            <div className="border-b border-[#134e97]/10 px-5 py-6 sm:px-7">
              <SectionHeading
                icon={<Heart className="h-4 w-4" strokeWidth={2.5} />}
                iconWrap="bg-rose-50 text-rose-500"
                title="Medical Information"
              />
              <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
                <FormField label="Allergies">
                  <textarea
                    rows={4}
                    placeholder="Enter allergies"
                    value={data.medicalHistory.allergies}
                    onChange={(e) => setMH("allergies", e.target.value)}
                    className={`${INPUT} min-h-[100px] resize-y`}
                  />
                </FormField>
                <FormField label="Current Medications">
                  <textarea
                    rows={4}
                    placeholder="Enter current medications"
                    value={data.medicalHistory.currentMedications}
                    onChange={(e) => setMH("currentMedications", e.target.value)}
                    className={`${INPUT} min-h-[100px] resize-y`}
                  />
                </FormField>
                <FormField label="Chronic Conditions">
                  <textarea
                    rows={4}
                    placeholder="Enter chronic conditions"
                    value={data.medicalHistory.chronicConditions}
                    onChange={(e) => setMH("chronicConditions", e.target.value)}
                    className={`${INPUT} min-h-[100px] resize-y`}
                  />
                </FormField>
              </div>
            </div>

            {/* Footer actions */}
            <div className="flex flex-col-reverse items-stretch justify-end gap-3 bg-slate-50/40 px-5 py-5 sm:flex-row sm:items-center sm:gap-3 sm:px-7">
              <Link to="/patient/dashboard">
                <button
                  type="button"
                  className="w-full rounded-lg border border-slate-300 bg-white px-6 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 sm:w-auto">
                  Cancel
                </button>
              </Link>
              <button
                type="submit"
                disabled={saving}
                className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[#134e97] px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#013473] disabled:opacity-60 sm:w-auto">
                <Check className="h-4 w-4" strokeWidth={2.5} />
                {saving ? "Saving…" : "Save Changes"}
              </button>
            </div>
          </div>
        </form>
      </main>

      <Footer />
    </div>
  );
}
