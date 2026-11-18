import React, { useEffect, useMemo, useState, useRef } from "react";
import { Link } from "react-router-dom";
import Swal from "sweetalert2";
import "sweetalert2/dist/sweetalert2.min.css";
import Footer from "@/components/HomePage/Footer";

const BACKEND = import.meta.env.VITE_BACKEND_URL || "http://localhost:8000";

function unwrapData(json) {
  return json?.data ?? json?.result ?? json;
}

function isSuperAdminRole(role) {
  const r = String(role || "").toLowerCase();
  return r === "super_admin" || r === "superadmin" || r === "super-admin";
}
function isAdminRole(role) {
  return String(role || "").toLowerCase() === "admin";
}

const PATIENT_BLOCK_THRESHOLDS = {
  cancel: 3,
  reschedule: 3,
  noShow: 3,
};

function isPatientEffectivelyBlocked(p) {
  if (p?.isBlocked) return true;
  const cancelCount = Number(p?.cancelCount ?? 0);
  const rescheduleCount = Number(p?.rescheduleCount ?? 0);
  const noShowCount = Number(p?.noShowCount ?? 0);
  return (
    cancelCount >= PATIENT_BLOCK_THRESHOLDS.cancel ||
    rescheduleCount >= PATIENT_BLOCK_THRESHOLDS.reschedule ||
    noShowCount >= PATIENT_BLOCK_THRESHOLDS.noShow
  );
}

function getImageUrl(path, fallbackName = "User") {
  const p = typeof path === "string" ? path.trim() : "";
  if (!p) {
    const label = String(fallbackName || "User").trim() || "User";
    const initials = label
      .split(/\s+/)
      .filter(Boolean)
      .map((w) => w[0])
      .join("")
      .toUpperCase()
      .slice(0, 2) || "U";
    return `https://ui-avatars.com/api/?name=${encodeURIComponent(
      initials
    )}&background=134e97&color=fff&size=400&bold=true`;
  }
  if (/^https?:\/\//i.test(p)) return p;
  if (p.startsWith("//")) return `https:${p}`;
  const normalized = p.startsWith("/") ? p : `/${p}`;
  return `${BACKEND}${normalized}`;
}

class PageErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  componentDidCatch(error, info) {
    console.error("🧯 React render error", error, info);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 12, fontFamily: "system-ui" }}>
          <h2>Something went wrong.</h2>
          <pre style={{ whiteSpace: "pre-wrap" }}>
            {String(this.state.error)}
          </pre>
        </div>
      );
    }
    return this.props.children;
  }
}

async function confirmCentered({
  title = "Are you sure?",
  text = "",
  confirmText = "Yes",
  icon = "question",
}) {
  const res = await Swal.fire({
    title,
    text,
    icon,
    showCancelButton: true,
    confirmButtonText: confirmText,
    cancelButtonText: "Cancel",
    focusCancel: true,
    position: "center",
    allowOutsideClick: false,
    customClass: { popup: "rounded-3xl" },
  });
  return res.isConfirmed;
}

function toastSuccessCentered(title = "Done", text = "") {
  return Swal.fire({
    title,
    text,
    icon: "success",
    position: "center",
    showConfirmButton: false,
    timer: 1400,
    customClass: { popup: "rounded-3xl" },
  });
}
function toastErrorCentered(title = "Error", text = "") {
  return Swal.fire({
    title,
    text,
    icon: "error",
    position: "center",
    showConfirmButton: true,
    customClass: { popup: "rounded-3xl" },
  });
}
function showInfoCentered(title = "", text = "") {
  return Swal.fire({
    title,
    text,
    icon: "info",
    position: "center",
    showConfirmButton: true,
    customClass: { popup: "rounded-3xl" },
  });
}

