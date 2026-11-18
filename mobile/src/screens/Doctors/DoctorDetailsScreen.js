import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Image,
  TouchableOpacity,
  RefreshControl,
  Platform,
  StatusBar,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { SPACING, RADIUS } from '../../constants/theme';
import { useAppTheme } from '../../context/SettingsContext';
import { patientApi } from '../../api/patient.api';
import { useAuth } from '../../context/AuthContext';
import { LoadingSpinner } from '../../components/LoadingSpinner';
import { HeaderBackButton, HeaderBackSpacer } from '../../components/HeaderBackButton';

const FALLBACK_IMAGE =
  'https://images.unsplash.com/photo-1559839734-2b71ea197ec2?auto=format&fit=crop&q=80&w=400';

/** Brains logo / brand blue — use for accent text & icons */
const LOGO_BLUE = '#124E96';
const LOGO_BLUE_SOFT = '#EAF2FC';

const WEEKDAYS = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];

const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function formatTimeToAMPM(time) {
  if (!time) return '';
  const [h, m] = String(time).split(':');
  let hour = parseInt(h, 10);
  if (Number.isNaN(hour)) return String(time);
  const ampm = hour >= 12 ? 'PM' : 'AM';
  hour = hour % 12 || 12;
  return `${hour}:${m || '00'} ${ampm}`;
}

