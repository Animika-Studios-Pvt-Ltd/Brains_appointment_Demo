import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { verifyAuthToken } from "@/utils/api";
import { getDashboardPathForUser } from "@/utils/roleRedirect";

/** `/` — doctor list for guests and patients; other roles go to their dashboard */
export default function RoleBasedHomeRedirect() {
  const [target, setTarget] = useState(null);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      const token = localStorage.getItem("token");
      if (!token) {
        if (!cancelled) setTarget("/patient/DoctorListPage");
        return;
      }
      const result = await verifyAuthToken();
      if (cancelled) return;
      setTarget(
        result.success
          ? getDashboardPathForUser(result.user)
          : "/patient/DoctorListPage"
      );
    }

    run();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!target) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-[#134e97] border-t-transparent" />
      </div>
    );
  }

  return <Navigate to={target} replace />;
}
