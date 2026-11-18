import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, Linking, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SPACING } from '../constants/theme';
import { useAppTheme } from '../context/SettingsContext';
import { MeetJoinGateModal } from './MeetJoinGateModal';
import { Calendar, Clock, Video, User, MapPin } from 'lucide-react-native';

/** Brains logo / brand blue */
const LOGO_BLUE = '#124E96';
const LOGO_BLUE_SOFT = '#EAF2FC';

const MEET_JOIN_WINDOW_MS = 60 * 60 * 1000;

const formatWhen = (ms) => {
  if (!Number.isFinite(ms)) return '';
  try {
    return new Date(ms).toLocaleString('en-IN', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  } catch {
    return '';
  }
};

export const getMeetLink = (appointment) => {
  if (String(appointment?.paymentMode || '').toLowerCase() !== 'online') {
    return '';
  }
  return String(
    appointment?.googleCalendar?.meetLink || appointment?.meetLink || ''
  ).trim();
};

export const getMeetJoinState = (appointmentOrStart, now = Date.now()) => {
  const startRaw =
    appointmentOrStart?.slotStartIso ||
    appointmentOrStart?.start ||
    (typeof appointmentOrStart === 'string' || appointmentOrStart instanceof Date
      ? appointmentOrStart
      : null);
  const startMs = startRaw ? new Date(startRaw).getTime() : NaN;
  if (!Number.isFinite(startMs)) {
    return {
      enabled: false,
      label: 'Join Google Meet',
      hint: '',
      reason: 'unknown',
      meetingTimeLabel: '',
      opensAtLabel: '',
      title: 'Not available yet',
      message: 'You can join Google Meet starting 1 hour before your appointment.',
    };
  }

  const endRaw = appointmentOrStart?.slotEndIso || appointmentOrStart?.end;
  const endMs = endRaw
    ? new Date(endRaw).getTime()
    : startMs + MEET_JOIN_WINDOW_MS;

  const opensAt = startMs - MEET_JOIN_WINDOW_MS;
  const meetingTimeLabel = formatWhen(startMs);
  const opensAtLabel = formatWhen(opensAt);

  if (now < opensAt) {
    const mins = Math.max(1, Math.ceil((opensAt - now) / 60000));
    const hint =
      mins >= 60
        ? 'Available 1 hour before the meeting'
        : `Available in ${mins} min`;
    return {
      enabled: false,
      label: 'Join Google Meet',
      hint,
      reason: 'early',
      meetingTimeLabel,
      opensAtLabel,
      title: 'Not available yet',
      message:
        'Google Meet opens 1 hour before your appointment. We’ll unlock the join button when it’s time.',
    };
  }

  if (Number.isFinite(endMs) && now > endMs) {
    return {
      enabled: false,
      label: 'Meeting ended',
      hint: 'This Google Meet session has ended',
      reason: 'ended',
      meetingTimeLabel,
      opensAtLabel: '',
      title: 'Meeting ended',
      message:
        'This Google Meet session has already ended. Book a new visit if you still need care.',
    };
  }

  return {
    enabled: true,
    label: 'Join Google Meet',
    hint: 'Tap to join now',
    reason: 'open',
    meetingTimeLabel,
    opensAtLabel: '',
    title: '',
    message: '',
  };
};

const openMeetLink = async (url) => {
  try {
    const can = await Linking.canOpenURL(url);
    if (!can) {
      Alert.alert('Unable to open', 'Could not open the Google Meet link on this device.');
      return;
    }
    await Linking.openURL(url);
  } catch {
    Alert.alert('Unable to open', 'Could not open the Google Meet link.');
  }
};

const FALLBACK_DOCTOR_IMAGE =
  'https://images.unsplash.com/photo-1559839734-2b71ea197ec2?auto=format&fit=crop&q=80&w=300';

const formatTime = (appointment) => {
  if (appointment.slotStartIso) {
    try {
      return new Date(appointment.slotStartIso).toLocaleTimeString('en-IN', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      });
    } catch {
      // fall through
    }
  }
  if (typeof appointment.timeSlot === 'string') return appointment.timeSlot;
  if (appointment.timeSlot?.start) {
    return appointment.timeSlot.end
      ? `${appointment.timeSlot.start} – ${appointment.timeSlot.end}`
      : appointment.timeSlot.start;
  }
  return appointment.time || 'Scheduled';
};

const formatDate = (appointment) => {
  const raw = appointment.slotStartIso || appointment.date;
  if (!raw) return 'N/A';
  try {
    return new Date(raw).toLocaleDateString('en-IN', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
    });
  } catch {
    return 'N/A';
  }
};

