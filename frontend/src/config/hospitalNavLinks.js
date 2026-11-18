/** Official Brains Hospital site — external nav targets */
export const HOSPITAL_SITE = "https://brainshospital.com";

const u = (path) => `${HOSPITAL_SITE}${path.startsWith("/") ? path : `/${path}`}`;

export const hospitalNavMenus = [
  {
    id: "about",
    label: "ABOUT",
    href: u("/Doctors"),
    items: [
      { label: "Founder", href: u("/founder") },
      { label: "Doctors", href: u("/Doctors") },
    ],
  },
  {
    id: "specialities",
    label: "SPECIALITIES",
    href: u("/brains-hospital-specialities"),
    columns: [
      [
        { label: "Brain Tumor Treatment", href: u("/brain-tumor-treatment-bangalore") },
        { label: "Spine Care and Ortho Care", href: u("/spine-care-and-ortho-care-hospital-bangalore") },
        { label: "Nerve Compression Treatment", href: u("/nerve-compression-treatment-bangalore") },
        { label: "Joint and Bone Care Treatment", href: u("/joint-and-bone-care-hospital") },
        { label: "Heart Care Treatment", href: u("/Heart-Care") },
        { label: "Lung Cancer Treatment", href: u("/Lung-Care") },
        { label: "General Medicine Doctor", href: u("/General-Medicine") },
        { label: "Critical Care Treatment", href: u("/Critical-care-hospital-bangalore") },
        { label: "Vascular Care Treatment", href: u("/Vascular-Care") },
      ],
      [
        { label: "Epilepsy Treatment", href: u("/Epilepsy-Treatment") },
        { label: "Surgical Oncology", href: u("/Surgical-Oncology") },
        { label: "Orthopedic Treatment", href: u("/Orthopedic-Treatment") },
        { label: "Neck Pain Treatment", href: u("/neck-pain-treatment-bangalore") },
        { label: "Parkinson Disease", href: u("/Parkinson-Disease") },
        { label: "Brain Tumor Wing", href: u("/Brain-Tumor-Wing") },
        { label: "Paediatric Neuroscience", href: u("/Paediatric-Neuroscience") },
        { label: "Neuro Nutrition", href: u("/Neuro-Nutrition") },
        { label: "Speech Therapy", href: u("/Speech-Therapy") },
      ],
    ],
  },
  {
    id: "clinic",
    label: "CLINIC",
    href: u("/Parkinsons-Clinic"),
    items: [
      { label: "Parkinson's Clinic", href: u("/Parkinsons-Clinic") },
      { label: "Vertigo Clinic", href: u("/Vertigo-Clinic") },
      { label: "Spine Care Clinic", href: u("/Spine-care-clinic") },
      { label: "Multiple Sclerosis Clinic", href: u("/Multiple-Sclerosis-Clinic") },
      { label: "Craniofacial Clinic", href: u("/Craniofacial-Clinic") },
      { label: "Alzheimer's & Dementia Clinic", href: u("/Alzheimers-and-Dementia-Clinic") },
      { label: "Motor Neuron Disease Clinic", href: u("/Motor-Neuron-Disease") },
      { label: "Stroke (Brain Attack) Clinic", href: u("/stroke-brain-attack-clinic") },
      { label: "ENT Clinic at Brains Hospital", href: u("/ENT-clinic-at-brains-hospital") },
      { label: "Neuro Genetic Clinic", href: u("/Neuro-genetics-clinic-at-Brains-Hospital") },
    ],
  },
  {
    id: "inpatient",
    label: "INPATIENT",
    href: u("/Inpatient"),
    items: [
      { label: "Admission Procedures", href: u("/Admission-Procedures") },
      { label: "Important Guidelines", href: u("/Important-Guidelines") },
      { label: "Registration", href: u("/Registration") },
      { label: "Insurance/Mediclaim", href: u("/InsuranceMediclaim") },
      { label: "Food", href: u("/Food") },
      { label: "Discharge Process", href: u("/Discharge-Process") },
      { label: "Feedback", href: u("/Feedback") },
    ],
  },
  {
    id: "resources",
    label: "RESOURCES",
    href: u("/Brain-Voice"),
    items: [
      { label: "Brain Voice", href: u("/Brain-Voice") },
      { label: "Articles by Dr. Venkataramana", href: u("/Articles-by-Dr-Venkataramana") },
      { label: "News @Brains", href: u("/News-Brains") },
      { label: "Articles by Specialists", href: u("/Articles-by-Specialists") },
      { label: "Brain Wave of the Week", href: u("/Brain-Wave-of-the-week") },
      { label: "Basal Ganglia Support Group", href: u("/Basal-Ganglia-Support-Group") },
      { label: "Brain Attack (Stroke) Support Group", href: u("/Brain-Attack-Stroke-Support-Group") },
      { label: "CSR", href: u("/CSR") },
      { label: "Intensive Care Unit", href: u("/Intensive-Care-Unit") },
      { label: "World Health Day", href: u("/World-Health-Day") },
      { label: "Donate & Gift Lives", href: u("/Donate-and-gift-lives") },
      { label: "Patient Stories", href: u("/Patient-Stories") },
      { label: "Case Studies", href: u("/Case-Studies") },
      { label: "Golden Hour-Social Initiative", href: u("/Golden-HourSocial-Initiative") },
      { label: "Maitri Program", href: u("/Maitri-Program") },
    ],
  },
  {
    id: "media",
    label: "MEDIA",
    href: u("/Gallery"),
    items: [
      { label: "Gallery", href: u("/Gallery") },
      { label: "Videos", href: u("/Videos") },
    ],
  },
];

export const hospitalNavSecondary = [
  { label: "International Patients", href: u("/INTERNATIONAL-PATIENTS") },
  { label: "Diseases", href: u("/Diseases") },
  { label: "Key Procedures", href: u("/Key-Procedures") },
  { label: "Contact Us", href: u("/Contact-Us") },
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
