// frontend/src/components/HomePage/Header.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import {
  Power,
  ChevronDown,
  User,
  LayoutDashboard,
  LogOut,
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
const HELPLINE_TEL = "tel:+919148080000";
const HELPLINE_DISPLAY = "HELPLINE: +91 91480 80000";

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
        <div className="row header-row">
          {/* Left: Logo */}
          <div className="col-xl-4 col-lg-3 col-md-4 col-sm-3 col-3 header-logo-col">
            <Link to={DOCTOR_LIST_PATH} className="header-logo-link" title="Brains Super Speciality Hospital">
              <img
                src="/images/brains-logo.webp"
                alt="BrainS Logo"
                className="header-logo-img"
              />
            </Link>
          </div>

          {/* Right: Content */}
          <div className="col-xl-8 col-lg-9 col-md-8 col-sm-9 col-9 header-right-col">
            {/* Top Row: Helpline, Book Appointment & Account */}
            <div className="header-top-action">
              <div className="header-helpline-group">
                <img
                  src="/images/24x7.webp"
                  alt="24/7"
                  className="header-helpline-img"
                />
                <div className="header-helpline-text">
                  <a href={HELPLINE_TEL}>{HELPLINE_DISPLAY}</a>
                </div>
              </div>

              <Link
                to={DOCTOR_LIST_PATH}
                className="header-book-btn"
                title="book an appointment">
                BOOK AN APPOINTMENT
              </Link>

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
            </div>

            {/* Bottom Row: Navigation */}
            <nav className="header-nav">
              <ul className="header-nav-list">
                {/* ABOUT */}
                <li className="header-has-dropdown">
                  <a href="https://brainshospital.com/Doctors.html">
                    ABOUT <i className="fas fa-chevron-down"></i>
                  </a>
                  <ul className="header-dropdown-menu">
                    <li>
                      <a href="https://brainshospital.com/founder.html">Founder</a>
                    </li>
                    <li>
                      <a href="https://brainshospital.com/Doctors.html">Doctors</a>
                    </li>
                  </ul>
                </li>

                {/* SPECIALITIES */}
                <li className="header-has-dropdown">
                  <a href="https://brainshospital.com/brains-hospital-specialities.html">
                    SPECIALITIES <i className="fas fa-chevron-down"></i>
                  </a>
                  <ul className="header-dropdown-menu header-dropdown-2col">
                    <li>
                      <a href="https://brainshospital.com/brain-tumor-treatment-bangalore.html">
                        Brain Tumor Treatment
                      </a>
                    </li>
                    <li>
                      <a href="https://brainshospital.com/spine-care-and-ortho-care-hospital-bangalore.html">
                        Spine Care and Ortho Care
                      </a>
                    </li>
                    <li>
                      <a href="https://brainshospital.com/nerve-compression-treatment-bangalore.html">
                        Nerve Compression Treatment
                      </a>
                    </li>
                    <li>
                      <a href="https://brainshospital.com/joint-and-bone-care-hospital.html">
                        Joint and Bone Care Treatment
                      </a>
                    </li>
                    <li>
                      <a href="https://brainshospital.com/Heart-Care.html">
                        Heart Care Treatment
                      </a>
                    </li>
                    <li>
                      <a href="https://brainshospital.com/Lung-Care.html">
                        Lung Cancer Treatment
                      </a>
                    </li>
                    <li>
                      <a href="https://brainshospital.com/General-Medicine.html">
                        General Medicine Doctor
                      </a>
                    </li>
                    <li>
                      <a href="https://brainshospital.com/Critical-care-hospital-bangalore.html">
                        Critical Care Treatment
                      </a>
                    </li>
                    <li>
                      <a href="https://brainshospital.com/Vascular-Care.html">
                        Vascular Care Treatment
                      </a>
                    </li>
                    <li>
                      <a href="https://brainshospital.com/Epilepsy-Treatment.html">
                        Epilepsy Treatment
                      </a>
                    </li>
                    <li>
                      <a href="https://brainshospital.com/Surgical-Oncology.html">
                        Surgical Oncology
                      </a>
                    </li>
                    <li>
                      <a href="https://brainshospital.com/Orthopedic-Treatment.html">
                        Orthopedic Treatment
                      </a>
                    </li>
                    <li>
                      <a href="https://brainshospital.com/neck-pain-treatment-bangalore.html">
                        Neck Pain Treatment
                      </a>
                    </li>
                    <li>
                      <a href="https://brainshospital.com/Parkinson-Disease.html">
                        Parkinson Disease
                      </a>
                    </li>
                    <li>
                      <a href="https://brainshospital.com/Brain-Tumor-Wing.html">
                        Brain Tumor Wing
                      </a>
                    </li>
                    <li>
                      <a href="https://brainshospital.com/Paediatric-Neuroscience.html">
                        Paediatric Neuroscience
                      </a>
                    </li>
                    <li>
                      <a href="https://brainshospital.com/Neuro-Nutrition.html">
                        Neuro Nutrition
                      </a>
                    </li>
                    <li>
                      <a href="https://brainshospital.com/Speech-Therapy.html">
                        Speech Therapy
                      </a>
                    </li>
                  </ul>
                </li>

                {/* CLINICS */}
                <li className="header-has-dropdown">
                  <a href="https://brainshospital.com/Parkinsons-Clinic.html">
                    CLINICS <i className="fas fa-chevron-down"></i>
                  </a>
                  <ul className="header-dropdown-menu">
                    <li>
                      <a href="https://brainshospital.com/Parkinsons-Clinic.html">
                        Parkinson's Clinic
                      </a>
                    </li>
                    <li>
                      <a href="https://brainshospital.com/Vertigo-Clinic.html">
                        Vertigo Clinic
                      </a>
                    </li>
                    <li>
                      <a href="https://brainshospital.com/Spine-care-clinic.html">
                        Spine Care Clinic
                      </a>
                    </li>
                    <li>
                      <a href="https://brainshospital.com/Multiple-Sclerosis-Clinic.html">
                        Multiple Sclerosis Clinic
                      </a>
                    </li>
                    <li>
                      <a href="https://brainshospital.com/Craniofacial-Clinic.html">
                        Craniofacial Clinic
                      </a>
                    </li>
                    <li>
                      <a href="https://brainshospital.com/Alzheimers-and-Dementia-Clinic.html">
                        Alzheimer's & Dementia Clinic
                      </a>
                    </li>
                    <li>
                      <a href="https://brainshospital.com/Motor-Neuron-Disease.html">
                        Motor Neuron Disease Clinic
                      </a>
                    </li>
                    <li>
                      <a href="https://brainshospital.com/stroke-brain-attack-clinic.html">
                        Stroke (Brain Attack) Clinic
                      </a>
                    </li>
                    <li>
                      <a href="https://brainshospital.com/ENT-clinic-at-brains-hospital.html">
                        ENT Clinic at Brains Hospital
                      </a>
                    </li>
                    <li>
                      <a href="https://brainshospital.com/Neuro-genetics-clinic-at-Brains-Hospital.html">
                        Neuro Genetic Clinic
                      </a>
                    </li>
                  </ul>
                </li>

                {/* INPATIENT */}
                <li className="header-has-dropdown">
                  <a href="https://brainshospital.com/Inpatient.html">
                    INPATIENT <i className="fas fa-chevron-down"></i>
                  </a>
                  <ul className="header-dropdown-menu">
                    <li>
                      <a href="https://brainshospital.com/Admission-Procedures.html">
                        Admission Procedures
                      </a>
                    </li>
                    <li>
                      <a href="https://brainshospital.com/Important-Guidelines.html">
                        Important Guidelines
                      </a>
                    </li>
                    <li>
                      <a href="https://brainshospital.com/Registration.html">
                        Registration
                      </a>
                    </li>
                    <li>
                      <a href="https://brainshospital.com/InsuranceMediclaim.html">
                        Insurance/Mediclaim
                      </a>
                    </li>
                    <li>
                      <a href="https://brainshospital.com/Food.html">Food</a>
                    </li>
                    <li>
                      <a href="https://brainshospital.com/Discharge-Process.html">
                        Discharge Process
                      </a>
                    </li>
                    <li>
                      <a href="https://brainshospital.com/Feedback.html">
                        Feedback
                      </a>
                    </li>
                  </ul>
                </li>

                {/* RESOURCES */}
                <li className="header-has-dropdown">
                  <a href="https://brainshospital.com/Brain-Voice.html">
                    RESOURCES <i className="fas fa-chevron-down"></i>
                  </a>
                  <ul className="header-dropdown-menu">
                    <li>
                      <a href="https://brainshospital.com/Brain-Voice.html">
                        Brain Voice
                      </a>
                    </li>
                    <li>
                      <a href="https://brainshospital.com/Articles-by-Dr-Venkataramana.html">
                        Articles by Dr. Venkataramana
                      </a>
                    </li>
                    <li>
                      <a href="https://brainshospital.com/News-Brains.html">
                        News @Brains
                      </a>
                    </li>
                    <li>
                      <a href="https://brainshospital.com/Articles-by-Specialists.html">
                        Articles by Specialists
                      </a>
                    </li>
                    <li>
                      <a href="https://brainshospital.com/Brain-Wave-of-the-week.html">
                        Brain Wave of the Week
                      </a>
                    </li>
                    <li>
                      <a href="https://brainshospital.com/Basal-Ganglia-Support-Group.html">
                        Basal Ganglia Support Group
                      </a>
                    </li>
                    <li>
                      <a href="https://brainshospital.com/Brain-Attack-Stroke-Support-Group.html">
                        Brain Attack (Stroke) Support Group
                      </a>
                    </li>
                    <li>
                      <a href="https://brainshospital.com/CSR.html">CSR</a>
                    </li>
                    <li>
                      <a href="https://brainshospital.com/Intensive-Care-Unit.html">
                        Intensive Care Unit
                      </a>
                    </li>
                    <li>
                      <a href="https://brainshospital.com/World-Health-Day.html">
                        World Health Day
                      </a>
                    </li>
                    <li>
                      <a href="https://brainshospital.com/Donate-and-gift-lives.html">
                        Donate & Gift Lives
                      </a>
                    </li>
                    <li>
                      <a href="https://brainshospital.com/Patient-Stories.html">
                        Patient Stories
                      </a>
                    </li>
                    <li>
                      <a href="https://brainshospital.com/Case-Studies.html">
                        Case Studies
                      </a>
                    </li>
                    <li>
                      <a href="https://brainshospital.com/Golden-HourSocial-Initiative.html">
                        Golden Hour-Social Initiative
                      </a>
                    </li>
                    <li>
                      <a href="https://brainshospital.com/Maitri-Program.html">
                        Maitri Program
                      </a>
                    </li>
                  </ul>
                </li>

                {/* MEDIA */}
                <li className="header-has-dropdown">
                  <a href="https://brainshospital.com/Gallery.html">
                    MEDIA <i className="fas fa-chevron-down"></i>
                  </a>
                  <ul className="header-dropdown-menu">
                    <li>
                      <a href="https://brainshospital.com/Gallery.html">Gallery</a>
                    </li>
                    <li>
                      <a href="https://brainshospital.com/Videos.html">Videos</a>
                    </li>
                  </ul>
                </li>
              </ul>

              {/* Mobile-only Login / User pill placed side-by-side with Hamburger */}
              <div className="header-mobile-login-wrap">
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
              </div>

              {/* Hamburger Icon */}
              <div
                className="header-hamburger"
                onClick={() => setSidebarOpen(true)}
                title="Open menu">
                <span className="header-hamburger-bar"></span>
                <span className="header-hamburger-bar"></span>
                <span className="header-hamburger-bar"></span>
              </div>
            </nav>
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
          {/* ABOUT */}
          <li
            className={`header-has-dropdown mobile-nav-item ${
              openSidebarDropdown === "about" ? "active" : ""
            }`}>
            <a
              href="https://brainshospital.com/Doctors.html"
              onClick={(e) => toggleSidebarDropdown("about", e)}>
              <span>ABOUT</span>
              <i
                className="fas fa-chevron-down"
                style={{
                  transform:
                    openSidebarDropdown === "about"
                      ? "rotate(180deg)"
                      : "rotate(0deg)",
                }}
              />
            </a>
            <ul className="header-dropdown-menu">
              <li>
                <a
                  href="https://brainshospital.com/founder.html"
                  onClick={() => setSidebarOpen(false)}>
                  Founder
                </a>
              </li>
              <li>
                <a
                  href="https://brainshospital.com/Doctors.html"
                  onClick={() => setSidebarOpen(false)}>
                  Doctors
                </a>
              </li>
            </ul>
          </li>

          {/* SPECIALITIES */}
          <li
            className={`header-has-dropdown mobile-nav-item ${
              openSidebarDropdown === "specialities" ? "active" : ""
            }`}>
            <a
              href="https://brainshospital.com/brains-hospital-specialities.html"
              onClick={(e) => toggleSidebarDropdown("specialities", e)}>
              <span>SPECIALITIES</span>
              <i
                className="fas fa-chevron-down"
                style={{
                  transform:
                    openSidebarDropdown === "specialities"
                      ? "rotate(180deg)"
                      : "rotate(0deg)",
                }}
              />
            </a>
            <ul className="header-dropdown-menu header-dropdown-2col">
              <li><a href="https://brainshospital.com/brain-tumor-treatment-bangalore.html" onClick={() => setSidebarOpen(false)}>Brain Tumor Treatment</a></li>
              <li><a href="https://brainshospital.com/spine-care-and-ortho-care-hospital-bangalore.html" onClick={() => setSidebarOpen(false)}>Spine Care and Ortho Care</a></li>
              <li><a href="https://brainshospital.com/nerve-compression-treatment-bangalore.html" onClick={() => setSidebarOpen(false)}>Nerve Compression Treatment</a></li>
              <li><a href="https://brainshospital.com/joint-and-bone-care-hospital.html" onClick={() => setSidebarOpen(false)}>Joint and Bone Care Treatment</a></li>
              <li><a href="https://brainshospital.com/Heart-Care.html" onClick={() => setSidebarOpen(false)}>Heart Care Treatment</a></li>
              <li><a href="https://brainshospital.com/Lung-Care.html" onClick={() => setSidebarOpen(false)}>Lung Cancer Treatment</a></li>
              <li><a href="https://brainshospital.com/General-Medicine.html" onClick={() => setSidebarOpen(false)}>General Medicine Doctor</a></li>
              <li><a href="https://brainshospital.com/Critical-care-hospital-bangalore.html" onClick={() => setSidebarOpen(false)}>Critical Care Treatment</a></li>
              <li><a href="https://brainshospital.com/Vascular-Care.html" onClick={() => setSidebarOpen(false)}>Vascular Care Treatment</a></li>
              <li><a href="https://brainshospital.com/Epilepsy-Treatment.html" onClick={() => setSidebarOpen(false)}>Epilepsy Treatment</a></li>
              <li><a href="https://brainshospital.com/Surgical-Oncology.html" onClick={() => setSidebarOpen(false)}>Surgical Oncology</a></li>
              <li><a href="https://brainshospital.com/Orthopedic-Treatment.html" onClick={() => setSidebarOpen(false)}>Orthopedic Treatment</a></li>
              <li><a href="https://brainshospital.com/neck-pain-treatment-bangalore.html" onClick={() => setSidebarOpen(false)}>Neck Pain Treatment</a></li>
              <li><a href="https://brainshospital.com/Parkinson-Disease.html" onClick={() => setSidebarOpen(false)}>Parkinson Disease</a></li>
              <li><a href="https://brainshospital.com/Brain-Tumor-Wing.html" onClick={() => setSidebarOpen(false)}>Brain Tumor Wing</a></li>
              <li><a href="https://brainshospital.com/Paediatric-Neuroscience.html" onClick={() => setSidebarOpen(false)}>Paediatric Neuroscience</a></li>
              <li><a href="https://brainshospital.com/Neuro-Nutrition.html" onClick={() => setSidebarOpen(false)}>Neuro Nutrition</a></li>
              <li><a href="https://brainshospital.com/Speech-Therapy.html" onClick={() => setSidebarOpen(false)}>Speech Therapy</a></li>
            </ul>
          </li>

          {/* CLINICS */}
          <li
            className={`header-has-dropdown mobile-nav-item ${
              openSidebarDropdown === "clinics" ? "active" : ""
            }`}>
            <a
              href="https://brainshospital.com/Parkinsons-Clinic.html"
              onClick={(e) => toggleSidebarDropdown("clinics", e)}>
              <span>CLINICS</span>
              <i
                className="fas fa-chevron-down"
                style={{
                  transform:
                    openSidebarDropdown === "clinics"
                      ? "rotate(180deg)"
                      : "rotate(0deg)",
                }}
              />
            </a>
            <ul className="header-dropdown-menu">
              <li><a href="https://brainshospital.com/Parkinsons-Clinic.html" onClick={() => setSidebarOpen(false)}>Parkinson's Clinic</a></li>
              <li><a href="https://brainshospital.com/Vertigo-Clinic.html" onClick={() => setSidebarOpen(false)}>Vertigo Clinic</a></li>
              <li><a href="https://brainshospital.com/Spine-care-clinic.html" onClick={() => setSidebarOpen(false)}>Spine Care Clinic</a></li>
              <li><a href="https://brainshospital.com/Multiple-Sclerosis-Clinic.html" onClick={() => setSidebarOpen(false)}>Multiple Sclerosis Clinic</a></li>
              <li><a href="https://brainshospital.com/Craniofacial-Clinic.html" onClick={() => setSidebarOpen(false)}>Craniofacial Clinic</a></li>
              <li><a href="https://brainshospital.com/Alzheimers-and-Dementia-Clinic.html" onClick={() => setSidebarOpen(false)}>Alzheimer's & Dementia Clinic</a></li>
              <li><a href="https://brainshospital.com/Motor-Neuron-Disease.html" onClick={() => setSidebarOpen(false)}>Motor Neuron Disease Clinic</a></li>
              <li><a href="https://brainshospital.com/stroke-brain-attack-clinic.html" onClick={() => setSidebarOpen(false)}>Stroke (Brain Attack) Clinic</a></li>
              <li><a href="https://brainshospital.com/ENT-clinic-at-brains-hospital.html" onClick={() => setSidebarOpen(false)}>ENT Clinic at Brains Hospital</a></li>
              <li><a href="https://brainshospital.com/Neuro-genetics-clinic-at-Brains-Hospital.html" onClick={() => setSidebarOpen(false)}>Neuro Genetic Clinic</a></li>
            </ul>
          </li>

          {/* INPATIENT */}
          <li
            className={`header-has-dropdown mobile-nav-item ${
              openSidebarDropdown === "inpatient" ? "active" : ""
            }`}>
            <a
              href="https://brainshospital.com/Inpatient.html"
              onClick={(e) => toggleSidebarDropdown("inpatient", e)}>
              <span>INPATIENT</span>
              <i
                className="fas fa-chevron-down"
                style={{
                  transform:
                    openSidebarDropdown === "inpatient"
                      ? "rotate(180deg)"
                      : "rotate(0deg)",
                }}
              />
            </a>
            <ul className="header-dropdown-menu">
              <li><a href="https://brainshospital.com/Admission-Procedures.html" onClick={() => setSidebarOpen(false)}>Admission Procedures</a></li>
              <li><a href="https://brainshospital.com/Important-Guidelines.html" onClick={() => setSidebarOpen(false)}>Important Guidelines</a></li>
              <li><a href="https://brainshospital.com/Registration.html" onClick={() => setSidebarOpen(false)}>Registration</a></li>
              <li><a href="https://brainshospital.com/InsuranceMediclaim.html" onClick={() => setSidebarOpen(false)}>Insurance/Mediclaim</a></li>
              <li><a href="https://brainshospital.com/Food.html" onClick={() => setSidebarOpen(false)}>Food</a></li>
              <li><a href="https://brainshospital.com/Discharge-Process.html" onClick={() => setSidebarOpen(false)}>Discharge Process</a></li>
              <li><a href="https://brainshospital.com/Feedback.html" onClick={() => setSidebarOpen(false)}>Feedback</a></li>
            </ul>
          </li>

          {/* RESOURCES */}
          <li
            className={`header-has-dropdown mobile-nav-item ${
              openSidebarDropdown === "resources" ? "active" : ""
            }`}>
            <a
              href="https://brainshospital.com/Brain-Voice.html"
              onClick={(e) => toggleSidebarDropdown("resources", e)}>
              <span>RESOURCES</span>
              <i
                className="fas fa-chevron-down"
                style={{
                  transform:
                    openSidebarDropdown === "resources"
                      ? "rotate(180deg)"
                      : "rotate(0deg)",
                }}
              />
            </a>
            <ul className="header-dropdown-menu">
              <li><a href="https://brainshospital.com/Brain-Voice.html" onClick={() => setSidebarOpen(false)}>Brain Voice</a></li>
              <li><a href="https://brainshospital.com/Articles-by-Dr-Venkataramana.html" onClick={() => setSidebarOpen(false)}>Articles by Dr. Venkataramana</a></li>
              <li><a href="https://brainshospital.com/News-Brains.html" onClick={() => setSidebarOpen(false)}>News @Brains</a></li>
              <li><a href="https://brainshospital.com/Articles-by-Specialists.html" onClick={() => setSidebarOpen(false)}>Articles by Specialists</a></li>
              <li><a href="https://brainshospital.com/Brain-Wave-of-the-week.html" onClick={() => setSidebarOpen(false)}>Brain Wave of the Week</a></li>
              <li><a href="https://brainshospital.com/Basal-Ganglia-Support-Group.html" onClick={() => setSidebarOpen(false)}>Basal Ganglia Support Group</a></li>
              <li><a href="https://brainshospital.com/Brain-Attack-Stroke-Support-Group.html" onClick={() => setSidebarOpen(false)}>Brain Attack (Stroke) Support Group</a></li>
              <li><a href="https://brainshospital.com/CSR.html" onClick={() => setSidebarOpen(false)}>CSR</a></li>
              <li><a href="https://brainshospital.com/Intensive-Care-Unit.html" onClick={() => setSidebarOpen(false)}>Intensive Care Unit</a></li>
              <li><a href="https://brainshospital.com/World-Health-Day.html" onClick={() => setSidebarOpen(false)}>World Health Day</a></li>
              <li><a href="https://brainshospital.com/Donate-and-gift-lives.html" onClick={() => setSidebarOpen(false)}>Donate & Gift Lives</a></li>
              <li><a href="https://brainshospital.com/Patient-Stories.html" onClick={() => setSidebarOpen(false)}>Patient Stories</a></li>
              <li><a href="https://brainshospital.com/Case-Studies.html" onClick={() => setSidebarOpen(false)}>Case Studies</a></li>
              <li><a href="https://brainshospital.com/Golden-HourSocial-Initiative.html" onClick={() => setSidebarOpen(false)}>Golden Hour-Social Initiative</a></li>
              <li><a href="https://brainshospital.com/Maitri-Program.html" onClick={() => setSidebarOpen(false)}>Maitri Program</a></li>
            </ul>
          </li>

          {/* MEDIA */}
          <li
            className={`header-has-dropdown mobile-nav-item ${
              openSidebarDropdown === "media" ? "active" : ""
            }`}>
            <a
              href="https://brainshospital.com/Gallery.html"
              onClick={(e) => toggleSidebarDropdown("media", e)}>
              <span>MEDIA</span>
              <i
                className="fas fa-chevron-down"
                style={{
                  transform:
                    openSidebarDropdown === "media"
                      ? "rotate(180deg)"
                      : "rotate(0deg)",
                }}
              />
            </a>
            <ul className="header-dropdown-menu">
              <li><a href="https://brainshospital.com/Gallery.html" onClick={() => setSidebarOpen(false)}>Gallery</a></li>
              <li><a href="https://brainshospital.com/Videos.html" onClick={() => setSidebarOpen(false)}>Videos</a></li>
            </ul>
          </li>

          {/* Standalone links */}
          <li>
            <a
              href="https://brainshospital.com/INTERNATIONAL-PATIENTS.html"
              onClick={() => setSidebarOpen(false)}>
              INTERNATIONAL PATIENTS
            </a>
          </li>
          <li>
            <a
              href="https://brainshospital.com/Diseases.html"
              onClick={() => setSidebarOpen(false)}>
              DISEASES
            </a>
          </li>
          <li>
            <a
              href="https://brainshospital.com/Key-Procedures.html"
              onClick={() => setSidebarOpen(false)}>
              KEY PROCEDURES
            </a>
          </li>
          <li>
            <a
              href="https://brainshospital.com/Contact-Us.html"
              onClick={() => setSidebarOpen(false)}>
              CONTACT US
            </a>
          </li>
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
