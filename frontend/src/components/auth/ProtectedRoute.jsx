// frontend/src/components/auth/ProtectedRoute.jsx
// Access only after GET /api/auth/verify succeeds (our backend + JWT).
import React, { useEffect, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { verifyAuthToken, clearAuth } from "../../utils/api";
import { isRoleAllowed } from "../../utils/roleRedirect";

const ProtectedRoute = ({ children, allowedRoles = [] }) => {
  const location = useLocation();
  const [gate, setGate] = useState("pending");
  const [verifiedUser, setVerifiedUser] = useState(null);
  const [retryTick, setRetryTick] = useState(0);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      const token = localStorage.getItem("token");

      if (!token) {
        if (!cancelled) {
          setVerifiedUser(null);
          setGate("no_auth");
        }
        return;
      }

      if (!cancelled) {
        setGate("verifying");
      }

      const result = await verifyAuthToken();
      if (cancelled) {
        return;
      }

      if (!result.success) {
        if (result.reason === "network_error") {
          setVerifiedUser(null);
          setGate("backend_unreachable");
          return;
        }
        clearAuth();
        setVerifiedUser(null);
        setGate("no_auth");
        return;
      }

      setVerifiedUser(result.user);
      setGate("ok");
    };

    run();
    return () => {
      cancelled = true;
    };
  }, [retryTick, location.pathname, location.key]);

  if (gate === "pending" || gate === "verifying") {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" />
      </div>
    );
  }

  if (gate === "backend_unreachable") {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50 px-4">
        <div className="text-center bg-white p-8 rounded-lg shadow max-w-md">
          <h2 className="text-xl font-semibold text-gray-800 mb-2">Cannot reach server</h2>
          <p className="text-gray-600 text-sm mb-6">
            The app could not connect to the API (for example the backend is not running on port 8000).
            Start the backend, then try again.
          </p>
          <button
            type="button"
            onClick={() => setRetryTick((t) => t + 1)}
            className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg transition"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (gate === "no_auth") {
    return <Navigate to="/" replace />;
  }

  if (allowedRoles && allowedRoles.length > 0) {
    const userRole =
      verifiedUser?.type || verifiedUser?.userType || verifiedUser?.role;
    if (!isRoleAllowed(verifiedUser, allowedRoles)) {
      return (
        <div className="flex items-center justify-center min-h-screen bg-gray-50">
          <div className="text-center bg-white p-8 rounded-lg shadow-lg max-w-md">
            <div className="text-red-500 text-5xl mb-4">🚫</div>
            <h2 className="text-2xl font-bold mb-2 text-gray-800">Access Denied</h2>
            <p className="text-gray-600 mb-2">You don&apos;t have permission to access this page.</p>
            <p className="text-sm text-gray-500 mt-2">
              Your role: <strong>{userRole || "unknown"}</strong>
            </p>
            <p className="text-xs text-gray-400 mt-1">Required: {allowedRoles.join(", ")}</p>
            <button
              type="button"
              onClick={() => {
                window.location.href = "/";
              }}
              className="mt-6 bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg transition"
            >
              Go to Homepage
            </button>
          </div>
        </div>
      );
    }
  }

  return children;
};

export default ProtectedRoute;
