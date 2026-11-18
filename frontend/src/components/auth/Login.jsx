import { useState, useEffect } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowRight, Eye, EyeOff, Lock, Mail, ShieldCheck } from 'lucide-react';
import {
  verifyAuthToken,
  getApiOrigin,
  notifyMobileAppAuth,
  isMobileAppLoginFlow,
  isMobileAppWebView,
  closeMobileAppWebView,
} from '../../utils/api';
import { notifyUserStorageUpdated } from '../../utils/authStorage';
import { getDashboardPathForUser } from '../../utils/roleRedirect';

const Login = () => {
  const { userType } = useParams();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [mobileHandoff, setMobileHandoff] = useState(false);

  const completeAuthForClient = (token, user) => {
    notifyUserStorageUpdated();
    notifyMobileAppAuth(token, user);
    // In the mobile app WebView, do not open the website dashboard.
    if (isMobileAppLoginFlow() || isMobileAppWebView()) {
      return;
    }
    navigate(getDashboardPathForUser(user), { replace: true });
  };

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const oauthErr = urlParams.get('error');
    if (oauthErr === 'google_auth_failed') {
      setError('Google sign-in was cancelled or failed. Try again or use email and password.');
      const clean = `${window.location.pathname}`;
      window.history.replaceState({}, '', clean);
      return;
    }

    const token = urlParams.get('token');
    if (!token) return;

    let cancelled = false;
    (async () => {
      localStorage.setItem('token', token);
      const result = await verifyAuthToken();
      if (cancelled) return;
      if (!result.success) {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        window.history.replaceState({}, '', window.location.pathname);
        setError(
          result.message ||
            'Could not complete Google sign-in. Your account may be inactive or the session expired.'
        );
        return;
      }
      completeAuthForClient(token, result.user);
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigate]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('token')) return;
    // App WebView opens login fresh — never auto-jump to dashboard from leftover token.
    if (isMobileAppLoginFlow()) return;

    const token = localStorage.getItem('token');
    if (!token) return;

    let cancelled = false;
    (async () => {
      const result = await verifyAuthToken();
      if (cancelled || !result.success) return;
      completeAuthForClient(token, result.user);
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigate]);

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    try {
      const origin = getApiOrigin();
      const response = await fetch(`${origin}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      let data;
      try {
        data = await response.json();
      } catch {
        setError(
          `The server at ${origin} did not return JSON (HTTP ${response.status}). Check that the backend is running and healthy.`
        );
        return;
      }
      if (data.success) {
        localStorage.setItem('token', data.token);
        localStorage.setItem('user', JSON.stringify(data.user));
        completeAuthForClient(data.token, data.user);
      } else {
        setError(data.message);
      }
    } catch (err) {
      setError(
        err?.message
          ? `Failed to connect to server (${err.message}). Is backend running at ${getApiOrigin()}?`
          : `Failed to connect to server at ${getApiOrigin()}`
      );
    }
  };

  const handleGoogleLogin = () => {
    const pageHost = window.location.hostname;
    const isLocalPage =
      !pageHost || pageHost === 'localhost' || pageHost === '127.0.0.1';
    const isLanPage =
      /^192\.168\.\d{1,3}\.\d{1,3}$/.test(pageHost) ||
      /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(pageHost);
    const mobileFlow = isMobileAppLoginFlow();

    // Local desktop → localhost. Mobile/LAN → injected API or same host :8000.
    // Production → Railway via VITE_BACKEND_URL.
    let origin;
    if (isLocalPage && !mobileFlow) {
      origin = 'http://localhost:8000';
    } else {
      origin = getApiOrigin();
      if (isLanPage) {
        try {
          const u = new URL(origin);
          if (u.hostname === 'localhost' || u.hostname === '127.0.0.1') {
            origin = `${window.location.protocol}//${pageHost}:8000`;
          }
        } catch {
          origin = `${window.location.protocol}//${pageHost}:8000`;
        }
      }
    }

    const type = encodeURIComponent(userType || 'patient');
    const returnOrigin =
      isLocalPage && !mobileFlow
        ? 'http://localhost:5173'
        : window.location.origin;
    const returnTo = encodeURIComponent(returnOrigin);
    const mobileQ = mobileFlow ? '&mobile=1' : '';
    window.location.href = `${origin}/api/auth/google?type=${type}&returnTo=${returnTo}${mobileQ}`;
  };

  if (mobileHandoff) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-[#e6f4fb] px-6 text-center">
        <div className="mb-4 h-10 w-10 animate-spin rounded-full border-2 border-[#134e97] border-t-transparent" />
        <p className="text-lg font-semibold text-[#134e97]">Signing you into the app…</p>
        <p className="mt-2 text-sm text-slate-500">Please wait a moment.</p>
      </div>
    );
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-gradient-to-br from-[#e6f4fb] via-[#d7edf8] to-[#cce8f5] p-3 sm:p-5 lg:p-8">
      <div className="pointer-events-none absolute -top-24 -left-24 h-72 w-72 rounded-full bg-[#06adc6]/20 blur-3xl" />
      <div className="pointer-events-none absolute -right-20 bottom-8 h-72 w-72 rounded-full bg-[#134e97]/20 blur-3xl" />

      <div className="relative grid w-full max-w-md overflow-hidden rounded-3xl border border-white/70 bg-white/85 shadow-2xl backdrop-blur sm:max-w-2xl min-[1031px]:max-w-[1040px] min-[1031px]:grid-cols-[1.02fr_0.98fr] min-[1200px]:max-w-[1120px] min-[1200px]:grid-cols-[1.05fr_0.95fr] xl:max-w-[1200px] 2xl:max-w-[1280px]">
        <aside className="hidden bg-gradient-to-b from-[#134e97] via-[#0f5aa8] to-[#06adc6] p-8 text-white min-[1031px]:flex min-[1031px]:flex-col min-[1031px]:justify-between min-[1200px]:p-10 xl:p-12">
          <div className="flex flex-1 flex-col items-center justify-center text-center">
            <p className="inline-flex rounded-full border border-white/30 bg-white/15 px-3 py-1 text-xs font-semibold tracking-wider">
              BRAINS APPOINTMENTS
            </p>
            <h2 className="mt-4 text-4xl font-bold leading-tight xl:text-5xl">Welcome!</h2>
            <p className="mt-3 max-w-sm text-white/90 xl:text-lg">Book and manage appointments in seconds.</p>
          </div>
        </aside>
    
        <section className="p-5 sm:p-8 min-[1031px]:p-10 min-[1200px]:px-14 min-[1200px]:py-12 xl:px-16 xl:py-14">
          <h3 className="text-center text-2xl font-bold text-gray-900 sm:text-3xl">Sign in to continue</h3>
          <div className="mt-3 flex items-center justify-center gap-3 min-[1031px]:hidden">
            <span className="h-px w-8 bg-blue-200" />
            <ShieldCheck className="h-4 w-4 text-[#06adc6]" />
            <span className="h-px w-8 bg-blue-200" />
          </div>
          <p className="mt-1 text-center text-sm text-slate-500">Secure access to your appointments and profile.</p>

          {error && (
            <div className="mt-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <form onSubmit={handleLogin} className="mt-6 space-y-4 sm:space-y-5">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700">Email Address</label>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 sm:h-[18px] sm:w-[18px]" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 bg-white py-3 pl-10 pr-4 shadow-sm outline-none transition focus:border-[#134e97] focus:ring-4 focus:ring-[#06adc6]/20 sm:py-3.5"
                  placeholder="you@example.com"
                  required
                />
              </div>
            </div>

            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <label className="text-sm font-medium text-gray-700">Password</label>
                <Link to={`/forgot-password${window.location.search}`} className="text-sm font-medium text-[#134e97] hover:text-[#013473]">
                  Forgot password?
                </Link>
              </div>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 sm:h-[18px] sm:w-[18px]" />
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 bg-white py-3 pl-10 pr-11 shadow-sm outline-none transition focus:border-[#134e97] focus:ring-4 focus:ring-[#06adc6]/20 sm:py-3.5"
                  placeholder="••••••••"
                  required
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

            <button
              type="submit"
              className="group flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#06adc6] to-[#134e97] px-4 py-3 text-base font-semibold text-white shadow-lg shadow-[#134e97]/25 transition hover:from-[#059ab0] hover:to-[#013473] sm:py-3.5">
              <span>Sign In</span>
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </button>
          </form>

          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-slate-200" />
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="bg-white px-2 text-slate-500">Or continue with</span>
            </div>
          </div>

          <button
            onClick={handleGoogleLogin}
            className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 transition hover:bg-slate-50 sm:py-3.5">
            <span className="flex items-center justify-center gap-2 font-semibold text-gray-700">
              <img src="https://www.svgrepo.com/show/355037/google.svg" className="h-5 w-5" alt="Google" />
              Login with Google
            </span>
          </button>

          <p className="mt-7 text-center text-sm text-gray-600">
            Don&apos;t have an account?{" "}
            <Link to={`/register${window.location.search}`} className="font-semibold text-[#134e97] hover:text-[#013473]">
              Sign up
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
};

export default Login;