const canManage = (status) => {
  const s = String(status || '').toLowerCase();
  return (
    s === 'scheduled' ||
    s === 'confirmed' ||
    s === 'pending' ||
    s === 'rescheduled' ||
    s === 'reassigned' ||
    s === 'in progress'
  );
};

const formatDoctorName = (name) => {
  const raw = String(name || 'Specialist').trim();
  if (!raw) return 'Dr. Specialist';
  return /^dr\.?\s/i.test(raw) ? raw : `Dr. ${raw}`;
};

const getStatusStyle = (status, colors, isDark) => {
  const s = String(status || '').toLowerCase();
  if (s.includes('cancel') || s === 'rejected') {
    return {
      bg: isDark ? 'rgba(248,113,113,0.15)' : '#FEF2F2',
      text: colors.error,
      icon: 'close-circle',
    };
  }
  if (s.includes('comple')) {
    return {
      bg: isDark ? 'rgba(52,211,153,0.15)' : '#ECFDF5',
      text: colors.success || '#059669',
      icon: 'checkmark-circle',
    };
  }
  if (s.includes('miss') || s.includes('no show')) {
    return {
      bg: isDark ? 'rgba(251,191,36,0.15)' : '#FFFBEB',
      text: colors.warning || '#D97706',
      icon: 'alert-circle',
    };
  }
  return {
    bg: isDark ? 'rgba(18,78,150,0.2)' : LOGO_BLUE_SOFT,
    text: LOGO_BLUE,
    icon: 'calendar',
  };
};