export default function AdminUsersPage() {
  const [roleFilter, setRoleFilter] = useState("admin");
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10); // 10, 25, 50, 100, 'all'
  const [search, setSearch] = useState("");
  const [error, setError] = useState(null);
  const [totalPages, setTotalPages] = useState(null);
  const searchRef = useRef(null);
  const [token, setToken] = useState(null);
  const [currentUserRole, setCurrentUserRole] = useState(null);
  const [currentUserId, setCurrentUserId] = useState(null);
  const [modalPassword, setModalPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const searchDebounce = useRef(null);

  useEffect(() => {
    const tk = localStorage.getItem("token");
    setToken(tk || null);
    if (tk) {
      try {
        const payload = JSON.parse(
          atob((tk.split(".")[1] || "").replace(/-/g, "+").replace(/_/g, "/"))
        );
        setCurrentUserRole(
          payload.type ?? payload.role ?? payload.userType ?? null
        );
        setCurrentUserId(payload.id ?? payload._id ?? null);
      } catch {
        setCurrentUserRole(null);
        setCurrentUserId(null);
      }
    }
  }, []);

  useEffect(() => {
    if (!token) return;
    fetchUsers();
  }, [roleFilter, page, itemsPerPage, token]);

  useEffect(() => {
    return () => {
      if (searchDebounce.current) {
        clearTimeout(searchDebounce.current);
        searchDebounce.current = null;
      }
    };
  }, []);

  function listEndpoint() {
    if (roleFilter === "doctor") return `${BACKEND}/api/admin/doctors`;
    if (roleFilter === "admin") return `${BACKEND}/api/admin/admins`;
    if (roleFilter === "receptionist")
      return `${BACKEND}/api/admin/receptionists`;
    if (roleFilter === "patient") return `${BACKEND}/api/admin/patients`;
    return `${BACKEND}/api/admin/users`;
  }

  async function fetchUsers() {
    if (!token) {
      setError("Not authenticated. Please log in again.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const base = listEndpoint();
      const q = new URLSearchParams();
      q.set("page", String(page));
      q.set("limit", String(itemsPerPage === 'all' ? 1000 : itemsPerPage));
      if (search) q.set("search", search);

      const url = `${base}?${q.toString()}`;

      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        throw new Error(`HTTP ${res.status}: ${txt || "Request failed"}`);
      }
      const json = await res.json();

      let list = [];
      let pagination = null;

      if (json?.status === "success" && json?.data) {
        if (roleFilter === "doctor") {
          list = json.data.doctors ?? [];
        } else if (roleFilter === "admin") {
          list = json.data.admins ?? json.data.staff ?? [];
        } else if (roleFilter === "receptionist") {
          list = json.data.receptionists ?? json.data.staff ?? [];
        } else if (roleFilter === "patient") {
          list = json.data.patients ?? [];
        } else {
          list = json.data.users ?? json.data.staff ?? [];
        }
        pagination =
          json.data.pagination ??
          (json.data.meta
            ? {
                total: json.data.meta.total,
                page: json.data.meta.page,
                limit: json.data.meta.limit,
                totalPages: json.data.meta.pages,
              }
            : null) ??
          json.pagination ??
          null;
      } else if (Array.isArray(json)) {
        list = json;
      } else if (json?.staff) {
        list = json.staff;
        pagination = json.pagination ?? null;
      } else {
        list = json?.data ?? [];
      }

      if (!Array.isArray(list)) list = [];

      const normalized = list.map((it) => {
        const raw = it;
        const rawProfile = it.profileImage ?? it.avatar ?? "";
        return {
          _id:
            it._id ??
            it.id ??
            (it._doc && it._doc._id) ??
            Math.random().toString(36).slice(2),
          name: it.name ?? it.fullName ?? "—",
          email: it.email ?? "",
          role:
            it.role ??
            it.userType ??
            (roleFilter === "doctor" ? "doctor" : roleFilter),
          isActive:
            roleFilter === "patient"
              ? !isPatientEffectivelyBlocked(it)
              : typeof it.isActive === "boolean"
                ? it.isActive
                : it.active ?? true,
          profileImage: rawProfile,
          phone: it.phone ?? "",
          createdAt: it.createdAt ?? it.created_at ?? null,
          raw,
        };
      });

      let finalList = normalized;
      try {
        if (roleFilter === "admin" || roleFilter === "super_admin") {
          finalList = normalized.filter((u) => {
            const roleVal =
              (u.raw && (u.raw.role ?? u.raw.userType)) ?? u.role ?? "";
            return !isSuperAdminRole(roleVal);
          });
        }
      } catch (e) {
        console.warn("Filtering super_admin failed", e);
        finalList = normalized;
      }

      setUsers(finalList);
      if (itemsPerPage === 'all') {
        setTotalPages(1);
      } else if (pagination) {
        const total = pagination.total ?? finalList.length;
        const pLimit = Number(itemsPerPage);
        setTotalPages(
          pagination.totalPages ?? Math.max(1, Math.ceil(total / pLimit))
        );
        setPage(pagination.page ?? page);
      } else {
        setTotalPages(Math.max(1, Math.ceil(finalList.length / Number(itemsPerPage))));
      }
    } catch (err) {
      console.error("Fetch users error", err);
      setError(err.message || "Error fetching users");
    } finally {
      setLoading(false);
    }
  }

  function adminActionUrl(id, action) {
    if (action === "toggle")
      return `${BACKEND}/api/admin/admins/${id}/toggle-status`;
    if (!action) return `${BACKEND}/api/admin/admins/${id}`;
    return `${BACKEND}/api/admin/admins/${id}`;
  }
  function receptionistActionUrl(id, action) {
    if (action === "toggle")
      return `${BACKEND}/api/admin/receptionists/${id}/toggle-status`;
    if (!action) return `${BACKEND}/api/admin/receptionists/${id}`;
    return `${BACKEND}/api/admin/receptionists/${id}`;
  }
  function doctorActionUrl(id, action) {
    if (action) return `${BACKEND}/api/admin/doctors/${id}/${action}`;
    return `${BACKEND}/api/admin/doctors/${id}`;
  }
  function patientActionUrl(id, action) {
    return `${BACKEND}/api/admin/patients/${id}/${action}`;
  }

  function isProtectedAccount(target) {
    const role = target.role ?? target.raw?.role ?? target.raw?.userType;
    return isSuperAdminRole(role);
  }

  function actionBlockedForAdminTarget(target) {
    const tId = target?._id ? String(target._id) : "";
    const meId = currentUserId ? String(currentUserId) : "";
    return (
      isAdminRole(target?.role) &&
      currentUserRole !== "super_admin" &&
      tId !== meId
    );
  }

  const isSelf = (u) => String(u?._id || "") === String(currentUserId || "");

  async function toggleActive(user) {
    if (isProtectedAccount(user)) {
      await showInfoCentered(
        "Action blocked",
        "Cannot modify a super admin account."
      );
      return;
    }
    if (actionBlockedForAdminTarget(user)) {
      await showInfoCentered(
        "Access denied",
        "Only Super Admin can modify Admin accounts."
      );
      return;
    }

    const isPatient = user.role === "patient" || roleFilter === "patient";
    const confirmMsg = isPatient
      ? user.isActive
        ? `Block ${user.name}?`
        : `Unblock ${user.name}?`
      : user.isActive
        ? `Suspend ${user.name}?`
        : `Activate ${user.name}?`;
    const ok = await confirmCentered({
      title: confirmMsg,
      text: isPatient
        ? user.isActive
          ? "Blocked patients cannot book appointments online."
          : "This will unblock the patient and reset violation counts."
        : "This action can be reverted.",
      confirmText: isPatient
        ? user.isActive
          ? "Block"
          : "Unblock"
        : user.isActive
          ? "Suspend"
          : "Activate",
      icon: "warning",
    });
    if (!ok) return;

    try {
      let res;
      if (isPatient) {
        if (user.isActive) {
          const { value: reason } = await Swal.fire({
            title: "Enter block reason",
            input: "textarea",
            inputPlaceholder: "Reason for blocking…",
            showCancelButton: true,
            confirmButtonText: "Save Reason & Block",
            confirmButtonColor: "#4f46e5",
            cancelButtonColor: "#64748b",
            customClass: { popup: "rounded-3xl" },
          });
          if (reason === undefined) return;

          res = await fetch(patientActionUrl(user._id, "block"), {
            method: "PATCH",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ reason: reason || "" }),
          });
        } else {
          res = await fetch(patientActionUrl(user._id, "unblock"), {
            method: "PATCH",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ resetCounts: true }),
          });
        }
      } else if (user.role === "admin") {
        res = await fetch(adminActionUrl(user._id, "toggle"), {
          method: "PATCH",
          headers: { Authorization: `Bearer ${token}` },
        });
      } else if (user.role === "receptionist" || user.role === "call_center") {
        res = await fetch(receptionistActionUrl(user._id, "toggle"), {
          method: "PATCH",
          headers: { Authorization: `Bearer ${token}` },
        });
      } else if (user.role === "doctor") {
        const action = user.isActive ? "suspend" : "activate";
        res = await fetch(doctorActionUrl(user._id, action), {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            reason: user.isActive ? "Suspended by admin" : "Activated by admin",
          }),
        });
      } else {
        const url = `${BACKEND}/api/admin/users/${user._id
          }/status?role=${encodeURIComponent(user.role ?? "")}`;
        res = await fetch(url, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ isActive: !user.isActive, role: user.role }),
        });
      }

      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        throw new Error(txt || "Failed to update status");
      }

      if (isPatient) {
        await fetchUsers();
      } else {
        setUsers((prev) =>
          prev.map((u) =>
            u._id === user._id ? { ...u, isActive: !u.isActive } : u
          )
        );
      }
      await toastSuccessCentered(
        "Success",
        isPatient
          ? `${user.name} has been ${user.isActive ? "blocked" : "unblocked"}.`
          : `${user.name} is now ${user.isActive ? "suspended" : "active"}.`
      );
    } catch (err) {
      console.error("toggleActive error", err);
      await toastErrorCentered(
        "Operation failed",
        err?.message || "Could not update status"
      );
    }
  }

  async function deleteUser(user) {
    if (isProtectedAccount(user)) {
      await showInfoCentered(
        "Action blocked",
        "Cannot delete a super admin account."
      );
      return;
    }
    if (actionBlockedForAdminTarget(user)) {
      await showInfoCentered(
        "Access denied",
        "Only Super Admin can delete Admin accounts."
      );
      return;
    }
    if (isSelf(user)) {
      await showInfoCentered(
        "Not allowed",
        "You cannot delete your own account."
      );
      return;
    }

    const ok = await confirmCentered({
      title: `Delete ${user.name}?`,
      text: "This will permanently remove the user and cannot be undone.",
      confirmText: "Delete",
      icon: "warning",
    });
    if (!ok) return;

    try {
      let res;
      if (user.role === "admin") {
        res = await fetch(adminActionUrl(user._id), {
          method: "DELETE",
          headers: { Authorization: `Bearer ${token}` },
        });
      } else if (user.role === "receptionist" || user.role === "call_center") {
        res = await fetch(receptionistActionUrl(user._id), {
          method: "DELETE",
          headers: { Authorization: `Bearer ${token}` },
        });
      } else if (user.role === "doctor") {
        res = await fetch(doctorActionUrl(user._id), {
          method: "DELETE",
          headers: { Authorization: `Bearer ${token}` },
        });
      } else {
        res = await fetch(
          `${BACKEND}/api/admin/users/${user._id}?role=${encodeURIComponent(
            user.role ?? ""
          )}`,
          {
            method: "DELETE",
            headers: { Authorization: `Bearer ${token}` },
          }
        );
      }

      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        throw new Error(txt || "Failed to delete user");
      }

      setUsers((prev) => prev.filter((u) => u._id !== user._id));
      await toastSuccessCentered("Deleted", `${user.name} has been deleted.`);
    } catch (err) {
      console.error("deleteUser error", err);
      await toastErrorCentered(
        "Delete failed",
        err?.message || "Could not delete user"
      );
    }
  }

  async function triggerChangePassword(user, customPassword = null) {
    if (isProtectedAccount(user)) {
      await showInfoCentered(
        "Action blocked",
        "Cannot modify a super admin account."
      );
      return false;
    }
    if (actionBlockedForAdminTarget(user)) {
      await showInfoCentered(
        "Access denied",
        "Only Super Admin can modify Admin accounts."
      );
      return false;
    }

    let newPassword = customPassword;
    if (!newPassword) {
      const { value: typedPassword } = await Swal.fire({
        title: `Change Password for ${user.name}`,
        input: "password",
        inputPlaceholder: "Enter new password (min. 6 chars)",
        showCancelButton: true,
        confirmButtonText: "Update",
        confirmButtonColor: "#4f46e5",
        inputValidator: (value) => {
          if (!value || value.length < 6) {
            return "Password must be at least 6 characters long!";
          }
        },
        customClass: { popup: "rounded-3xl" },
      });
      if (!typedPassword) return false;
      newPassword = typedPassword;
    }

    if (newPassword.length < 6) {
      await toastErrorCentered(
        "Validation Error",
        "Password must be at least 6 characters long!"
      );
      return false;
    }

    try {
      const res = await fetch(`${BACKEND}/api/admin/users/${user._id}/change-password`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          newPassword,
          role: user.role,
        }),
      });

      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        throw new Error(txt || "Failed to update password");
      }

      await toastSuccessCentered("Updated", `Password for ${user.name} has been updated.`);
      return true;
    } catch (err) {
      console.error("triggerChangePassword error", err);
      await toastErrorCentered(
        "Update failed",
        err?.message || "Could not update password"
      );
      return false;
    }
  }

  const [doctorImageFile, setDoctorImageFile] = useState(null);
  const [doctorImagePreview, setDoctorImagePreview] = useState(null);
  const [showAddDoctor, setShowAddDoctor] = useState(false);
  const [creating, setCreating] = useState(false);
  const [doctorForm, setDoctorForm] = useState({
    name: "",
    email: "",
    specialization: "",
    qualification: "",
    experience: "",
    fees: "",
    about: "",
  });
  const requiredDoctorFields = ["name", "email", "specialization", "fees"];

  function handleDoctorField(key, value) {
    setDoctorForm((prev) => ({ ...prev, [key]: value }));
  }

  useEffect(() => {
    return () => {
      if (doctorImagePreview) URL.revokeObjectURL(doctorImagePreview);
    };
  }, [doctorImagePreview]);

  async function submitAddDoctor() {
    for (const f of requiredDoctorFields) {
      const v = doctorForm[f];
      if (!v || String(v).trim() === "") {
        await showInfoCentered("Missing field", `Please enter ${f}`);
        return;
      }
    }

    setCreating(true);
    try {
      const payload = {
        name: doctorForm.name,
        email: doctorForm.email,
        specialization: doctorForm.specialization,
        qualification: doctorForm.qualification || "",
        experience: Number(doctorForm.experience || 0),
        fees: Number(doctorForm.fees || 0),
        about: doctorForm.about || "",
      };

      const formData = new FormData();
      Object.keys(payload).forEach((key) => {
        const value = payload[key];
        if (typeof value === "object")
          formData.append(key, JSON.stringify(value));
        else formData.append(key, String(value ?? ""));
      });
      if (doctorImageFile) formData.append("profileImage", doctorImageFile);

      const res = await fetch(`${BACKEND}/api/admin/doctors/create`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        throw new Error(txt || "Failed to create doctor");
      }

      const json = await res.json();
      const created = unwrapData(json);

      const newItem = {
        _id: created._id ?? Math.random().toString(36).slice(2),
        name: created.name ?? doctorForm.name,
        email: created.email ?? doctorForm.email,
        role: "doctor",
        isActive: !!created.isActive,
        profileImage: created.profileImage ?? "",
        phone: created.phone ?? "",
        createdAt: created.createdAt ?? new Date().toISOString(),
        raw: created,
      };

      setUsers((prev) => [newItem, ...prev]);
      setShowAddDoctor(false);
      setDoctorForm({
        name: "",
        email: "",
        specialization: "",
        qualification: "",
        experience: "",
        fees: "",
        about: "",
      });
      if (doctorImagePreview) {
        URL.revokeObjectURL(doctorImagePreview);
        setDoctorImagePreview(null);
      }
      setDoctorImageFile(null);

      await toastSuccessCentered(
        "Doctor created",
        `${newItem.name} added successfully.`
      );
    } catch (err) {
      console.error("Create doctor error", err);
      await toastErrorCentered(
        "Create failed",
        err?.message || "Could not create doctor"
      );
    } finally {
      setCreating(false);
    }
  }

  const [editImageFile, setEditImageFile] = useState(null);
  const [editImagePreview, setEditImagePreview] = useState(null);
  const [showEditDoctor, setShowEditDoctor] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({
    name: "",
    email: "",
    specialization: "",
    qualification: "",
    experience: "",
    fees: "",
    about: "",
    profileImage: "",
  });

  useEffect(() => {
    return () => {
      if (editImagePreview) URL.revokeObjectURL(editImagePreview);
    };
  }, [editImagePreview]);

  function handleEditField(key, value) {
    setEditForm((prev) => ({ ...prev, [key]: value }));
  }

  function openEditDoctor(user) {
    setModalPassword("");
    setShowPassword(false);
    const src = user.raw ?? user;
    if (editImagePreview) {
      URL.revokeObjectURL(editImagePreview);
      setEditImagePreview(null);
      setEditImageFile(null);
    }
    setEditingId(user._id);
    setEditForm({
      name: src.name ?? "",
      email: src.email ?? "",
      specialization: src.specialization ?? "",
      qualification: src.qualification ?? "",
      experience: (src.experience ?? "") + "",
      fees: (src.fees ?? "") + "",
      about: src.about ?? "",
      profileImage: src.profileImage ?? "",
    });
    setShowEditDoctor(true);
  }

  async function submitEditDoctor() {
    if (!editingId) {
      await showInfoCentered("No doctor", "No doctor selected for edit.");
      return;
    }
    for (const f of ["name", "specialization", "fees"]) {
      const v = editForm[f];
      if (!v || String(v).trim() === "") {
        await showInfoCentered("Missing field", `Please enter ${f}`);
        return;
      }
    }

    setEditing(true);
    try {
      const payload = {
        name: editForm.name,
        specialization: editForm.specialization,
        qualification: editForm.qualification || "",
        experience: Number(editForm.experience || 0),
        fees: Number(editForm.fees || 0),
        about: editForm.about || "",
      };

      const formData = new FormData();
      Object.keys(payload).forEach((key) => {
        const value = payload[key];
        if (typeof value === "object")
          formData.append(key, JSON.stringify(value));
        else formData.append(key, String(value ?? ""));
      });
      if (editImageFile) formData.append("profileImage", editImageFile);

      const res = await fetch(`${BACKEND}/api/admin/doctors/${editingId}`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        throw new Error(txt || "Failed to update doctor");
      }

      const json = await res.json();
      const updated = unwrapData(json);

      const normalized = {
        _id: updated._id ?? editingId,
        name: updated.name ?? editForm.name,
        email: updated.email ?? editForm.email,
        role: "doctor",
        isActive: !!updated.isActive,
        profileImage: updated.profileImage ?? editForm.profileImage ?? "",
        phone: updated.phone ?? "",
        createdAt: updated.createdAt ?? null,
        raw: updated,
      };
      setUsers((prev) =>
        prev.map((u) => (u._id === normalized._id ? normalized : u))
      );

      setShowEditDoctor(false);
      setEditingId(null);
      if (editImagePreview) {
        URL.revokeObjectURL(editImagePreview);
        setEditImagePreview(null);
        setEditImageFile(null);
      }

      await toastSuccessCentered("Saved", "Doctor updated successfully.");
    } catch (err) {
      console.error("Edit doctor error", err);
      await toastErrorCentered(
        "Save failed",
        err?.message || "Could not update doctor"
      );
    } finally {
      setEditing(false);
    }
  }

  function handleDoctorImage(file) {
    if (doctorImagePreview) {
      try {
        URL.revokeObjectURL(doctorImagePreview);
      } catch { }
    }
    if (!file) {
      setDoctorImageFile(null);
      setDoctorImagePreview(null);
      return;
    }
    setDoctorImageFile(file);
    setDoctorImagePreview(URL.createObjectURL(file));
  }

  function handleEditImage(file) {
    if (editImagePreview) {
      try {
        URL.revokeObjectURL(editImagePreview);
      } catch { }
    }
    if (!file) {
      setEditImageFile(null);
      setEditImagePreview(null);
      return;
    }
    setEditImageFile(file);
    setEditImagePreview(URL.createObjectURL(file));
  }

  const [staffImageFile, setStaffImageFile] = useState(null);
  const [staffImagePreview, setStaffImagePreview] = useState(null);
  const [showAddStaff, setShowAddStaff] = useState(false);
  const [creatingStaff, setCreatingStaff] = useState(false);
  const [staffForm, setStaffForm] = useState({
    name: "",
    email: "",
    role: "admin",
  });
  const [editStaffImageFile, setEditStaffImageFile] = useState(null);
  const [editStaffImagePreview, setEditStaffImagePreview] = useState(null);
  const [showEditStaff, setShowEditStaff] = useState(false);
  const [editingStaffId, setEditingStaffId] = useState(null);
  const [editingStaff, setEditingStaff] = useState(false);
  const [editStaffForm, setEditStaffForm] = useState({
    name: "",
    email: "",
    role: "",
    profileImage: "",
  });

  function handleStaffField(key, value) {
    setStaffForm((prev) => ({ ...prev, [key]: value }));
  }
  function handleEditStaffField(key, value) {
    setEditStaffForm((prev) => ({ ...prev, [key]: value }));
  }
  function handleStaffImage(file) {
    if (staffImagePreview)
      try {
        URL.revokeObjectURL(staffImagePreview);
      } catch { }
    if (!file) {
      setStaffImageFile(null);
      setStaffImagePreview(null);
      return;
    }
    setStaffImageFile(file);
    setStaffImagePreview(URL.createObjectURL(file));
  }
  function handleEditStaffImage(file) {
    if (editStaffImagePreview)
      try {
        URL.revokeObjectURL(editStaffImagePreview);
      } catch { }
    if (!file) {
      setEditStaffImageFile(null);
      setEditStaffImagePreview(null);
      return;
    }
    setEditStaffImageFile(file);
    setEditStaffImagePreview(URL.createObjectURL(file));
  }

  async function submitAddStaff() {
    if (!staffForm.name || !staffForm.email) {
      await showInfoCentered("Missing fields", "Please enter name and email");
      return;
    }
    setCreatingStaff(true);
    try {
      const formData = new FormData();
      formData.append("name", staffForm.name);
      formData.append("email", staffForm.email);
      formData.append("role", staffForm.role);
      if (staffImageFile) formData.append("profileImage", staffImageFile);

      const endpoint =
        staffForm.role === "admin"
          ? `${BACKEND}/api/admin/admins/create`
          : `${BACKEND}/api/admin/receptionists/create`;

      const res = await fetch(endpoint, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        throw new Error(txt || "Failed to create staff");
      }
      const json = await res.json();
      const created = unwrapData(json);

      const item = {
        _id: created._id ?? Math.random().toString(36).slice(2),
        name: created.name ?? staffForm.name,
        email: created.email ?? staffForm.email,
        role: created.role ?? staffForm.role ?? "staff",
        isActive: !!created.isActive,
        profileImage: created.profileImage ?? "",
        raw: created,
      };
      setUsers((prev) => [item, ...prev]);
      setShowAddStaff(false);
      setStaffForm({ name: "", email: "", role: "admin" });
      if (staffImagePreview) {
        URL.revokeObjectURL(staffImagePreview);
        setStaffImagePreview(null);
      }
      setStaffImageFile(null);

      await toastSuccessCentered(
        "Created",
        `${item.name} created successfully.`
      );
    } catch (err) {
      console.error("Create staff error", err);
      await toastErrorCentered(
        "Create failed",
        err?.message || "Could not create staff"
      );
    } finally {
      setCreatingStaff(false);
    }
  }

  function openEditStaff(u) {
    if (!u) return;
    setModalPassword("");
    setShowPassword(false);

    if (u.role === "admin" && currentUserRole !== "super_admin") {
      if (u._id !== currentUserId) {
        showInfoCentered(
          "Restricted",
          "Only Super Admin can edit other Admin accounts."
        );
        return;
      }
    }

    const src = u.raw ?? u;
    if (editStaffImagePreview) {
      URL.revokeObjectURL(editStaffImagePreview);
      setEditStaffImagePreview(null);
      setEditStaffImageFile(null);
    }
    setEditingStaffId(u._id);
    setEditStaffForm({
      name: src.name ?? "",
      email: src.email ?? "",
      role: src.role ?? src.userType ?? u.role ?? "",
      profileImage: src.profileImage ?? "",
    });
    setShowEditStaff(true);
  }

  async function submitEditStaff() {
    if (!editingStaffId) {
      await showInfoCentered(
        "No staff selected",
        "Please pick a staff to edit."
      );
      return;
    }
    setEditingStaff(true);

    try {
      const formData = new FormData();
      formData.append("name", editStaffForm.name);
      if (editStaffImageFile)
        formData.append("profileImage", editStaffImageFile);

      const role = (editStaffForm.role || "").toLowerCase();

      const candidateEndpoints =
        role === "admin"
          ? [
            `${BACKEND}/api/admin/admins/${editingStaffId}`,
            `${BACKEND}/api/admin/users/${editingStaffId}?role=admin`,
          ]
          : [
            `${BACKEND}/api/admin/receptionists/${editingStaffId}`,
            `${BACKEND}/api/admin/users/${editingStaffId}?role=receptionist`,
          ];

      const candidateMethods = ["PUT", "PATCH"];

      let lastErrTxt = "Unknown error";
      let ok = false,
        json = null;

      for (const url of candidateEndpoints) {
        for (const method of candidateMethods) {
          try {
            const res = await fetch(url, {
              method,
              headers: { Authorization: `Bearer ${token}` },
              body: formData,
            });

            if (res.ok) {
              json = await res.json();
              ok = true;
              break;
            } else {
              const txt = await res.text();
              lastErrTxt = `${res.status} ${res.statusText} — ${txt || url}`;
              if (res.status === 404) break;
              if (res.status === 405) continue;
            }
          } catch (e) {
            lastErrTxt = e?.message || String(e);
          }
        }
        if (ok) break;
      }

      if (!ok) throw new Error(lastErrTxt);

      const updated = unwrapData(json);
      const normalized = {
        _id: updated._id ?? editingStaffId,
        name: updated.name ?? editStaffForm.name,
        email: updated.email ?? editStaffForm.email,
        role: updated.role ?? editStaffForm.role,
        isActive:
          typeof updated.isActive === "boolean" ? updated.isActive : true,
        profileImage: updated.profileImage ?? editStaffForm.profileImage ?? "",
        raw: updated,
      };

      setUsers((prev) =>
        prev.map((u) => (u._id === normalized._id ? normalized : u))
      );
      setShowEditStaff(false);
      setEditingStaffId(null);
      if (editStaffImagePreview) {
        URL.revokeObjectURL(editStaffImagePreview);
        setEditStaffImagePreview(null);
        setEditStaffImageFile(null);
      }

      await toastSuccessCentered("Saved", "Staff updated successfully.");
    } catch (err) {
      console.error("Edit staff error", err);
      await toastErrorCentered(
        "Update failed",
        err?.message || "Could not update staff"
      );
    } finally {
      setEditingStaff(false);
    }
  }

  const [adminImageFile, setAdminImageFile] = useState(null);
  const [adminImagePreview, setAdminImagePreview] = useState(null);
  const [showAddAdmin, setShowAddAdmin] = useState(false);
  const [creatingAdmin, setCreatingAdmin] = useState(false);
  const [adminForm, setAdminForm] = useState({
    name: "",
    email: "",
    role: "admin",
  });
  const [receptionistImageFile, setReceptionistImageFile] = useState(null);
  const [receptionistImagePreview, setReceptionistImagePreview] =
    useState(null);
  const [showAddReceptionist, setShowAddReceptionist] = useState(false);
  const [creatingReceptionist, setCreatingReceptionist] = useState(false);
  const [receptionistForm, setReceptionistForm] = useState({
    name: "",
    email: "",
    role: "receptionist",
  });
  const [showAddPatient, setShowAddPatient] = useState(false);
  const [creatingPatient, setCreatingPatient] = useState(false);
  const [patientForm, setPatientForm] = useState({
    name: "",
    email: "",
    phone: "",
    age: "",
  });

  function handleAdminField(key, value) {
    setAdminForm((prev) => ({ ...prev, [key]: value }));
  }
  function handleReceptionistField(key, value) {
    setReceptionistForm((prev) => ({ ...prev, [key]: value }));
  }
  function handlePatientField(key, value) {
    setPatientForm((prev) => ({ ...prev, [key]: value }));
  }

  function handleAdminImage(file) {
    if (adminImagePreview)
      try {
        URL.revokeObjectURL(adminImagePreview);
      } catch { }
    if (!file) {
      setAdminImageFile(null);
      setAdminImagePreview(null);
      return;
    }
    setAdminImageFile(file);
    setAdminImagePreview(URL.createObjectURL(file));
  }
  function handleReceptionistImage(file) {
    if (receptionistImagePreview)
      try {
        URL.revokeObjectURL(receptionistImagePreview);
      } catch { }
    if (!file) {
      setReceptionistImageFile(null);
      setReceptionistImagePreview(null);
      return;
    }
    setReceptionistImageFile(file);
    setReceptionistImagePreview(URL.createObjectURL(file));
  }

  async function submitAddRole(
    role,
    form,
    imageFile,
    setCreatingFlag,
    onClose
  ) {
    if (!form.name || !form.email) {
      await showInfoCentered("Missing fields", "Please enter name and email");
      return;
    }
    setCreatingFlag(true);
    try {
      const formData = new FormData();
      formData.append("name", form.name);
      formData.append("email", form.email);
      formData.append("role", role);
      if (imageFile) formData.append("profileImage", imageFile);

      const endpoint =
        role === "admin"
          ? `${BACKEND}/api/admin/admins/create`
          : `${BACKEND}/api/admin/receptionists/create`;

      const res = await fetch(endpoint, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        throw new Error(txt || "Failed to create staff");
      }
      const json = await res.json();
      const created = unwrapData(json);

      const item = {
        _id: created._id ?? Math.random().toString(36).slice(2),
        name: created.name ?? form.name,
        email: created.email ?? form.email,
        role: created.role ?? role,
        isActive: !!created.isActive,
        profileImage: created.profileImage ?? "",
        raw: created,
      };
      setUsers((prev) => [item, ...prev]);
      onClose();

      if (role === "admin") {
        if (adminImagePreview) {
          URL.revokeObjectURL(adminImagePreview);
          setAdminImagePreview(null);
        }
        setAdminImageFile(null);
        setAdminForm({ name: "", email: "", role: "admin" });
      } else {
        if (receptionistImagePreview) {
          URL.revokeObjectURL(receptionistImagePreview);
          setReceptionistImagePreview(null);
        }
        setReceptionistImageFile(null);
        setReceptionistForm({ name: "", email: "", role: "receptionist" });
      }

      await toastSuccessCentered(
        "Created",
        `${item.name} (${role}) created successfully.`
      );
    } catch (err) {
      console.error("Create role error", err);
      await toastErrorCentered(
        "Creation failed",
        err?.message || "Could not create staff"
      );
    } finally {
      setCreatingFlag(false);
    }
  }

  function submitAddAdmin() {
    if (currentUserRole !== "super_admin") {
      showInfoCentered("Restricted", "Only Super Admin can add Admins.");
      return;
    }
    submitAddRole("admin", adminForm, adminImageFile, setCreatingAdmin, () =>
      setShowAddAdmin(false)
    );
  }
  function submitAddReceptionist() {
    submitAddRole(
      receptionistForm.role || "receptionist",
      receptionistForm,
      receptionistImageFile,
      setCreatingReceptionist,
      () => setShowAddReceptionist(false)
    );
  }

  async function submitAddPatient() {
    const { name, email, phone, age } = patientForm;

    if (!String(name || "").trim()) {
      await showInfoCentered("Missing field", "Patient name is required.");
      return;
    }

    if (!String(age || "").trim()) {
      await showInfoCentered("Missing field", "Patient age is required.");
      return;
    }

    const ageNum = Number(age);
    if (!Number.isFinite(ageNum) || ageNum < 0 || ageNum > 150) {
      await showInfoCentered(
        "Invalid age",
        "Please enter a valid age between 0 and 150."
      );
      return;
    }

    const phoneDigits = String(phone || "").replace(/\D/g, "");
    if (phoneDigits.length !== 10) {
      await showInfoCentered(
        "Invalid mobile number",
        "Please enter a valid 10-digit mobile number."
      );
      return;
    }

    const emailTrimmed = String(email || "").trim();
    if (emailTrimmed) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(emailTrimmed)) {
        await showInfoCentered(
          "Invalid email",
          "Please provide a valid email address."
        );
        return;
      }
    }

    setCreatingPatient(true);
    try {
      const res = await fetch(`${BACKEND}/api/receptionist/patients`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: String(name).trim(),
          phone: phoneDigits,
          age: ageNum,
          ...(emailTrimmed ? { email: emailTrimmed } : {}),
        }),
      });

      const json = await res.json().catch(() => ({}));

      if (json.status === "warning") {
        await showInfoCentered("Duplicate detected", json.message || "Patient already exists.");
        return;
      }

      if (!res.ok || json.status === "error") {
        throw new Error(json.message || "Failed to create patient");
      }

      setShowAddPatient(false);
      setPatientForm({ name: "", email: "", phone: "", age: "" });
      await fetchUsers();
      await toastSuccessCentered("Added", "Patient registered successfully.");
    } catch (err) {
      console.error("submitAddPatient error", err);
      await toastErrorCentered(
        "Create failed",
        err?.message || "Could not create patient"
      );
    } finally {
      setCreatingPatient(false);
    }
  }

  return (
    <PageErrorBoundary>
      <>
        <div className="min-h-screen flex flex-col bg-gradient-to-br from-slate-50 via-indigo-50/20 to-sky-50/30 overflow-x-hidden">
          <header className="sticky top-0 z-40 bg-gradient-to-r from-[var(--color-gradient-start)] to-[var(--color-gradient-end)] shadow-md shadow-indigo-900/10 backdrop-blur-md">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3.5">
              <div className="flex items-center justify-between gap-3">
                <Link
                  to="/admin/dashboard"
                  className="inline-flex items-center gap-2 px-3.5 py-1.5 text-xs sm:text-sm font-semibold rounded-full bg-white/10 text-white hover:bg-white/20 border border-white/15 hover:scale-102 active:scale-95 transition-all duration-200">
                  <svg
                    viewBox="0 0 24 24"
                    className="w-4 h-4"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5">
                    <path d="M15 19l-7-7 7-7" />
                  </svg>
                  <span className="hidden sm:inline">Back</span>
                </Link>

                {/* CENTER: Title */}
                <div className="flex flex-col items-center flex-1 text-center px-1 min-w-0">
                  <h1 className="text-lg sm:text-2xl font-bold text-white tracking-tight truncate font-heading">
                    Manage Users
                  </h1>
                </div>

                {/* RIGHT: Buttons */}
                <div className="flex items-center gap-2">
                  <Link
                    to="/admin/appointments"
                    className="inline-flex items-center gap-2 px-3.5 py-1.5 text-xs sm:text-sm font-semibold rounded-full bg-white/10 text-white hover:bg-white/20 border border-white/15 hover:scale-102 active:scale-95 transition-all duration-200">
                    <svg
                      viewBox="0 0 24 24"
                      className="w-4 h-4"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5">
                      <path d="M7 3v4M17 3v4M3 9h18M5 12h14M5 16h10" />
                      <rect x="3" y="5" width="18" height="16" rx="2" />
                    </svg>
                    <span className="hidden sm:inline">Appointments</span>
                  </Link>
                </div>
              </div>
            </div>
          </header>

          {/* Page Main Content */}
          <main className="flex-1">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">

              {/* Search & Filters Glass Card */}
              <div className="rounded-3xl border border-slate-200/50 bg-white/90 backdrop-blur-xl shadow-md shadow-slate-100/50 p-4 sm:p-5 md:p-6 mb-6 transition-all duration-200">
                <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">

                  {/* Search bar inside constrained width */}
                  <div className="relative flex-1 min-w-0 md:max-w-md w-full">
                    <input
                      ref={searchRef}
                      value={search}
                      onChange={(e) => {
                        const v = e.target.value;
                        setSearch(v);
                        setPage(1);

                        if (searchDebounce.current)
                          clearTimeout(searchDebounce.current);
                        searchDebounce.current = setTimeout(() => {
                          if (token) fetchUsers();
                        }, 400);
                      }}
                      placeholder={
                        roleFilter === "patient"
                          ? "Search by name, email or phone..."
                          : "Search by name or email..."
                      }
                      className="w-full h-10 pl-10 pr-4 rounded-2xl bg-slate-50/50 border border-slate-200/80 text-slate-800 text-sm placeholder:text-slate-400 focus:outline-none focus:bg-white focus:ring-2 focus:ring-[var(--color-accent)]/30 focus:border-[var(--color-accent)] shadow-inner transition-all duration-200"
                    />
                    <svg
                      viewBox="0 0 24 24"
                      className="w-4.5 h-4.5 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5">
                      <circle cx="11" cy="11" r="7" />
                      <path d="M21 21l-4.3-4.3" />
                    </svg>
                  </div>

                  {/* Role filter Capsule Design */}
                  <div className="inline-flex flex-wrap items-center gap-1 bg-slate-100/80 border border-slate-200/60 rounded-full p-1 backdrop-blur-sm self-start md:self-auto">
                    {["admin", "doctor", "receptionist", "patient"].map((role) => (
                      <button
                        key={role}
                        onClick={() => {
                          setRoleFilter(role);
                          setPage(1);
                        }}
                        className={`px-4.5 py-2 text-xs sm:text-sm font-semibold rounded-full transition-all duration-200 ${roleFilter === role
                          ? "bg-gradient-to-r from-[var(--color-gradient-start)] to-[var(--color-gradient-end)] text-white shadow-sm shadow-indigo-900/10 scale-102"
                          : "text-slate-600 hover:text-slate-900 hover:bg-slate-200/50"
                          }`}>
                        <span className="whitespace-nowrap">
                          {role === "admin"
                            ? "Admins"
                            : role === "doctor"
                              ? "Doctors"
                              : role === "patient"
                                ? "Patients"
                                : "Reception Staff"}
                        </span>
                      </button>
                    ))}
                  </div>

                  {/* Per page select */}
                  <div className="flex items-center gap-1.5 shrink-0 self-start md:self-auto">
                    <label htmlFor="usersPerPageSelect" className="text-xs font-semibold text-slate-500">
                      Show:
                    </label>
                    <select
                      id="usersPerPageSelect"
                      value={itemsPerPage}
                      onChange={(e) => {
                        const val = e.target.value === "all" ? "all" : Number(e.target.value);
                        setItemsPerPage(val);
                        setPage(1);
                      }}
                      className="px-3 py-1.5 bg-white border border-slate-200 rounded-full text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/30 focus:border-[var(--color-accent)] transition-all cursor-pointer shadow-sm"
                    >
                      <option value={10}>10 per page</option>
                      <option value={25}>25 per page</option>
                      <option value={50}>50 per page</option>
                      <option value={100}>100 per page</option>
                      <option value="all">All entries</option>
                    </select>
                  </div>

                  {/* Add User Actions */}
                  <div className="flex items-center gap-2 flex-wrap">
                    {/* Admin */}
                    {roleFilter === "admin" && (
                      <div className="relative group">
                        <button
                          onClick={() => {
                            if (currentUserRole === "super_admin")
                              setShowAddAdmin(true);
                          }}
                          disabled={currentUserRole !== "super_admin"}
                          className={`inline-flex items-center gap-2 px-4 py-2 rounded-full font-bold shadow-sm text-xs sm:text-sm transition-all duration-200 active:scale-95 ${currentUserRole === "super_admin"
                            ? "bg-gradient-to-r from-[var(--color-accent)] to-[var(--color-gradient-start)] hover:from-[var(--color-accent-light)] hover:to-[var(--color-gradient-end)] text-white hover:shadow-md hover:shadow-cyan-100/50 cursor-pointer"
                            : "bg-slate-100 border border-slate-200 text-slate-400 cursor-not-allowed shadow-none"
                            }`}>
                          <svg
                            viewBox="0 0 24 24"
                            className="w-4 h-4"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2.5">
                            <path d="M15 14c2.7 0 5 1.3 5 3v2H10v-2c0-1.7 2.3-3 5-3z" />
                            <circle cx="15" cy="8" r="4" />
                            <path d="M4 8h6M7 5v6" />
                          </svg>
                          <span className="whitespace-nowrap">
                            Add Admin
                          </span>
                        </button>
                        {currentUserRole !== "super_admin" && (
                          <div className="absolute bottom-full mb-2 right-0 hidden group-hover:block bg-slate-800 text-white text-[10px] px-2 py-1 rounded-md shadow-md whitespace-nowrap z-10 pointer-events-none">
                            Only Super Admin can add Admins
                          </div>
                        )}
                      </div>
                    )}

                    {/* Doctor */}
                    {roleFilter === "doctor" &&
                      (currentUserRole === "admin" ||
                        currentUserRole === "super_admin") && (
                        <button
                          onClick={() => setShowAddDoctor(true)}
                          className="inline-flex items-center gap-2 px-4 py-2 rounded-full font-bold bg-gradient-to-r from-[var(--color-accent)] to-[var(--color-gradient-start)] hover:from-[var(--color-accent-light)] hover:to-[var(--color-gradient-end)] text-white hover:shadow-md hover:shadow-cyan-100/50 active:scale-95 transition-all duration-200 text-xs sm:text-sm cursor-pointer">
                          <svg
                            viewBox="0 0 24 24"
                            className="w-4 h-4"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2.5">
                            <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
                            <circle cx="12" cy="7" r="4" />
                            <path d="M12 11v3M10 12h4" />
                          </svg>
                          <span className="whitespace-nowrap">
                            Add Doctor
                          </span>
                        </button>
                      )}

                    {/* Reception Staff */}
                    {roleFilter === "receptionist" &&
                      (currentUserRole === "admin" ||
                        currentUserRole === "super_admin") && (
                        <button
                          onClick={() => setShowAddReceptionist(true)}
                          className="inline-flex items-center gap-2 px-4 py-2 rounded-full font-bold bg-gradient-to-r from-[var(--color-accent)] to-[var(--color-gradient-start)] hover:from-[var(--color-accent-light)] hover:to-[var(--color-gradient-end)] text-white hover:shadow-md hover:shadow-cyan-100/50 active:scale-95 transition-all duration-200 text-xs sm:text-sm cursor-pointer">
                          <svg
                            viewBox="0 0 24 24"
                            className="w-4 h-4"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2.5">
                            <path d="M15 14c2.7 0 5 1.3 5 3v2H10v-2c0-1.7 2.3-3 5-3z" />
                            <circle cx="15" cy="8" r="4" />
                            <path d="M4 8h6M7 5v6" />
                          </svg>
                          <span className="whitespace-nowrap">
                            Add Reception Staff
                          </span>
                        </button>
                      )}

                    {/* Patient */}
                    {roleFilter === "patient" &&
                      (currentUserRole === "admin" ||
                        currentUserRole === "super_admin") && (
                        <button
                          onClick={() => setShowAddPatient(true)}
                          className="inline-flex items-center gap-2 px-4 py-2 rounded-full font-bold bg-gradient-to-r from-[var(--color-accent)] to-[var(--color-gradient-start)] hover:from-[var(--color-accent-light)] hover:to-[var(--color-gradient-end)] text-white hover:shadow-md hover:shadow-cyan-100/50 active:scale-95 transition-all duration-200 text-xs sm:text-sm cursor-pointer">
                          <svg
                            viewBox="0 0 24 24"
                            className="w-4 h-4"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2.5">
                            <path d="M15 14c2.7 0 5 1.3 5 3v2H10v-2c0-1.7 2.3-3 5-3z" />
                            <circle cx="15" cy="8" r="4" />
                            <path d="M4 8h6M7 5v6" />
                          </svg>
                          <span className="whitespace-nowrap">Add Patient</span>
                        </button>
                      )}
                  </div>
                </div>
              </div>

              {/* Table / list */}
              <div className="rounded-3xl border border-slate-200/50 bg-white/90 backdrop-blur-xl shadow-md shadow-slate-100/40 overflow-hidden">
                {loading ? (
                  <div className="text-center text-slate-600 py-10 text-sm">
                    Loading…
                  </div>
                ) : error ? (
                  <div className="text-rose-600 px-4 py-4 text-sm">{error}</div>
                ) : users.length === 0 ? (
                  <div className="text-slate-600 px-4 py-10 text-sm">
                    No users found.
                  </div>
                ) : (
                  <>
                    {/* Desktop/table view - visible on sm and up */}
                    <div className="hidden lg:block">
                      <table className="w-full table-fixed text-left text-[12px] sm:text-sm">
                        <thead className="bg-slate-50/60 border-b border-slate-200/80">
                          <tr className="text-slate-500">
                            <th className="w-[25%] py-3 px-3 sm:py-3.5 sm:px-4 text-[11px] font-semibold uppercase tracking-wider">
                              Name
                            </th>
                            <th className="w-[25%] py-3 px-3 sm:py-3.5 sm:px-4 text-[11px] font-semibold uppercase tracking-wider">
                              Email
                            </th>
                            <th className="w-[13%] py-3 px-3 sm:py-3.5 sm:px-4 text-[11px] font-semibold uppercase tracking-wider">
                              Status
                            </th>
                            <th className="w-[12%] py-3 px-3 sm:py-3.5 sm:px-4 text-[11px] font-semibold uppercase tracking-wider">
                              Created
                            </th>
                            <th className="w-[25%] py-3 px-3 sm:py-3.5 sm:px-4 text-[11px] font-semibold uppercase tracking-wider">
                              Actions
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {users.map((u) => {
                            const protectedAccount = isProtectedAccount(u);
                            const adminTargetBlocked =
                              actionBlockedForAdminTarget(u);
                            const selfRow = isSelf(u);
                            return (
                              <tr
                                key={u._id}
                                className="border-t border-slate-200/50 hover:bg-slate-50/40 transition-all duration-200">
                                <td className="py-3 px-3 sm:py-3.5 sm:px-4 align-top">
                                  <div className="flex items-center gap-3 min-w-0">
                                    <img
                                      src={getImageUrl(u.profileImage, u.name)}
                                      alt="avatar"
                                      className="w-10 h-10 rounded-full object-cover ring-2 ring-white shadow flex-shrink-0"
                                    />
                                    <div className="min-w-0 flex-1">
                                      <div className="flex items-center gap-2 min-w-0 flex-wrap">
                                        <span className="text-slate-900 font-medium text-[13px] sm:text-sm truncate">
                                          {u.name || "—"}
                                        </span>
                                        {protectedAccount && (
                                          <span className="text-[10px] bg-amber-50 text-amber-800 px-1.5 py-0.5 rounded-full border border-amber-200 font-semibold tracking-wider uppercase flex-shrink-0">
                                            SUPER ADMIN
                                          </span>
                                        )}
                                        {(u.role === "call_center" || u.raw?.userType === "call_center") && (
                                          <span className="text-[10px] bg-cyan-50 text-[#06adc6] px-1.5 py-0.5 rounded-full border border-cyan-200 font-semibold tracking-wider flex-shrink-0">
                                            Call Center
                                          </span>
                                        )}
                                        {(u.role === "receptionist" || u.raw?.userType === "receptionist") && roleFilter === "receptionist" && (
                                          <span className="text-[10px] bg-emerald-50 text-emerald-700 px-1.5 py-0.5 rounded-full border border-emerald-200 font-semibold tracking-wider flex-shrink-0">
                                            Receptionist
                                          </span>
                                        )}
                                      </div>
                                      <div className="text-[11px] text-slate-500 truncate">
                                        {u.phone || ""}
                                      </div>
                                    </div>
                                  </div>
                                </td>

                                <td className="py-3 px-3 sm:py-3.5 sm:px-4 text-slate-700 text-[12px] truncate">
                                  {u.email}
                                </td>

                                <td className="py-3 px-3 sm:py-3.5 sm:px-4">
                                  {u.isActive ? (
                                    <span className="inline-flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200/80 shadow-sm font-medium">
                                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                      Active
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-full bg-rose-50 text-rose-700 border border-rose-200/80 shadow-sm font-medium">
                                      <span className="w-1.5 h-1.5 rounded-full bg-rose-400" />
                                      {roleFilter === "patient" ? "Blocked" : "Suspended"}
                                    </span>
                                  )}
                                </td>

                                <td className="py-3 px-3 sm:py-3.5 sm:px-4 text-slate-700 text-[12px]">
                                  {u.createdAt
                                    ? new Date(u.createdAt).toLocaleDateString()
                                    : ""}
                                </td>

                                <td className="py-3 px-3 sm:py-3.5 sm:px-4">
                                  <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
                                    <div className="relative group">
                                      <button
                                        onClick={() => {
                                          if (
                                            protectedAccount ||
                                            adminTargetBlocked ||
                                            selfRow
                                          )
                                            return;
                                          toggleActive(u);
                                        }}
                                        className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full border text-xs font-semibold shadow-sm transition-all duration-200 active:scale-95 ${protectedAccount ||
                                          adminTargetBlocked ||
                                          selfRow
                                          ? "opacity-40 cursor-not-allowed border-slate-200 bg-slate-50 text-slate-400"
                                          : "border-slate-200 bg-slate-50/50 hover:bg-slate-100/80 hover:border-slate-300 text-slate-700 hover:shadow"
                                          } whitespace-nowrap`}
                                        disabled={
                                          protectedAccount ||
                                          adminTargetBlocked ||
                                          selfRow
                                        }
                                        aria-disabled={
                                          protectedAccount ||
                                          adminTargetBlocked ||
                                          selfRow
                                        }>
                                        <svg
                                          viewBox="0 0 24 24"
                                          className="w-3.5 h-3.5"
                                          fill="none"
                                          stroke="currentColor"
                                          strokeWidth="2.5">
                                          <path d="M12 3v6" />
                                          <path d="M6.7 6.7a7 7 0 1 0 10.6 0" />
                                        </svg>
                                        <span className="hidden sm:inline">
                                          {roleFilter === "patient"
                                            ? u.isActive
                                              ? "Block"
                                              : "Unblock"
                                            : u.isActive
                                              ? "Suspend"
                                              : "Activate"}
                                        </span>
                                      </button>

                                      {adminTargetBlocked && (
                                        <div className="absolute top-full mt-1 left-1/2 -translate-x-1/2 hidden group-hover:flex items-center whitespace-nowrap w-max bg-slate-800 text-white text-[11px] px-2 py-1 rounded-md shadow-lg pointer-events-none">
                                          Only Super Admin can modify
                                        </div>
                                      )}
                                    </div>

                                    {roleFilter !== "patient" && (
                                    <>
                                    <div className="relative group">
                                      <button
                                        onClick={() => {
                                          if (protectedAccount) {
                                            showInfoCentered(
                                              "Action blocked",
                                              "Editing super_admin accounts is not allowed."
                                            );
                                            return;
                                          }
                                          if (adminTargetBlocked) {
                                            showInfoCentered(
                                              "Restricted",
                                              "Only Super Admin can edit this account."
                                            );
                                            return;
                                          }
                                          if (u.role === "doctor")
                                            openEditDoctor(u);
                                          else openEditStaff(u);
                                        }}
                                        className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full border text-xs font-semibold shadow-sm transition-all duration-200 active:scale-95 ${protectedAccount || adminTargetBlocked
                                          ? "opacity-40 cursor-not-allowed border-slate-100 bg-slate-50 text-slate-400"
                                          : "border-indigo-100 bg-indigo-50/40 hover:bg-indigo-100/80 hover:border-indigo-200 text-indigo-600 hover:shadow"
                                          } whitespace-nowrap`}
                                        disabled={
                                          protectedAccount || adminTargetBlocked
                                        }>
                                        <svg
                                          viewBox="0 0 24 24"
                                          className="w-3.5 h-3.5"
                                          fill="none"
                                          stroke="currentColor"
                                          strokeWidth="2.5">
                                          <path d="M12 20h9" />
                                          <path d="M16.5 3.5a2.1 2.1 0 1 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
                                        </svg>
                                        <span className="hidden sm:inline">
                                          Edit
                                        </span>
                                      </button>
                                    </div>

                                    <div className="relative group">
                                      <button
                                        onClick={() => {
                                          if (
                                            protectedAccount ||
                                            adminTargetBlocked ||
                                            selfRow
                                          )
                                            return;
                                          deleteUser(u);
                                        }}
                                        className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full border text-xs font-semibold shadow-sm transition-all duration-200 active:scale-95 ${protectedAccount ||
                                          adminTargetBlocked ||
                                          selfRow
                                          ? "opacity-40 cursor-not-allowed border-slate-100 bg-slate-50 text-slate-300"
                                          : "border-rose-100 bg-rose-50/40 hover:bg-rose-100/80 hover:border-rose-200 text-rose-600 hover:shadow"
                                          } whitespace-nowrap`}
                                        disabled={
                                          protectedAccount ||
                                          adminTargetBlocked ||
                                          selfRow
                                        }
                                        aria-disabled={
                                          protectedAccount ||
                                          adminTargetBlocked ||
                                          selfRow
                                        }>
                                        <svg
                                          viewBox="0 0 24 24"
                                          className="w-3.5 h-3.5"
                                          fill="none"
                                          stroke="currentColor"
                                          strokeWidth="2.5">
                                          <path d="M3 6h18" />
                                          <path d="M8 6V4h8v2" />
                                          <path d="M6 6l1 14a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-14" />
                                        </svg>
                                        <span className="hidden sm:inline">
                                          Delete
                                        </span>
                                      </button>
                                    </div>
                                    </>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>

                    {/* Mobile/card view - visible under sm */}
                    <div className="lg:hidden p-4 space-y-3.5">
                      {users.map((u) => {
                        const protectedAccount = isProtectedAccount(u);
                        const adminTargetBlocked =
                          actionBlockedForAdminTarget(u);
                        const selfRow = isSelf(u);
                        return (
                          <div
                            key={u._id}
                            className="relative bg-white/95 border border-slate-100 shadow-sm shadow-slate-100/60 rounded-3xl p-4 transition-all duration-200 hover:shadow-md hover:border-slate-200/60">
                            <div className="absolute top-3 right-3">
                              {u.isActive ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200/80 shadow-sm text-[10px] font-semibold">
                                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                  Active
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-200/80 shadow-sm text-[10px] font-semibold">
                                  <span className="w-1.5 h-1.5 rounded-full bg-rose-400" />
                                  {roleFilter === "patient" ? "Blocked" : "Suspended"}
                                </span>
                              )}
                            </div>

                            <div className="flex items-start gap-3.5 mt-3">
                              <img
                                src={getImageUrl(u.profileImage, u.name)}
                                alt="avatar"
                                className="w-12 h-12 rounded-full object-cover ring-2 ring-white shadow flex-shrink-0"
                              />

                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <div className="font-semibold text-slate-900 text-sm truncate break-words">
                                    {u.name || "—"}
                                  </div>
                                  {protectedAccount && (
                                    <span className="text-[9px] bg-amber-50 text-amber-800 px-1.5 py-0.5 rounded-full border border-amber-200 font-bold uppercase tracking-wider">
                                      SUPER ADMIN
                                    </span>
                                  )}
                                  {(u.role === "call_center" || u.raw?.userType === "call_center") && (
                                    <span className="text-[9px] bg-cyan-50 text-[#06adc6] px-1.5 py-0.5 rounded-full border border-cyan-200 font-bold tracking-wider">
                                      Call Center
                                    </span>
                                  )}
                                  {(u.role === "receptionist" || u.raw?.userType === "receptionist") && roleFilter === "receptionist" && (
                                    <span className="text-[9px] bg-emerald-50 text-emerald-700 px-1.5 py-0.5 rounded-full border border-emerald-200 font-bold tracking-wider">
                                      Receptionist
                                    </span>
                                  )}
                                </div>
                                <div className="text-xs text-slate-500 truncate break-words mt-0.5">
                                  {u.email}
                                </div>
                                {u.phone && (
                                  <div className="text-xs text-slate-400 mt-0.5">
                                    {u.phone}
                                  </div>
                                )}

                                <div className="mt-3.5 flex flex-wrap gap-1.5">
                                  <button
                                    onClick={() => {
                                      if (
                                        protectedAccount ||
                                        adminTargetBlocked ||
                                        selfRow
                                      )
                                        return;
                                      toggleActive(u);
                                    }}
                                    disabled={
                                      protectedAccount ||
                                      adminTargetBlocked ||
                                      selfRow
                                    }
                                    className={`px-2.5 py-1 rounded-full text-xs font-semibold border transition ${protectedAccount ||
                                      adminTargetBlocked ||
                                      selfRow
                                      ? "opacity-40 cursor-not-allowed border-slate-200 bg-slate-50 text-slate-400"
                                      : "border-slate-200 bg-slate-50/50 hover:bg-slate-100/80 hover:border-slate-300 text-slate-700"
                                      }`}>
                                    {roleFilter === "patient"
                                      ? u.isActive
                                        ? "Block"
                                        : "Unblock"
                                      : u.isActive
                                        ? "Suspend"
                                        : "Activate"}
                                  </button>

                                  {roleFilter !== "patient" && (
                                  <>
                                  <button
                                    onClick={() => {
                                      if (protectedAccount) {
                                        showInfoCentered(
                                          "Action blocked",
                                          "Editing super_admin accounts is not allowed."
                                        );
                                        return;
                                      }
                                      if (adminTargetBlocked) {
                                        showInfoCentered(
                                          "Restricted",
                                          "Only Super Admin can edit this account."
                                        );
                                        return;
                                      }
                                      if (u.role === "doctor")
                                        openEditDoctor(u);
                                      else openEditStaff(u);
                                    }}
                                    className={`px-2.5 py-1 rounded-full text-xs font-semibold border transition ${protectedAccount || adminTargetBlocked
                                      ? "opacity-40 cursor-not-allowed border-slate-100 bg-slate-50 text-slate-400"
                                      : "border-indigo-100 bg-indigo-50/40 hover:bg-indigo-100/80 hover:border-indigo-200 text-indigo-600"
                                      }`}>
                                    Edit
                                  </button>

                                  <button
                                    onClick={() => {
                                      if (
                                        protectedAccount ||
                                        adminTargetBlocked ||
                                        selfRow
                                      )
                                        return;
                                      deleteUser(u);
                                    }}
                                    disabled={
                                      protectedAccount ||
                                      adminTargetBlocked ||
                                      selfRow
                                    }
                                    className={`px-2.5 py-1 rounded-full text-xs font-semibold border transition ${protectedAccount ||
                                      adminTargetBlocked ||
                                      selfRow
                                      ? "opacity-40 cursor-not-allowed border-slate-100 bg-slate-50 text-slate-300"
                                      : "border-rose-100 bg-rose-50/40 hover:bg-rose-100/80 hover:border-rose-200 text-rose-600"
                                      }`}>
                                    Delete
                                  </button>
                                  </>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* PAGINATION FOOTER CONTROLS */}
                    {(totalPages > 1 || itemsPerPage === 'all') && (
                      <div className="mt-6 pt-4 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs font-semibold text-slate-500">
                        <div>
                          {itemsPerPage === 'all' ? (
                            `Showing all ${users.length} users`
                          ) : (
                            `Showing ${((page - 1) * Number(itemsPerPage)) + 1} to ${Math.min(users.length, page * Number(itemsPerPage))} of ${users.length} users`
                          )}
                        </div>
                        {totalPages > 1 && (
                          <div className="flex items-center gap-1.5">
                            <button
                              onClick={() => {
                                setPage((p) => Math.max(1, p - 1));
                                window.scrollTo({ top: 0, behavior: "smooth" });
                              }}
                              disabled={page <= 1}
                              className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-sm"
                            >
                              Previous
                            </button>

                            {(() => {
                              const range = [];
                              const delta = 1;
                              for (let i = 1; i <= totalPages; i++) {
                                if (i === 1 || i === totalPages || (i >= page - delta && i <= page + delta)) {
                                  range.push(i);
                                } else if (range[range.length - 1] !== "...") {
                                  range.push("...");
                                }
                              }
                              return range.map((pageNum, idx) => {
                                if (pageNum === "...") {
                                  return <span key={`ellipsis-${idx}`} className="px-1.5 text-slate-400">...</span>;
                                }
                                return (
                                  <button
                                    key={pageNum}
                                    onClick={() => {
                                      setPage(pageNum);
                                      window.scrollTo({ top: 0, behavior: "smooth" });
                                    }}
                                    className={`px-3 py-1.5 rounded-lg border transition-all shadow-sm ${page === pageNum ? "bg-[#134e97] text-white border-[#134e97]" : "border-slate-200 bg-white hover:bg-slate-50 text-slate-600"}`}
                                  >
                                    {pageNum}
                                  </button>
                                );
                              });
                            })()}

                            <button
                              onClick={() => {
                                setPage((p) => Math.min(totalPages, p + 1));
                                window.scrollTo({ top: 0, behavior: "smooth" });
                              }}
                              disabled={page >= totalPages}
                              className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-sm"
                            >
                              Next
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          </main>

          {/* Add Doctor Modal */}
          {showAddDoctor && (
            <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm">
              <div className="flex min-h-screen items-start justify-center p-3 sm:p-6 overflow-y-auto">
                <div className="w-full max-w-lg rounded-3xl border border-slate-200 bg-white backdrop-blur-xl shadow-2xl overflow-hidden flex flex-col max-h-[calc(100dvh-2rem)]">
                  <div className="relative px-5 py-4 bg-gradient-to-r from-[var(--color-gradient-start)] to-[var(--color-gradient-end)] text-white flex items-center justify-between">
                    <h3 className="text-base sm:text-lg font-bold tracking-tight font-heading">
                      Add Doctor
                    </h3>
                    <button
                      onClick={() => setShowAddDoctor(false)}
                      className="text-white/80 hover:text-white hover:bg-white/10 p-1.5 rounded-full transition-all duration-200">
                      <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <path d="M18 6L6 18M6 6l12 12" />
                      </svg>
                    </button>
                  </div>

                  <div className="p-5 space-y-4 overflow-y-auto">
                    {/* Photo */}
                    <div className="flex items-center gap-4">
                      <input
                        id="doctorPhotoInput"
                        type="file"
                        accept="image/*"
                        onChange={(e) =>
                          handleDoctorImage(e.target.files?.[0] ?? null)
                        }
                        className="hidden"
                      />
                      <label
                        htmlFor="doctorPhotoInput"
                        className="relative group w-24 h-24 sm:w-28 sm:h-28 rounded-3xl border-2 border-dashed border-slate-200 hover:border-[var(--color-accent)] bg-slate-50/50 overflow-hidden cursor-pointer flex flex-col items-center justify-center transition-all duration-200">
                        {doctorImagePreview ? (
                          <img
                            src={doctorImagePreview}
                            alt="preview"
                            className="absolute inset-0 w-full h-full object-cover"
                          />
                        ) : (
                          <div className="flex flex-col items-center justify-center text-slate-500 group-hover:text-[var(--color-accent)] p-2 text-center">
                            <svg
                              className="w-6 h-6 opacity-85 mb-1"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2.5"
                              viewBox="0 0 24 24">
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                d="M12 4v16m8-8H4"
                              />
                            </svg>
                            <span className="text-[10px] font-bold tracking-wide uppercase">
                              Upload
                            </span>
                          </div>
                        )}
                      </label>

                      <div className="text-xs text-slate-500">
                        <div className="font-bold text-slate-700 text-sm">
                          Doctor Profile Photo
                        </div>
                        <div className="mt-0.5">Select a clear, professional portrait (JPEG/PNG)</div>
                      </div>
                    </div>

                    {/* Form grid */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                      <input
                        className="px-4 py-2.5 rounded-2xl border border-slate-200 bg-slate-50/50 text-slate-800 text-sm placeholder:text-slate-400 focus:outline-none focus:bg-white focus:ring-2 focus:ring-[var(--color-accent)]/30 focus:border-[var(--color-accent)] transition-all duration-200"
                        placeholder="Name *"
                        value={doctorForm.name}
                        onChange={(e) =>
                          handleDoctorField("name", e.target.value)
                        }
                      />
                      <input
                        className="px-4 py-2.5 rounded-2xl border border-slate-200 bg-slate-50/50 text-slate-800 text-sm placeholder:text-slate-400 focus:outline-none focus:bg-white focus:ring-2 focus:ring-[var(--color-accent)]/30 focus:border-[var(--color-accent)] transition-all duration-200"
                        placeholder="Email *"
                        value={doctorForm.email}
                        onChange={(e) =>
                          handleDoctorField("email", e.target.value)
                        }
                      />

                      <select
                        className="px-4 py-2.5 rounded-2xl border border-slate-200 bg-slate-50/50 text-slate-800 text-sm focus:outline-none focus:bg-white focus:ring-2 focus:ring-[var(--color-accent)]/30 focus:border-[var(--color-accent)] transition-all duration-200"
                        value={doctorForm.specialization}
                        onChange={(e) =>
                          handleDoctorField("specialization", e.target.value)
                        }>
                        <option value="">Select specialization *</option>
                        {[
                          "Neurologist",
                          "General Physician",
                          "Clinical Psychologist",
                        ].map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>

                      <input
                        className="px-4 py-2.5 rounded-2xl border border-slate-200 bg-slate-50/50 text-slate-800 text-sm placeholder:text-slate-400 focus:outline-none focus:bg-white focus:ring-2 focus:ring-[var(--color-accent)]/30 focus:border-[var(--color-accent)] transition-all duration-200"
                        placeholder="Qualification"
                        value={doctorForm.qualification}
                        onChange={(e) =>
                          handleDoctorField("qualification", e.target.value)
                        }
                      />

                      <input
                        className="px-4 py-2.5 rounded-2xl border border-slate-200 bg-slate-50/50 text-slate-800 text-sm placeholder:text-slate-400 focus:outline-none focus:bg-white focus:ring-2 focus:ring-[var(--color-accent)]/30 focus:border-[var(--color-accent)] transition-all duration-200"
                        placeholder="Experience (years)"
                        value={doctorForm.experience}
                        onChange={(e) =>
                          handleDoctorField("experience", e.target.value)
                        }
                      />
                      <input
                        className="px-4 py-2.5 rounded-2xl border border-slate-200 bg-slate-50/50 text-slate-800 text-sm placeholder:text-slate-400 focus:outline-none focus:bg-white focus:ring-2 focus:ring-[var(--color-accent)]/30 focus:border-[var(--color-accent)] transition-all duration-200"
                        placeholder="Fees *"
                        value={doctorForm.fees}
                        onChange={(e) =>
                          handleDoctorField("fees", e.target.value)
                        }
                      />
                    </div>

                    {/* About */}
                    <textarea
                      className="w-full px-4 py-2.5 rounded-2xl border border-slate-200 bg-slate-50/50 text-slate-800 text-sm placeholder:text-slate-400 focus:outline-none focus:bg-white focus:ring-2 focus:ring-[var(--color-accent)]/30 focus:border-[var(--color-accent)] transition-all duration-200"
                      placeholder="About doctor's background, medical experience..."
                      value={doctorForm.about}
                      onChange={(e) =>
                        handleDoctorField("about", e.target.value)
                      }
                      rows={3}
                    />
                  </div>

                  <div className="px-5 py-4 border-t border-slate-100 flex justify-end gap-2.5 bg-slate-50/60">
                    <button
                      onClick={() => setShowAddDoctor(false)}
                      className="px-4.5 py-2 rounded-full border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 text-sm font-semibold transition active:scale-95 duration-200">
                      Cancel
                    </button>
                    <button
                      onClick={submitAddDoctor}
                      className="px-5 py-2 rounded-full bg-gradient-to-r from-[var(--color-accent)] to-[var(--color-gradient-start)] hover:from-[var(--color-accent-light)] hover:to-[var(--color-gradient-end)] text-white text-sm font-bold shadow-md shadow-indigo-100/50 hover:shadow-lg active:scale-95 transition-all duration-200"
                      disabled={creating}>
                      {creating ? "Creating..." : "Create"}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Edit Doctor Modal */}
          {showEditDoctor && (
            <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm">
              <div className="flex min-h-screen items-start justify-center p-3 sm:p-6 overflow-y-auto">
                <div className="w-full max-w-lg rounded-3xl border border-slate-200 bg-white backdrop-blur-xl shadow-2xl overflow-hidden flex flex-col max-h-[calc(100dvh-2rem)]">
                  <div className="relative px-5 py-4 bg-gradient-to-r from-[var(--color-gradient-start)] to-[var(--color-gradient-end)] text-white flex items-center justify-between">
                    <h3 className="text-base sm:text-lg font-bold tracking-tight font-heading">
                      Edit Doctor
                    </h3>
                    <button
                      onClick={() => {
                        setShowEditDoctor(false);
                        setEditingId(null);
                      }}
                      className="text-white/80 hover:text-white hover:bg-white/10 p-1.5 rounded-full transition-all duration-200">
                      <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <path d="M18 6L6 18M6 6l12 12" />
                      </svg>
                    </button>
                  </div>

                  <div className="p-5 space-y-4 overflow-y-auto">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* Photo */}
                      <div className="md:col-span-2">
                        <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                          Doctor Profile Photo
                        </label>
                        <input
                          id="editDoctorPhotoInput"
                          type="file"
                          accept="image/*"
                          onChange={(e) =>
                            handleEditImage(e.target.files?.[0] ?? null)
                          }
                          className="hidden"
                        />
                        <label
                          htmlFor="editDoctorPhotoInput"
                          className="relative group w-24 h-24 sm:w-28 sm:h-28 rounded-3xl border-2 border-dashed border-slate-200 hover:border-[var(--color-accent)] bg-slate-50/50 overflow-hidden cursor-pointer flex flex-col items-center justify-center transition-all duration-200">
                          {editImagePreview ? (
                            <img
                              src={editImagePreview}
                              className="absolute inset-0 w-full h-full object-cover"
                            />
                          ) : editForm.profileImage ? (
                            <img
                              src={getImageUrl(editForm.profileImage, editForm.name)}
                              className="absolute inset-0 w-full h-full object-cover"
                            />
                          ) : (
                            <div className="flex flex-col items-center justify-center text-slate-500 group-hover:text-[var(--color-accent)] p-2 text-center">
                              <svg
                                className="w-6 h-6 opacity-85 mb-1"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2.5"
                                viewBox="0 0 24 24">
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  d="M12 4v16m8-8H4"
                                />
                              </svg>
                              <span className="text-[10px] font-bold tracking-wide uppercase">
                                Upload
                              </span>
                            </div>
                          )}
                        </label>
                      </div>

                      {/* Name / Email */}
                      <input
                        className="px-4 py-2.5 rounded-2xl border border-slate-200 bg-slate-50/50 text-slate-800 text-sm placeholder:text-slate-400 focus:outline-none focus:bg-white focus:ring-2 focus:ring-[var(--color-accent)]/30 focus:border-[var(--color-accent)] transition-all duration-200"
                        placeholder="Name *"
                        value={editForm.name}
                        onChange={(e) =>
                          handleEditField("name", e.target.value)
                        }
                      />
                      <input
                        className="px-4 py-2.5 rounded-2xl border border-slate-200 bg-slate-100 text-slate-400 text-sm cursor-not-allowed"
                        placeholder="Email (cannot change)"
                        value={editForm.email}
                        readOnly
                      />

                      {/* Specialization / Qualification */}
                      <select
                        className="px-4 py-2.5 rounded-2xl border border-slate-200 bg-slate-50/50 text-slate-800 text-sm focus:outline-none focus:bg-white focus:ring-2 focus:ring-[var(--color-accent)]/30 focus:border-[var(--color-accent)] transition-all duration-200"
                        value={editForm.specialization}
                        onChange={(e) =>
                          handleEditField("specialization", e.target.value)
                        }>
                        <option value="">Select specialization *</option>
                        {[
                          "Neurologist",
                          "General Physician",
                          "Clinical Psychologist",
                        ].map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>
                      <input
                        className="px-4 py-2.5 rounded-2xl border border-slate-200 bg-slate-50/50 text-slate-800 text-sm placeholder:text-slate-400 focus:outline-none focus:bg-white focus:ring-2 focus:ring-[var(--color-accent)]/30 focus:border-[var(--color-accent)] transition-all duration-200"
                        placeholder="Qualification"
                        value={editForm.qualification}
                        onChange={(e) =>
                          handleEditField("qualification", e.target.value)
                        }
                      />

                      {/* Experience / Fees */}
                      <input
                        className="px-4 py-2.5 rounded-2xl border border-slate-200 bg-slate-50/50 text-slate-800 text-sm placeholder:text-slate-400 focus:outline-none focus:bg-white focus:ring-2 focus:ring-[var(--color-accent)]/30 focus:border-[var(--color-accent)] transition-all duration-200"
                        placeholder="Experience (years)"
                        value={editForm.experience}
                        onChange={(e) =>
                          handleEditField("experience", e.target.value)
                        }
                      />
                      <input
                        className="px-4 py-2.5 rounded-2xl border border-slate-200 bg-slate-50/50 text-slate-800 text-sm placeholder:text-slate-400 focus:outline-none focus:bg-white focus:ring-2 focus:ring-[var(--color-accent)]/30 focus:border-[var(--color-accent)] transition-all duration-200"
                        placeholder="Fees *"
                        value={editForm.fees}
                        onChange={(e) =>
                          handleEditField("fees", e.target.value)
                        }
                      />
                    </div>

                    {/* About */}
                    <textarea
                      className="w-full mt-1.5 px-4 py-2.5 rounded-2xl border border-slate-200 bg-slate-50/50 text-slate-800 text-sm placeholder:text-slate-400 focus:outline-none focus:bg-white focus:ring-2 focus:ring-[var(--color-accent)]/30 focus:border-[var(--color-accent)] transition-all duration-200"
                      placeholder="About doctor's background, medical experience..."
                      value={editForm.about}
                      onChange={(e) => handleEditField("about", e.target.value)}
                      rows={3}
                    />

                    {/* Change Password Section */}
                    {(() => {
                      const targetUser = users.find((u) => u._id === editingId);
                      if (!targetUser) return null;
                      const protectedAccount = isProtectedAccount(targetUser);
                      const adminTargetBlocked = actionBlockedForAdminTarget(targetUser);

                      if (protectedAccount || adminTargetBlocked) {
                        return (
                          <div className="mt-4 p-3.5 bg-amber-50/50 rounded-2xl border border-amber-200/60 text-xs text-amber-800 font-semibold flex items-center gap-2">
                            <span>⚠️</span> Password modification is restricted for this account.
                          </div>
                        );
                      }

                      return (
                        <div className="mt-4 p-4 bg-slate-50 rounded-3xl border border-slate-200/60">
                          <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                            Change Password
                          </label>
                          <div className="flex flex-col sm:flex-row gap-2">
                            <div className="relative flex-grow">
                              <input
                                type={showPassword ? "text" : "password"}
                                autoComplete="new-password"
                                placeholder="Enter new password (min. 6 chars)"
                                className="w-full pl-4 pr-10 py-2.5 rounded-2xl border border-slate-200 bg-white text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/30 focus:border-[var(--color-accent)] text-sm transition-all duration-200"
                                value={modalPassword}
                                onChange={(e) => setModalPassword(e.target.value)}
                              />
                              <button
                                type="button"
                                onClick={() => setShowPassword(!showPassword)}
                                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-650 transition-colors p-1"
                                aria-label={showPassword ? "Hide password" : "Show password"}
                              >
                                {showPassword ? (
                                  <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5">
                                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                                    <line x1="1" y1="1" x2="23" y2="23" />
                                  </svg>
                                ) : (
                                  <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5">
                                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                                    <circle cx="12" cy="12" r="3" />
                                  </svg>
                                )}
                              </button>
                            </div>
                            <button
                              type="button"
                              onClick={async () => {
                                const ok = await triggerChangePassword(targetUser, modalPassword);
                                if (ok) setModalPassword("");
                              }}
                              className="px-4.5 py-2.5 bg-gradient-to-r from-indigo-500 to-indigo-600 hover:from-indigo-600 hover:to-indigo-700 text-white rounded-full text-xs font-bold shadow-sm whitespace-nowrap active:scale-95 duration-200 transition-all">
                              Update Password
                            </button>
                          </div>
                        </div>
                      );
                    })()}
                  </div>

                  <div className="px-5 py-4 border-t border-slate-100 flex justify-end gap-2.5 bg-slate-50/60">
                    <button
                      onClick={() => {
                        setShowEditDoctor(false);
                        setEditingId(null);
                      }}
                      className="px-4.5 py-2 rounded-full border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 text-sm font-semibold transition active:scale-95 duration-200">
                      Cancel
                    </button>
                    <button
                      onClick={submitEditDoctor}
                      className="px-5 py-2 rounded-full bg-gradient-to-r from-[var(--color-accent)] to-[var(--color-gradient-start)] hover:from-[var(--color-accent-light)] hover:to-[var(--color-gradient-end)] text-white text-sm font-bold shadow-md shadow-indigo-100/50 hover:shadow-lg active:scale-95 transition-all duration-200"
                      disabled={editing}>
                      {editing ? "Saving..." : "Save changes"}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Add Admin */}
          {showAddAdmin && (
            <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm">
              <div className="flex min-h-screen items-start justify-center p-3 sm:p-6 overflow-y-auto">
                <div className="w-full max-w-lg rounded-3xl border border-slate-200 bg-white backdrop-blur-xl shadow-2xl overflow-hidden flex flex-col max-h-[calc(100dvh-2rem)]">
                  <div className="relative px-5 py-4 bg-gradient-to-r from-[var(--color-gradient-start)] to-[var(--color-gradient-end)] text-white flex items-center justify-between">
                    <h3 className="text-base sm:text-lg font-bold tracking-tight font-heading">
                      Add Admin
                    </h3>
                    <button
                      onClick={() => setShowAddAdmin(false)}
                      className="text-white/80 hover:text-white hover:bg-white/10 p-1.5 rounded-full transition-all duration-200">
                      <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <path d="M18 6L6 18M6 6l12 12" />
                      </svg>
                    </button>
                  </div>

                  <div className="p-5 space-y-4 overflow-y-auto">
                    {/* Photo */}
                    <div className="flex items-center gap-4">
                      <input
                        id="addAdminPhotoInput"
                        type="file"
                        accept="image/*"
                        onChange={(e) =>
                          handleAdminImage(e.target.files?.[0] ?? null)
                        }
                        className="hidden"
                      />
                      <label
                        htmlFor="addAdminPhotoInput"
                        className="relative group w-24 h-24 sm:w-28 sm:h-28 rounded-3xl border-2 border-dashed border-slate-200 hover:border-[var(--color-accent)] bg-slate-50/50 overflow-hidden cursor-pointer flex flex-col items-center justify-center transition-all duration-200">
                        {adminImagePreview ? (
                          <img
                            src={adminImagePreview}
                            alt="preview"
                            className="absolute inset-0 w-full h-full object-cover"
                          />
                        ) : (
                          <div className="flex flex-col items-center justify-center text-slate-500 group-hover:text-[var(--color-accent)] p-2 text-center">
                            <svg
                              className="w-6 h-6 opacity-85 mb-1"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2.5"
                              viewBox="0 0 24 24">
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                d="M12 4v16m8-8H4"
                              />
                            </svg>
                            <span className="text-[10px] font-bold tracking-wide uppercase">
                              Upload
                            </span>
                          </div>
                        )}
                      </label>
                      <div className="text-xs text-slate-500">
                        <p className="font-semibold text-slate-700">Administrator Photo</p>
                        <p className="mt-0.5">Supports PNG, JPG, or GIF up to 5MB.</p>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="flex flex-col gap-1.5">
                        <label className="text-xs font-bold text-slate-600 uppercase tracking-wider">Name *</label>
                        <input
                          className="px-4 py-2.5 rounded-2xl border border-slate-200 bg-slate-50/50 text-slate-800 text-sm placeholder:text-slate-400 focus:outline-none focus:bg-white focus:ring-2 focus:ring-[var(--color-accent)]/30 focus:border-[var(--color-accent)] transition-all duration-200"
                          placeholder="Full Name"
                          value={adminForm.name}
                          onChange={(e) =>
                            handleAdminField("name", e.target.value)
                          }
                        />
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <label className="text-xs font-bold text-slate-600 uppercase tracking-wider">Email *</label>
                        <input
                          className="px-4 py-2.5 rounded-2xl border border-slate-200 bg-slate-50/50 text-slate-800 text-sm placeholder:text-slate-400 focus:outline-none focus:bg-white focus:ring-2 focus:ring-[var(--color-accent)]/30 focus:border-[var(--color-accent)] transition-all duration-200"
                          placeholder="email@example.com"
                          value={adminForm.email}
                          onChange={(e) =>
                            handleAdminField("email", e.target.value)
                          }
                        />
                      </div>

                      <div className="sm:col-span-2 text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 flex gap-2">
                        <span className="text-slate-500">ℹ️</span>
                        <span>
                          Admins will be created according to backend rules (an invitation email will be sent with a temporary password).
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="px-5 py-4 border-t border-slate-100 flex justify-end gap-2.5 bg-slate-50/60">
                    <button
                      onClick={() => setShowAddAdmin(false)}
                      className="px-4.5 py-2 rounded-full border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 text-sm font-semibold transition active:scale-95 duration-200">
                      Cancel
                    </button>
                    <button
                      onClick={submitAddAdmin}
                      className="px-5 py-2 rounded-full bg-gradient-to-r from-[var(--color-accent)] to-[var(--color-gradient-start)] hover:from-[var(--color-accent-light)] hover:to-[var(--color-gradient-end)] text-white text-sm font-bold shadow-md shadow-indigo-100/50 hover:shadow-lg active:scale-95 transition-all duration-200"
                      disabled={creatingAdmin}>
                      {creatingAdmin ? "Creating..." : "Create"}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Add Receptionist */}
          {showAddReceptionist && (
            <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm">
              <div className="flex min-h-screen items-start justify-center p-3 sm:p-6 overflow-y-auto">
                <div className="w-full max-w-lg rounded-3xl border border-slate-200 bg-white backdrop-blur-xl shadow-2xl overflow-hidden flex flex-col max-h-[calc(100dvh-2rem)]">
                  <div className="relative px-5 py-4 bg-gradient-to-r from-[var(--color-gradient-start)] to-[var(--color-gradient-end)] text-white flex items-center justify-between">
                    <h3 className="text-base sm:text-lg font-bold tracking-tight font-heading">
                      Add Reception Staff
                    </h3>
                    <button
                      onClick={() => setShowAddReceptionist(false)}
                      className="text-white/80 hover:text-white hover:bg-white/10 p-1.5 rounded-full transition-all duration-200">
                      <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <path d="M18 6L6 18M6 6l12 12" />
                      </svg>
                    </button>
                  </div>

                  <div className="p-5 space-y-4 overflow-y-auto">
                    {/* Photo */}
                    <div className="flex items-center gap-4">
                      <input
                        id="addReceptionistPhotoInput"
                        type="file"
                        accept="image/*"
                        onChange={(e) =>
                          handleReceptionistImage(e.target.files?.[0] ?? null)
                        }
                        className="hidden"
                      />
                      <label
                        htmlFor="addReceptionistPhotoInput"
                        className="relative group w-24 h-24 sm:w-28 sm:h-28 rounded-3xl border-2 border-dashed border-slate-200 hover:border-[var(--color-accent)] bg-slate-50/50 overflow-hidden cursor-pointer flex flex-col items-center justify-center transition-all duration-200">
                        {receptionistImagePreview ? (
                          <img
                            src={receptionistImagePreview}
                            alt="preview"
                            className="absolute inset-0 w-full h-full object-cover"
                          />
                        ) : (
                          <div className="flex flex-col items-center justify-center text-slate-500 group-hover:text-[var(--color-accent)] p-2 text-center">
                            <svg
                              className="w-6 h-6 opacity-85 mb-1"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2.5"
                              viewBox="0 0 24 24">
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                d="M12 4v16m8-8H4"
                              />
                            </svg>
                            <span className="text-[10px] font-bold tracking-wide uppercase">
                              Upload
                            </span>
                          </div>
                        )}
                      </label>
                      <div className="text-xs text-slate-500">
                        <p className="font-semibold text-slate-700">Receptionist Photo</p>
                        <p className="mt-0.5">Supports PNG, JPG, or GIF up to 5MB.</p>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="flex flex-col gap-1.5">
                        <label className="text-xs font-bold text-slate-600 uppercase tracking-wider">Name *</label>
                        <input
                          className="px-4 py-2.5 rounded-2xl border border-slate-200 bg-slate-50/50 text-slate-800 text-sm placeholder:text-slate-400 focus:outline-none focus:bg-white focus:ring-2 focus:ring-[var(--color-accent)]/30 focus:border-[var(--color-accent)] transition-all duration-200"
                          placeholder="Full Name"
                          value={receptionistForm.name}
                          onChange={(e) =>
                            handleReceptionistField("name", e.target.value)
                          }
                        />
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <label className="text-xs font-bold text-slate-600 uppercase tracking-wider">Email *</label>
                        <input
                          className="px-4 py-2.5 rounded-2xl border border-slate-200 bg-slate-50/50 text-slate-800 text-sm placeholder:text-slate-400 focus:outline-none focus:bg-white focus:ring-2 focus:ring-[var(--color-accent)]/30 focus:border-[var(--color-accent)] transition-all duration-200"
                          placeholder="email@example.com"
                          value={receptionistForm.email}
                          onChange={(e) =>
                            handleReceptionistField("email", e.target.value)
                          }
                        />
                      </div>

                      {/* Role selector */}
                      <div className="sm:col-span-2 flex flex-col gap-1.5">
                        <label className="text-xs font-bold text-slate-600 uppercase tracking-wider">Role *</label>
                        <div className="flex gap-3">
                          {[
                            { value: "receptionist", label: "Receptionist", desc: "Handles walk-in patients & front-desk", color: "emerald" },
                            { value: "call_center", label: "Call Center", desc: "Manages bookings & incoming calls", color: "cyan" },
                          ].map((opt) => {
                            const selected = (receptionistForm.role || "receptionist") === opt.value;
                            const emerald = opt.color === "emerald";
                            return (
                              <button
                                key={opt.value}
                                type="button"
                                onClick={() => handleReceptionistField("role", opt.value)}
                                className={`flex-1 flex flex-col items-start gap-1 px-3.5 py-3 rounded-2xl border-2 text-left transition-all duration-200 ${
                                  selected
                                    ? emerald
                                      ? "border-emerald-400 bg-emerald-50 shadow-sm"
                                      : "border-[#06adc6] bg-cyan-50 shadow-sm"
                                    : "border-slate-200 bg-slate-50/50 hover:border-slate-300"
                                }`}>
                                <span className={`text-xs font-bold ${
                                  selected
                                    ? emerald ? "text-emerald-700" : "text-[#06adc6]"
                                    : "text-slate-700"
                                }`}>
                                  {opt.label}
                                </span>
                                <span className="text-[10px] text-slate-500 leading-tight">{opt.desc}</span>
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      <div className="sm:col-span-2 text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 flex gap-2">
                        <span className="text-slate-500">ℹ️</span>
                        <span>
                          {(receptionistForm.role || "receptionist") === "call_center"
                            ? "Call Center staff manage patient bookings and incoming calls. A temporary password will be sent to their email."
                            : "Receptionists manage appointments and front-desk tasks. A temporary password will be sent to their email."}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="px-5 py-4 border-t border-slate-100 flex justify-end gap-2.5 bg-slate-50/60">
                    <button
                      onClick={() => setShowAddReceptionist(false)}
                      className="px-4.5 py-2 rounded-full border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 text-sm font-semibold transition active:scale-95 duration-200">
                      Cancel
                    </button>
                    <button
                      onClick={submitAddReceptionist}
                      className="px-5 py-2 rounded-full bg-gradient-to-r from-[var(--color-accent)] to-[var(--color-gradient-start)] hover:from-[var(--color-accent-light)] hover:to-[var(--color-gradient-end)] text-white text-sm font-bold shadow-md shadow-indigo-100/50 hover:shadow-lg active:scale-95 transition-all duration-200"
                      disabled={creatingReceptionist}>
                      {creatingReceptionist ? "Creating..." : "Create"}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Add Patient */}
          {showAddPatient && (
            <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm">
              <div className="flex min-h-screen items-start justify-center p-3 sm:p-6 overflow-y-auto">
                <div className="w-full max-w-lg rounded-3xl border border-slate-200 bg-white backdrop-blur-xl shadow-2xl overflow-hidden flex flex-col max-h-[calc(100dvh-2rem)]">
                  <div className="relative px-5 py-4 bg-gradient-to-r from-[var(--color-gradient-start)] to-[var(--color-gradient-end)] text-white flex items-center justify-between">
                    <h3 className="text-base sm:text-lg font-bold tracking-tight font-heading">
                      Add Patient
                    </h3>
                    <button
                      onClick={() => setShowAddPatient(false)}
                      className="text-white/80 hover:text-white hover:bg-white/10 p-1.5 rounded-full transition-all duration-200">
                      <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <path d="M18 6L6 18M6 6l12 12" />
                      </svg>
                    </button>
                  </div>

                  <div className="p-5 space-y-4 overflow-y-auto">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="sm:col-span-2 flex flex-col gap-1.5">
                        <label className="text-xs font-bold text-slate-600 uppercase tracking-wider">Name *</label>
                        <input
                          className="px-4 py-2.5 rounded-2xl border border-slate-200 bg-slate-50/50 text-slate-800 text-sm placeholder:text-slate-400 focus:outline-none focus:bg-white focus:ring-2 focus:ring-[var(--color-accent)]/30 focus:border-[var(--color-accent)] transition-all duration-200"
                          placeholder="Full Name"
                          value={patientForm.name}
                          onChange={(e) => handlePatientField("name", e.target.value)}
                        />
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <label className="text-xs font-bold text-slate-600 uppercase tracking-wider">Age *</label>
                        <input
                          type="number"
                          inputMode="numeric"
                          min={0}
                          max={150}
                          className="px-4 py-2.5 rounded-2xl border border-slate-200 bg-slate-50/50 text-slate-800 text-sm placeholder:text-slate-400 focus:outline-none focus:bg-white focus:ring-2 focus:ring-[var(--color-accent)]/30 focus:border-[var(--color-accent)] transition-all duration-200"
                          placeholder="Age"
                          value={patientForm.age}
                          onChange={(e) => handlePatientField("age", e.target.value)}
                        />
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <label className="text-xs font-bold text-slate-600 uppercase tracking-wider">Mobile *</label>
                        <input
                          type="tel"
                          inputMode="numeric"
                          maxLength={10}
                          className="px-4 py-2.5 rounded-2xl border border-slate-200 bg-slate-50/50 text-slate-800 text-sm placeholder:text-slate-400 focus:outline-none focus:bg-white focus:ring-2 focus:ring-[var(--color-accent)]/30 focus:border-[var(--color-accent)] transition-all duration-200"
                          placeholder="10-digit mobile number"
                          value={patientForm.phone}
                          onChange={(e) => {
                            const digitsOnly = e.target.value.replace(/\D/g, "");
                            if (digitsOnly.length <= 10)
                              handlePatientField("phone", digitsOnly);
                          }}
                        />
                      </div>
                      <div className="sm:col-span-2 flex flex-col gap-1.5">
                        <label className="text-xs font-bold text-slate-600 uppercase tracking-wider">Email (optional)</label>
                        <input
                          type="email"
                          className="px-4 py-2.5 rounded-2xl border border-slate-200 bg-slate-50/50 text-slate-800 text-sm placeholder:text-slate-400 focus:outline-none focus:bg-white focus:ring-2 focus:ring-[var(--color-accent)]/30 focus:border-[var(--color-accent)] transition-all duration-200"
                          placeholder="email@example.com"
                          value={patientForm.email}
                          onChange={(e) => handlePatientField("email", e.target.value)}
                        />
                      </div>
                    </div>
                    <p className="text-xs text-slate-500">
                      If no email is provided, a placeholder will be used. A welcome email is sent only when a real email is entered.
                    </p>
                  </div>

                  <div className="px-5 py-4 border-t border-slate-100 flex justify-end gap-2.5 bg-slate-50/60">
                    <button
                      onClick={() => setShowAddPatient(false)}
                      className="px-4.5 py-2 rounded-full border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 text-sm font-semibold transition active:scale-95 duration-200">
                      Cancel
                    </button>
                    <button
                      onClick={submitAddPatient}
                      className="px-5 py-2 rounded-full bg-gradient-to-r from-[var(--color-accent)] to-[var(--color-gradient-start)] hover:from-[var(--color-accent-light)] hover:to-[var(--color-gradient-end)] text-white text-sm font-bold shadow-md shadow-indigo-100/50 hover:shadow-lg active:scale-95 transition-all duration-200"
                      disabled={creatingPatient}>
                      {creatingPatient ? "Creating..." : "Register Patient"}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Edit Staff */}
          {showEditStaff && (
            <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm">
              <div className="flex min-h-screen items-start justify-center p-3 sm:p-6 overflow-y-auto">
                <div className="w-full max-w-lg rounded-3xl border border-slate-200 bg-white backdrop-blur-xl shadow-2xl overflow-hidden flex flex-col max-h-[calc(100dvh-2rem)]">
                  <div className="relative px-5 py-4 bg-gradient-to-r from-[var(--color-gradient-start)] to-[var(--color-gradient-end)] text-white flex items-center justify-between">
                    <h3 className="text-base sm:text-lg font-bold tracking-tight font-heading">
                      Edit Staff
                    </h3>
                    <button
                      onClick={() => {
                        setShowEditStaff(false);
                        setEditingStaffId(null);
                      }}
                      className="text-white/80 hover:text-white hover:bg-white/10 p-1.5 rounded-full transition-all duration-200">
                      <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <path d="M18 6L6 18M6 6l12 12" />
                      </svg>
                    </button>
                  </div>

                  <div className="p-5 space-y-4 overflow-y-auto">
                    {/* Photo */}
                    <div className="flex items-center gap-4">
                      <input
                        id="editStaffPhotoInput"
                        type="file"
                        accept="image/*"
                        onChange={(e) =>
                          handleEditStaffImage(e.target.files?.[0] ?? null)
                        }
                        className="hidden"
                      />
                      <label
                        htmlFor="editStaffPhotoInput"
                        className="relative group w-24 h-24 sm:w-28 sm:h-28 rounded-3xl border-2 border-dashed border-slate-200 hover:border-[var(--color-accent)] bg-slate-50/50 overflow-hidden cursor-pointer flex flex-col items-center justify-center transition-all duration-200">
                        {editStaffImagePreview ? (
                          <img
                            src={editStaffImagePreview}
                            alt="preview"
                            className="absolute inset-0 w-full h-full object-cover"
                          />
                        ) : editStaffForm.profileImage ? (
                          <img
                            src={getImageUrl(editStaffForm.profileImage, editStaffForm.name)}
                            alt="preview"
                            className="absolute inset-0 w-full h-full object-cover"
                          />
                        ) : (
                          <div className="flex flex-col items-center justify-center text-slate-500 group-hover:text-[var(--color-accent)] p-2 text-center">
                            <svg
                              className="w-6 h-6 opacity-85 mb-1"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2.5"
                              viewBox="0 0 24 24">
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                d="M12 4v16m8-8H4"
                              />
                            </svg>
                            <span className="text-[10px] font-bold tracking-wide uppercase">
                              Upload
                            </span>
                          </div>
                        )}
                      </label>
                      <div className="text-xs text-slate-500">
                        <p className="font-semibold text-slate-700">Staff Photo</p>
                        <p className="mt-0.5">Supports PNG, JPG, or GIF up to 5MB.</p>
                      </div>
                    </div>

                    {/* Fields */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="flex flex-col gap-1.5">
                        <label className="text-xs font-bold text-slate-600 uppercase tracking-wider">Name *</label>
                        <input
                          className="px-4 py-2.5 rounded-2xl border border-slate-200 bg-slate-50/50 text-slate-800 text-sm placeholder:text-slate-400 focus:outline-none focus:bg-white focus:ring-2 focus:ring-[var(--color-accent)]/30 focus:border-[var(--color-accent)] transition-all duration-200"
                          placeholder="Name *"
                          value={editStaffForm.name}
                          onChange={(e) =>
                            handleEditStaffField("name", e.target.value)
                          }
                        />
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Email (Read Only)</label>
                        <input
                          className="px-4 py-2.5 rounded-2xl border border-slate-200 bg-slate-100 text-slate-500 text-sm cursor-not-allowed"
                          placeholder="Email"
                          value={editStaffForm.email}
                          readOnly
                        />
                      </div>
                      <div className="sm:col-span-2 flex flex-col gap-1.5">
                        <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Role (Read Only)</label>
                        <input
                          className="px-4 py-2.5 rounded-2xl border border-slate-200 bg-slate-100 text-slate-500 text-sm cursor-not-allowed"
                          value={editStaffForm.role}
                          readOnly
                        />
                      </div>
                    </div>

                    {/* Change Password Section */}
                    {(() => {
                      const targetUser = users.find((u) => u._id === editingStaffId);
                      if (!targetUser) return null;
                      const protectedAccount = isProtectedAccount(targetUser);
                      const adminTargetBlocked = actionBlockedForAdminTarget(targetUser);

                      if (protectedAccount || adminTargetBlocked) {
                        return (
                          <div className="mt-4 p-3.5 bg-amber-50/50 rounded-2xl border border-amber-200/60 text-xs text-amber-800 font-semibold flex items-center gap-2">
                            <span>⚠️</span> Password modification is restricted for this account.
                          </div>
                        );
                      }

                      return (
                        <div className="mt-4 p-4 bg-slate-50 rounded-3xl border border-slate-200/60">
                          <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                            Change Password
                          </label>
                          <div className="flex flex-col sm:flex-row gap-2">
                            <div className="relative flex-grow">
                              <input
                                type={showPassword ? "text" : "password"}
                                autoComplete="new-password"
                                placeholder="Enter new password (min. 6 chars)"
                                className="w-full pl-4 pr-10 py-2.5 rounded-2xl border border-slate-200 bg-white text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/30 focus:border-[var(--color-accent)] text-sm transition-all duration-200"
                                value={modalPassword}
                                onChange={(e) => setModalPassword(e.target.value)}
                              />
                              <button
                                type="button"
                                onClick={() => setShowPassword(!showPassword)}
                                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-650 transition-colors p-1"
                                aria-label={showPassword ? "Hide password" : "Show password"}
                              >
                                {showPassword ? (
                                  <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5">
                                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                                    <line x1="1" y1="1" x2="23" y2="23" />
                                  </svg>
                                ) : (
                                  <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5">
                                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                                    <circle cx="12" cy="12" r="3" />
                                  </svg>
                                )}
                              </button>
                            </div>
                            <button
                              type="button"
                              onClick={async () => {
                                const ok = await triggerChangePassword(targetUser, modalPassword);
                                if (ok) setModalPassword("");
                              }}
                              className="px-4.5 py-2.5 bg-gradient-to-r from-indigo-500 to-indigo-600 hover:from-indigo-600 hover:to-indigo-700 text-white rounded-full text-xs font-bold shadow-sm whitespace-nowrap active:scale-95 duration-200 transition-all">
                              Update Password
                            </button>
                          </div>
                        </div>
                      );
                    })()}
                  </div>

                  <div className="px-5 py-4 border-t border-slate-100 flex justify-end gap-2.5 bg-slate-50/60">
                    <button
                      onClick={() => {
                        setShowEditStaff(false);
                        setEditingStaffId(null);
                      }}
                      className="px-4.5 py-2 rounded-full border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 text-sm font-semibold transition active:scale-95 duration-200">
                      Cancel
                    </button>
                    <button
                      onClick={submitEditStaff}
                      className="px-5 py-2 rounded-full bg-gradient-to-r from-[var(--color-accent)] to-[var(--color-gradient-start)] hover:from-[var(--color-accent-light)] hover:to-[var(--color-gradient-end)] text-white text-sm font-bold shadow-md shadow-indigo-100/50 hover:shadow-lg active:scale-95 transition-all duration-200"
                      disabled={editingStaff}>
                      {editingStaff ? "Saving..." : "Save changes"}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
          <Footer />
        </div>
      </>
    </PageErrorBoundary>
  );
}
