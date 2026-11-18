import { useState, useEffect } from "react";

export default function GoogleCalendarView({ onEventsLoaded }) {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState("daily"); // 'daily' | 'weekly' | 'monthly'
  const [currentDate, setCurrentDate] = useState(new Date());

  useEffect(() => {
    fetchEvents();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewMode, currentDate]);

  const getDateRange = () => {
    const start = new Date(currentDate);
    const end = new Date(currentDate);

    if (viewMode === "daily") {
      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);
    } else if (viewMode === "weekly") {
      const firstDay = new Date(currentDate);
      firstDay.setDate(currentDate.getDate() - currentDate.getDay()); // Sunday
      firstDay.setHours(0, 0, 0, 0);
      start.setTime(firstDay.getTime());

      const weekEnd = new Date(firstDay);
      weekEnd.setDate(firstDay.getDate() + 6);
      weekEnd.setHours(23, 59, 59, 999);
      end.setTime(weekEnd.getTime());
    } else if (viewMode === "monthly") {
      start.setDate(1);
      start.setHours(0, 0, 0, 0);

      end.setDate(1);
      end.setMonth(end.getMonth() + 1);
      end.setDate(0); // last day of previous month
      end.setHours(23, 59, 59, 999);
    }

    return { start, end };
  };

  const fetchEvents = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem("token");
      if (!token) {
        setLoading(false);
        return;
      }

      const { start, end } = getDateRange();

      const res = await fetch(
        `${import.meta.env.VITE_BACKEND_URL || "http://localhost:8000"}/api/google/events?timeMin=${encodeURIComponent(
          start.toISOString()
        )}&timeMax=${encodeURIComponent(end.toISOString())}&maxResults=100`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      const data = await res.json();
      if (data.success && Array.isArray(data?.data?.events)) {
        setEvents(data.data.events);
        if (onEventsLoaded) onEventsLoaded(data.data.events);
      } else {
        setEvents([]);
      }
    } catch (err) {
      console.error("Error fetching calendar events:", err);
      setEvents([]);
    } finally {
      setLoading(false);
    }
  };

  // Return null to render nothing
  return null;
}
