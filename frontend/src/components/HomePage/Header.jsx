// frontend/src/components/HomePage/Header.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import {
  Power,
  ChevronDown,
  User,
  LayoutDashboard,
  LogOut,
  CalendarDays,
} from "lucide-react";
import Swal from "sweetalert2";
import { performLogout, verifyAuthToken } from "../../utils/api";
import { parseStoredUser, USER_STORAGE_UPDATED } from "../../utils/authStorage";
import { getImageUrl } from "@/utils/imageUrl";
import {
  getAccountMenuDashboardLabel,
  getAccountMenuDashboardPath,
  shouldShowAccountDashboardLink,
} from "@/utils/roleRedirect";
import "./brains-header.css";

const DOCTOR_LIST_PATH = "/patient/DoctorListPage";

const DUMMY_NAV_ITEMS = [
  {
    id: "doctors",
    label: "CONSULT EXPERTS",
    href: DOCTOR_LIST_PATH,
    isLink: true,
  },
  {
    id: "specialties",
    label: "SPECIALTIES",
    columns: 2,
    items: [
      { label: "Cardiology", href: "#" },
      { label: "Neurology", href: "#" },
      { label: "Orthopedics", href: "#" },
      { label: "General Medicine", href: "#" },
      { label: "Pediatrics", href: "#" },
      { label: "Dermatology", href: "#" },
      { label: "Oncology", href: "#" },
      { label: "ENT & Ophthalmology", href: "#" },
    ],
  },
  {
    id: "services",
    label: "SERVICES",
    columns: 1,
    items: [
      { label: "OPD Consultations", href: "#" },
      { label: "24/7 Emergency Care", href: "#" },
      { label: "Diagnostics & Pathology", href: "#" },
      { label: "Radiology & Imaging", href: "#" },
      { label: "Health Checkup Packages", href: "#" },
    ],
  },
  {
    id: "patient-care",
    label: "PATIENT CARE",
    columns: 1,
    items: [
      { label: "Admission Procedures", href: "#" },
      { label: "Insurance & TPA Helpdesk", href: "#" },
      { label: "Visitor Guidelines", href: "#" },
      { label: "Discharge & Billing", href: "#" },
      { label: "Patient Feedback", href: "#" },
    ],
  },
  {
    id: "about",
    label: "ABOUT US",
    columns: 1,
    items: [
      { label: "Hospital Overview", href: "#" },
      { label: "Our Medical Team", href: "#" },
      { label: "Infrastructure & Technology", href: "#" },
      { label: "Quality & Safety Standards", href: "#" },
    ],
  },
  {
    id: "contact",
    label: "CONTACT",
    columns: 1,
    items: [
      { label: "Hospital Locations", href: "#" },
      { label: "Emergency Contacts", href: "#" },
      { label: "Feedback & Inquiries", href: "#" },
    ],
  },
];

function hasRealProfilePhoto(path) {
  if (!path || typeof path !== "string") return false;
  const p = path.trim();
  if (!p || p.includes("avatar-placeholder") || p.includes("ui-avatars.com")) return false;
  return true;
}

function UserNavPill({ user, onLogout }) {
  const navigate = useNavigate();
  const location = useLocation();
  const ref = useRef(null);
  const [open, setOpen] = useState(false);

  const dashboardRoute = getAccountMenuDashboardPath(user);
  const showDashboardLink = shouldShowAccountDashboardLink(
    user,
    location.pathname
  );
  const dashboardLabel = getAccountMenuDashboardLabel(user);
  const displayName = user?.name?.split(" ")[0] || user?.name || "User";
  const showPhoto = hasRealProfilePhoto(user?.profileImage);
  const photoUrl = getImageUrl(user?.profileImage, user?.name);

  useEffect(() => {
    function handleClickOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className="header-user-nav" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={`${displayName} account menu`}
        className="header-user-nav__trigger">
        <span className="header-user-nav__avatar">
          {showPhoto ? (
            <img
              key={user.profileImage}
              src={photoUrl}
              alt=""
              className="header-user-nav__photo"
            />
          ) : (
            <span className="header-user-nav__fallback">
              {displayName.charAt(0)}
            </span>
          )}
        </span>
        <span className="header-user-nav__name">{displayName}</span>
        <i
          className={`fas fa-chevron-down header-user-nav__chevron ${
            open ? "open" : ""
          }`}
        />
      </button>

      {open && (
        <div role="menu" className="header-user-nav__menu">
          {showDashboardLink && (
            <>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  navigate(dashboardRoute);
                }}
                className="header-user-nav__item">
                <LayoutDashboard className="h-4 w-4" />
                <span>{dashboardLabel}</span>
              </button>
              <div className="header-user-nav__divider" />
            </>
          )}
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              onLogout();
            }}
            className="header-user-nav__item danger">
            <LogOut className="h-4 w-4" />
            <span>Logout</span>
          </button>
        </div>
      )}
    </div>
  );
}

