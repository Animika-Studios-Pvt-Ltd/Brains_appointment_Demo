import React from "react";
import { Routes, Route, Navigate } from "react-router-dom";

import Login from "./components/auth/Login";
import Register from "./components/auth/Register";
import ForgotPassword from "./components/auth/ForgotPassword";
import ResetPassword from "./components/auth/ResetPassword";
import ProtectedRoute from "./components/auth/ProtectedRoute";
import RoleBasedHomeRedirect from "./components/auth/RoleBasedHomeRedirect";

import AdminDashboard from "./components/Dashboard/admin/dashboard/AdminDashboard";
import AdminUsersPage from "./components/Dashboard/admin/users/AdminUsersPage";
import AdminAnalyticsPage from "./components/Dashboard/admin/analytics/AdminAnalyticsPage";
import SuperAdminLoginHistoryPage from "./components/Dashboard/admin/superadmin/SuperAdminLoginHistoryPage";
import SuperAdminActivityLogsPage from "./components/Dashboard/admin/superadmin/SuperAdminActivityLogsPage";
import SystemApiTesterPage from "./components/Dashboard/admin/SystemApiTesterPage";

import PatientDashboard from "./components/Dashboard/patient/patientdashboardpage";
import PatientDashboardContent from "./components/Dashboard/patient/PatientDashboardContent";
import DoctorListPage from "./components/Dashboard/doctor/DoctorListPage";
import PatientProfile from "./components/Dashboard/patient/PatientProfile";
import PatientAppointmentsPage from "./components/Dashboard/patient/PatientAppointmentsPage";

import DoctorDashboardContent from "./components/Dashboard/doctor/DoctorDashboardContent";
import DoctorProfileEdit from "./components/Dashboard/doctor/DoctorProfileEdit";
import DoctorAppointmentContent from "./components/Dashboard/doctor/DoctorAppointmentContent";
import DoctorProfileWrapper from "./components/Dashboard/doctor/DoctorProfileWrapper";
import SingleDoctorDetailPage from "./components/Dashboard/doctor/SingleDoctorDetailPage";

import ReceptionistDashboardContent from "./components/Dashboard/receptionist/ReceptionistDashboardContent";
import ReceptionistBookAppointmentPage from "./components/Dashboard/receptionist/ReceptionistBookAppointmentPage";
import ReceptionistAppointmentsTable from "./components/Dashboard/receptionist/ReceptionistAppointmentsTable";
import ReceptionistDoctorCalendar from "./components/Dashboard/receptionist/ReceptionistDoctorCalendar";
import AdminDoctorsListPage from "./components/Dashboard/admin/appointments/AdminDoctorsListPage";
import AdminDoctorAppointmentsListPage from "./components/Dashboard/admin/appointments/AdminDoctorAppointmentsListPage";
import DoctorAppointmentPage from "./components/Dashboard/doctor/DoctorAppoinmentPage";
import ManagePatientsPage from "./components/Dashboard/admin/ManagePatientsPage";
import ReceptionistProfile from "./components/Dashboard/receptionist/ReceptionistProfile";
import ReceptionistManagePatientsPage from "./components/Dashboard/receptionist/ReceptionistManagePatientsPage";
import InstallPWAPrompt from "./components/InstallPWAPrompt";
import IOSInstallPrompt from "./components/IOSInstallPrompt";
import PWADiagnostic from "./components/PWADiagnostic";
import useInactivityLogout from "./hooks/useInactivityLogout";

