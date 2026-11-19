/** Hospital site demo nav targets */
export const HOSPITAL_SITE = "#";

const u = (path) => "#";

export const hospitalNavMenus = [
  {
    id: "specialities",
    label: "SPECIALTIES",
    href: "#",
    columns: [
      [
        { label: "Cardiology", href: "#" },
        { label: "Neurology", href: "#" },
        { label: "Orthopedics", href: "#" },
        { label: "General Medicine", href: "#" },
        { label: "Pediatrics", href: "#" },
      ],
      [
        { label: "Dermatology", href: "#" },
        { label: "Oncology", href: "#" },
        { label: "ENT Care", href: "#" },
        { label: "Critical Care", href: "#" },
        { label: "Physiotherapy", href: "#" },
      ],
    ],
  },
  {
    id: "services",
    label: "SERVICES",
    href: "#",
    items: [
      { label: "OPD Consultations", href: "#" },
      { label: "24/7 Emergency Care", href: "#" },
      { label: "Diagnostics & Lab Tests", href: "#" },
      { label: "Radiology & Imaging", href: "#" },
      { label: "Health Checkup Packages", href: "#" },
    ],
  },
  {
    id: "patient-care",
    label: "PATIENT CARE",
    href: "#",
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
    href: "#",
    items: [
      { label: "Hospital Overview", href: "#" },
      { label: "Our Medical Experts", href: "#" },
      { label: "Infrastructure & Technology", href: "#" },
      { label: "Quality & Safety Standards", href: "#" },
    ],
  },
  {
    id: "contact",
    label: "CONTACT",
    href: "#",
    items: [
      { label: "Hospital Locations", href: "#" },
      { label: "Emergency Contacts", href: "#" },
      { label: "Feedback & Enquiries", href: "#" },
    ],
  },
];

export const hospitalNavSecondary = [
  { label: "International Patients", href: "#" },
  { label: "Health Checkups", href: "#" },
  { label: "Key Procedures", href: "#" },
  { label: "Contact Us", href: "#" },
];

/** Doctor app routes that must keep the default header (not patient booking UI) */
const DOCTOR_APP_RESERVED_SEGMENTS = new Set([
  "dashboard",
  "appointments",
  "profile",
  "detail",
]);

/** Patient-facing pages that use the hospital site nav bar in Header */
export function isHospitalSiteHeaderRoute(pathname) {
  if (!pathname) return false;
  if (pathname === "/patient/DoctorListPage") return true;
  if (/^\/doctor\/detail\/[^/]+$/.test(pathname)) return true;

  const bookMatch = pathname.match(/^\/doctor\/([^/]+)$/);
  if (bookMatch && !DOCTOR_APP_RESERVED_SEGMENTS.has(bookMatch[1])) {
    return true;
  }

  return false;
}
