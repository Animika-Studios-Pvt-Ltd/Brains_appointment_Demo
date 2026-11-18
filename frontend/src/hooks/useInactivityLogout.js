import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import Swal from "sweetalert2";
import { getAuthToken, performLogout } from "../utils/api";

const EIGHT_HOURS_MS = 8 * 60 * 60 * 1000; // 8 hours in milliseconds
const LAST_ACTIVITY_KEY = "last_activity_timestamp";

export default function useInactivityLogout() {
  const navigate = useNavigate();

  useEffect(() => {
    const token = getAuthToken();
    if (!token) return; // Only run when user is authenticated

    // Initialize timestamp if not present
    if (!localStorage.getItem(LAST_ACTIVITY_KEY)) {
      localStorage.setItem(LAST_ACTIVITY_KEY, Date.now().toString());
    }

    let lastUpdated = Date.now();

    const updateActivity = () => {
      const now = Date.now();
      // Throttle updates to localStorage once every 10 seconds
      if (now - lastUpdated > 10000) {
        lastUpdated = now;
        localStorage.setItem(LAST_ACTIVITY_KEY, now.toString());
      }
    };

    const checkInactivity = () => {
      const currentToken = getAuthToken();
      if (!currentToken) return;

      const lastActivity = parseInt(localStorage.getItem(LAST_ACTIVITY_KEY) || Date.now().toString(), 10);
      const elapsed = Date.now() - lastActivity;

      if (elapsed >= EIGHT_HOURS_MS) {
        console.warn("⚠️ User inactive for 8 hours. Logging out automatically.");
        localStorage.removeItem(LAST_ACTIVITY_KEY);
        performLogout();

        Swal.fire({
          icon: "warning",
          title: "Session Expired",
          text: "You have been automatically logged out due to 8 hours of inactivity.",
          confirmButtonColor: "#4f46e5",
          confirmButtonText: "Sign In Again",
        }).then(() => {
          navigate("/login", { replace: true });
        });
      }
    };

    // User interaction event listeners
    const events = ["mousemove", "mousedown", "keydown", "touchstart", "scroll", "click"];
    events.forEach((event) => window.addEventListener(event, updateActivity, { passive: true }));

    // Check inactivity every 30 seconds
    const intervalId = setInterval(checkInactivity, 30000);

    return () => {
      events.forEach((event) => window.removeEventListener(event, updateActivity));
      clearInterval(intervalId);
    };
  }, [navigate]);
}