function App() {
  useInactivityLogout();

  return (
    <>
      <Routes>
        <Route path="/" element={<RoleBasedHomeRedirect />} />

        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />

        <Route
          path="/admin/dashboard"
          element={
            <ProtectedRoute allowedRoles={["admin", "super_admin"]}>
              <AdminDashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/users"
          element={
            <ProtectedRoute allowedRoles={["admin", "super_admin"]}>
              <AdminUsersPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/super-admin/login-history"
          element={
            <ProtectedRoute allowedRoles={["super_admin"]}>
              <SuperAdminLoginHistoryPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/super-admin/activity-logs"
          element={
            <ProtectedRoute allowedRoles={["super_admin"]}>
              <SuperAdminActivityLogsPage />
            </ProtectedRoute>
          }
        />

        <Route
          path="/admin/manage-patients"
          element={
            <ProtectedRoute
              allowedRoles={["admin", "super_admin", "receptionist"]}>
              <ManagePatientsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/appointments"
          element={
            <ProtectedRoute allowedRoles={["admin", "super_admin"]}>
              <AdminDoctorsListPage />
            </ProtectedRoute>
          }
        />

        {/* NEW: doctor-specific appointments page */}
        <Route
          path="/admin/appointments/doctor/:doctorId"
          element={
            <ProtectedRoute allowedRoles={["admin", "super_admin"]}>
              <AdminDoctorAppointmentsListPage />
            </ProtectedRoute>
          }
        />

        <Route
          path="/admin/analytics"
          element={
            <ProtectedRoute allowedRoles={["admin", "super_admin"]}>
              <AdminAnalyticsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/doctor/:id/reschedule"
          element={
            <ProtectedRoute allowedRoles={["admin", "super_admin"]}>
              <DoctorAppointmentPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/api-tester"
          element={
            <ProtectedRoute allowedRoles={["admin", "super_admin"]}>
              <SystemApiTesterPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/system-api-tester"
          element={
            <ProtectedRoute allowedRoles={["admin", "super_admin"]}>
              <SystemApiTesterPage />
            </ProtectedRoute>
          }
        />

        <Route
          path="/patient/dashboard"
          element={
            <ProtectedRoute allowedRoles={["patient"]}>
              <PatientDashboard />
            </ProtectedRoute>
          }
        />
        <Route path="/patient/DoctorListPage" element={<DoctorListPage />} />
        <Route
          path="/patient/PatientDashboardContent"
          element={
            <ProtectedRoute allowedRoles={["patient"]}>
              <PatientDashboardContent />
            </ProtectedRoute>
          }
        />
        <Route
          path="/patient/profile"
          element={
            <ProtectedRoute allowedRoles={["patient"]}>
              <PatientProfile />
            </ProtectedRoute>
          }
        />
        <Route
          path="/patient/appointments"
          element={<PatientAppointmentsPage />}
        />

        <Route
          path="/doctor/dashboard"
          element={
            <ProtectedRoute allowedRoles={["doctor"]}>
              <DoctorDashboardContent />
            </ProtectedRoute>
          }
        />
        <Route
          path="/doctor/appointments"
          element={
            <ProtectedRoute allowedRoles={["doctor"]}>
              <DoctorAppointmentContent />
            </ProtectedRoute>
          }
        />
        <Route
          path="/doctor/profile/edit"
          element={
            <ProtectedRoute allowedRoles={["doctor"]}>
              <DoctorProfileEdit />
            </ProtectedRoute>
          }
        />

        <Route path="/doctor/detail/:id" element={<SingleDoctorDetailPage />} />

        <Route path="/doctor/:id" element={<DoctorProfileWrapper />} />

        <Route
          path="/receptionist/dashboard"
          element={
            <ProtectedRoute allowedRoles={["receptionist", "call_center"]}>
              <ReceptionistDashboardContent />
            </ProtectedRoute>
          }
        />
        <Route
          path="/receptionist/book-appointment"
          element={
            <ProtectedRoute allowedRoles={["receptionist", "call_center"]}>
              <ReceptionistBookAppointmentPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/receptionist/appointments"
          element={
            <ProtectedRoute allowedRoles={["receptionist", "call_center"]}>
              <ReceptionistAppointmentsTable />
            </ProtectedRoute>
          }
        />
        <Route
          path="/receptionist/manage-patients"
          element={
            <ProtectedRoute allowedRoles={["receptionist", "call_center"]}>
              <ReceptionistManagePatientsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/receptionist/doctor-calendar/:doctorId"
          element={
            <ProtectedRoute allowedRoles={["receptionist", "call_center", "admin", "super_admin", "superadmin"]}>
              <ReceptionistDoctorCalendar />
            </ProtectedRoute>
          }
        />

        <Route
          path="/receptionist/manage-patients"
          element={
            <ProtectedRoute allowedRoles={["receptionist", "call_center"]}>
              <ManagePatientsPage />
            </ProtectedRoute>
          }
        />

        <Route
          path="receptionist/profile"
          element={
            <ProtectedRoute allowedRoles={["receptionist", "call_center"]}>
              <ReceptionistProfile />
            </ProtectedRoute>
          }
        />

        <Route path="*" element={<Navigate to="/patient/DoctorListPage" replace />} />
      </Routes>

      {/* PWA Install Prompts */}
      <InstallPWAPrompt />
      <IOSInstallPrompt />
      {/* <PWADiagnostic /> */}

    </>
  );
}

export default App;
