// services/googleCalendar.js
const { google } = require('googleapis');
const Doctor = require('../modal/Doctor');
const Patient = require('../modal/Patient');
const Admin = require('../modal/Admin');
const Receptionist = require('../modal/Receptionist');

function toRFC3339(value) {
  if (!value) return null;
  const d = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (Number.isNaN(d.getTime())) return null;

  const pad = (n) => String(n).padStart(2, '0');

  // local date/time components
  const year = d.getFullYear();
  const month = pad(d.getMonth() + 1);
  const day = pad(d.getDate());
  const hour = pad(d.getHours());
  const minute = pad(d.getMinutes());
  const second = pad(d.getSeconds());
  const tzMin = -d.getTimezoneOffset();
  const sign = tzMin >= 0 ? '+' : '-';
  const tzHour = pad(Math.floor(Math.abs(tzMin) / 60));
  const tzMinute = pad(Math.abs(tzMin) % 60);

  return `${year}-${month}-${day}T${hour}:${minute}:${second}${sign}${tzHour}:${tzMinute}`;
}

function formatDateAndTimeRange(startIso, endIso) {
  try {
    const start = new Date(startIso);
    const end = new Date(endIso);

    const dateFormatter = new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      timeZone: 'Asia/Kolkata',
    });

    const timeFormatter = new Intl.DateTimeFormat('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
      timeZone: 'Asia/Kolkata',
    });

    const dateStr = dateFormatter.format(start); // e.g. "Nov 14, 2025"
    const timeStr = `${timeFormatter.format(start)} to ${timeFormatter.format(end)}`;

    return { dateStr, timeStr };
  } catch (e) {
    return { dateStr: startIso, timeStr: `${startIso} to ${endIso}` };
  }
}

function statusToColorId(status) {
  const s = (status || '').toLowerCase();

  // Rescheduled → purple
  if (s.includes('resched') || s.includes('reschedule')) return '3';

  // Reassigned → indigo
  if (s.includes('reassign') || s.includes('reassigned')) return '7';

  // In Progress → orange
  if (s.includes('progress') || s.includes('in progress') || s.includes('inprogress'))
    return '8';

  // Pending → yellow
  if (s.includes('pend') || s.includes('pending')) return '5';

  // Completed → green
  if (s.includes('comp') || s.includes('completed')) return '10';

  // Cancelled → red
  if (s.includes('cancel') || s.includes('cancelled')) return '11';

  // No Show → dark gray (matches bg-gray-700 text-white)
  if (s.includes('no show') || s.includes('noshow')) return '4';

  // Scheduled → blue
  if (s.includes('sched') || s.includes('confirm') || s.includes('book') || s.includes('scheduled'))
    return '2';

  return '1';
}

const BLOCKED_COLOR_ID = '4';

/* ---------- description / summary builders ---------- */
function buildEventSummary(doctorDoc, patientDoc, status) {
  const patientName = patientDoc?.name || 'Patient';
  const doctorName = doctorDoc?.name || 'Doctor';
  const statusText = status ? `(${status}) •` : '';
  return `${statusText} Dr. ${doctorName} • ${patientName}`;
}

function buildEventDescription(appointmentData, doctorDoc, patientDoc) {
  const { symptoms, status, extraNote, slotStartIso, slotEndIso } = appointmentData || {};
  const patientName = patientDoc?.name || "Patient";
  const doctorName = doctorDoc?.name || "Doctor";
  const { dateStr, timeStr } = formatDateAndTimeRange(slotStartIso, slotEndIso);

  return `
📌 Appointment Details
———————————————
• Status: ${status || "Scheduled"}
• Patient: ${patientName}
• Doctor: Dr. ${doctorName}

🕒 Timing
———————————————
• Date: ${dateStr}
• Time: ${timeStr}

💬 Additional Information
———————————————
• Symptoms: ${symptoms || "Not provided"}
• Notes: ${extraNote || "None"}

(Automatically synced from the Brains Appointment System)
  `.trim();
}

function buildBlockedSummary(blockedSlot) {
  const reason = (blockedSlot && blockedSlot.reason) ? ` - ${String(blockedSlot.reason).slice(0, 80)}` : '';
  return `(Blocked) - Doctor unavailable${reason}`;
}
function buildBlockedDescription(blockedSlot, doctorDoc) {
  const { dateStr, timeStr } = formatDateAndTimeRange(blockedSlot.startTime, blockedSlot.endTime);
  return `
Blocked Slot
———————————————
• Doctor: ${doctorDoc?.name || 'Doctor'}
• Date: ${dateStr}
• Time: ${timeStr}
• Reason: ${blockedSlot?.reason || 'Not specified'}

(Managed by the Brains Hospital)
`.trim();
}