const Header = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [userRevision, setUserRevision] = useState(0);

  // Sidebar state
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [openSidebarDropdown, setOpenSidebarDropdown] = useState(null);

  useEffect(() => {
    const bump = () => setUserRevision((n) => n + 1);
    window.addEventListener(USER_STORAGE_UPDATED, bump);
    return () => window.removeEventListener(USER_STORAGE_UPDATED, bump);
  }, []);

  useEffect(() => {
    if (!localStorage.getItem("token")) return;
    let cancelled = false;
    verifyAuthToken()
      .then((result) => {
        if (!cancelled && result?.success) setUserRevision((n) => n + 1);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [location.pathname]);

  const user = useMemo(
    () => parseStoredUser(),
    [location.pathname, location.key, userRevision]
  );

  const handleLogout = async () => {
    const result = await Swal.fire({
      title: "Are you sure?",
      text: "Do you really want to logout?",
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Yes, Logout",
      cancelButtonText: "Cancel",
    });
    if (result.isConfirmed) await performLogout();
  };

  // Close sidebar on scroll
  useEffect(() => {
    const handleScroll = () => {
      if (sidebarOpen) {
        setSidebarOpen(false);
        setOpenSidebarDropdown(null);
      }
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, [sidebarOpen]);

  // Lock body scroll when sidebar is open
  useEffect(() => {
    if (sidebarOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [sidebarOpen]);

  const toggleSidebarDropdown = (id, e) => {
    e.preventDefault();
    setOpenSidebarDropdown((prev) => (prev === id ? null : id));
  };

  return (
    <header className="brains-header">
      <div className="container-fluid header-section">
        <div className="header-single-row">
          {/* Left: Brand */}
          <div className="header-brand-wrap">
            <Link
              to={DOCTOR_LIST_PATH}
              className="header-logo-link flex flex-row items-center gap-2.5 no-underline group"
              style={{ display: "flex", flexDirection: "row", alignItems: "center", gap: "10px", textDecoration: "none" }}
              title="Appointment Scheduler">
              <span className="flex h-10 w-10 sm:h-11 sm:w-11 items-center justify-center rounded-xl bg-gradient-to-tr from-[#134e97] to-[#06adc6] text-white shadow-md shadow-[#134e97]/25 shrink-0 transition-transform group-hover:scale-105">
                <CalendarDays className="h-5 w-5 sm:h-6 sm:w-6" />
              </span>
              <div className="flex flex-col text-left">
                <span className="text-lg sm:text-xl md:text-2xl font-bold tracking-tight text-[#134e97] leading-tight group-hover:text-[#06adc6] transition-colors whitespace-nowrap">
                  Appointment Scheduler
                </span>
                <span className="text-[10px] sm:text-xs font-medium uppercase tracking-wider text-slate-400 whitespace-nowrap">
                  Online Booking Portal
                </span>
              </div>
            </Link>
          </div>

          {/* Center: Navigation */}
          <nav className="header-nav">
            <ul className="header-nav-list">
              {DUMMY_NAV_ITEMS.map((item) =>
                item.isLink ? (
                  <li key={item.id}>
                    <Link to={item.href}>{item.label}</Link>
                  </li>
                ) : (
                  <li key={item.id} className="header-has-dropdown">
                    <a href="#" onClick={(e) => e.preventDefault()}>
                      {item.label} <i className="fas fa-chevron-down"></i>
                    </a>
                    <ul
                      className={`header-dropdown-menu ${
                        item.columns === 2 ? "header-dropdown-2col" : ""
                      }`}>
                      {item.items.map((sub, idx) => (
                        <li key={idx}>
                          <a href={sub.href} onClick={(e) => e.preventDefault()}>
                            {sub.label}
                          </a>
                        </li>
                      ))}
                    </ul>
                  </li>
                )
              )}
            </ul>
          </nav>

          {/* Right: Login / Account & Hamburger */}
          <div className="header-actions-wrap">
            {user ? (
              <UserNavPill user={user} onLogout={handleLogout} />
            ) : (
              <Link
                to="/login"
                className="header-login-btn"
                title="Login">
                <span className="header-login-icon-badge">
                  <User className="h-3.5 w-3.5" />
                </span>
                <span>LOGIN</span>
              </Link>
            )}

            {/* Hamburger Icon */}
            <div
              className="header-hamburger"
              onClick={() => setSidebarOpen(true)}
              title="Open menu">
              <span className="header-hamburger-bar"></span>
              <span className="header-hamburger-bar"></span>
              <span className="header-hamburger-bar"></span>
            </div>
          </div>
        </div>
      </div>

      {/* Hamburger Menu Sidebar */}
      <div
        className={`header-sidebar-menu ${sidebarOpen ? "active" : ""}`}
        id="sidebarMenu">
        <div
          className="header-sidebar-close"
          id="sidebarClose"
          onClick={() => {
            setSidebarOpen(false);
            setOpenSidebarDropdown(null);
          }}>
          &times;
        </div>

        <ul className="header-sidebar-nav-list">
          {DUMMY_NAV_ITEMS.map((item) =>
            item.isLink ? (
              <li key={item.id}>
                <Link to={item.href} onClick={() => setSidebarOpen(false)}>
                  {item.label}
                </Link>
              </li>
            ) : (
              <li
                key={item.id}
                className={`header-has-dropdown mobile-nav-item ${
                  openSidebarDropdown === item.id ? "active" : ""
                }`}>
                <a
                  href="#"
                  onClick={(e) => toggleSidebarDropdown(item.id, e)}>
                  <span>{item.label}</span>
                  <i
                    className="fas fa-chevron-down"
                    style={{
                      transform:
                        openSidebarDropdown === item.id
                          ? "rotate(180deg)"
                          : "rotate(0deg)",
                    }}
                  />
                </a>
                <ul
                  className={`header-dropdown-menu ${
                    item.columns === 2 ? "header-dropdown-2col" : ""
                  }`}>
                  {item.items.map((sub, idx) => (
                    <li key={idx}>
                      <a
                        href={sub.href}
                        onClick={(e) => {
                          e.preventDefault();
                          setSidebarOpen(false);
                        }}>
                        {sub.label}
                      </a>
                    </li>
                  ))}
                </ul>
              </li>
            )
          )}
        </ul>
      </div>

      {/* Sidebar Overlay */}
      <div
        className={`header-sidebar-overlay ${sidebarOpen ? "active" : ""}`}
        id="sidebarOverlay"
        onClick={() => {
          setSidebarOpen(false);
          setOpenSidebarDropdown(null);
        }}
      />
    </header>
  );
};

export default Header;
