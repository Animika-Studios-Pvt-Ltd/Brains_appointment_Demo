import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Alert,
  RefreshControl,
  Modal,
  Pressable,
  ActivityIndicator,
  Image,
  ScrollView,
  Animated,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { SPACING, RADIUS } from '../../constants/theme';
import { getTabBarScrollPadding } from '../../constants/layout';
import { useAppTheme } from '../../context/SettingsContext';
import { patientApi, appointmentApi } from '../../api/patient.api';
import { AppointmentCard } from '../../components/AppointmentCard';
import { LoadingSpinner } from '../../components/LoadingSpinner';
import { HeaderBackButton, HeaderBackSpacer } from '../../components/HeaderBackButton';
import { Ionicons } from '@expo/vector-icons';

/** Brains logo / brand blue — accent text & buttons */
const LOGO_BLUE = '#124E96';
const LOGO_BLUE_SOFT = '#EAF2FC';

const UPCOMING = new Set([
  'scheduled',
  'confirmed',
  'pending',
  'rescheduled',
  'reassigned',
  'in progress',
]);

const COMPLETED = new Set(['completed']);
const CANCELLED = new Set([
  'cancelled',
  'canceled',
  'rejected',
  'missed',
  'no show',
  'no-show',
  'noshow',
  'expired',
]);

const FALLBACK_DOCTOR_IMAGE =
  'https://images.unsplash.com/photo-1559839734-2b71ea197ec2?auto=format&fit=crop&q=80&w=300';

const parseAppointmentsResponse = (data) => {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.data?.appointments)) return data.data.appointments;
  if (Array.isArray(data?.appointments)) return data.appointments;
  if (Array.isArray(data?.data)) return data.data;
  return [];
};