export const AppointmentCard = ({ appointment, onPress, onCancel, onReschedule }) => {
  const { colors, isDark } = useAppTheme();
  const doctorName = formatDoctorName(
    appointment.doctorId?.name || appointment.doctorName || 'Specialist'
  );
  const speciality =
    appointment.doctorId?.specialization || appointment.speciality || 'General Medicine';
  const doctorImage =
    appointment.doctorId?.profileImage ||
    appointment.doctorProfileImage ||
    FALLBACK_DOCTOR_IMAGE;
  const dateStr = formatDate(appointment);
  const timeStr = formatTime(appointment);
  const isOnline = String(appointment?.paymentMode || '').toLowerCase() === 'online';
  const consultationLabel = isOnline ? 'Video Call' : 'In-Person';
  const meetLink = getMeetLink(appointment);
  const statusStyle = getStatusStyle(appointment.status, colors, isDark);
  const statusLabel = String(appointment.status || 'Scheduled').toUpperCase();

  const [meetJoin, setMeetJoin] = useState(() => getMeetJoinState(appointment));
  const [gateOpen, setGateOpen] = useState(false);

  useEffect(() => {
    setMeetJoin(getMeetJoinState(appointment));
    const id = setInterval(() => {
      setMeetJoin(getMeetJoinState(appointment));
    }, 30000);
    return () => clearInterval(id);
  }, [appointment?.slotStartIso, appointment?.slotEndIso, appointment?._id]);

  const meetingEnded = meetJoin.reason === 'ended';
  // Hide Reschedule/Cancel once the visit slot (or Meet) has ended
  const showActions = canManage(appointment.status) && !meetingEnded;

  const onJoinMeet = () => {
    // No popup when the session is over — bar stays informational only
    if (meetJoin.reason === 'ended') return;
    if (!meetJoin.enabled) {
      setGateOpen(true);
      return;
    }
    openMeetLink(meetLink);
  };

  const meetEnded = meetingEnded;
  const meetOpen = meetJoin.reason === 'open';
  const meetEarly = meetJoin.reason === 'early';

  return (
    <>
      <TouchableOpacity
        activeOpacity={0.94}
        style={[
          styles.card,
          {
            backgroundColor: isDark ? colors.cardBackground : '#FFFFFF',
            borderColor: isDark ? colors.cardBorder : 'rgba(18,78,150,0.08)',
            shadowColor: isDark ? '#000' : '#053B74',
          },
        ]}
        onPress={onPress}
      >
        {/* Top: doctor + status + menu */}
        <View style={styles.topRow}>
          <View style={styles.avatarWrap}>
            {doctorImage ? (
              <Image source={{ uri: doctorImage }} style={styles.avatarImage} />
            ) : (
              <View style={[styles.avatarFallback, { backgroundColor: LOGO_BLUE_SOFT }]}>
                <User color={LOGO_BLUE} size={22} />
              </View>
            )}
          </View>

          <View style={styles.doctorCopy}>
            <Text style={[styles.doctorName, { color: colors.textPrimary }]} numberOfLines={1}>
              {doctorName}
            </Text>
            <Text style={styles.speciality} numberOfLines={1}>
              {speciality}
            </Text>
            <View style={styles.clinicRow}>
              <MapPin color={colors.textMuted} size={12} />
              <Text style={[styles.clinic, { color: colors.textMuted }]} numberOfLines={1}>
                Brains Clinic
              </Text>
            </View>
          </View>

          <View style={styles.topRight}>
            <View style={[styles.statusBadge, { backgroundColor: statusStyle.bg }]}>
              <Text style={[styles.statusText, { color: statusStyle.text }]} numberOfLines={1}>
                {statusLabel}
              </Text>
            </View>
          </View>
        </View>

        {/* Date / Time / Consultation */}
        <View
          style={[
            styles.metaPanel,
            {
              backgroundColor: isDark ? colors.inputBackground : '#FFFFFF',
              borderColor: isDark ? colors.cardBorder : '#E8EEF4',
            },
          ]}
        >
          <View style={styles.metaItem}>
            <View style={styles.metaIcon}>
              <Calendar color={LOGO_BLUE} size={16} />
            </View>
            <View style={styles.metaTextCol}>
              <Text style={[styles.metaLabel, { color: colors.textMuted }]}>Date</Text>
              <Text style={[styles.metaValue, { color: colors.textPrimary }]} numberOfLines={2}>
                {dateStr}
              </Text>
            </View>
          </View>

          <View style={[styles.metaDivider, { backgroundColor: isDark ? colors.cardBorder : '#E5EAF0' }]} />

          <View style={styles.metaItem}>
            <View style={styles.metaIcon}>
              <Clock color={LOGO_BLUE} size={16} />
            </View>
            <View style={styles.metaTextCol}>
              <Text style={[styles.metaLabel, { color: colors.textMuted }]}>Time</Text>
              <Text style={[styles.metaValue, { color: colors.textPrimary }]} numberOfLines={2}>
                {timeStr}
              </Text>
            </View>
          </View>

          <View style={[styles.metaDivider, { backgroundColor: isDark ? colors.cardBorder : '#E5EAF0' }]} />

          <View style={[styles.metaItem, styles.metaItemConsult]}>
            <View style={styles.metaIcon}>
              <Video color={LOGO_BLUE} size={15} />
            </View>
            <View style={styles.metaTextCol}>
              <Text
                style={[styles.metaLabel, { color: colors.textMuted }]}
                numberOfLines={1}
              >
                Consultation
              </Text>
              <Text
                style={[styles.metaValue, styles.consultValue, { color: colors.textPrimary }]}
                numberOfLines={1}
                ellipsizeMode="clip"
                adjustsFontSizeToFit
                minimumFontScale={0.8}
              >
                {consultationLabel}
              </Text>
            </View>
          </View>
        </View>

        {/* Meet status bar */}
        {meetLink ? (
          <TouchableOpacity
            style={[
              styles.meetBar,
              meetEnded && styles.meetBarEnded,
              meetOpen && styles.meetBarOpen,
              meetEarly && styles.meetBarEarly,
              {
                backgroundColor: meetEnded
                  ? isDark
                    ? 'rgba(52,211,153,0.12)'
                    : '#ECFDF5'
                  : meetOpen
                    ? isDark
                      ? 'rgba(18,78,150,0.15)'
                      : LOGO_BLUE_SOFT
                    : isDark
                      ? colors.inputBackground
                      : '#F1F5F9',
              },
            ]}
            onPress={(e) => {
              e?.stopPropagation?.();
              onJoinMeet();
            }}
            disabled={meetEnded}
            activeOpacity={meetEnded ? 1 : 0.88}
          >
            <View
              style={[
                styles.meetIconCircle,
                {
                  backgroundColor: meetEnded
                    ? '#12B76A'
                    : meetOpen
                      ? LOGO_BLUE
                      : '#94A3B8',
                },
              ]}
            >
              <Ionicons
                name={
                  meetEnded
                    ? 'checkmark'
                    : meetOpen
                      ? 'videocam'
                      : 'information'
                }
                size={14}
                color="#FFFFFF"
              />
            </View>
            <View style={styles.meetCopy}>
              <Text
                style={[
                  styles.meetTitle,
                  {
                    color: meetEnded
                      ? '#059669'
                      : meetOpen
                        ? LOGO_BLUE
                        : colors.textSecondary,
                  },
                ]}
                numberOfLines={1}
              >
                {meetJoin.label}
              </Text>
              {meetJoin.hint ? (
                <Text style={[styles.meetHint, { color: colors.textMuted }]} numberOfLines={1}>
                  {meetJoin.hint}
                </Text>
              ) : null}
            </View>
          </TouchableOpacity>
        ) : isOnline && showActions ? (
          <View
            style={[
              styles.meetBar,
              { backgroundColor: isDark ? colors.inputBackground : '#F1F5F9' },
            ]}
          >
            <View style={[styles.meetIconCircle, { backgroundColor: '#94A3B8' }]}>
              <Ionicons name="information" size={14} color="#FFFFFF" />
            </View>
            <View style={styles.meetCopy}>
              <Text style={[styles.meetTitle, { color: colors.textSecondary }]}>
                Meet link pending
              </Text>
              <Text style={[styles.meetHint, { color: colors.textMuted }]}>
                Link will appear before your visit
              </Text>
            </View>
          </View>
        ) : null}

        {/* Actions */}
        {showActions ? (
          <View style={styles.actionsRow}>
            {onReschedule ? (
              <TouchableOpacity
                style={[
                  styles.actionBtn,
                  {
                    borderColor: LOGO_BLUE,
                    backgroundColor: isDark ? colors.cardBackground : '#FFFFFF',
                  },
                ]}
                onPress={(e) => {
                  e?.stopPropagation?.();
                  onReschedule();
                }}
                activeOpacity={0.85}
              >
                <Ionicons name="calendar-outline" size={15} color={LOGO_BLUE} />
                <Text style={[styles.actionBtnText, { color: LOGO_BLUE }]}>Reschedule</Text>
              </TouchableOpacity>
            ) : null}
            {onCancel ? (
              <TouchableOpacity
                style={[
                  styles.actionBtn,
                  {
                    borderColor: '#F87171',
                    backgroundColor: isDark ? colors.cardBackground : '#FFFFFF',
                  },
                ]}
                onPress={(e) => {
                  e?.stopPropagation?.();
                  onCancel();
                }}
                activeOpacity={0.85}
              >
                <Ionicons name="close" size={15} color="#EF4444" />
                <Text style={[styles.actionBtnText, { color: '#EF4444' }]}>Cancel</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        ) : null}
      </TouchableOpacity>

      <MeetJoinGateModal
        visible={gateOpen && meetJoin.reason !== 'ended'}
        onClose={() => setGateOpen(false)}
        title={meetJoin.title}
        message={meetJoin.message}
        meetingTimeLabel={meetJoin.meetingTimeLabel}
        opensAtLabel={meetJoin.opensAtLabel}
        ended={false}
      />
    </>
  );
};

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: 22,
    padding: 16,
    marginBottom: SPACING.md,
    elevation: 3,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  avatarWrap: {
    marginRight: 12,
  },
  avatarImage: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#EEF2F6',
  },
  avatarFallback: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  doctorCopy: {
    flex: 1,
    minWidth: 0,
    paddingRight: 8,
  },
  doctorName: {
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  speciality: {
    fontSize: 13,
    fontWeight: '700',
    color: LOGO_BLUE,
    marginTop: 2,
  },
  clinicRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
  },
  clinic: {
    fontSize: 12,
    fontWeight: '500',
    flex: 1,
  },
  topRight: {
    alignItems: 'flex-end',
    gap: 8,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
  },
  statusText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  metaPanel: {
    marginTop: 14,
    borderRadius: 16,
    borderWidth: 1,
    paddingVertical: 12,
    paddingHorizontal: 8,
    flexDirection: 'row',
    alignItems: 'center',
  },
  metaItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minWidth: 0,
  },
  metaItemConsult: {
    flex: 1.05,
  },
  metaDivider: {
    width: StyleSheet.hairlineWidth,
    height: 36,
    marginHorizontal: 4,
  },
  metaIcon: {
    width: 30,
    height: 30,
    borderRadius: 9,
    backgroundColor: LOGO_BLUE_SOFT,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  metaTextCol: {
    flex: 1,
    minWidth: 0,
    justifyContent: 'center',
  },
  metaLabel: {
    fontSize: 10,
    fontWeight: '600',
  },
  metaValue: {
    fontSize: 11,
    fontWeight: '800',
    marginTop: 2,
    lineHeight: 14,
  },
  consultValue: {
    flexShrink: 1,
    width: '100%',
  },
  meetBar: {
    marginTop: 14,
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  meetBarEnded: {},
  meetBarOpen: {},
  meetBarEarly: {},
  meetIconCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  meetCopy: {
    flex: 1,
    minWidth: 0,
  },
  meetTitle: {
    fontSize: 13,
    fontWeight: '800',
  },
  meetHint: {
    fontSize: 11,
    fontWeight: '500',
    marginTop: 1,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 14,
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 1.5,
    borderRadius: 14,
    paddingVertical: 12,
  },
  actionBtnText: {
    fontSize: 13,
    fontWeight: '700',
  },
});