/* ---------- service class ---------- */
class GoogleCalendarService {
  constructor() {
    this.oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI
    );
  }

  getUserModel(userType) {
    switch (userType) {
      case 'doctor': return Doctor;
      case 'patient': return Patient;
      case 'admin':
      case 'super_admin': return Admin;
      case 'receptionist': return Receptionist;
      default: throw new Error('Invalid user type');
    }
  }

  async ensureAuthForUser(googleCalendarConfig) {
    if (!googleCalendarConfig?.accessToken || !googleCalendarConfig?.refreshToken) {
      throw new Error('User has no Google Calendar tokens');
    }

    this.oauth2Client.setCredentials({
      access_token: googleCalendarConfig.accessToken,
      refresh_token: googleCalendarConfig.refreshToken,
      expiry_date: googleCalendarConfig.expiryDate || googleCalendarConfig.tokenExpiry,
    });

    return this.oauth2Client;
  }

  /* ---------- Auth helpers ---------- */
  getAuthUrl(userId, userType) {
    const scopes = [
      'openid',
      'https://www.googleapis.com/auth/userinfo.profile',
      'https://www.googleapis.com/auth/userinfo.email',
      'https://www.googleapis.com/auth/calendar',
      'https://www.googleapis.com/auth/calendar.events',
      'https://www.googleapis.com/auth/gmail.send',
    ];
    const state = encodeURIComponent(JSON.stringify({ userId, userType }));
    const url = this.oauth2Client.generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent',
      scope: scopes,
      state,
    });
    return url;
  }
  async exchangeCodeForTokens(code) {
    const { tokens } = await this.oauth2Client.getToken(code);
    return tokens;
  }
  async getUserEmail(accessToken) {
    const auth = new google.auth.OAuth2();
    auth.setCredentials({ access_token: accessToken });
    const oauth2 = google.oauth2({ version: 'v2', auth });
    const res = await oauth2.userinfo.get();
    return res.data.email;
  }

  /* ---------- work calendar creation (no defaults) ---------- */
  async getOrCreateWorkCalendar(tokens, existingCalendarId = null) {
    this.oauth2Client.setCredentials({
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expiry_date: tokens.expiry_date,
    });

    const calendar = google.calendar({ version: 'v3', auth: this.oauth2Client });

    // If we have an existing calendar ID, verify that it still exists/is accessible
    if (existingCalendarId) {
      try {
        await calendar.calendars.get({ calendarId: existingCalendarId });
        console.log('✅ Verified access to existing work calendar ID:', existingCalendarId);
        return existingCalendarId;
      } catch (err) {
        console.log('⚠️ Existing calendar inaccessible or deleted, will create a new one:', err.message);
      }
    }

    console.log('📅 Creating a new "Medical Appointments" calendar...');
    const createRes = await calendar.calendars.insert({
      requestBody: { summary: 'Medical Appointments', timeZone: 'Asia/Kolkata' },
    });

    const newCalendarId = createRes.data.id;

    try {
      await calendar.calendarList.patch({
        calendarId: newCalendarId,
        requestBody: { defaultReminders: [] },
      });
    } catch (patchErr) {
      console.warn('Could not clear calendar default reminders (non-fatal):', patchErr?.message || patchErr);
    }

    return newCalendarId;
  }

  async _listCalendars(calendar) {
    try {
      const listRes = await calendar.calendarList.list({ maxResults: 250 });
      return (listRes.data.items || []).map(c => c.id);
    } catch (e) {
      // safe fallback
      return [];
    }
  }

  // Fallback search by time window + summary (best-effort)
  async _searchEventsByWindowAndSummary(calendar, calendarId, startIso, endIso, summaryQ) {
    try {
      const start = new Date(startIso);
      const end = new Date(endIso);
      const windowStart = new Date(start.getTime() - 2 * 60 * 1000).toISOString();
      const windowEnd = new Date(end.getTime() + 2 * 60 * 1000).toISOString();

      const listRes = await calendar.events.list({
        calendarId,
        timeMin: windowStart,
        timeMax: windowEnd,
        singleEvents: true,
        orderBy: 'startTime',
        q: summaryQ || undefined,
        maxResults: 250,
      });

      return listRes.data.items || [];
    } catch (e) {
      return [];
    }
  }

  // robust helper to find blocked slot events by blockedSlotId across calendars; returns map: {calendarId: [events]}
  async _findBlockedEventsAcrossCalendars(calendar, calendars, blockedSlotId) {
    const matches = {};
    for (const calId of calendars) {
      try {
        const res = await calendar.events.list({
          calendarId: calId,
          privateExtendedProperty: `blockedSlotId=${String(blockedSlotId)}`,
          singleEvents: true,
          orderBy: 'startTime',
          maxResults: 250,
        });
        const items = res.data.items || [];
        if (items.length) matches[calId] = items;
      } catch (e) {
        // some calendars may refuse privateExtendedProperty query - ignore
      }
    }
    return matches;
  }

  async findMatchingEvents(calendar, calendarId, summary, startIso, endIso, appointmentId) {
    if (appointmentId) {
      try {
        const byExt = await calendar.events.list({
          calendarId,
          privateExtendedProperty: `appointmentId=${String(appointmentId)}`,
          singleEvents: true,
          orderBy: 'startTime',
          maxResults: 20,
        });
        if (Array.isArray(byExt.data.items) && byExt.data.items.length) {
          return byExt.data.items;
        } else {
          return [];
        }
      } catch (e) {
        console.warn('privateExtendedProperty query failed:', e?.message || e);
        return [];
      }
    }

    try {
      const start = new Date(startIso);
      const end = new Date(endIso);
      const windowStart = new Date(start.getTime() - 2 * 60 * 1000).toISOString();
      const windowEnd = new Date(end.getTime() + 2 * 60 * 1000).toISOString();

      const listRes = await calendar.events.list({
        calendarId,
        timeMin: windowStart,
        timeMax: windowEnd,
        singleEvents: true,
        orderBy: 'startTime',
        q: summary,
        maxResults: 20,
      });

      return listRes.data.items || [];
    } catch (e) {
      console.warn('findMatchingEvents fallback failed:', e?.message || e);
    }

    return [];
  }

  async removeDuplicates(calendar, calendarId, items, keepEventId) {
    for (const it of items) {
      if (!it || !it.id) continue;
      if (it.id === keepEventId) continue;
      try {
        await calendar.events.delete({
          calendarId,
          eventId: it.id,
          sendUpdates: 'all',
        });
      } catch (e) {
        console.warn('Failed to delete duplicate event', it.id, e?.message || e);
      }
    }
  }

  async removeOverlappingCancelledOrNoShow(calendar, calendarId, startIso, endIso, keepEventId = null, appointmentId = null) {
    try {
      if (!startIso || !endIso) return;
      const start = new Date(startIso);
      const end = new Date(endIso);
      const windowStart = new Date(start.getTime() - 2 * 60 * 1000).toISOString();
      const windowEnd = new Date(end.getTime() + 2 * 60 * 1000).toISOString();

      const listRes = await calendar.events.list({
        calendarId,
        timeMin: windowStart,
        timeMax: windowEnd,
        singleEvents: true,
        orderBy: 'startTime',
        maxResults: 200,
      });

      const items = listRes.data.items || [];
      for (const it of items) {
        if (!it || !it.id) continue;
        if (keepEventId && it.id === keepEventId) continue;

        const eventApptId = it.extendedProperties && it.extendedProperties.private && it.extendedProperties.private.appointmentId
          ? String(it.extendedProperties.private.appointmentId)
          : null;
        if (eventApptId && appointmentId && eventApptId !== String(appointmentId)) {
          continue;
        }

        const summary = String(it.summary || '').toLowerCase();
        const color = String(it.colorId || '');

        const looksCancelled = color === statusToColorId('Cancelled') || /cancel|cancelled/.test(summary);
        const looksNoShow = color === statusToColorId('No Show') || /no[\s-]?show|noshow/.test(summary);

        if (!(looksCancelled || looksNoShow)) continue;

        if (!eventApptId && !appointmentId) {
          try {
            await calendar.events.delete({ calendarId, eventId: it.id, sendUpdates: 'none' });
          } catch (delErr) {
            console.warn('Failed to delete overlapping Cancelled/No Show event (orphan)', it.id, delErr?.message || delErr);
          }
          continue;
        }

        try {
          await calendar.events.delete({ calendarId, eventId: it.id, sendUpdates: 'none' });
        } catch (delErr) {
          console.warn('Failed to delete overlapping Cancelled/No Show event', it.id, delErr?.message || delErr);
        }
      }
    } catch (err) {
      console.warn('removeOverlappingCancelledOrNoShow failed:', err?.message || err);
    }
  }

  // ---------- CREATE APPOINTMENT (dedup-aware) ----------
  async createAppointmentEvent(doctorDoc, patientDoc, appointmentData) {
    try {
      if (!doctorDoc?.googleCalendar) return { success: false, error: 'Doctor calendar not connected' };

      await this.ensureAuthForUser(doctorDoc.googleCalendar);
      const calendar = google.calendar({ version: 'v3', auth: this.oauth2Client });
      const calendarId = doctorDoc.googleCalendar.workCalendarId || 'primary';

      const startIso = toRFC3339(appointmentData.slotStartIso);
      const endIso = toRFC3339(appointmentData.slotEndIso);
      const status = appointmentData.status || 'Scheduled';
      const appointmentIdStr = String(appointmentData.appointmentId || appointmentData._id || appointmentData.appointment || '');

      const summary = buildEventSummary(doctorDoc, patientDoc, status);
      const description = buildEventDescription({ ...appointmentData, slotStartIso: startIso, slotEndIso: endIso }, doctorDoc, patientDoc);
      const colorId = statusToColorId(status);
      const includeVideoConference = appointmentData.includeVideoConference === true;

      const extractMeetLink = (event) =>
        event?.conferenceData?.entryPoints?.find((ep) => ep.entryPointType === 'video')?.uri ||
        event?.hangoutLink ||
        null;

      // 1) Try to find existing events
      const matches = await this.findMatchingEvents(calendar, calendarId, summary, startIso, endIso, appointmentIdStr);

      if (Array.isArray(matches) && matches.length > 0) {
        // pick best candidate (prefer one with patient attendee)
        let keep = matches[0];
        for (const m of matches) {
          if (m.attendees && m.attendees.length > 0 && patientDoc?.email) {
            const hasPatient = m.attendees.some(a => String(a.email).toLowerCase() === String(patientDoc.email).toLowerCase());
            if (hasPatient) { keep = m; break; }
          }
        }

        // patch the kept event
        const patchBody = {
          summary,
          description,
          colorId,
          reminders: {
            useDefault: false,
            overrides: [
              { method: 'email', minutes: 60 },
              { method: 'popup', minutes: 15 },
            ],
          },
          extendedProperties: {
            private: {
              appointmentId: appointmentIdStr,
            },
          },
        };

        if (startIso && endIso) {
          patchBody.start = { dateTime: startIso, timeZone: 'Asia/Kolkata' };
          patchBody.end = { dateTime: endIso, timeZone: 'Asia/Kolkata' };
        }

        // Build attendees:
        const includeDoctorAsAttendee = (calendarId === 'primary');
        const attendees = [
          ...(includeDoctorAsAttendee && doctorDoc.email ? [{ email: doctorDoc.email, displayName: doctorDoc.name }] : []),
          ...(patientDoc?.email ? [{ email: patientDoc.email, displayName: patientDoc.name }] : []),
        ];

        if (keep.attendees && keep.attendees.length > 0) {
          const existingEmails = new Set((keep.attendees || []).map(a => String(a.email).toLowerCase()));
          for (const a of attendees) if (!existingEmails.has(String(a.email).toLowerCase())) keep.attendees.push(a);
          patchBody.attendees = keep.attendees;
        } else {
          patchBody.attendees = attendees;
        }

        if (
          includeVideoConference &&
          (!keep.conferenceData?.entryPoints ||
            !keep.conferenceData.entryPoints.some((ep) => ep.entryPointType === 'video'))
        ) {
          patchBody.conferenceData = {
            createRequest: {
              requestId: appointmentIdStr || Math.random().toString(36).slice(2, 10),
              conferenceSolutionKey: { type: 'hangoutsMeet' },
            },
          };
        }

        try {
          const upd = await calendar.events.patch({
            calendarId,
            eventId: keep.id,
            conferenceDataVersion: includeVideoConference ? 1 : 0,
            requestBody: patchBody,
            sendUpdates: 'all',
          });

          // remove duplicates if any
          if (matches.length > 1) await this.removeDuplicates(calendar, calendarId, matches, keep.id);

          // CLEANUP: remove any overlapping Cancelled/No Show events (keep the updated event)
          try {
            await this.removeOverlappingCancelledOrNoShow(calendar, calendarId, startIso, endIso, upd.data.id, appointmentIdStr);
          } catch (e) { /* non-fatal */ }

          return {
            success: true,
            eventId: upd.data.id,
            eventLink: upd.data.htmlLink,
            meetLink: includeVideoConference
              ? extractMeetLink(upd.data) || extractMeetLink(keep)
              : null,
          };
        } catch (e) {
          console.warn('Failed to patch existing matched event, will attempt to create new', e?.message || e);
          // fall through to create
        }
      }

      // 2) Create a new event
      const includeDoctorAsAttendee = (calendarId === 'primary');
      const createAttendees = [
        ...(includeDoctorAsAttendee && doctorDoc.email ? [{ email: doctorDoc.email, displayName: doctorDoc.name }] : []),
        ...(patientDoc?.email ? [{ email: patientDoc.email, displayName: patientDoc.name }] : []),
      ];

      const eventBody = {
        summary,
        description,
        start: { dateTime: startIso, timeZone: 'Asia/Kolkata' },
        end: { dateTime: endIso, timeZone: 'Asia/Kolkata' },
        attendees: createAttendees,
        colorId,
        reminders: {
          useDefault: false,
          overrides: [
            { method: 'email', minutes: 60 },
            { method: 'popup', minutes: 15 },
          ],
        },
        extendedProperties: {
          private: {
            appointmentId: appointmentIdStr,
          },
        },
      };

      if (includeVideoConference) {
        eventBody.conferenceData = {
          createRequest: {
            requestId: appointmentIdStr || Math.random().toString(36).slice(2, 10),
            conferenceSolutionKey: { type: 'hangoutsMeet' },
          },
        };
      }

      const res = await calendar.events.insert({
        calendarId,
        conferenceDataVersion: includeVideoConference ? 1 : 0,
        requestBody: eventBody,
        sendUpdates: 'all',
      });

      // CLEANUP: remove any overlapping Cancelled/No Show events (keep newly created event)
      try {
        await this.removeOverlappingCancelledOrNoShow(calendar, calendarId, startIso, endIso, res.data.id, appointmentIdStr);
      } catch (e) { /* non-fatal */ }

      return {
        success: true,
        eventId: res.data.id,
        eventLink: res.data.htmlLink,
        meetLink: includeVideoConference ? extractMeetLink(res.data) : null,
      };
    } catch (err) {
      console.error('📅 createAppointmentEvent error:', err?.message || err);
      return { success: false, error: err?.message || String(err) };
    }
  }

  /* ---------- UPDATE APPOINTMENT (dedup-aware) ---------- */
  async updateAppointmentEvent(doctorDoc, eventId, appointmentData) {
    try {
      if (!doctorDoc?.googleCalendar) return { success: false, error: 'Doctor calendar not connected' };
      await this.ensureAuthForUser(doctorDoc.googleCalendar);
      const calendar = google.calendar({ version: 'v3', auth: this.oauth2Client });
      const calendarId = doctorDoc.googleCalendar.workCalendarId || 'primary';

      const status = appointmentData.status || 'Scheduled';
      const startIso = appointmentData.slotStartIso ? toRFC3339(appointmentData.slotStartIso) : undefined;
      const endIso = appointmentData.slotEndIso ? toRFC3339(appointmentData.slotEndIso) : undefined;
      const appointmentIdStr = String(appointmentData.appointmentId || appointmentData._id || appointmentData.appointment || '');

      const pickPatientName = (existing) => {
        if (appointmentData.patientName && String(appointmentData.patientName).trim()) {
          return String(appointmentData.patientName).trim();
        }
        if (appointmentData.patientDoc && appointmentData.patientDoc.name) {
          return appointmentData.patientDoc.name;
        }
        // try to infer from existing attendees
        if (existing && Array.isArray(existing.attendees) && existing.attendees.length) {
          const doctorEmail = (doctorDoc && doctorDoc.email) ? String(doctorDoc.email).toLowerCase() : null;
          const other = existing.attendees.find(a => {
            if (!a || !a.email) return false;
            const em = String(a.email).toLowerCase();
            return doctorEmail ? em !== doctorEmail : true;
          });
          if (other) {
            return other.displayName || other.email || 'Patient';
          }
        }
        return 'Patient';
      };

      // helper: include doctor as attendee only if we're writing to 'primary' calendar
      const includeDoctorAsAttendee = (calendarId === 'primary');

      // If eventId provided, try to patch that event (preserve extendedProperties)
      if (eventId) {
        try {
          let existing;
          try {
            const getRes = await calendar.events.get({ calendarId, eventId });
            existing = getRes.data;
          } catch (e) {
            existing = null;
          }

          // determine patient name for summary
          const patientName = pickPatientName(existing);

          // build description using available times (existing fallback)
          const description = buildEventDescription(
            {
              ...appointmentData,
              slotStartIso: startIso || (existing && existing.start && (existing.start.dateTime || existing.start.date)),
              slotEndIso: endIso || (existing && existing.end && (existing.end.dateTime || existing.end.date)),
            },
            doctorDoc,
            { name: patientName }
          );

          // ensure summary includes status + patient name
          const summaryText = appointmentData.summary
            || buildEventSummary(doctorDoc, { name: patientName }, status)
            || (existing && existing.summary)
            || `Appointment • ${status}`;

          const patchBody = {
            summary: summaryText,
            description,
            colorId: statusToColorId(status),
            reminders: {
              useDefault: false,
              overrides: [
                { method: 'email', minutes: 60 },
                { method: 'popup', minutes: 15 },
              ],
            },
            extendedProperties: {
              private: {
                appointmentId: appointmentIdStr || (existing && existing.extendedProperties && existing.extendedProperties.private && existing.extendedProperties.private.appointmentId) || '',
              },
            },
          };

          if (startIso && endIso) {
            patchBody.start = { dateTime: startIso, timeZone: 'Asia/Kolkata' };
            patchBody.end = { dateTime: endIso, timeZone: 'Asia/Kolkata' };
          }

          // preserve or set attendees
          if (Array.isArray(appointmentData.attendees) && appointmentData.attendees.length > 0) {
            const provided = appointmentData.attendees.slice();
            if (!includeDoctorAsAttendee) {
              const doctorEmailLower = doctorDoc?.email ? String(doctorDoc.email).toLowerCase() : null;
              if (doctorEmailLower) {
                patchBody.attendees = provided.filter(a => !(a && a.email && String(a.email).toLowerCase() === doctorEmailLower));
              } else {
                patchBody.attendees = provided;
              }
            } else {
              patchBody.attendees = provided;
            }
          } else if (existing && existing.attendees && existing.attendees.length > 0) {
            if (!includeDoctorAsAttendee) {
              const doctorEmailLower = doctorDoc?.email ? String(doctorDoc.email).toLowerCase() : null;
              if (doctorEmailLower) {
                patchBody.attendees = existing.attendees.filter(a => !(a && a.email && String(a.email).toLowerCase() === doctorEmailLower));
              } else {
                patchBody.attendees = existing.attendees;
              }
            } else {
              patchBody.attendees = existing.attendees;
            }
          } else {
            const attendees = [
              ...(includeDoctorAsAttendee && doctorDoc.email ? [{ email: doctorDoc.email, displayName: doctorDoc.name }] : []),
              ...(appointmentData.patientEmail ? [{ email: appointmentData.patientEmail }] : []),
            ];
            if (attendees.length) patchBody.attendees = attendees;
          }

          const res = await calendar.events.patch({
            calendarId,
            eventId,
            requestBody: patchBody,
            sendUpdates: 'all',
          });

          // CLEANUP: remove overlapping Cancelled/No Show events (keep patched event)
          try {
            const cleanupStart = (patchBody.start && patchBody.start.dateTime) ? patchBody.start.dateTime : (startIso || undefined);
            const cleanupEnd = (patchBody.end && patchBody.end.dateTime) ? patchBody.end.dateTime : (endIso || undefined);
            if (res && res.data && res.data.id) {
              await this.removeOverlappingCancelledOrNoShow(calendar, calendarId, cleanupStart, cleanupEnd, res.data.id, appointmentIdStr);
            }
          } catch (e) { /* non-fatal */ }

          return { success: true, eventId: res.data.id, eventLink: res.data.htmlLink };
        } catch (err) {
          console.warn('Patch by eventId failed; will try to find/create instead.', err?.message || err);
        }
      }

      // If no eventId or patch failed: try to find by appointmentId or summary/slot and reuse
      const summaryForSearch = appointmentData.summary || buildEventSummary(doctorDoc, null, status);
      const searchStart = startIso || toRFC3339(appointmentData.slotStartIso);
      const searchEnd = endIso || toRFC3339(appointmentData.slotEndIso);

      if (searchStart && searchEnd) {
        const matches = await this.findMatchingEvents(calendar, calendarId, summaryForSearch, searchStart, searchEnd, appointmentIdStr);
        if (Array.isArray(matches) && matches.length > 0) {
          let keep = matches[0];

          if (appointmentData.patientEmail) {
            const lower = String(appointmentData.patientEmail).toLowerCase();
            const found = matches.find(m => Array.isArray(m.attendees) && m.attendees.some(a => a.email && String(a.email).toLowerCase() === lower));
            if (found) keep = found;
          }

          const patientName = pickPatientName(keep);

          try {
            const patchBody = {
              summary: appointmentData.summary || buildEventSummary(doctorDoc, { name: patientName }, status) || keep.summary || `Appointment • ${status}`,
              description: buildEventDescription({ ...appointmentData, slotStartIso: searchStart, slotEndIso: searchEnd }, doctorDoc, { name: patientName }),
              colorId: statusToColorId(status),
              reminders: {
                useDefault: false,
                overrides: [
                  { method: 'email', minutes: 60 },
                  { method: 'popup', minutes: 15 },
                ],
              },
              extendedProperties: {
                private: { appointmentId: appointmentIdStr || (keep.extendedProperties && keep.extendedProperties.private && keep.extendedProperties.private.appointmentId) || '' },
              },
            };

            if (searchStart && searchEnd) {
              patchBody.start = { dateTime: searchStart, timeZone: 'Asia/Kolkata' };
              patchBody.end = { dateTime: searchEnd, timeZone: 'Asia/Kolkata' };
            }

            if (Array.isArray(appointmentData.attendees) && appointmentData.attendees.length > 0) {
              const provided = appointmentData.attendees.slice();
              if (!includeDoctorAsAttendee) {
                const doctorEmailLower = doctorDoc?.email ? String(doctorDoc.email).toLowerCase() : null;
                if (doctorEmailLower) {
                  patchBody.attendees = provided.filter(a => !(a && a.email && String(a.email).toLowerCase() === doctorEmailLower));
                } else {
                  patchBody.attendees = provided;
                }
              } else {
                patchBody.attendees = provided;
              }
            } else if (keep.attendees && keep.attendees.length > 0) {
              if (!includeDoctorAsAttendee) {
                const doctorEmailLower = doctorDoc?.email ? String(doctorDoc.email).toLowerCase() : null;
                if (doctorEmailLower) {
                  patchBody.attendees = keep.attendees.filter(a => !(a && a.email && String(a.email).toLowerCase() === doctorEmailLower));
                } else {
                  patchBody.attendees = keep.attendees;
                }
              } else {
                patchBody.attendees = keep.attendees;
              }
            } else {
              const atts = [
                ...(includeDoctorAsAttendee && doctorDoc.email ? [{ email: doctorDoc.email, displayName: doctorDoc.name }] : []),
                ...(appointmentData.patientEmail ? [{ email: appointmentData.patientEmail }] : []),
              ];
              if (atts.length) patchBody.attendees = atts;
            }

            const upd = await calendar.events.patch({
              calendarId,
              eventId: keep.id,
              requestBody: patchBody,
              sendUpdates: 'all',
            });

            try {
              await this.removeOverlappingCancelledOrNoShow(calendar, calendarId, searchStart, searchEnd, upd.data.id, appointmentIdStr);
            } catch (e) { /* non-fatal */ }

            if (matches.length > 1) await this.removeDuplicates(calendar, calendarId, matches, keep.id);

            return { success: true, eventId: upd.data.id, eventLink: upd.data.htmlLink };
          } catch (e) {
            console.warn('Failed to patch matched event, will attempt to create new', e?.message || e);
          }
        }
      }

      // fallback: create new event
      const startForCreate = searchStart || toRFC3339(appointmentData.slotStartIso);
      const endForCreate = searchEnd || toRFC3339(appointmentData.slotEndIso);
      if (!startForCreate || !endForCreate) {
        return { success: false, error: 'Missing start/end times for event creation' };
      }

      const includeDoctor = (calendarId === 'primary');
      const createAttendees = [
        ...(includeDoctor && doctorDoc.email ? [{ email: doctorDoc.email, displayName: doctorDoc.name }] : []),
        ...(appointmentData.patientEmail ? [{ email: appointmentData.patientEmail }] : []),
      ];

      const createRes = await calendar.events.insert({
        calendarId,
        requestBody: {
          summary: appointmentData.summary || buildEventSummary(doctorDoc, { name: appointmentData.patientName || (appointmentData.patientDoc && appointmentData.patientDoc.name) || null }, status),
          description: buildEventDescription({ ...appointmentData, slotStartIso: startForCreate, slotEndIso: endForCreate }, doctorDoc, { name: appointmentData.patientName || (appointmentData.patientDoc && appointmentData.patientDoc.name) || null }),
          start: { dateTime: startForCreate, timeZone: 'Asia/Kolkata' },
          end: { dateTime: endForCreate, timeZone: 'Asia/Kolkata' },
          colorId: statusToColorId(status),
          attendees: createAttendees,
          reminders: { useDefault: false, overrides: [{ method: 'email', minutes: 60 }, { method: 'popup', minutes: 15 }] },
          extendedProperties: { private: { appointmentId: appointmentIdStr } },
        },
        sendUpdates: 'all',
      });

      try {
        await this.removeOverlappingCancelledOrNoShow(calendar, calendarId, startForCreate, endForCreate, createRes.data.id, appointmentIdStr);
      } catch (e) { /* non-fatal */ }

      return { success: true, eventId: createRes.data.id, eventLink: createRes.data.htmlLink };
    } catch (err) {
      console.error('📅 updateAppointmentEvent error:', err?.message || err);
      return { success: false, error: err?.message || String(err) };
    }
  }

  async deleteAppointmentEvent(doctorDoc, eventId, options = {}) {
    try {
      if (!doctorDoc?.googleCalendar) return { success: false, error: 'Doctor calendar not connected' };
      await this.ensureAuthForUser(doctorDoc.googleCalendar);
      const calendar = google.calendar({ version: 'v3', auth: this.oauth2Client });
      const calendarId = doctorDoc.googleCalendar.workCalendarId || 'primary';

      const sendUpdates = options.sendUpdates || 'all';

      await calendar.events.delete({ calendarId, eventId, sendUpdates });
      return { success: true };
    } catch (err) {
      console.error('📅 deleteAppointmentEvent error:', err?.message || err);
      return { success: false, error: err?.message || String(err) };
    }
  }

  /* ---------- BLOCKED SLOT HANDLERS (robust, dedupe-aware) ---------- */
  async createBlockedSlotEvent(doctorDoc, blockedSlot, options = {}) {
    try {
      if (!doctorDoc?.googleCalendar) return { success: false, error: 'Doctor calendar not connected' };
      await this.ensureAuthForUser(doctorDoc.googleCalendar);
      const calendar = google.calendar({ version: 'v3', auth: this.oauth2Client });

      const startIso = toRFC3339(blockedSlot.startTime);
      const endIso = toRFC3339(blockedSlot.endTime);
      const summary = buildBlockedSummary(blockedSlot);
      const description = buildBlockedDescription(blockedSlot, doctorDoc);

      const sendUpdates = options.sendUpdates || 'none';
      const visibility = options.visibility || 'private';
      const noAttendees = options.noAttendees === undefined ? true : !!options.noAttendees;
      const onlyOnDoctorCalendar = (options.onlyOnDoctorCalendar === undefined) ? true : !!options.onlyOnDoctorCalendar;

      const blockedSlotId = String(blockedSlot._id);

      const makeEventBody = (bsId) => {
        const body = {
          summary,
          description,
          start: { dateTime: startIso, timeZone: 'Asia/Kolkata' },
          end: { dateTime: endIso, timeZone: 'Asia/Kolkata' },
          colorId: BLOCKED_COLOR_ID,
          transparency: 'opaque',
          visibility,
          reminders: { useDefault: false, overrides: [{ method: 'popup', minutes: 30 }] },
          extendedProperties: { private: { blockedBySystem: 'true', blockedSlotId: String(bsId) } },
        };
        if (!noAttendees && Array.isArray(blockedSlot.attendees) && blockedSlot.attendees.length) {
          body.attendees = blockedSlot.attendees;
        }
        return body;
      };

      // If onlyOnDoctorCalendar flag is set, operate *only* on doctor's target calendar and do not scan others.
      const targetCalendar = doctorDoc.googleCalendar.workCalendarId || 'primary';

      if (onlyOnDoctorCalendar) {
        // Try to find by private extended property on target calendar
        try {
          const res = await calendar.events.list({
            calendarId: targetCalendar,
            privateExtendedProperty: `blockedSlotId=${blockedSlotId}`,
            singleEvents: true,
            maxResults: 50,
          });
          const items = res.data.items || [];
          if (items.length) {
            // patch first, delete any dupes in same calendar
            const keep = items[0];
            const upd = await calendar.events.patch({
              calendarId: targetCalendar,
              eventId: keep.id,
              requestBody: makeEventBody(blockedSlotId),
              sendUpdates,
            });
            for (let i = 1; i < items.length; ++i) {
              try { await calendar.events.delete({ calendarId: targetCalendar, eventId: items[i].id, sendUpdates }); } catch (e) { /* ignore */ }
            }
            return { success: true, eventId: upd.data.id, eventLink: upd.data.htmlLink };
          }
        } catch (e) {
          // If property query fails (some calendars restrict it), fall back to time+summary search but still only on targetCalendar
          try {
            const found = await this._searchEventsByWindowAndSummary(calendar, targetCalendar, startIso, endIso, summary);
            if (found && found.length) {
              const keep = found[0];
              const upd = await calendar.events.patch({
                calendarId: targetCalendar,
                eventId: keep.id,
                requestBody: makeEventBody(blockedSlotId),
                sendUpdates,
              });
              for (const f of found) {
                if (f.id === keep.id) continue;
                try { await calendar.events.delete({ calendarId: targetCalendar, eventId: f.id, sendUpdates }); } catch (e) { /* ignore */ }
              }
              return { success: true, eventId: upd.data.id, eventLink: upd.data.htmlLink };
            }
          } catch (e2) {
            // continue to create
          }
        }

        // Not found -> create on targetCalendar
        const eventBody = makeEventBody(blockedSlotId);
        const createRes = await calendar.events.insert({
          calendarId: targetCalendar,
          requestBody: eventBody,
          sendUpdates,
        });
        return { success: true, eventId: createRes.data.id, eventLink: createRes.data.htmlLink };
      }

      // --- legacy behavior (existing code): attempt to find across calendars if not restricted ---
      let calendars = [];
      try {
        const listRes = await calendar.calendarList.list({ maxResults: 250 });
        calendars = (listRes.data.items || []).map(c => c.id);
      } catch (e) {
        calendars = [targetCalendar, 'primary'];
        console.warn('Failed to list calendarList in createBlockedSlotEvent; falling back:', e?.message || e);
      }

      // Prefer find by blockedSlotId across calendars
      const matchesById = await this._findBlockedEventsAcrossCalendars(calendar, calendars, blockedSlotId);
      for (const calId of Object.keys(matchesById)) {
        const items = matchesById[calId];
        if (items.length > 0) {
          const keep = items[0];
          try {
            const patchBody = makeEventBody(blockedSlotId);
            const upd = await calendar.events.patch({ calendarId: calId, eventId: keep.id, requestBody: patchBody, sendUpdates });
            for (let i = 1; i < items.length; ++i) {
              try { await calendar.events.delete({ calendarId: calId, eventId: items[i].id, sendUpdates }); } catch (e) { /* ignore */ }
            }
            return { success: true, eventId: upd.data.id, eventLink: upd.data.htmlLink };
          } catch (e) {
            console.warn('Failed to patch existing blocked event by id, will fallback to create', e?.message || e);
          }
        }
      }

      // Fallback search across calendars
      for (const calId of calendars) {
        const found = await this._searchEventsByWindowAndSummary(calendar, calId, startIso, endIso, summary);
        if (found && found.length) {
          const keep = found[0];
          try {
            const patchBody = makeEventBody(blockedSlotId);
            const upd = await calendar.events.patch({ calendarId: calId, eventId: keep.id, requestBody: patchBody, sendUpdates });
            for (const f of found) {
              if (f.id === keep.id) continue;
              try { await calendar.events.delete({ calendarId: calId, eventId: f.id, sendUpdates }); } catch (e) { /* ignore */ }
            }
            return { success: true, eventId: upd.data.id, eventLink: upd.data.htmlLink };
          } catch (e) {
            console.warn('Failed to patch orphan found event, will try to create new', e?.message || e);
          }
        }
      }

      // Final fallback: create on doctor's calendar
      const finalCreate = await calendar.events.insert({ calendarId: targetCalendar, requestBody: makeEventBody(blockedSlotId), sendUpdates });
      return { success: true, eventId: finalCreate.data.id, eventLink: finalCreate.data.htmlLink };
    } catch (err) {
      console.error('📅 createBlockedSlotEvent error:', err?.message || err);
      return { success: false, error: err?.message || String(err) };
    }
  }

  async updateBlockedSlotEvent(doctorDoc, blockedSlotId, blockedSlot, options = {}) {
    try {
      if (!doctorDoc?.googleCalendar) return { success: false, error: 'Doctor calendar not connected' };
      await this.ensureAuthForUser(doctorDoc.googleCalendar);
      const calendar = google.calendar({ version: 'v3', auth: this.oauth2Client });

      const sendUpdates = options.sendUpdates || 'none';
      const visibility = options.visibility || 'private';
      const noAttendees = options.noAttendees === undefined ? true : !!options.noAttendees;
      const onlyOnDoctorCalendar = (options.onlyOnDoctorCalendar === undefined) ? true : !!options.onlyOnDoctorCalendar;

      const startIso = toRFC3339(blockedSlot.startTime);
      const endIso = toRFC3339(blockedSlot.endTime);
      const summary = buildBlockedSummary(blockedSlot);
      const description = buildBlockedDescription(blockedSlot, doctorDoc);
      const bsId = String(blockedSlotId);

      const makePatch = () => {
        const patch = {
          summary,
          description,
          colorId: BLOCKED_COLOR_ID,
          transparency: 'opaque',
          visibility,
          reminders: { useDefault: false, overrides: [{ method: 'popup', minutes: 30 }] },
          extendedProperties: { private: { blockedBySystem: 'true', blockedSlotId: bsId } },
          start: startIso ? { dateTime: startIso, timeZone: 'Asia/Kolkata' } : undefined,
          end: endIso ? { dateTime: endIso, timeZone: 'Asia/Kolkata' } : undefined,
        };
        if (!noAttendees && Array.isArray(blockedSlot.attendees) && blockedSlot.attendees.length) {
          patch.attendees = blockedSlot.attendees;
        }
        return patch;
      };

      const patchBody = makePatch();
      const targetCalendar = doctorDoc.googleCalendar.workCalendarId || 'primary';

      if (onlyOnDoctorCalendar) {
        // Try privateExtendedProperty search on target calendar
        try {
          const res = await calendar.events.list({
            calendarId: targetCalendar,
            privateExtendedProperty: `blockedSlotId=${bsId}`,
            singleEvents: true,
            maxResults: 50,
          });
          const items = res.data.items || [];
          if (items.length) {
            const keep = items[0];
            const updRes = await calendar.events.patch({ calendarId: targetCalendar, eventId: keep.id, requestBody: patchBody, sendUpdates });
            // cleanup duplicates in same calendar
            for (let i = 1; i < items.length; ++i) {
              try { await calendar.events.delete({ calendarId: targetCalendar, eventId: items[i].id, sendUpdates }); } catch (e) { /* ignore */ }
            }
            return { success: true, eventId: updRes.data.id, eventLink: updRes.data.htmlLink };
          }
        } catch (e) {
          // fallback to window+summary on target calendar
          try {
            const found = await this._searchEventsByWindowAndSummary(calendar, targetCalendar, startIso, endIso, summary);
            if (found && found.length) {
              const keep = found[0];
              const updRes = await calendar.events.patch({ calendarId: targetCalendar, eventId: keep.id, requestBody: patchBody, sendUpdates });
              for (const f of found) {
                if (f.id === keep.id) continue;
                try { await calendar.events.delete({ calendarId: targetCalendar, eventId: f.id, sendUpdates }); } catch (e) { /* ignore */ }
              }
              return { success: true, eventId: updRes.data.id, eventLink: updRes.data.htmlLink };
            }
          } catch (e2) { /* ignore */ }
        }

        // nothing found -> create on doctor calendar
        try {
          const createRes = await calendar.events.insert({ calendarId: targetCalendar, requestBody: patchBody, sendUpdates });
          return { success: true, eventId: createRes.data.id, eventLink: createRes.data.htmlLink };
        } catch (createErr) {
          console.error('Failed to create blocked-slot event during update flow (restricted):', createErr?.message || createErr);
          return { success: false, error: createErr?.message || String(createErr) };
        }
      }

      // --- legacy: if not restricted, behave as before and search across calendars ---
      let calendars = [];
      try {
        const listRes = await calendar.calendarList.list({ maxResults: 250 });
        calendars = (listRes.data.items || []).map(c => c.id);
      } catch (e) {
        calendars = [targetCalendar, 'primary'];
        console.warn('Failed to list calendarList in updateBlockedSlotEvent; falling back:', e?.message || e);
      }

      const matchesById = await this._findBlockedEventsAcrossCalendars(calendar, calendars, bsId);
      for (const calId of Object.keys(matchesById)) {
        const items = matchesById[calId];
        if (items.length > 0) {
          const keep = items[0];
          try {
            const updRes = await calendar.events.patch({ calendarId: calId, eventId: keep.id, requestBody: patchBody, sendUpdates });
            // delete duplicates in same calendar
            for (let i = 1; i < items.length; ++i) {
              try { await calendar.events.delete({ calendarId: calId, eventId: items[i].id, sendUpdates }); } catch (e) { /* ignore */ }
            }
            // delete matching items in other calendars to leave only this one
            for (const otherCal of calendars) {
              if (otherCal === calId) continue;
              try {
                const res2 = await calendar.events.list({ calendarId: otherCal, privateExtendedProperty: `blockedSlotId=${bsId}`, singleEvents: true, maxResults: 250 });
                const items2 = res2.data.items || [];
                for (const it of items2) {
                  if (!it || !it.id) continue;
                  try { await calendar.events.delete({ calendarId: otherCal, eventId: it.id, sendUpdates }); } catch (e) { /* ignore */ }
                }
              } catch (e) { /* ignore */ }
            }
            return { success: true, eventId: updRes.data.id, eventLink: updRes.data.htmlLink };
          } catch (e) {
            console.warn('Failed to patch by blockedSlotId, continuing to fallback search', e?.message || e);
          }
        }
      }

      // fallback: search by window+summary across calendars, then create on doctor's calendar
      for (const calId of calendars) {
        const found = await this._searchEventsByWindowAndSummary(calendar, calId, startIso, endIso, summary);
        if (found && found.length) {
          const keep = found[0];
          try {
            const updRes = await calendar.events.patch({ calendarId: calId, eventId: keep.id, requestBody: patchBody, sendUpdates });
            for (let i = 0; i < found.length; ++i) {
              if (found[i].id === keep.id) continue;
              try { await calendar.events.delete({ calendarId: calId, eventId: found[i].id, sendUpdates }); } catch (e) { /* ignore */ }
            }
            // also try to remove matches in other calendars (best-effort)
            for (const otherCal of calendars) {
              if (otherCal === calId) continue;
              try {
                const otherFound = await this._searchEventsByWindowAndSummary(calendar, otherCal, startIso, endIso, summary);
                for (const ofe of (otherFound || [])) {
                  try { await calendar.events.delete({ calendarId: otherCal, eventId: ofe.id, sendUpdates }); } catch (e) { /* ignore */ }
                }
              } catch (e) { /* ignore */ }
            }
            return { success: true, eventId: updRes.data.id, eventLink: updRes.data.htmlLink };
          } catch (e) {
            console.warn('Failed to patch orphan event found by window+summary; will try create', e?.message || e);
          }
        }
      }

      // create new on doctor's calendar
      try {
        const createRes = await calendar.events.insert({ calendarId: targetCalendar, requestBody: patchBody, sendUpdates });
        if (createRes && createRes.data && createRes.data.id) {
          return { success: true, eventId: createRes.data.id, eventLink: createRes.data.htmlLink };
        }
        return { success: false, error: 'Calendar returned no event id when creating blocked slot event' };
      } catch (createErr) {
        console.error('Failed to create blocked-slot event during update flow:', createErr?.message || createErr);
        return { success: false, error: createErr?.message || String(createErr) };
      }
    } catch (err) {
      console.error('updateBlockedSlotEvent error:', err?.message || err);
      return { success: false, error: err?.message || String(err) };
    }
  }

  async deleteBlockedSlotEvent(doctorDoc, eventIdOrBlockedSlotId) {
    try {
      if (!doctorDoc?.googleCalendar) return { success: false, error: 'Doctor calendar not connected' };
      await this.ensureAuthForUser(doctorDoc.googleCalendar);
      const calendar = google.calendar({ version: 'v3', auth: this.oauth2Client });

      // list calendars (fallback to primary/workCal)
      let calendars = [];
      try {
        const listRes = await calendar.calendarList.list({ maxResults: 250 });
        calendars = (listRes.data.items || []).map(c => c.id);
      } catch (e) {
        calendars = [doctorDoc.googleCalendar.workCalendarId || 'primary', 'primary'];
        console.warn('Failed to list calendarList, falling back to primary/workCalendarId:', e?.message || e);
      }

      const deleteEventsArray = async (calId, items) => {
        for (const it of (items || [])) {
          if (!it || !it.id) continue;
          try {
            await calendar.events.delete({ calendarId: calId, eventId: it.id, sendUpdates: 'none' });
          } catch (e) {
            console.warn('Failed to delete event', it.id, 'on', calId, e?.message || e);
          }
        }
      };

      const bsId = String(eventIdOrBlockedSlotId || '');

      // 1) If bsId looks like a Mongo ObjectId => search by privateExtendedProperty
      if (bsId && bsId.match(/^[0-9a-fA-F]{24}$/)) {
        let foundAny = false;
        for (const calId of calendars) {
          try {
            const res = await calendar.events.list({
              calendarId: calId,
              privateExtendedProperty: `blockedSlotId=${bsId}`,
              singleEvents: true,
              maxResults: 250,
            });
            const items = res.data.items || [];
            if (items.length) {
              foundAny = true;
              await deleteEventsArray(calId, items);
            }
          } catch (e) {
            console.warn('privateExtendedProperty list failed on', calId, e?.message || e);
          }
        }
        if (foundAny) {
          return { success: true };
        }

        // fallback: maybe bsId is actually an eventId -> try delete across calendars
        for (const calId of calendars) {
          try {
            await calendar.events.delete({ calendarId: calId, eventId: bsId, sendUpdates: 'none' });
            return { success: true };
          } catch (e) {
            // try next
          }
        }

        return { success: false, error: 'No matching calendar event(s) found to delete' };
      }

      // 2) else treat eventId and try to delete across calendars
      if (eventIdOrBlockedSlotId) {
        for (const calId of calendars) {
          try {
            await calendar.events.delete({ calendarId: calId, eventId: eventIdOrBlockedSlotId, sendUpdates: 'none' });
            return { success: true };
          } catch (e) {
            // ignore and continue
          }
        }
        return { success: false, error: 'Tried eventId delete across calendars but nothing removed' };
      }

      return { success: false, error: 'No valid identifier provided' };
    } catch (err) {
      console.error('deleteBlockedSlotEvent error:', err?.message || err);
      return { success: false, error: err?.message || String(err) };
    }
  }

  /* ---------- GET EVENTS ---------- */
  async getCalendarEvents(googleConfig, options = {}, userId, userType) {
    if (!googleConfig?.accessToken || !googleConfig?.refreshToken) throw new Error('Calendar not connected');
    await this.ensureAuthForUser(googleConfig);
    const calendar = google.calendar({ version: 'v3', auth: this.oauth2Client });
    const calendarId = googleConfig.workCalendarId || 'primary';
    const timeMin = options.timeMin || new Date().toISOString();
    const timeMax = options.timeMax || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    const maxResults = options.maxResults || 100;
    const res = await calendar.events.list({ calendarId, timeMin, timeMax, maxResults, singleEvents: true, orderBy: 'startTime' });
    const items = res.data.items || [];
    return items;
  }

  /**
   * Lumos-style fallback: create a Meet link on the clinic Gmail calendar
   * when the doctor's Google tokens are missing/expired (invalid_grant).
   */
  async createGeneralGoogleMeetLink(appointmentData = {}) {
    try {
      if (!process.env.GMAIL_REFRESH_TOKEN) {
        console.warn('⚠️ createGeneralGoogleMeetLink: GMAIL_REFRESH_TOKEN not set');
        return null;
      }

      const generalAuth = new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET,
        process.env.GOOGLE_REDIRECT_URI ||
          process.env.GOOGLE_CALLBACK_URL ||
          'http://localhost:8000/api/google/callback'
      );
      generalAuth.setCredentials({
        refresh_token: process.env.GMAIL_REFRESH_TOKEN,
      });

      const calendar = google.calendar({ version: 'v3', auth: generalAuth });
      const startIso = toRFC3339(appointmentData.slotStartIso);
      const endIso = toRFC3339(appointmentData.slotEndIso);
      const appointmentIdStr = String(
        appointmentData.appointmentId || appointmentData._id || ''
      );

      const eventBody = {
        summary: appointmentData.summary || 'Brains Hospital — Video consultation',
        description:
          appointmentData.description ||
          `Video appointment${appointmentIdStr ? ` (${appointmentIdStr})` : ''}`,
        start: { dateTime: startIso, timeZone: 'Asia/Kolkata' },
        end: { dateTime: endIso, timeZone: 'Asia/Kolkata' },
        conferenceData: {
          createRequest: {
            requestId:
              appointmentIdStr || Math.random().toString(36).slice(2, 12),
            conferenceSolutionKey: { type: 'hangoutsMeet' },
          },
        },
      };

      const res = await calendar.events.insert({
        calendarId: 'primary',
        conferenceDataVersion: 1,
        requestBody: eventBody,
        sendUpdates: 'none',
      });

      const meetLink =
        res.data.conferenceData?.entryPoints?.find(
          (ep) => ep.entryPointType === 'video'
        )?.uri ||
        res.data.hangoutLink ||
        null;

      return {
        eventId: res.data.id,
        eventLink: res.data.htmlLink || null,
        meetLink,
      };
    } catch (err) {
      console.warn(
        '⚠️ General Google Meet link generation failed:',
        err?.message || err
      );
      return null;
    }
  }
}

module.exports = new GoogleCalendarService();
