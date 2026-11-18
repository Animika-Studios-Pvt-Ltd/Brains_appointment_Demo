// frontend/src/components/Dashboard/receptionist/ReceptionistBookAppointmentPage.jsx
import React, { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Card } from "../../ui/card";
import { Button } from "../../ui/button";
import { ArrowLeft, Search } from "lucide-react";
import ReceptionistDashboardHeader from "./ReceptionistDashboardHeader";
import Footer from "@/components/HomePage/Footer";


const API = import.meta.env.VITE_BACKEND_URL || "http://localhost:8000";

function getImageUrl(path) {
  if (!path) return "/avatar-placeholder.png";
  if (path.startsWith("http://") || path.startsWith("https://")) return path;
  return path.startsWith("/") ? `${API}${path}` : `${API}/${path}`;
}

const ReceptionistBookAppointmentPage = () => {
  const navigate = useNavigate();

  // doctor list + search state
  const [loading, setLoading] = useState(true);
  const [doctors, setDoctors] = useState([]);
  const [error, setError] = useState(null);

  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const limit = 8;

  useEffect(() => {
    const token = localStorage.getItem("token");
    const controller = new AbortController();

    async function loadDoctors() {
      try {
        setLoading(true);
        setError(null);

        const params = new URLSearchParams();
        params.set("page", String(page));
        params.set("limit", String(limit));
        const q = (search || "").trim();
        if (q) params.set("search", q);

        const res = await fetch(
          `${API}/api/receptionist/doctors?${params.toString()}`,
          {
            signal: controller.signal,
            headers: token ? { Authorization: `Bearer ${token}` } : {},
          }
        );

        const json = await res.json().catch(() => ({}));
        if (!res.ok || json.status === "error")
          throw new Error(json.message || "Failed to load doctors");

        setDoctors(json?.data?.doctors ?? []);
      } catch (e) {
        if (e.name !== "AbortError") {
          setError(e.message || "Failed to load doctors");
          setDoctors([]);
        }
      } finally {
        setLoading(false);
      }
    }

    loadDoctors();
    return () => controller.abort();
  }, [search, page]);

  // reset page when search changes
  useEffect(() => {
    setPage(1);
  }, [search]);


  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-slate-50 via-[#134e97]/5 to-[#06adc6]/5" style={{ fontFamily: "'roboto-regular', 'Roboto', sans-serif" }}>
      <ReceptionistDashboardHeader />

      <main className="flex-1">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-6">
          <Card className="p-4 sm:p-6 bg-white rounded-2xl shadow-md mb-6 border-0">
            <div className="flex items-center justify-between gap-3">
              {/* Back button */}
              <div className="flex items-center">
                <Button
                  onClick={() => navigate("/receptionist/dashboard")}
                  variant="outline"
                  className="flex items-center gap-2 bg-white/10 text-gray-700 border-gray-200 hover:bg-gray-50 rounded-full px-2 py-1 sm:px-4 sm:py-1.5"
                  aria-label="Back to dashboard">
                  <ArrowLeft size={18} />
                  <span className="hidden sm:inline">Back</span>
                </Button>
              </div>

              {/* Title */}
              <div className="flex-1 text-center">
                <h2 className="text-lg sm:text-xl md:text-2xl font-semibold text-gray-800" style={{ fontFamily: "'mirador-medium', 'Outfit', sans-serif" }}>
                  Choose Doctor
                </h2>
              </div>

              {/* Balance block */}
              <div className="w-[70px] sm:w-[100px]" aria-hidden />
            </div>
          </Card>
        </div>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-6 space-y-6">
          {/* SEARCH BAR */}
          <section>
            <div className="w-full bg-white border border-slate-100 shadow-sm p-4 md:p-5 rounded-lg md:rounded-xl">
              <div className="grid grid-cols-1 sm:grid-cols-3 md:grid-cols-4 gap-3 items-end">
                <div className="sm:col-span-2 md:col-span-3">
                  <div className="flex gap-2">
                    <input
                      value={search}
                      onChange={(e) => {
                        const cleaned = e.target.value.replace(
                          /[^a-zA-Z0-9.\s]/g,
                          ""
                        );
                        setSearch(cleaned);
                      }}
                      onKeyDown={(e) => e.key === "Enter" && setPage(1)}
                      className="flex-1 rounded-md border border-gray-200 px-4 py-2 text-sm md:text-base focus:ring-2 focus:ring-[#134e97]/20 outline-none"
                      placeholder="Search by Doctor Name/Specialization..."
                    />
                    <button
                      onClick={() => setPage(1)}
                      className="bg-[#134e97] hover:bg-[#013473] text-white rounded-full px-4 py-2 flex items-center gap-2 text-sm md:text-base">
                      <Search className="w-4 h-4" />
                      Search
                    </button>
                  </div>
                </div>
                <div className="hidden md:block" />
              </div>
            </div>
          </section>

          {/* DOCTOR LIST */}
          {error && (
            <div className="mb-4 p-3 rounded-md bg-amber-50 text-amber-800 border border-amber-200 shadow-sm text-sm">
              {error}
            </div>
          )}

          {loading ? (
            <p className="text-center text-gray-500">Loading doctors...</p>
          ) : doctors.length === 0 ? (
            <div className="text-center py-10 bg-white rounded-xl border border-slate-100 text-gray-600">
              No doctors found.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
              {doctors.map((d) => (
                <Card
                  key={d._id}
                  className="p-4 md:p-5 bg-white border-0 rounded-xl md:rounded-2xl shadow-sm hover:shadow-md transition">
                  <div className="flex items-center gap-4">
                    <img
                      src={getImageUrl(d.profileImage)}
                      alt={d.name}
                      className="w-20 h-20 md:w-24 md:h-24 rounded-full object-cover border border-gray-200"
                    />

                    <div className="flex-1">
                      <h4 className="text-sm md:text-lg font-semibold text-gray-900" style={{ fontFamily: "'mirador-medium', 'Outfit', sans-serif" }}>
                        Dr. {d.name}
                      </h4>
                      <p className="text-xs md:text-sm text-gray-600">
                        {d.specialization}
                      </p>

                      <div className="flex flex-wrap gap-3 mt-2 text-xs md:text-sm text-gray-700">
                        {d.experience && <span>{d.experience} yrs exp</span>}
                        {d.fees && <span>₹{d.fees}</span>}
                      </div>

                      <div className="mt-3">
                        {(d.googleCalendar?.isConnected || d.googleCalendar?.connected) ? (
                          <Link
                            to={`/receptionist/doctor-calendar/${d._id}`}
                            className="inline-block px-4 py-2 rounded-full bg-[#06adc6] text-white text-xs md:text-sm hover:bg-[#059ab0] transition">
                            View Calendar
                          </Link>
                        ) : (
                          <span className="inline-block px-4 py-2 rounded-full bg-gray-400 text-white text-xs md:text-sm cursor-not-allowed">
                            Calendar Not Connected
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      </main>

      <Footer />
    </div>
  );
};

export default ReceptionistBookAppointmentPage;
