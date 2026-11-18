// services/notificationService.js
const nodemailer = require("nodemailer");
const gmailService = require("./gmailService");

const {
  SMTP_HOST,
  SMTP_PORT,
  SMTP_USER,
  SMTP_PASS,
} = process.env;

let transporter = null;

const BRAND = {
  primary: "#134e97",
  accent: "#06adc6",
  text: "#1f2937",
  muted: "#6b7280",
  border: "#e5e7eb",
  bg: "#eef5fb",
  card: "#ffffff",
  soft: "#f0f7fc",
};

const STATUS_TONES = {
  confirmed: { bg: "#ecfdf5", border: "#a7f3d0", text: "#047857", label: "Confirmed" },
  cancelled: { bg: "#fef2f2", border: "#fecaca", text: "#b91c1c", label: "Cancelled" },
  rescheduled: { bg: "#fffbeb", border: "#fde68a", text: "#b45309", label: "Rescheduled" },
  reassigned: { bg: "#eff6ff", border: "#bfdbfe", text: "#1d4ed8", label: "Doctor changed" },
  status: { bg: "#f8fafc", border: "#e2e8f0", text: "#334155", label: "Updated" },
  welcome: { bg: "#ecfeff", border: "#a5f3fc", text: "#0e7490", label: "Welcome" },
  password: { bg: "#fff7ed", border: "#fed7aa", text: "#c2410c", label: "Security" },
  reminder: { bg: "#eff6ff", border: "#bfdbfe", text: "#1d4ed8", label: "Reminder" },
};

