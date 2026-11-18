import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import DoctorAppoinmentPage from "./DoctorAppoinmentPage";
import DoctorProfileEdit from "./DoctorProfileEdit";

const BACKEND = import.meta.env.VITE_BACKEND_URL || "http://localhost:8000";

export default function DoctorProfileWrapper() {
  const { id } = useParams();
  const [userRole, setUserRole] = useState(null);
  const [currentUserId, setCurrentUserId] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchUserInfo = async () => {
      const token = localStorage.getItem("token");
      if (!token) {
        setUserRole("guest");
        setLoading(false);
        return;
      }

      try {
        const res = await fetch(`${BACKEND}/api/auth/me`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (!res.ok) {
          console.error("Failed to fetch user info:", res.status);
          setUserRole("guest");
          setLoading(false);
          return;
        }

        const data = await res.json();
        
        // ✅ FIX: Access the correct path in response
        if (data.success && data.user) {
          setUserRole(data.user.type); // Changed from data.data.type
          setCurrentUserId(data.user.id); // Changed from data.data.id
        } else {
          console.error("Invalid response format:", data);
          setUserRole("guest");
        }
      } catch (error) {
        console.error("Failed to fetch user info:", error);
        setUserRole("guest");
      } finally {
        setLoading(false);
      }
    };

    fetchUserInfo();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-gray-600">Loading...</div>
      </div>
    );
  }

  // If doctor viewing their own profile → Edit mode
  if (userRole === "doctor" && currentUserId === id) {
    return <DoctorProfileEdit />;
  }

  // Everyone else (patients, other doctors, guests) → View-only mode
  return <DoctorAppoinmentPage />;
}