const formatDate = (appointment) => {
  const raw = appointment?.slotStartIso || appointment?.date;
  if (!raw) return 'Date N/A';
  try {
    return new Date(raw).toLocaleDateString('en-IN', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return 'Date N/A';
  }
};

const formatTime = (appointment) => {
  if (appointment?.slotStartIso) {
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
  return appointment?.time || 'Scheduled';
};

const RESCHEDULE_LIMIT = 999; // TODO testing (mobile only): restore to 3

const EMPTY_COPY = {
  upcoming: {
    title: 'No upcoming visits',
    body: 'Book a consultation with a specialist when you need care.',
    icon: 'calendar-outline',
  },
  completed: {
    title: 'No completed visits yet',
    body: 'Finished appointments and prescriptions will show up here.',
    icon: 'checkmark-circle-outline',
  },
  cancelled: {
    title: 'No cancelled visits',
    body: 'Cancelled or missed appointments will appear in this list.',
    icon: 'close-circle-outline',
  },
};

export const AppointmentsScreen = ({ navigation }) => {
  const { colors, isDark } = useAppTheme();
  const insets = useSafeAreaInsets();
  const [activeTab, setActiveTab] = useState('upcoming');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [appointments, setAppointments] = useState([]);
  const [cancelTarget, setCancelTarget] = useState(null);
  const [cancelLoading, setCancelLoading] = useState(false);
  const [cancelDone, setCancelDone] = useState(false);
  const [selectedAppt, setSelectedAppt] = useState(null);
  const [prescriptionModalOpen, setPrescriptionModalOpen] = useState(false);
  const [tabsHeight, setTabsHeight] = useState(64);

  const fetchAppointments = useCallback(async () => {
    try {
      const data = await patientApi.getAppointments();
      setAppointments(parseAppointmentsResponse(data));
    } catch (err) {
      console.warn('Error fetching appointments:', err?.response?.data || err?.message || err);
      setAppointments([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchAppointments();

      // Poll every 5 seconds for real-time status updates when screen is active
      const intervalId = setInterval(() => {
        fetchAppointments();
      }, 5000);

      return () => {
        clearInterval(intervalId);
      };
    }, [fetchAppointments])
  );

  const openCancelModal = (appointment) => {
    setCancelDone(false);
    setCancelLoading(false);
    setCancelTarget(appointment);
  };

  const closeCancelModal = () => {
    if (cancelLoading) return;
    setCancelTarget(null);
    setCancelDone(false);
    setCancelLoading(false);
  };

  const confirmCancel = async () => {
    if (!cancelTarget || cancelLoading) return;
    const appointmentId = cancelTarget._id || cancelTarget.id;
    setCancelLoading(true);
    try {
      await appointmentApi.cancelAppointment(
        appointmentId,
        'Patient requested cancellation'
      );
      setCancelDone(true);
      await fetchAppointments();
    } catch (err) {
      console.warn('Cancel appointment failed:', err?.response?.data || err?.message || err);
      setCancelLoading(false);
      Alert.alert(
        'Could not cancel',
        err.response?.data?.message || err.message || 'Failed to cancel appointment'
      );
    } finally {
      setCancelLoading(false);
    }
  };

  const handleReschedule = (appointment) => {
    const count = Number(appointment?.rescheduleCount || 0);
    if (count >= RESCHEDULE_LIMIT) {
      Alert.alert(
        'Reschedule Limit Reached',
        `You have reached the maximum allowed (${RESCHEDULE_LIMIT}) reschedules for this appointment. Please contact support / receptionist for help.`
      );
      return;
    }

    const doctorId =
      appointment?.doctorId?._id ||
      appointment?.doctorId?.id ||
      appointment?.doctorId ||
      null;
    if (!doctorId) {
      Alert.alert('Error', 'Doctor information is missing for this appointment.');
      return;
    }

    navigation.navigate('BookAppointment', {
      doctorId: String(doctorId),
      rescheduleAppointment: appointment,
    });
  };

  const handleViewPrescription = (appointment) => {
    setSelectedAppt(appointment);
    setPrescriptionModalOpen(true);
  };

  const goBook = () => navigation.navigate('SelectDoctor');

  const filteredAppointments = appointments.filter((item) => {
    const status = String(item.status || '').toLowerCase();
    const mode = String(item.paymentMode || '').toLowerCase();
    const payStatus = String(item.paymentStatus || '').toLowerCase();

    if (activeTab === 'upcoming') {
      if (mode === 'online' && payStatus === 'pending' && !item.razorpayPaymentId) {
        return false;
      }
      return UPCOMING.has(status);
    }
    if (activeTab === 'completed') return COMPLETED.has(status);
    if (activeTab === 'cancelled') return CANCELLED.has(status);
    return true;
  });

  const tabCounts = appointments.reduce(
    (acc, item) => {
      const status = String(item.status || '').toLowerCase();
      const mode = String(item.paymentMode || '').toLowerCase();
      const payStatus = String(item.paymentStatus || '').toLowerCase();
      if (mode === 'online' && payStatus === 'pending' && !item.razorpayPaymentId) {
        // skip unpaid online holds from upcoming count
      } else if (UPCOMING.has(status)) {
        acc.upcoming += 1;
      }
      if (COMPLETED.has(status)) acc.completed += 1;
      if (CANCELLED.has(status)) acc.cancelled += 1;
      return acc;
    },
    { upcoming: 0, completed: 0, cancelled: 0 }
  );

  const TABS = useMemo(
    () => [
      { key: 'upcoming', label: 'Upcoming', icon: 'calendar-outline', count: tabCounts.upcoming },
      { key: 'completed', label: 'Done', icon: 'checkmark-circle-outline', count: tabCounts.completed },
      { key: 'cancelled', label: 'Cancelled', icon: 'close-circle-outline', count: tabCounts.cancelled },
    ],
    [tabCounts.upcoming, tabCounts.completed, tabCounts.cancelled]
  );



  if (loading) {
    return <LoadingSpinner message="Loading appointments..." />;
  }

  const doctorName =
    cancelTarget?.doctorId?.name || cancelTarget?.doctorName || 'your doctor';
  const specialization = cancelTarget?.doctorId?.specialization || '';
  const doctorImage =
    cancelTarget?.doctorId?.profileImage ||
    cancelTarget?.doctorProfileImage ||
    FALLBACK_DOCTOR_IMAGE;

  const empty = EMPTY_COPY[activeTab] || EMPTY_COPY.upcoming;

  return (
    <View style={[styles.container, { backgroundColor: isDark ? colors.background : '#F2F8FB' }]}>
      <View style={styles.headerWrap}>
        <LinearGradient
          colors={['#053B74', '#124E96', '#06ADC6']}
          locations={[0, 0.55, 1]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.headerShell, { paddingTop: insets.top + 10 }]}
        >
          <View style={styles.headerTop}>
            <HeaderBackButton fallbackRoute="Home" />
            <Text style={styles.headerTitle}>My Appointments</Text>
            <HeaderBackSpacer />
          </View>
        </LinearGradient>
      </View>

      <View
        style={[
          styles.contentSheet,
          { backgroundColor: isDark ? colors.background : '#F2F8FB' },
        ]}
      >
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

        <FlatList
          style={styles.list}
          data={filteredAppointments}
          keyExtractor={(item) => String(item._id || item.id)}
          contentContainerStyle={[
            styles.listContainer,
            {
              paddingTop: tabsHeight + 8,
              paddingBottom: getTabBarScrollPadding(insets.bottom),
            },
            filteredAppointments.length === 0 ? styles.listGrow : null,
          ]}
          showsVerticalScrollIndicator={false}
          overScrollMode="never"
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                fetchAppointments();
              }}
              tintColor={LOGO_BLUE}
              progressViewOffset={tabsHeight}
            />
          }
          renderItem={({ item }) => (
            <AppointmentCard
              appointment={item}
              onCancel={() => openCancelModal(item)}
              onReschedule={() => handleReschedule(item)}
              onPress={() => {
                if (
                  item.status?.toLowerCase() === 'completed' &&
                  (String(item.prescription || '').trim() || String(item.notes || '').trim())
                ) {
                  handleViewPrescription(item);
                }
              }}
            />
          )}
          ListEmptyComponent={
            <View
              style={[
                styles.emptyCard,
                {
                  backgroundColor: isDark ? colors.cardBackground : '#FFFFFF',
                  borderColor: isDark ? colors.cardBorder : 'rgba(18,78,150,0.06)',
                },
              ]}
            >
              <LinearGradient
                colors={isDark ? ['#1e3d64', '#0f2038'] : ['#EAF2FC', '#D0E3FA']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.emptyIconRing}
              >
                <Ionicons name={empty.icon} size={32} color={LOGO_BLUE} />
              </LinearGradient>
              <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>{empty.title}</Text>
              <Text style={[styles.emptyBody, { color: colors.textMuted }]}>{empty.body}</Text>
              {activeTab === 'upcoming' ? (
                <TouchableOpacity style={styles.emptyCta} onPress={goBook} activeOpacity={0.9}>
                  <LinearGradient
                    colors={['#124E96', '#06ADC6']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={styles.emptyCtaGrad}
                  >
                    <Text style={styles.emptyCtaText}>Book appointment</Text>
                    <Ionicons name="arrow-forward" size={14} color="#fff" />
                  </LinearGradient>
                </TouchableOpacity>
              ) : null}
            </View>
          }
        />

        <View
          style={styles.tabsFloat}
          pointerEvents="box-none"
          onLayout={(e) => {
            const h = e.nativeEvent.layout.height;
            if (h > 0 && Math.abs(h - tabsHeight) > 0.5) setTabsHeight(h);
          }}
        >
          <View style={styles.tabsCard}>
            {TABS.map((tab) => {
              const active = activeTab === tab.key;
              const activeBg = isDark ? 'rgba(56, 189, 248, 0.12)' : 'rgba(18, 78, 150, 0.08)';
              const activeColor = isDark ? '#38BDF8' : '#124E96';
              const activeBorderColor = isDark ? 'rgba(56, 189, 248, 0.25)' : 'rgba(18, 78, 150, 0.15)';
              return (
                <TouchableOpacity
                  key={tab.key}
                  style={[
                    styles.tabChip,
                    active
                      ? {
                          backgroundColor: activeBg,
                          borderColor: activeBorderColor,
                        }
                      : {
                          backgroundColor: isDark ? colors.cardBackground : '#FFFFFF',
                          borderColor: isDark ? colors.cardBorder : 'rgba(18,78,150,0.06)',
                          shadowColor: '#053B74',
                          shadowOffset: { width: 0, height: 4 },
                          shadowOpacity: 0.04,
                          shadowRadius: 10,
                          elevation: 2,
                        }
                  ]}
                  onPress={() => setActiveTab(tab.key)}
                  activeOpacity={0.88}
                >
                  <Ionicons
                    name={tab.icon}
                    size={16}
                    color={active ? activeColor : colors.textMuted}
                  />
                  <View style={styles.tabLabelRow}>
                    <Text
                      style={[
                        styles.tabLabel,
                        { color: active ? activeColor : colors.textSecondary },
                      ]}
                      numberOfLines={1}
                    >
                      {tab.label}
                    </Text>
                    <View
                      style={[
                        styles.tabBadge,
                        {
                          backgroundColor: active
                            ? activeColor
                            : isDark
                              ? colors.inputBackground
                              : '#EAF2FC',
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.tabBadgeText,
                          { color: active ? '#FFFFFF' : colors.textSecondary },
                        ]}
                      >
                        {tab.count}
                      </Text>
                    </View>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      </View>

      <Modal
        visible={!!cancelTarget}
        transparent
        animationType="fade"
        onRequestClose={closeCancelModal}
      >
        <Pressable style={styles.modalBackdrop} onPress={closeCancelModal}>
          <Pressable
            style={[
              styles.modalCard,
              {
                backgroundColor: colors.cardBackground,
                borderColor: colors.cardBorder,
              },
            ]}
            onPress={(e) => e.stopPropagation?.()}
          >
            {cancelDone ? (
              <>
                <View
                  style={[
                    styles.successRing,
                    { backgroundColor: isDark ? 'rgba(52,211,153,0.12)' : '#ECFDF5' },
                  ]}
                >
                  <View style={[styles.successCircle, { backgroundColor: colors.success || '#059669' }]}>
                    <Ionicons name="checkmark" size={28} color="#fff" />
                  </View>
                </View>
                <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>
                  Cancelled successfully
                </Text>
                <Text style={[styles.modalBody, { color: colors.textSecondary }]}>
                  Your appointment has been cancelled. You can book a new visit whenever you need.
                </Text>

                {cancelTarget ? (
                  <View
                    style={[
                      styles.summaryCard,
                      {
                        backgroundColor: isDark ? colors.inputBackground : '#F8FBFF',
                        borderColor: colors.cardBorder,
                      },
                    ]}
                  >
                    <Image source={{ uri: doctorImage }} style={styles.summaryAvatar} />
                    <View style={styles.summaryText}>
                      <Text style={[styles.summaryDoctor, { color: colors.textPrimary }]} numberOfLines={1}>
                        {doctorName}
                      </Text>
                      {specialization ? (
                        <Text style={[styles.summaryMeta, { color: colors.textSecondary }]} numberOfLines={1}>
                          {specialization}
                        </Text>
                      ) : null}
                      <View style={styles.summaryRow}>
                        <Ionicons name="calendar-outline" size={13} color={colors.textMuted} />
                        <Text style={[styles.summaryMeta, { color: colors.textMuted }]}>
                          {formatDate(cancelTarget)}
                        </Text>
                      </View>
                      <View style={styles.summaryRow}>
                        <Ionicons name="time-outline" size={13} color={colors.textMuted} />
                        <Text style={[styles.summaryMeta, { color: colors.textMuted }]}>
                          {formatTime(cancelTarget)}
                        </Text>
                      </View>
                      <View
                        style={[
                          styles.statusPill,
                          { backgroundColor: isDark ? 'rgba(248,113,113,0.15)' : '#FEF2F2' },
                        ]}
                      >
                        <Text style={[styles.statusPillText, { color: colors.error }]}>Cancelled</Text>
                      </View>
                    </View>
                  </View>
                ) : null}

                <View style={styles.modalActions}>
                  <TouchableOpacity
                    style={[styles.primaryBtn, { backgroundColor: LOGO_BLUE }]}
                    onPress={closeCancelModal}
                    activeOpacity={0.88}
                  >
                    <Text style={styles.primaryBtnText}>Done</Text>
                  </TouchableOpacity>
                </View>
              </>
            ) : (
              <>
                <View style={[styles.warnIconWrap, { backgroundColor: isDark ? 'rgba(248,113,113,0.15)' : '#FEF2F2' }]}>
                  <Ionicons name="close-circle-outline" size={32} color={colors.error} />
                </View>
                <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>
                  Cancel appointment?
                </Text>
                <Text style={[styles.modalBody, { color: colors.textSecondary }]}>
                  This visit will be removed from your upcoming list. You can book again anytime.
                </Text>

                {cancelTarget ? (
                  <View
                    style={[
                      styles.summaryCard,
                      {
                        backgroundColor: isDark ? colors.inputBackground : '#F8FBFF',
                        borderColor: colors.cardBorder,
                      },
                    ]}
                  >
                    <Image source={{ uri: doctorImage }} style={styles.summaryAvatar} />
                    <View style={styles.summaryText}>
                      <Text style={[styles.summaryDoctor, { color: colors.textPrimary }]} numberOfLines={1}>
                        {doctorName}
                      </Text>
                      {specialization ? (
                        <Text style={[styles.summaryMeta, { color: colors.textSecondary }]} numberOfLines={1}>
                          {specialization}
                        </Text>
                      ) : null}
                      <View style={styles.summaryRow}>
                        <Ionicons name="calendar-outline" size={13} color={colors.textMuted} />
                        <Text style={[styles.summaryMeta, { color: colors.textMuted }]}>
                          {formatDate(cancelTarget)}
                        </Text>
                      </View>
                      <View style={styles.summaryRow}>
                        <Ionicons name="time-outline" size={13} color={colors.textMuted} />
                        <Text style={[styles.summaryMeta, { color: colors.textMuted }]}>
                          {formatTime(cancelTarget)}
                        </Text>
                      </View>
                    </View>
                  </View>
                ) : null}

                <View style={styles.modalActions}>
                  <TouchableOpacity
                    style={[
                      styles.secondaryBtn,
                      {
                        borderColor: colors.cardBorder,
                        backgroundColor: colors.inputBackground,
                      },
                    ]}
                    onPress={closeCancelModal}
                    disabled={cancelLoading}
                    activeOpacity={0.85}
                  >
                    <Text style={[styles.secondaryBtnText, { color: colors.textPrimary }]}>
                      Keep appointment
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.dangerBtn,
                      { backgroundColor: colors.error, opacity: cancelLoading ? 0.7 : 1 },
                    ]}
                    onPress={confirmCancel}
                    disabled={cancelLoading}
                    activeOpacity={0.88}
                  >
                    {cancelLoading ? (
                      <ActivityIndicator color="#fff" />
                    ) : (
                      <Text style={styles.dangerBtnText}>Yes, cancel</Text>
                    )}
                  </TouchableOpacity>
                </View>
              </>
            )}
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={prescriptionModalOpen} transparent animationType="slide">
        <View style={styles.prescriptionModalBackdrop}>
          <View style={[styles.prescriptionModalCard, { backgroundColor: colors.cardBackground }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: LOGO_BLUE }]}>Prescription Details</Text>
              <TouchableOpacity onPress={() => setPrescriptionModalOpen(false)}>
                <Ionicons name="close-circle-outline" size={24} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalScroll}>
              <View style={styles.metaSection}>
                <Text style={[styles.metaLabel, { color: colors.textMuted }]}>Doctor</Text>
                <Text style={[styles.metaValue, { color: colors.textPrimary }]}>
                  {selectedAppt?.doctorId?.name || selectedAppt?.doctorName || 'Dr. Specialist'}
                </Text>
                <Text style={[styles.metaSub, { color: colors.textSecondary }]}>
                  {selectedAppt?.doctorId?.specialization || selectedAppt?.speciality || 'General Medicine'}
                </Text>
              </View>

              <View style={styles.metaSection}>
                <Text style={[styles.metaLabel, { color: colors.textMuted }]}>Consultation Date</Text>
                <Text style={[styles.metaValue, { color: colors.textPrimary }]}>
                  {selectedAppt ? formatDate(selectedAppt) : ''}
                </Text>
              </View>

              <View style={[styles.cardSection, { borderColor: colors.cardBorder }]}>
                <Text style={[styles.sectionHeading, { color: LOGO_BLUE }]}>Patient Symptoms</Text>
                <Text style={[styles.sectionBodyText, { color: colors.textPrimary }]}>
                  {selectedAppt?.symptoms || selectedAppt?.reason || 'No symptoms provided.'}
                </Text>
              </View>

              <View style={[styles.cardSection, { borderColor: colors.cardBorder }]}>
                <Text style={[styles.sectionHeading, { color: LOGO_BLUE }]}>Rx / Prescription</Text>
                <Text style={[styles.sectionBodyText, { color: colors.textPrimary, fontStyle: selectedAppt?.prescription ? 'normal' : 'italic' }]}>
                  {selectedAppt?.prescription || 'No prescription written yet.'}
                </Text>
              </View>

              <View style={[styles.cardSection, { borderColor: colors.cardBorder }]}>
                <Text style={[styles.sectionHeading, { color: LOGO_BLUE }]}>Clinical Notes</Text>
                <Text style={[styles.sectionBodyText, { color: colors.textPrimary, fontStyle: selectedAppt?.notes ? 'normal' : 'italic' }]}>
                  {selectedAppt?.notes || 'No notes added by the doctor.'}
                </Text>
              </View>
            </ScrollView>

            <TouchableOpacity
              style={[styles.closeBtn, { backgroundColor: LOGO_BLUE }]}
              onPress={() => setPrescriptionModalOpen(false)}
            >
              <Text style={styles.closeBtnText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
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
    gap: 12,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.16)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.28)',
  },
  headerTitle: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: -0.3,
    textAlign: 'center',
  },
  headerSpacer: {
    width: 40,
  },
  contentSheet: {
    flex: 1,
    marginTop: -12,
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
    overflow: 'hidden',
    zIndex: 1,
  },
  list: {
    flex: 1,
  },
  tabsFloat: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 20,
    elevation: 20,
    paddingTop: 32,
    paddingHorizontal: SPACING.md,
    paddingBottom: 8,
  },
  tabsCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'transparent',
  },
  tabChip: {
    flex: 1,
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
    borderWidth: 1,
    paddingVertical: 10,
    gap: 4,
  },
  tabLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  tabLabel: {
    fontSize: 11,
    fontWeight: '800',
  },
  tabBadge: {
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabBadgeText: {
    fontSize: 9,
    fontWeight: '800',
  },
  listContainer: {
    paddingHorizontal: SPACING.md,
  },
  listGrow: {
    flexGrow: 1,
  },
  emptyCard: {
    marginTop: 24,
    borderRadius: 24,
    borderWidth: 1,
    borderStyle: 'dashed',
    paddingVertical: 44,
    paddingHorizontal: 28,
    alignItems: 'center',
    elevation: 3,
    shadowColor: '#053B74',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
  },
  emptyIconRing: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 18,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '800',
    textAlign: 'center',
    letterSpacing: -0.2,
  },
  emptyBody: {
    fontSize: 13,
    lineHeight: 20,
    textAlign: 'center',
    marginTop: 8,
    marginBottom: 22,
  },
  emptyCta: {
    borderRadius: 14,
    overflow: 'hidden',
  },
  emptyCtaGrad: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 14,
  },
  emptyCtaText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(11, 18, 32, 0.55)',
    justifyContent: 'center',
    paddingHorizontal: SPACING.lg,
  },
  modalCard: {
    borderRadius: 22,
    borderWidth: 1,
    padding: SPACING.lg,
    alignItems: 'center',
  },
  warnIconWrap: {
    width: 64,
    height: 64,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  successRing: {
    width: 84,
    height: 84,
    borderRadius: 42,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  successCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: -0.3,
    textAlign: 'center',
  },
  modalBody: {
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
    marginTop: 8,
    marginBottom: 16,
  },
  summaryCard: {
    width: '100%',
    borderWidth: 1,
    borderRadius: 16,
    padding: 12,
    flexDirection: 'row',
    gap: 12,
    marginBottom: 18,
  },
  summaryAvatar: {
    width: 48,
    height: 48,
    borderRadius: 14,
  },
  summaryText: { flex: 1, minWidth: 0 },
  summaryDoctor: { fontSize: 15, fontWeight: '800' },
  summaryMeta: { fontSize: 12, marginTop: 2 },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 4,
  },
  statusPill: {
    alignSelf: 'flex-start',
    marginTop: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  statusPillText: {
    fontSize: 10,
    fontWeight: '800',
  },
  modalActions: {
    width: '100%',
    gap: 10,
  },
  secondaryBtn: {
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 13,
    alignItems: 'center',
  },
  secondaryBtnText: {
    fontSize: 14,
    fontWeight: '700',
  },
  dangerBtn: {
    borderRadius: 14,
    paddingVertical: 13,
    alignItems: 'center',
    minHeight: 48,
    justifyContent: 'center',
  },
  dangerBtnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '800',
  },
  primaryBtn: {
    width: '100%',
    borderRadius: 14,
    paddingVertical: 13,
    alignItems: 'center',
  },
  primaryBtnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '800',
  },
  prescriptionModalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  prescriptionModalCard: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: SPACING.lg,
    maxHeight: '85%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.md,
  },
  modalScroll: {
    marginBottom: SPACING.md,
  },
  metaSection: {
    marginBottom: SPACING.md,
  },
  metaLabel: {
    fontSize: 11,
    textTransform: 'uppercase',
    fontWeight: '600',
  },
  metaValue: {
    fontSize: 16,
    fontWeight: '700',
    marginTop: 2,
  },
  metaSub: {
    fontSize: 13,
  },
  cardSection: {
    borderWidth: 1,
    borderRadius: RADIUS.md,
    padding: 12,
    marginBottom: SPACING.md,
  },
  sectionHeading: {
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 4,
  },
  sectionBodyText: {
    fontSize: 13,
    lineHeight: 18,
  },
  closeBtn: {
    paddingVertical: SPACING.md,
    borderRadius: RADIUS.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeBtnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
});
