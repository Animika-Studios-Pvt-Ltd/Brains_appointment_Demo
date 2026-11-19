import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, Eye, EyeOff, Lock, Mail, User } from "lucide-react";
import {
  getApiOrigin,
  notifyMobileAppAuth,
  isMobileAppLoginFlow,
  closeMobileAppWebView,
} from "../../utils/api";
import { notifyUserStorageUpdated } from "../../utils/authStorage";
import { getDashboardPathForUser } from "../../utils/roleRedirect";

export default function Register() {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [mobileHandoff, setMobileHandoff] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const origin = getApiOrigin();
      const res = await fetch(`${origin}/api/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim().toLowerCase(),
          password,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        const base = data.message || "Registration failed";
        const detail = data.detail || data.error;
        setError(detail && import.meta.env.DEV ? `${base} (${detail})` : base);
        setLoading(false);
        return;
      }
      localStorage.setItem("token", data.token);
      localStorage.setItem("user", JSON.stringify(data.user));
      notifyUserStorageUpdated();
      notifyMobileAppAuth(data.token, data.user);
      if (isMobileAppLoginFlow()) {
        setLoading(false);
        return;
      }
      navigate(getDashboardPathForUser(data.user), { replace: true });
    } catch {
      setError("Could not reach the server. Is the API running?");
    } finally {
      setLoading(false);
    }
  };

  if (mobileHandoff) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-[#e6f4fb] px-6 text-center">
        <div className="mb-4 h-10 w-10 animate-spin rounded-full border-2 border-[#134e97] border-t-transparent" />
        <p className="text-lg font-semibold text-[#134e97]">Opening the app…</p>
        <p className="mt-2 text-sm text-slate-500">Please wait a moment.</p>
      </div>
    );
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-gradient-to-br from-[#e6f4fb] via-[#d7edf8] to-[#cce8f5] p-3 sm:p-5 lg:p-8">
      <div className="pointer-events-none absolute -top-24 -left-24 h-72 w-72 rounded-full bg-[#06adc6]/20 blur-3xl" />
      <div className="pointer-events-none absolute -right-20 bottom-8 h-72 w-72 rounded-full bg-[#134e97]/20 blur-3xl" />

      <div className="relative grid w-full max-w-md overflow-hidden rounded-3xl border border-white/70 bg-white/85 shadow-2xl backdrop-blur sm:max-w-2xl min-[1000px]:max-w-[1120px] min-[1000px]:grid-cols-2 min-[1200px]:max-w-[1280px] xl:max-w-[1360px] 2xl:max-w-[1460px]">
        <aside className="hidden bg-gradient-to-b from-[#134e97] via-[#0f5aa8] to-[#06adc6] p-8 text-white min-[1000px]:flex min-[1000px]:flex-col min-[1000px]:justify-center min-[1200px]:p-10 xl:p-12">
          <div className="flex flex-1 flex-col items-center justify-center text-center">
            <p className="inline-flex rounded-full border border-white/30 bg-white/15 px-3 py-1 text-xs font-semibold tracking-wider">
              APPOINTMENT SCHEDULER
            </p>
            <h2 className="mt-4 text-4xl font-bold leading-tight xl:text-5xl">Create Account</h2>
            <p className="mt-3 max-w-sm text-white/90 xl:text-lg">
              Join now and manage appointments in seconds.
            </p>
          </div>
        </aside>

        <section className="p-5 sm:p-8 min-[1000px]:p-10 min-[1200px]:px-14 min-[1200px]:py-12 xl:px-16 xl:py-14">
          <h3 className="text-center text-2xl font-bold text-gray-900 sm:text-3xl">Sign up to get started</h3>
          <p className="mt-1 text-center text-sm text-slate-500">Create your account in just a few steps.</p>

          <form onSubmit={handleSubmit} className="mt-6 space-y-4 sm:space-y-5">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700" htmlFor="reg-name">
                Full Name
              </label>
              <div className="relative">
                <User className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 sm:h-[18px] sm:w-[18px]" />
                <input
                  id="reg-name"
                  name="name"
                  required
                  autoComplete="name"
                  placeholder="Your full name"
                  className="w-full rounded-xl border border-slate-300 bg-white py-3 pl-10 pr-4 shadow-sm outline-none transition focus:border-[#134e97] focus:ring-4 focus:ring-[#06adc6]/20 sm:py-3.5"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700" htmlFor="reg-email">
                Email Address
              </label>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 sm:h-[18px] sm:w-[18px]" />
                <input
                  id="reg-email"
                  name="email"
                  type="email"
                  required
                  autoComplete="email"
                  placeholder="you@example.com"
                  className="w-full rounded-xl border border-slate-300 bg-white py-3 pl-10 pr-4 shadow-sm outline-none transition focus:border-[#134e97] focus:ring-4 focus:ring-[#06adc6]/20 sm:py-3.5"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700" htmlFor="reg-pass">
                Password
              </label>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 sm:h-[18px] sm:w-[18px]" />
                <input
                  id="reg-pass"
                  type={showPassword ? "text" : "password"}
                  required
                  minLength={8}
                  autoComplete="new-password"
                  placeholder="At least 8 characters"
                  className="w-full rounded-xl border border-slate-300 bg-white py-3 pl-10 pr-11 shadow-sm outline-none transition focus:border-[#134e97] focus:ring-4 focus:ring-[#06adc6]/20 sm:py-3.5"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  className="absolute inset-y-0 right-0 px-3 text-gray-500 hover:text-gray-700"
                  aria-label={showPassword ? "Hide password" : "Show password"}>
                  {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>
            </div>

            {error ? (
              <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
                {error}
              </p>
            ) : null}

            <button
              type="submit"
              disabled={loading}
              className="group flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#06adc6] to-[#134e97] px-4 py-3 text-base font-semibold text-white shadow-lg shadow-[#134e97]/25 transition hover:from-[#059ab0] hover:to-[#013473] disabled:opacity-60 sm:py-3.5">
              <span>{loading ? "Creating account..." : "Sign up"}</span>
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </button>
          </form>

          <p className="mt-7 text-center text-sm text-gray-600">
            Already have an account?{" "}
            <Link to={`/login${window.location.search}`} className="font-semibold text-[#134e97] hover:text-[#013473]">
              Sign in
            </Link>
          </p>
          <p className="mt-4 text-center text-sm text-slate-500">
            <Link
              to="/"
              onClick={(e) => {
                if (isMobileAppLoginFlow()) {
                  e.preventDefault();
                  closeMobileAppWebView();
                }
              }}
              className="text-[#134e97] hover:text-[#013473]"
            >
              Back to home
            </Link>
          </p>
        </section>
      </div>
    </div>
  );
}