function getTransporter() {
  if (transporter) return transporter;

  if (!SMTP_HOST || !SMTP_PORT || !SMTP_USER || !SMTP_PASS) {
    console.warn("✉️ SMTP not fully configured. Emails will NOT be sent.");
    return null;
  }

  transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT || 587),
    secure: String(SMTP_PORT) === "465",
    auth: {
      user: SMTP_USER,
      pass: SMTP_PASS,
    },
  });

  transporter.verify((err) => {
    if (err) {
      console.error("✉️ SMTP connection failed:", err.message || err);
    } else {
      console.log("✉️ SMTP server is ready to take our messages");
    }
  });

  return transporter;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatDateTimeIST(date) {
  if (!date) return "";
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return "";

  return d.toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

function formatDateIST(date) {
  if (!date) return "";
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-IN", {
    timeZone: "Asia/Kolkata",
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function formatTimeIST(date) {
  if (!date) return "";
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("en-IN", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

async function sendMail(to, subject, html) {
  if (!to) {
    console.warn("✉️ No recipient email provided");
    return;
  }
  try {
    await gmailService.sendMail(to, subject, html);
    console.log(`✉️ Email sent successfully to ${to}`);
  } catch (error) {
    console.error(`✉️ Failed to send email to ${to}:`, error.message);
  }
}

function detailRow(label, value, { last = false } = {}) {
  if (value === undefined || value === null || value === "") return "";
  const border = last ? "" : `border-bottom:1px solid ${BRAND.border};`;

  // Always stack label above value — side-by-side columns collapse on mobile Gmail
  return `
    <tr>
      <td style="padding:14px 0;${border}vertical-align:top;width:100%;">
        <div style="font-size:12px;letter-spacing:0.04em;text-transform:uppercase;color:${BRAND.muted};font-weight:600;margin:0 0 6px 0;line-height:1.4;">
          ${escapeHtml(label)}
        </div>
        <div style="font-size:15px;color:${BRAND.text};font-weight:600;line-height:1.55;word-break:break-word;overflow-wrap:break-word;mso-line-height-rule:exactly;">
          ${value}
        </div>
      </td>
    </tr>
  `;
}

function detailsTable(rows) {
  const html = rows.filter(Boolean).join("");
  if (!html) return "";
  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;width:100%;">
      ${html}
    </table>
  `;
}

function statusPill(toneKey, customLabel) {
  const tone = STATUS_TONES[toneKey] || STATUS_TONES.status;
  const label = customLabel || tone.label;
  return `
    <span style="display:inline-block;padding:6px 12px;border-radius:999px;background:${tone.bg};border:1px solid ${tone.border};color:${tone.text};font-size:12px;font-weight:700;letter-spacing:0.02em;">
      ${escapeHtml(label)}
    </span>
  `;
}

function hospitalContactDetailsHtml() {
  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-top:10px;">
      <tr>
        <td style="padding:22px 24px;border-radius:14px;background:${BRAND.soft};border:1px solid ${BRAND.border};">
          <p style="margin:0 0 10px 0;font-size:14px;font-weight:700;color:${BRAND.primary};">
            Brains Hospital
          </p>
          <p style="margin:0 0 12px 0;font-size:14px;color:${BRAND.text};line-height:1.7;">
            #192, T Mariyappa Road, Lalbagh,<br/>
            Siddapura, Jayanagar 1st Block,<br/>
            Bengaluru, Karnataka 560011, India.
          </p>
          <p style="margin:0 0 12px 0;font-size:14px;color:${BRAND.text};line-height:1.7;">
            <strong style="color:${BRAND.primary};">Timings</strong><br/>
            Monday to Saturday · 09:00 AM – 05:00 PM &amp; 05:00 PM – 08:00 PM<br/>
            Sunday Holiday
          </p>
          <p style="margin:0;font-size:14px;color:${BRAND.text};line-height:1.7;">
            <strong style="color:${BRAND.primary};">Phone</strong><br/>
            <a href="tel:+919148080000" style="color:${BRAND.accent};text-decoration:none;font-weight:600;">+91 91480 80000</a>
            &nbsp;·&nbsp;
            <a href="tel:+918073012345" style="color:${BRAND.accent};text-decoration:none;font-weight:600;">+91 8073012345</a>
          </p>
        </td>
      </tr>
    </table>
  `;
}

function baseEmailTemplate({
  eyebrow = "Appointment update",
  title,
  intro,
  detailsHtml,
  includeHospitalInfo = false,
  tone = "status",
  statusLabel,
}) {
  const toneCfg = STATUS_TONES[tone] || STATUS_TONES.status;

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="X-UA-Compatible" content="IE=edge" />
  <title>${escapeHtml(title)}</title>
  <!--[if mso]>
  <style type="text/css">
    table { border-collapse: collapse; }
    td { font-family: Arial, sans-serif; }
  </style>
  <![endif]-->
</head>
<body style="margin:0;padding:0;background:${BRAND.bg};-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;background:${BRAND.bg};width:100%;">
    <tr>
      <td align="center" style="padding:24px 12px;">
        <!--[if mso]>
        <table role="presentation" width="640" cellpadding="0" cellspacing="0" border="0"><tr><td>
        <![endif]-->
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;max-width:640px;width:100%;">
          <tr>
            <td style="padding:0 4px 14px 4px;">
              <p style="margin:0;font-size:12px;letter-spacing:0.12em;text-transform:uppercase;color:${BRAND.primary};font-weight:700;">
                Brains Hospital
              </p>
            </td>
          </tr>
          <tr>
            <td style="background:${BRAND.card};border-radius:16px;overflow:hidden;border:1px solid ${BRAND.border};">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;width:100%;">
                <tr>
                  <td style="height:5px;background:${BRAND.primary};font-size:0;line-height:0;">&nbsp;</td>
                </tr>
                <tr>
                  <td style="padding:28px 24px 10px 24px;">
                    ${statusPill(tone, statusLabel)}
                    <p style="margin:14px 0 0 0;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:${BRAND.muted};font-weight:600;">
                      ${escapeHtml(eyebrow)}
                    </p>
                    <h1 style="margin:8px 0 0 0;font-family:Georgia,'Times New Roman',serif;font-size:24px;line-height:1.3;color:${BRAND.primary};font-weight:700;">
                      ${escapeHtml(title)}
                    </h1>
                    <p style="margin:14px 0 0 0;font-size:15px;line-height:1.65;color:${BRAND.text};">
                      ${intro}
                    </p>
                  </td>
                </tr>
                <tr>
                  <td style="padding:16px 24px 8px 24px;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;width:100%;">
                      <tr>
                        <td style="padding:12px 16px;border-radius:12px;background:${toneCfg.bg};border:1px solid ${toneCfg.border};">
                          ${detailsHtml}
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                ${
                  includeHospitalInfo
                    ? `<tr><td style="padding:8px 24px;">${hospitalContactDetailsHtml()}</td></tr>`
                    : ""
                }
                <tr>
                  <td style="padding:16px 24px 28px 24px;">
                    <p style="margin:0;font-size:12px;line-height:1.6;color:${BRAND.muted};">
                      This is an automated message from <strong style="color:${BRAND.text};">Brains Hospital</strong>.
                      For help with appointments, please contact reception.
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 4px 0 4px;text-align:center;">
              <p style="margin:0;font-size:11px;line-height:1.5;color:${BRAND.muted};">
                Brains Super Speciality Hospital · Bengaluru
              </p>
            </td>
          </tr>
        </table>
        <!--[if mso]>
        </td></tr></table>
        <![endif]-->
      </td>
    </tr>
  </table>
</body>
</html>
  `;
}

function doctorLabel(doctor) {
  const name = doctor?.name ? escapeHtml(doctor.name) : "N/A";
  return `Dr. ${name}`;
}

function appointmentIdLabel(appointment) {
  return `<span style="display:inline-block;max-width:100%;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:12px;font-weight:600;color:${BRAND.muted};word-break:break-word;overflow-wrap:break-word;line-height:1.5;">${escapeHtml(
    String(appointment?._id || "")
  )}</span>`;
}

function scheduleBlock(startIso, endIso) {
  const date = escapeHtml(formatDateIST(startIso));
  const start = escapeHtml(formatTimeIST(startIso));
  const end = escapeHtml(formatTimeIST(endIso));
  if (!date && !start) return "";
  return `
    <span style="display:block;">${date}</span>
    <span style="display:block;margin-top:4px;color:${BRAND.primary};">${start}${
      end ? ` – ${end}` : ""
    }</span>
  `;
}

function meetLinkBlock(meetLink) {
  const url = String(meetLink || "").trim();
  if (!url) return "";
  const safeHref = escapeHtml(url);
  return `
    <a href="${safeHref}" target="_blank" rel="noopener noreferrer"
       style="display:inline-block;margin-top:4px;padding:12px 18px;border-radius:10px;background:${BRAND.primary};color:#ffffff;text-decoration:none;font-size:14px;font-weight:700;">
      Join Google Meet
    </a>
    <span style="display:block;margin-top:10px;font-size:12px;font-weight:500;color:${BRAND.muted};line-height:1.55;word-break:break-word;overflow-wrap:break-word;">
      ${safeHref}
    </span>
  `;
}

/* =========================
   PUBLIC NOTIFICATION APIS
   ========================= */

async function sendOnlineMeetingReminderEmail({ appointment, doctor, patient }) {
  if (!patient?.email) return;

  const isOnline = String(appointment?.paymentMode || "").toLowerCase() === "online";
  if (!isOnline) return;

  const meetLink =
    appointment?.googleCalendar?.meetLink || appointment?.meetLink || null;
  if (!meetLink) return;

  const start = formatDateTimeIST(appointment.slotStartIso);
  const subject = `Reminder: Your online meeting with Dr. ${doctor.name} starts in 1 hour`;

  const detailsHtml = detailsTable([
    detailRow("Doctor", doctorLabel(doctor)),
    detailRow("Patient", escapeHtml(patient.name)),
    detailRow("When", scheduleBlock(appointment.slotStartIso, appointment.slotEndIso)),
    detailRow("Mode", "Video consultation"),
    detailRow("Google Meet", meetLinkBlock(meetLink), { stacked: true }),
    detailRow("Appointment ID", appointmentIdLabel(appointment), {
      last: true,
      stacked: true,
    }),
  ]);

  const html = baseEmailTemplate({
    eyebrow: "Meeting reminder",
    title: "Your online meeting is in 1 hour",
    intro: `Dear ${escapeHtml(
      patient.name
    )}, this is a reminder that your video consultation with ${doctorLabel(
      doctor
    )} starts at <strong>${escapeHtml(
      start
    )}</strong>. You can join Google Meet from the button below (or from My Appointments in the app) once the visit window opens.`,
    detailsHtml,
    includeHospitalInfo: true,
    tone: "reminder",
    statusLabel: "Starts in 1 hour",
  });

  await sendMail(patient.email, subject, html);

  if (doctor?.email) {
    const docSubject = `Reminder: Your online meeting with ${patient.name} starts in 1 hour`;
    const docIntro = `Dear Dr. ${escapeHtml(
      doctor.name
    )}, this is a reminder that your online meeting with patient <strong>${escapeHtml(
      patient.name
    )}</strong> starts at <strong>${escapeHtml(
      start
    )}</strong>. Details are below. You can join the Google Meet room using the link below.`;

    const docHtml = baseEmailTemplate({
      eyebrow: "Meeting reminder",
      title: "Online meeting in 1 hour",
      intro: docIntro,
      detailsHtml,
      includeHospitalInfo: true,
      tone: "reminder",
      statusLabel: "Starts in 1 hour",
    });

    await sendMail(doctor.email, docSubject, docHtml);
  }
}

function calendarLinkBlock(appointment, doctor, patient, meetLink) {
  try {
    const start = new Date(appointment.slotStartIso).toISOString().replace(/-|:|\.\d\d\d/g, "");
    const end = new Date(appointment.slotEndIso).toISOString().replace(/-|:|\.\d\d\d/g, "");
    
    const summary = `Video Consultation: ${patient?.name || 'Patient'} with Dr. ${doctor?.name || 'Doctor'}`;
    const details = [
      `Patient: ${patient?.name || 'N/A'}`,
      `Doctor: Dr. ${doctor?.name || 'N/A'}`,
      meetLink ? `Join Video Call: ${meetLink}` : null,
      `Appointment ID: ${appointment?._id}`,
    ].filter(Boolean).join('\n');
    
    const textParam = encodeURIComponent(summary);
    const datesParam = encodeURIComponent(`${start}/${end}`);
    const detailsParam = encodeURIComponent(details);
    const locationParam = meetLink ? encodeURIComponent(meetLink) : '';
    
    let calendarUrl = `https://www.google.com/calendar/render?action=TEMPLATE&text=${textParam}&dates=${datesParam}&details=${detailsParam}`;
    if (locationParam) {
      calendarUrl += `&location=${locationParam}`;
    }
    
    return `
      <a href="${calendarUrl}" target="_blank" rel="noopener noreferrer"
         style="display:inline-block;margin-top:4px;padding:12px 18px;border-radius:10px;background:#06adc6;color:#ffffff;text-decoration:none;font-size:14px;font-weight:700;">
        📅 Add to Google Calendar
      </a>
    `;
  } catch (err) {
    console.error("Error creating calendar link block:", err);
    return "";
  }
}

async function sendAppointmentBookedEmail({ appointment, doctor, patient }) {
  const start = formatDateTimeIST(appointment.slotStartIso);
  const isOnline = String(appointment?.paymentMode || "").toLowerCase() === "online";
  const meetLink = isOnline
    ? appointment?.googleCalendar?.meetLink || appointment?.meetLink || null
    : null;

  const detailRows = [
    detailRow("Doctor", doctorLabel(doctor)),
    detailRow("Patient", escapeHtml(patient?.name || "N/A")),
    detailRow("When", scheduleBlock(appointment.slotStartIso, appointment.slotEndIso)),
    detailRow("Status", escapeHtml(appointment.status || "Scheduled")),
    isOnline
      ? detailRow("Mode", "Video consultation")
      : detailRow("Mode", "In-person (pay at clinic)"),
    appointment.symptoms
      ? detailRow("Symptoms", escapeHtml(appointment.symptoms))
      : "",
  ];

  if (meetLink) {
    detailRows.push(
      detailRow("Google Meet", meetLinkBlock(meetLink), { stacked: true })
    );
  }

  if (appointment.slotStartIso && appointment.slotEndIso) {
    detailRows.push(
      detailRow("Calendar Invite", calendarLinkBlock(appointment, doctor, patient, meetLink), { stacked: true })
    );
  }

  detailRows.push(
    detailRow("Appointment ID", appointmentIdLabel(appointment), {
      last: true,
      stacked: true,
    })
  );

  // 1) Send email to Patient
  if (patient?.email) {
    const subject = `Appointment Confirmed with Dr. ${doctor?.name || "Doctor"} on ${start}`;
    const intro = meetLink
      ? `Dear ${escapeHtml(
          patient.name
        )}, your video appointment is confirmed. Use the Google Meet button below to join at the scheduled time.`
      : `Dear ${escapeHtml(
          patient.name
        )}, your visit has been booked successfully. Please arrive a few minutes early and bring any previous reports if available.`;

    const html = baseEmailTemplate({
      eyebrow: "Booking confirmation",
      title: "Your appointment is confirmed",
      intro,
      detailsHtml: detailsTable(detailRows),
      includeHospitalInfo: true,
      tone: "confirmed",
      statusLabel: "Confirmed",
    });

    try {
      await sendMail(patient.email, subject, html);
    } catch (e) {
      console.error("✉️ Failed to send email to patient:", e?.message || e);
    }
  }

  // 2) Send email to Doctor
  if (doctor?.email) {
    const docSubject = isOnline
      ? `Online Consultation Booked: ${patient?.name || "Patient"} on ${start}`
      : `Appointment Booked: ${patient?.name || "Patient"} on ${start}`;
    const docIntro = isOnline
      ? `Dear Dr. ${escapeHtml(
          doctor.name
        )}, a new video appointment has been scheduled with patient <strong>${escapeHtml(
          patient?.name || "N/A"
        )}</strong>. Details are below.`
      : `Dear Dr. ${escapeHtml(
          doctor.name
        )}, a new appointment has been scheduled with patient <strong>${escapeHtml(
          patient?.name || "N/A"
        )}</strong>. Details are below.`;

    const docHtml = baseEmailTemplate({
      eyebrow: isOnline ? "Online Booking confirmation" : "Booking confirmation",
      title: isOnline ? "New Video Appointment scheduled" : "New Appointment scheduled",
      intro: docIntro,
      detailsHtml: detailsTable(detailRows),
      includeHospitalInfo: true,
      tone: "confirmed",
      statusLabel: "Confirmed",
    });

    try {
      await sendMail(doctor.email, docSubject, docHtml);
    } catch (e) {
      console.error("✉️ Failed to send email to doctor:", e?.message || e);
    }
  }
}

async function sendAppointmentCancelledEmail({
  appointment,
  doctor,
  patient,
  cancelledByRole,
}) {
  if (!patient?.email) return;

  const who = cancelledByRole ? String(cancelledByRole) : "system";
  const subject = `Your appointment with Dr. ${doctor.name} has been cancelled`;

  const detailsHtml = detailsTable([
    detailRow("Doctor", doctorLabel(doctor)),
    detailRow("Original time", scheduleBlock(appointment.slotStartIso, appointment.slotEndIso)),
    detailRow("Status", escapeHtml(appointment.status || "Cancelled")),
    appointment.cancelReason
      ? detailRow("Reason", escapeHtml(appointment.cancelReason))
      : "",
    detailRow("Cancelled by", escapeHtml(who)),
    detailRow("Appointment ID", appointmentIdLabel(appointment), {
      last: true,
      stacked: true,
    }),
  ]);

  const html = baseEmailTemplate({
    eyebrow: "Cancellation notice",
    title: "Your appointment has been cancelled",
    intro: `Dear ${escapeHtml(
      patient.name
    )}, this appointment is no longer scheduled. If this was unexpected, please contact the clinic to rebook.`,
    detailsHtml,
    includeHospitalInfo: true,
    tone: "cancelled",
    statusLabel: "Cancelled",
  });

  await sendMail(patient.email, subject, html);
}

async function sendAppointmentRescheduledEmail({
  appointment,
  doctor,
  patient,
  requestedByRole,
}) {
  if (!patient?.email) return;

  const who = requestedByRole ? String(requestedByRole) : "system";
  const subject = `Your appointment with Dr. ${doctor.name} has been rescheduled`;

  const detailsHtml = detailsTable([
    detailRow("Doctor", doctorLabel(doctor)),
    detailRow("New time", scheduleBlock(appointment.slotStartIso, appointment.slotEndIso)),
    detailRow("Status", escapeHtml(appointment.status || "Rescheduled")),
    appointment.symptoms
      ? detailRow("Symptoms", escapeHtml(appointment.symptoms))
      : "",
    detailRow("Updated by", escapeHtml(who)),
    detailRow("Appointment ID", appointmentIdLabel(appointment), {
      last: true,
      stacked: true,
    }),
  ]);

  const html = baseEmailTemplate({
    eyebrow: "Schedule update",
    title: "Your appointment has been rescheduled",
    intro: `Dear ${escapeHtml(
      patient.name
    )}, your appointment time has been updated. Please review the new details below.`,
    detailsHtml,
    includeHospitalInfo: true,
    tone: "rescheduled",
    statusLabel: "Rescheduled",
  });

  await sendMail(patient.email, subject, html);
}

async function sendAppointmentReassignedEmail({
  appointment,
  oldDoctor,
  newDoctor,
  patient,
}) {
  if (!patient?.email) return;

  const subject = `Your appointment has been reassigned to Dr. ${newDoctor.name}`;

  const detailsHtml = detailsTable([
    detailRow("Previous doctor", doctorLabel(oldDoctor)),
    detailRow("New doctor", doctorLabel(newDoctor)),
    detailRow("When", scheduleBlock(appointment.slotStartIso, appointment.slotEndIso)),
    detailRow("Status", escapeHtml(appointment.status || "Scheduled")),
    detailRow("Appointment ID", appointmentIdLabel(appointment), {
      last: true,
      stacked: true,
    }),
  ]);

  const html = baseEmailTemplate({
    eyebrow: "Doctor assignment",
    title: "Your appointment doctor has changed",
    intro: `Dear ${escapeHtml(
      patient.name
    )}, your appointment has been assigned to a different doctor. Please review the updated details.`,
    detailsHtml,
    includeHospitalInfo: true,
    tone: "reassigned",
    statusLabel: "Doctor changed",
  });

  await sendMail(patient.email, subject, html);
}

async function sendAppointmentStatusChangedEmail({
  appointment,
  doctor,
  patient,
  previousStatus,
  newStatus,
  changedByRole,
}) {
  if (!patient?.email) return;

  const who = changedByRole ? String(changedByRole) : "system";
  const subject = `Appointment status updated: ${newStatus}`;

  const isMissedStatus =
    newStatus === "No Show" ||
    newStatus === "Missed" ||
    String(newStatus || "")
      .toLowerCase()
      .includes("no show");

  const detailsHtml = detailsTable([
    detailRow("Doctor", doctorLabel(doctor)),
    detailRow("When", scheduleBlock(appointment.slotStartIso, appointment.slotEndIso)),
    detailRow("Previous status", escapeHtml(previousStatus)),
    detailRow("Current status", escapeHtml(newStatus)),
    detailRow("Updated by", escapeHtml(who)),
    detailRow("Appointment ID", appointmentIdLabel(appointment), {
      last: true,
      stacked: true,
    }),
  ]);

  const introText = isMissedStatus
    ? `Dear ${escapeHtml(
        patient.name
      )}, this appointment was marked as <strong>Missed</strong> because the visit was not attended. If that looks wrong, please contact the clinic.`
    : `Dear ${escapeHtml(
        patient.name
      )}, the status of your appointment has been updated.`;

  const html = baseEmailTemplate({
    eyebrow: "Status update",
    title: `Appointment status: ${newStatus}`,
    intro: introText,
    detailsHtml,
    includeHospitalInfo: true,
    tone: isMissedStatus ? "cancelled" : "status",
    statusLabel: String(newStatus || "Updated"),
  });

  await sendMail(patient.email, subject, html);
}

async function sendWelcomeEmail({ name, email, password, role }) {
  if (!email) return;

  const roleStr = String(role || "staff");
  const subject = `Welcome to Brains Hospital - Your Account Credentials`;

  const detailsHtml = detailsTable([
    detailRow(
      "Account type",
      escapeHtml(roleStr.charAt(0).toUpperCase() + roleStr.slice(1))
    ),
    detailRow("Login email", escapeHtml(email)),
    detailRow(
      "Temporary password",
      `<code style="display:inline-block;background:#fff;border:1px solid ${BRAND.border};padding:6px 10px;border-radius:8px;font-size:14px;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;color:${BRAND.primary};font-weight:700;">${escapeHtml(
        password
      )}</code>`
    ),
    detailRow(
      "Next step",
      "Sign in and change this password in your profile settings. You can also continue with Google using the same email.",
      { last: true }
    ),
  ]);

  const html = baseEmailTemplate({
    eyebrow: "Account access",
    title: `Welcome, ${name || "there"}`,
    intro: `Your Brains Hospital account is ready. Use the credentials below to sign in, then update your password.`,
    detailsHtml,
    tone: "welcome",
    statusLabel: "Welcome",
  });

  await sendMail(email, subject, html);
}

async function sendPasswordChangedEmail({ name, email, newPassword, changerRole }) {
  if (!email) return;

  const subject = `Your Brains Hospital Password Has Been Updated`;
  const changer =
    changerRole === "super_admin" ? "Super Admin" : "Admin";

  const detailsHtml = detailsTable([
    detailRow("Name", escapeHtml(name)),
    detailRow("Login email", escapeHtml(email)),
    detailRow(
      "Updated password",
      `<code style="display:inline-block;background:#fff;border:1px solid ${BRAND.border};padding:6px 10px;border-radius:8px;font-size:14px;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;color:${BRAND.primary};font-weight:700;">${escapeHtml(
        newPassword
      )}</code>`
    ),
    detailRow(
      "Security note",
      `Updated by ${escapeHtml(
        changer
      )}. If you did not expect this change, contact reception immediately.`,
      { last: true }
    ),
  ]);

  const html = baseEmailTemplate({
    eyebrow: "Security notice",
    title: "Your password was updated",
    intro: `Hello ${escapeHtml(
      name
    )}, an administrator updated your login password. Use the new password below to sign in.`,
    detailsHtml,
    tone: "password",
    statusLabel: "Password updated",
  });

  await sendMail(email, subject, html);
}

module.exports = {
  sendMail,
  sendAppointmentBookedEmail,
  sendOnlineMeetingReminderEmail,
  sendAppointmentCancelledEmail,
  sendAppointmentRescheduledEmail,
  sendAppointmentReassignedEmail,
  sendAppointmentStatusChangedEmail,
  sendWelcomeEmail,
  sendPasswordChangedEmail,
};
