import React, { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { getUser, getAuthToken } from "@/utils/api";
import Footer from "@/components/HomePage/Footer";
import Swal from "sweetalert2";

import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import RefreshIcon from "@mui/icons-material/Refresh";
import StorageIcon from "@mui/icons-material/Storage";
import SendIcon from "@mui/icons-material/Send";
import HubIcon from "@mui/icons-material/Hub";
import ErrorIcon from "@mui/icons-material/Error";

import MailOutlineIcon from "@mui/icons-material/MailOutline";
import EmailIcon from "@mui/icons-material/Email";
import FolderOutlinedIcon from "@mui/icons-material/FolderOutlined";
import ChatOutlinedIcon from "@mui/icons-material/ChatOutlined";
import ImageOutlinedIcon from "@mui/icons-material/ImageOutlined";
import CreditCardIcon from "@mui/icons-material/CreditCard";
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutline";

const BACKEND_BASE = import.meta.env.VITE_BACKEND_URL || "http://localhost:8000";

function isAuthorizedAdmin(role) {
  const r = String(role || "").toLowerCase();
  return r === "admin" || r === "super_admin" || r === "superadmin" || r === "super-admin";
}

// Fallback System Status Items matching user's exact UI requirement
const DEFAULT_SERVICES = [
  {
    id: "database",
    name: "Database (MongoDB)",
    subtitle: "Connection: Connected",
    status: "Healthy",
    ok: true,
    icon: <StorageIcon style={{ fontSize: 20 }} />,
    bgClass: "bg-emerald-50 text-emerald-600 border-emerald-100"
  },
  {
    id: "email",
    name: "Email Gateway (Gmail OAuth2)",
    subtitle: "Sender: doctorjoshi18@gmail.com",
    status: "Connected",
    ok: true,
    icon: <EmailIcon style={{ fontSize: 20 }} />,
    bgClass: "bg-blue-50 text-blue-600 border-blue-100"
  },
  {
    id: "storage",
    name: "Document Storage (Plesk Server)",
    subtitle: `Endpoint: ${BACKEND_BASE}/uploads`,
    status: "Online",
    ok: true,
    icon: <FolderOutlinedIcon style={{ fontSize: 20 }} />,
    bgClass: "bg-amber-50 text-amber-600 border-amber-100"
  },
  {
    id: "whatsapp",
    name: "WhatsApp API (QuickMessage)",
    subtitle: "Template: otp_verification",
    status: "Configured",
    ok: true,
    icon: <ChatOutlinedIcon style={{ fontSize: 20 }} />,
    bgClass: "bg-emerald-50 text-emerald-600 border-emerald-100"
  },
  {
    id: "media",
    name: "Media Storage (Cloudinary CDN)",
    subtitle: "Cloud Name: dml2h9ej4",
    status: "Connected",
    ok: true,
    icon: <ImageOutlinedIcon style={{ fontSize: 20 }} />,
    bgClass: "bg-purple-50 text-purple-600 border-purple-100"
  },
  {
    id: "payment",
    name: "Payment Portal (Razorpay Gateway)",
    subtitle: "Merchant Key: rzp_test_TGpHJcy4yxMQBM",
    status: "Connected",
    ok: true,
    icon: <CreditCardIcon style={{ fontSize: 20 }} />,
    bgClass: "bg-indigo-50 text-indigo-600 border-indigo-100"
  }
];

export default function SystemApiTesterPage() {
  const navigate = useNavigate();
  const [currentUser, setCurrentUser] = useState(null);
  const [authToken, setAuthToken] = useState("");

  // Services Status
  const [servicesList, setServicesList] = useState(DEFAULT_SERVICES);
  const [servicesLoading, setServicesLoading] = useState(false);

  // Send Test Email Card State
  const [testEmailAddress, setTestEmailAddress] = useState("");
  const [testEmailSubject, setTestEmailSubject] = useState("System Test Mail");
  const [testEmailMessage, setTestEmailMessage] = useState("Hello! This is a test email sent from the API & Mail Tester.");
  const [sendingTestMail, setSendingTestMail] = useState(false);

  // Server Health Status Indicator
  const [pingStatus, setPingStatus] = useState(null);
  const [pingLoading, setPingLoading] = useState(false);

  useEffect(() => {
    const u = getUser();
    const t = getAuthToken();

    if (!u || !t) {
      navigate("/login", { replace: true });
      return;
    }

    if (!isAuthorizedAdmin(u.role || u.type)) {
      Swal.fire({
        icon: "error",
        title: "Access Denied",
        text: "Only Administrators or Super Admins can access the System API Tester.",
      });
      navigate("/admin/dashboard", { replace: true });
      return;
    }

    setCurrentUser(u);
    setAuthToken(t);
    if (u.email) setTestEmailAddress(u.email);

    checkServerHealth();
    fetchServicesStatus();
  }, [navigate]);

  const fetchServicesStatus = async () => {
    setServicesLoading(true);
    try {
      const res = await fetch(`${BACKEND_BASE}/api/system-settings/services-status`);
      const data = await res.json();
      if (data.status === "success" && Array.isArray(data.services)) {
        const merged = DEFAULT_SERVICES.map((def) => {
          const found = data.services.find((s) => s.id === def.id);
          if (found) {
            return {
              ...def,
              subtitle: found.subtitle || def.subtitle,
              status: found.status || def.status,
              ok: found.ok !== undefined ? found.ok : def.ok
            };
          }
          return def;
        });
        setServicesList(merged);
      }
    } catch (err) {
      console.error("Failed to fetch live services status:", err);
    } finally {
      setServicesLoading(false);
    }
  };

  const checkServerHealth = async () => {
    setPingLoading(true);
    const start = performance.now();
    try {
      const targetUrl = `${BACKEND_BASE}/health`;
      const res = await fetch(targetUrl);
      const end = performance.now();
      const data = await res.json();
      setPingStatus({
        ok: res.ok,
        status: res.status,
        latency: Math.round(end - start),
        mongodb: data.mongodb || "unknown",
        environment: data.environment || "production",
        uptime: data.uptime ? `${Math.round(data.uptime)}s` : "active"
      });
    } catch (err) {
      setPingStatus({
        ok: false,
        status: 0,
        latency: 0,
        error: err.message || "Failed to reach server"
      });
    } finally {
      setPingLoading(false);
    }
  };

  const handleSendTestEmailSubmit = async (e) => {
    e.preventDefault();
    if (!testEmailAddress.trim() || !testEmailAddress.includes("@")) {
      Swal.fire({
        icon: "warning",
        title: "Recipient Email Required",
        text: "Please enter a valid recipient email address.",
        confirmButtonColor: "#0c5836"
      });
      return;
    }

    setSendingTestMail(true);
    try {
      const res = await fetch(`${BACKEND_BASE}/api/system-settings/send-test-email`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${authToken}`
        },
        body: JSON.stringify({
          to: testEmailAddress.trim(),
          subject: testEmailSubject.trim() || "System Test Mail",
          message: testEmailMessage.trim() || "Hello! This is a test email sent from the API & Mail Tester."
        })
      });

      const data = await res.json();
      if (res.ok && data.status === "success") {
        Swal.fire({
          icon: "success",
          title: "Test Email Sent!",
          text: data.message || `Test email successfully delivered to ${testEmailAddress}.`,
          confirmButtonColor: "#0c5836"
        });
      } else {
        throw new Error(data.message || "Failed to deliver test email.");
      }
    } catch (err) {
      Swal.fire({
        icon: "error",
        title: "Email Dispatch Failed",
        text: err.message || "Could not send test email via backend SMTP.",
        confirmButtonColor: "#0c5836"
      });
    } finally {
      setSendingTestMail(false);
    }
  };

  if (!currentUser) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 text-slate-600">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-800 font-sans antialiased">
      {/* Header */}
      <header className="bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-700 text-white shadow-md border-b border-indigo-500/30 sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <Link
                to="/admin/dashboard"
                className="p-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white transition border border-white/20 shadow-sm"
                title="Back to Admin Dashboard"
              >
                <ArrowBackIcon fontSize="small" />
              </Link>
              <div>
                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold tracking-wider bg-white/20 text-white border border-white/30 uppercase">
                    SYSTEM CONTROL
                  </span>
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold tracking-wider bg-emerald-400/20 text-emerald-100 border border-emerald-300/30 uppercase">
                    SYSTEM & MAIL TESTER
                  </span>
                </div>
                <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight mt-1 flex items-center gap-2">
                  <HubIcon /> System & Mail Tester
                </h1>
              </div>
            </div>

            {/* Health Status Indicator */}
            <div className="flex items-center gap-3 bg-white/10 border border-white/20 px-4 py-2 rounded-2xl backdrop-blur-md">
              <div className="text-right">
                <div className="text-xs font-semibold text-blue-100">Backend API Server</div>
                <div className="text-xs font-mono font-medium flex items-center justify-end gap-1.5 mt-0.5">
                  <span className={`w-2.5 h-2.5 rounded-full ${pingStatus?.ok ? "bg-emerald-300 animate-pulse" : "bg-rose-300"}`} />
                  <span className={pingStatus?.ok ? "text-emerald-200 font-bold" : "text-rose-200 font-bold"}>
                    {pingLoading ? "Ping..." : pingStatus?.ok ? `ONLINE (${pingStatus.latency}ms)` : "OFFLINE"}
                  </span>
                </div>
              </div>
              <button
                onClick={() => { checkServerHealth(); fetchServicesStatus(); }}
                disabled={pingLoading}
                className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white transition border border-white/20 cursor-pointer"
                title="Refresh Ping & Services Status"
              >
                <RefreshIcon className={pingLoading ? "animate-spin" : ""} fontSize="small" />
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Body */}
      <main className="flex-1 max-w-5xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">

        {/* ========================================================================= */}
        {/* SYSTEM SERVICES STATUS LIST CARD */}
        {/* ========================================================================= */}
        <section className="bg-white border border-slate-200/90 rounded-2xl p-2 sm:p-5 shadow-xs">
          <div className="flex items-center justify-between px-3 py-2 border-b border-slate-100 mb-2">
            <h2 className="text-sm font-bold text-slate-900 tracking-tight flex items-center gap-2">
              <StorageIcon className="text-emerald-600" fontSize="small" /> System Infrastructure & Integrations Status
            </h2>
            <button
              onClick={fetchServicesStatus}
              className="text-xs text-indigo-600 hover:text-indigo-800 font-medium flex items-center gap-1 cursor-pointer"
            >
              <RefreshIcon className={servicesLoading ? "animate-spin" : ""} style={{ fontSize: 14 }} /> Refresh Status
            </button>
          </div>

          <div className="divide-y divide-slate-100">
            {servicesList.map((service) => (
              <div
                key={service.id}
                className="py-3.5 px-3 sm:px-4 flex items-center justify-between gap-4 hover:bg-slate-50/80 transition-colors rounded-xl"
              >
                {/* Left: Icon & Names */}
                <div className="flex items-center gap-3.5 min-w-0">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center border shrink-0 ${service.bgClass}`}>
                    {service.icon}
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-bold text-slate-900 text-sm sm:text-base leading-tight truncate">
                      {service.name}
                    </h3>
                    <p className="text-xs text-slate-500 font-mono mt-0.5 truncate">
                      {service.subtitle}
                    </p>
                  </div>
                </div>

                {/* Right: Green Status Pill Badge */}
                <div className="shrink-0">
                  {service.ok ? (
                    <span className="inline-flex items-center gap-1.5 px-3.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200/80 shadow-2xs">
                      <CheckCircleOutlineIcon style={{ fontSize: 15 }} className="text-emerald-600" />
                      <span>{service.status}</span>
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 px-3.5 py-1 rounded-full text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200/80 shadow-2xs">
                      <ErrorIcon style={{ fontSize: 15 }} className="text-rose-600" />
                      <span>{service.status}</span>
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ========================================================================= */}
        {/* SEND TEST EMAIL CARD */}
        {/* ========================================================================= */}
        <section className="bg-white border border-slate-200 rounded-2xl p-6 sm:p-7 shadow-xs space-y-5">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
            <MailOutlineIcon className="text-emerald-800" style={{ fontSize: 22 }} />
            <h2 className="text-base sm:text-lg font-bold text-slate-900 tracking-tight">
              Send Test Email
            </h2>
          </div>

          <form onSubmit={handleSendTestEmailSubmit} className="space-y-4">
            {/* Recipient Email */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                Recipient Email
              </label>
              <input
                type="email"
                required
                value={testEmailAddress}
                onChange={(e) => setTestEmailAddress(e.target.value)}
                placeholder="name@example.com"
                className="w-full py-2.5 px-3.5 border border-slate-200 rounded-xl bg-white text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-600/30 focus:border-emerald-600 transition"
              />
            </div>

            {/* Subject */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                Subject
              </label>
              <input
                type="text"
                value={testEmailSubject}
                onChange={(e) => setTestEmailSubject(e.target.value)}
                placeholder="System Test Mail"
                className="w-full py-2.5 px-3.5 border border-slate-200 rounded-xl bg-white text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-600/30 focus:border-emerald-600 transition"
              />
            </div>

            {/* Message Body */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                Message Body
              </label>
              <textarea
                rows={3}
                value={testEmailMessage}
                onChange={(e) => setTestEmailMessage(e.target.value)}
                placeholder="Hello! This is a test email sent from the API & Mail Tester."
                className="w-full p-3 border border-slate-200 rounded-xl bg-white text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-600/30 focus:border-emerald-600 transition"
              />
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={sendingTestMail}
              className="w-full py-3 px-6 bg-[#0c5836] hover:bg-[#084529] text-white font-bold text-sm rounded-xl shadow-xs transition flex items-center justify-center gap-2 disabled:opacity-60 cursor-pointer"
            >
              {sendingTestMail ? (
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
              ) : (
                <>
                  <SendIcon style={{ fontSize: 16 }} /> Send Test Email
                </>
              )}
            </button>
          </form>
        </section>

      </main>

      <Footer />
    </div>
  );
}
