// frontend/src/components/Dashboard/receptionist/ReceptionistManagePatientsPage.jsx
import { useNavigate } from "react-router-dom";
import { Card } from "../../ui/card";
import { Button } from "../../ui/button";
import { ArrowLeft } from "lucide-react";
import ManagePatientsPage from "../admin/ManagePatientsPage";
import ReceptionistDashboardHeader from "./ReceptionistDashboardHeader";
import Footer from "@/components/HomePage/Footer";



const ReceptionistManagePatientsPage = () => {
  const navigate = useNavigate();

  return (
    <div className="receptionist-section min-h-screen flex flex-col bg-gradient-to-br from-slate-50 via-[#134e97]/5 to-[#06adc6]/5" style={{ fontFamily: "'roboto-regular', 'Roboto', sans-serif" }}>
      {/* ------------------------- HEADER ------------------------- */}
      <ReceptionistDashboardHeader />

      {/* ------------------------- PAGE CONTENT ------------------------- */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-6 w-full">
        <Card className="p-4 sm:p-6 bg-white rounded-2xl shadow-md mb-6 border-0">
          <div className="flex items-center justify-between gap-3">
            {/* Back Button */}
            <Button
              onClick={() => navigate("/receptionist/dashboard")}
              variant="outline"
              className="flex items-center gap-2 bg-white/10 text-gray-700 border-gray-200 hover:bg-gray-50 rounded-full px-2 py-1 sm:px-4 sm:py-1.5"
              aria-label="Back to dashboard">
              <ArrowLeft size={18} />
              <span className="hidden sm:inline">Back</span>
            </Button>

            {/* Page Title */}
            <h2 className="flex-1 text-center text-lg sm:text-xl md:text-2xl font-semibold text-gray-800" style={{ fontFamily: "'mirador-medium', 'Outfit', sans-serif" }}>
              Manage Patients
            </h2>

            {/* Empty block for balance */}
            <div className="w-[70px] sm:w-[100px]"></div>
          </div>
        </Card>
      </div>

      <ManagePatientsPage hideHeader={true} hideFooter={true} />

      <Footer />
    </div>
  );
};

export default ReceptionistManagePatientsPage;