/** Split doctor bio into readable paragraphs (mirrors web SingleDoctorDetailPage). */
function splitAboutParagraphs(text) {
  const raw = String(text || '').trim();
  if (!raw) return [];

  const byBlankLine = raw
    .split(/\n\s*\n+/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (byBlankLine.length > 1) return byBlankLine;

  const byLine = raw
    .split(/\n+/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (byLine.length > 1) return byLine;

  const sentences =
    raw.match(/[^.!?]+[.!?]+(?:\s+|$)|[^.!?]+$/g)?.map((s) => s.trim()).filter(Boolean) ??
    [];
  if (sentences.length > 1) return sentences;

  return [raw];
}

export const DoctorDetailsScreen = ({ navigation, route }) => {
  const doctorId = route?.params?.doctorId;
  const { isAuthenticated } = useAuth();
  const { colors, isDark } = useAppTheme();
  const insets = useSafeAreaInsets();
  const [doctor, setDoctor] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [selectedDay, setSelectedDay] = useState(null);
  const [aboutExpanded, setAboutExpanded] = useState(false);

  const loadDoctor = useCallback(async () => {
    if (!doctorId) {
      setError('Doctor id is missing.');
      setLoading(false);
      return;
    }

    try {
      setError('');
      const res = await patientApi.getDoctorDetails(doctorId);
      const data = res?.data || res?.doctor || res;
      if (!data || (!data._id && !data.id && !data.name)) {
        setError('Doctor details not found.');
        setDoctor(null);
        return;
      }
      setDoctor(data);
      setAboutExpanded(false);
      setSelectedDay(null);
    } catch (err) {
      setDoctor(null);
      setError(
        err?.response?.data?.message ||
          err.message ||
          'Failed to load doctor details.'
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [doctorId]);

  useEffect(() => {
    setLoading(true);
    loadDoctor();
  }, [loadDoctor]);

  const onRefresh = () => {
    setRefreshing(true);
    loadDoctor();
  };

  const handleBook = () => {
    if (!isAuthenticated) {
      navigation.navigate('WebsiteLogin');
      return;
    }
    navigation.navigate('BookAppointment', {
      doctorId: doctor?._id || doctor?.id || doctorId,
    });
  };

  const availableDays = useMemo(() => {
    const excluded = doctor?.availabilityRange?.excludedWeekdays || [];
    return [0, 1, 2, 3, 4, 5, 6].filter((d) => !excluded.includes(d));
  }, [doctor]);

  const activeDay = useMemo(() => {
    if (selectedDay !== null && availableDays.includes(selectedDay)) {
      return selectedDay;
    }
    return availableDays[0] ?? null;
  }, [selectedDay, availableDays]);

  const dailySlots = useMemo(() => {
    const ranges = Array.isArray(doctor?.dailyTimeRanges)
      ? doctor.dailyTimeRanges
      : [];
    const isCustomMode = doctor?.availabilityMode === 'custom';
    if (isCustomMode && activeDay !== null) {
      return ranges.filter((slot) => slot.day !== undefined && slot.day !== null && Number(slot.day) === Number(activeDay));
    }
    return ranges;
  }, [doctor, activeDay]);

  const consultationMinutes =
    doctor?.appointmentDuration ?? doctor?.slotDurationMinutes ?? 30;

  const aboutText =
    doctor?.about?.trim() ||
    doctor?.bio?.trim() ||
    `${doctor?.name || 'This doctor'} is a ${
      doctor?.specialization || 'specialist'
    } at Brains Hospital.`;

  const aboutParagraphs = useMemo(
    () => splitAboutParagraphs(aboutText),
    [aboutText]
  );
  const hasMoreAbout = aboutParagraphs.length > 1;
  const visibleAbout = aboutExpanded
    ? aboutParagraphs
    : aboutParagraphs.slice(0, 1);

  if (loading) {
    return <LoadingSpinner message="Loading doctor details..." />;
  }

  return (
    <View style={[styles.container, { backgroundColor: isDark ? colors.background : '#F2F8FB' }]}>
      <StatusBar barStyle="light-content" backgroundColor="#053B74" />

      <View style={styles.headerWrap}>
        <LinearGradient
          colors={['#053B74', '#124E96', '#06ADC6']}
          locations={[0, 0.55, 1]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.headerShell, { paddingTop: insets.top + 10 }]}
        >
          <View style={styles.headerTop}>
            <HeaderBackButton />
            <Text style={styles.headerTitle}>Doctor Profile</Text>
            <HeaderBackSpacer />
          </View>
        </LinearGradient>
      </View>

      <View style={[styles.contentSheet, { backgroundColor: isDark ? colors.background : '#F2F8FB' }]}>
        <LinearGradient
          pointerEvents="none"
          colors={
            isDark
              ? [colors.background, colors.surfaceMuted || colors.background]
              : ['#DCEAF6', '#E8F3F8', '#DFF5F8', '#F2F8FB']
          }
          locations={[0, 0.32, 0.68, 1]}
          start={{ x: 0.1, y: 0 }}
          end={{ x: 0.9, y: 1 }}
          style={StyleSheet.absoluteFillObject}
        />

        {error || !doctor ? (
          <View style={styles.centered}>
            <Ionicons name="alert-circle-outline" size={40} color={colors.error} />
            <Text style={[styles.errorText, { color: colors.textSecondary }]}>
              {error || 'Doctor not found.'}
            </Text>
            <TouchableOpacity style={styles.bookBtn} onPress={loadDoctor} activeOpacity={0.88}>
              <Text style={styles.bookBtnText}>Try Again</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <ScrollView
            contentContainerStyle={styles.scroll}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                tintColor={LOGO_BLUE}
              />
            }
          >
            <View style={styles.hero}>
              <Image
                source={{ uri: doctor.profileImage || FALLBACK_IMAGE }}
                style={[styles.avatar, { backgroundColor: LOGO_BLUE_SOFT }]}
              />
              <Text style={[styles.name, { color: colors.textPrimary }]}>
                {doctor.name || 'Doctor'}
              </Text>
              <Text style={[styles.specialty, { color: LOGO_BLUE }]}>
                {doctor.specialization || doctor.specialty || 'General Practitioner'}
              </Text>

              <View style={styles.chipRow}>
                <View style={[styles.chip, { backgroundColor: LOGO_BLUE_SOFT }]}>
                  <Ionicons name="shield-checkmark" size={13} color={LOGO_BLUE} />
                  <Text style={[styles.chipText, { color: LOGO_BLUE }]}>
                    Verified Doctor
                  </Text>
                </View>
                {doctor.experience != null && doctor.experience !== '' ? (
                  <View style={[styles.chip, { backgroundColor: LOGO_BLUE_SOFT }]}>
                    <Ionicons name="briefcase-outline" size={13} color={LOGO_BLUE} />
                    <Text style={[styles.chipText, { color: LOGO_BLUE }]}>
                      {doctor.experience}+ yrs
                    </Text>
                  </View>
                ) : null}
              </View>
            </View>

            <View style={styles.statsRow}>
              <View
                style={[
                  styles.statCard,
                  {
                    backgroundColor: isDark ? colors.surface : LOGO_BLUE_SOFT,
                    borderColor: colors.cardBorder,
                  },
                ]}
              >
                <Ionicons name="briefcase-outline" size={18} color={LOGO_BLUE} />
                <Text style={[styles.statValue, { color: colors.textPrimary }]}>
                  {doctor.experience != null && doctor.experience !== ''
                    ? `${doctor.experience} yrs`
                    : 'N/A'}
                </Text>
                <Text style={[styles.statLabel, { color: colors.textSecondary }]}>
                  Experience
                </Text>
              </View>
              <View
                style={[
                  styles.statCard,
                  {
                    backgroundColor: isDark ? colors.surface : LOGO_BLUE_SOFT,
                    borderColor: colors.cardBorder,
                  },
                ]}
              >
                <Ionicons name="time-outline" size={18} color={LOGO_BLUE} />
                <Text style={[styles.statValue, { color: colors.textPrimary }]}>
                  {consultationMinutes} mins
                </Text>
                <Text style={[styles.statLabel, { color: colors.textSecondary }]}>
                  Consultation
                </Text>
              </View>
              <View
                style={[
                  styles.statCard,
                  {
                    backgroundColor: isDark ? colors.surface : LOGO_BLUE_SOFT,
                    borderColor: colors.cardBorder,
                  },
                ]}
              >
                <Ionicons name="cash-outline" size={18} color={LOGO_BLUE} />
                <Text style={[styles.statValue, { color: colors.textPrimary }]}>
                  {doctor.fees != null ? `₹${doctor.fees}` : '—'}
                </Text>
                <Text style={[styles.statLabel, { color: colors.textSecondary }]}>
                  Fees
                </Text>
              </View>
            </View>

            {doctor.qualification ? (
              <View
                style={[
                  styles.qualCard,
                  {
                    backgroundColor: isDark ? colors.surface : LOGO_BLUE_SOFT,
                    borderColor: colors.cardBorder,
                  },
                ]}
              >
                <View style={styles.qualIconWrap}>
                  <Ionicons name="school-outline" size={20} color={LOGO_BLUE} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.statLabel, { color: colors.textSecondary }]}>
                    Qualification
                  </Text>
                  <Text style={[styles.qualValue, { color: colors.textPrimary }]}>
                    {doctor.qualification}
                  </Text>
                </View>
              </View>
            ) : null}

            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>
                Availability
              </Text>

              {availableDays.length > 0 ? (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.dayPillsRow}
                >
                  {availableDays.map((d) => {
                    const active = d === activeDay;
                    return (
                      <TouchableOpacity
                        key={d}
                        style={[
                          styles.dayPill,
                          {
                            backgroundColor: active
                              ? LOGO_BLUE
                              : isDark
                                ? colors.surface
                                : '#F1F5F9',
                            borderColor: active ? LOGO_BLUE : colors.cardBorder,
                          },
                        ]}
                        onPress={() => setSelectedDay(d)}
                        activeOpacity={0.85}
                      >
                        <Text
                          style={[
                            styles.dayPillText,
                            { color: active ? '#FFFFFF' : colors.textSecondary },
                          ]}
                        >
                          {WEEKDAY_SHORT[d]}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              ) : (
                <Text style={[styles.sectionBody, { color: colors.textMuted }]}>
                  No available days configured.
                </Text>
              )}

              {activeDay != null ? (
                <Text style={[styles.activeDayLabel, { color: colors.textMuted }]}>
                  {WEEKDAYS[activeDay]}
                  {doctor.availabilityMode === 'custom' ? '' : ' · same hours each day'}
                </Text>
              ) : null}

              {dailySlots.length > 0 ? (
                <View style={styles.slotsList}>
                  {dailySlots.map((slot, idx) => (
                    <View
                      key={`${slot.day ?? 'd'}-${slot.start}-${slot.end}-${idx}`}
                      style={[
                        styles.slotRow,
                        {
                          backgroundColor: isDark ? colors.surface : '#F8FBFF',
                          borderColor: colors.cardBorder,
                        },
                      ]}
                    >
                      <Ionicons name="time-outline" size={16} color={LOGO_BLUE} />
                      <View style={{ flex: 1 }}>
                        {slot.label ? (
                          <Text
                            style={[styles.slotLabel, { color: colors.textPrimary }]}
                            numberOfLines={1}
                          >
                            {slot.label}
                          </Text>
                        ) : null}
                        <Text style={[styles.slotTime, { color: colors.textMuted }]}>
                          {formatTimeToAMPM(slot.start)} – {formatTimeToAMPM(slot.end)}
                        </Text>
                      </View>
                    </View>
                  ))}
                </View>
              ) : (
                <Text style={[styles.sectionBody, { color: colors.textMuted }]}>
                  Contact hospital for timings
                </Text>
              )}
            </View>

            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>
                About
              </Text>
              {visibleAbout.map((para, idx) => (
                <Text
                  key={`about-${idx}`}
                  style={[styles.sectionBody, { color: colors.textMuted, marginBottom: 8 }]}
                >
                  {para}
                </Text>
              ))}
              {hasMoreAbout ? (
                <TouchableOpacity
                  onPress={() => setAboutExpanded((v) => !v)}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.readMore, { color: LOGO_BLUE }]}>
                    {aboutExpanded ? 'Read less' : 'Read more'}
                  </Text>
                </TouchableOpacity>
              ) : null}
            </View>

            {(doctor.email || doctor.phone) && (
              <View style={styles.section}>
                <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>
                  Contact
                </Text>
                {doctor.email ? (
                  <View style={styles.infoRow}>
                    <Ionicons name="mail-outline" size={16} color={colors.textMuted} />
                    <Text style={[styles.infoText, { color: colors.textMuted }]}>
                      {doctor.email}
                    </Text>
                  </View>
                ) : null}
                {doctor.phone ? (
                  <View style={styles.infoRow}>
                    <Ionicons name="call-outline" size={16} color={colors.textMuted} />
                    <Text style={[styles.infoText, { color: colors.textMuted }]}>
                      {doctor.phone}
                    </Text>
                  </View>
                ) : null}
              </View>
            )}

            <TouchableOpacity
              style={styles.bookBtn}
              onPress={handleBook}
              activeOpacity={0.88}
            >
              <Text style={styles.bookBtnText}>Book Appointment</Text>
              <Ionicons name="chevron-forward" size={16} color="#FFFFFF" />
            </TouchableOpacity>
            <View style={{ height: SPACING.xl }} />
          </ScrollView>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  headerWrap: {
    zIndex: 4,
    elevation: 8,
    shadowColor: '#053B74',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.18,
    shadowRadius: 12,
  },
  headerShell: {
    paddingHorizontal: SPACING.md,
    paddingBottom: 22,
    borderBottomLeftRadius: 18,
    borderBottomRightRadius: 18,
    overflow: 'hidden',
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerTitle: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: -0.3,
    textAlign: 'center',
  },
  headerSpacer: { width: 40 },
  contentSheet: {
    flex: 1,
    marginTop: -16,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: 'hidden',
    zIndex: 1,
  },
  scroll: {
    padding: SPACING.lg,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: SPACING.lg,
    gap: SPACING.md,
  },
  errorText: {
    textAlign: 'center',
    marginBottom: SPACING.sm,
  },
  hero: {
    alignItems: 'center',
    marginBottom: SPACING.lg,
  },
  avatar: {
    width: 120,
    height: 120,
    borderRadius: 60,
    marginBottom: SPACING.md,
  },
  name: {
    fontSize: 22,
    fontWeight: '700',
    textAlign: 'center',
  },
  specialty: {
    marginTop: 4,
    fontSize: 15,
    fontWeight: '600',
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 8,
    marginTop: 12,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },
  chipText: {
    fontSize: 12,
    fontWeight: '700',
  },
  statsRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
    marginBottom: SPACING.md,
  },
  statCard: {
    flex: 1,
    borderRadius: RADIUS.md,
    paddingVertical: SPACING.md,
    paddingHorizontal: 6,
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
  },
  statValue: {
    fontSize: 13,
    fontWeight: '800',
    textAlign: 'center',
  },
  statLabel: {
    fontSize: 11,
    fontWeight: '600',
  },
  qualCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    padding: 14,
    marginBottom: SPACING.lg,
  },
  qualIconWrap: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  qualValue: {
    marginTop: 2,
    fontSize: 14,
    fontWeight: '700',
  },
  section: {
    marginBottom: SPACING.lg,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: SPACING.sm,
  },
  sectionBody: {
    fontSize: 14,
    lineHeight: 22,
  },
  dayPillsRow: {
    gap: 8,
    paddingBottom: 4,
  },
  dayPill: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
  },
  dayPillText: {
    fontSize: 13,
    fontWeight: '700',
  },
  activeDayLabel: {
    marginTop: 10,
    marginBottom: 8,
    fontSize: 12,
    fontWeight: '600',
  },
  slotsList: {
    gap: 8,
  },
  slotRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  slotLabel: {
    fontSize: 13,
    fontWeight: '700',
  },
  slotTime: {
    fontSize: 12,
    fontWeight: '600',
    marginTop: 1,
  },
  readMore: {
    marginTop: 2,
    fontSize: 13,
    fontWeight: '700',
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  infoText: {
    fontSize: 14,
    flex: 1,
  },
  bookBtn: {
    marginTop: 4,
    backgroundColor: LOGO_BLUE,
    borderRadius: 16,
    paddingVertical: 15,
    paddingHorizontal: 18,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  bookBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },
});
