import React, { useState, useEffect, useCallback } from "react";
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TouchableOpacity,
  Image,
  StatusBar,
  RefreshControl,
  Alert,
  Modal,
  Pressable,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect } from "@react-navigation/native";
import { getTabBarScrollPadding } from "../../constants/layout";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useAuth } from "../../context/AuthContext";
import { useSettings, useAppTheme } from "../../context/SettingsContext";
import { patientApi } from "../../api/patient.api";
import { LoadingSpinner } from "../../components/LoadingSpinner";
import { NotificationPanel } from "../../components/NotificationPanel";
import {
  buildNotificationsFromAppointments,
  getReadNotificationIds,
  getDismissedNotificationIds,
  filterDismissedNotifications,
  markNotificationsRead,
  dismissNotification,
} from "../../utils/notifications";

const RESCHEDULE_LIMIT = 999; // TODO testing (mobile only): restore to 3

const ACTIVE_APPT = new Set([
  "Scheduled",
  "scheduled",
  "confirmed",
  "pending",
  "Rescheduled",
  "Reassigned",
  "In Progress",
]);

const FALLBACK_DOCTOR_IMAGE =
  "https://images.unsplash.com/photo-1559839734-2b71ea197ec2?auto=format&fit=crop&q=80&w=300";

const getTimeGreeting = () => {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  if (hour < 21) return "Good evening";
  return "Good night";
};

export const HomeScreen = ({ navigation }) => {
  const { user, isAuthenticated } = useAuth();
  const {
    notificationsEnabled,
    appointmentReminders,
    bookingUpdates,
  } = useSettings();
  const { colors, isDark } = useAppTheme();
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [upcoming, setUpcoming] = useState([]);
  const [allAppointments, setAllAppointments] = useState([]);
  const [stats, setStats] = useState({
    totalAppointments: 0,
    completedCount: 0,
  });
  const [doctors, setDoctors] = useState([]);
  const [favoriteDoctorIds, setFavoriteDoctorIds] = useState({});
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [readIds, setReadIds] = useState([]);
  const [viewAppointment, setViewAppointment] = useState(null);

  const goBookOrLogin = (doctorId) => {
    const id =
      doctorId != null &&
      (typeof doctorId === "string" || typeof doctorId === "number")
        ? String(doctorId)
        : null;
    if (id) {
      if (!isAuthenticated) {
        navigation.navigate("WebsiteLogin");
        return;
      }
      navigation.navigate("BookAppointment", { doctorId: id });
      return;
    }
    navigation.navigate("SelectDoctor");
  };

  const toggleFavoriteDoctor = (doctorId) => {
    if (!doctorId) return;
    const key = String(doctorId);
    setFavoriteDoctorIds((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  const formatDoctorDisplayName = (name) => {
    const raw = String(name || "Doctor").trim();
    if (!raw) return "Doctor";
    return /^dr\.?\s/i.test(raw) ? raw : `Dr. ${raw}`;
  };

  const getDoctorAvailability = (doc) => {
    const raw = String(doc?.available || doc?.nextAvailable || "").trim();
    if (raw) {
      const parts = raw.split(",").map((p) => p.trim()).filter(Boolean);
      if (parts.length >= 2) {
        const dayPart = parts[0];
        const timePart = parts.slice(1).join(", ");
        return {
          label: /^available/i.test(dayPart) ? dayPart : `Available ${dayPart}`,
          time: timePart,
        };
      }
      return { label: "Available Today", time: raw };
    }
    return { label: "Available Today", time: "02:00 PM" };
  };

  const goAppointments = () => {
    navigation.navigate("Appointments");
  };

  const openDoctorDetails = (doctorId) => {
    if (!doctorId) return;
    navigation.navigate("DoctorDetails", { doctorId: String(doctorId) });
  };

  const handleReschedule = (appointment) => {
    if (!isAuthenticated) {
      navigation.navigate("WebsiteLogin");
      return;
    }
    const count = Number(appointment?.rescheduleCount || 0);
    if (count >= RESCHEDULE_LIMIT) {
      Alert.alert(
        "Reschedule Limit Reached",
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
      Alert.alert("Error", "Doctor information is missing for this appointment.");
      return;
    }
    navigation.navigate("BookAppointment", {
      doctorId: String(doctorId),
      rescheduleAppointment: appointment,
    });
  };

  const openAppointmentView = (appointment) => {
    setViewAppointment(appointment);
  };

  const closeAppointmentView = () => setViewAppointment(null);

  const refreshNotifications = useCallback(
    async (appointmentsList) => {
      if (!notificationsEnabled) {
        setNotifications([]);
        setReadIds(await getReadNotificationIds());
        return;
      }

      let built = buildNotificationsFromAppointments(appointmentsList, {
        isAuthenticated,
      });

      built = built.filter((n) => {
        if (n.type === "appointment" && !appointmentReminders) return false;
        if (
          (n.type === "warning" || n.type === "success" || n.type === "payment") &&
          !bookingUpdates
        ) {
          return false;
        }
        return true;
      });

      const [ids, dismissed] = await Promise.all([
        getReadNotificationIds(),
        getDismissedNotificationIds(),
      ]);
      setNotifications(filterDismissedNotifications(built, dismissed));
      setReadIds(ids);
    },
    [
      isAuthenticated,
      notificationsEnabled,
      appointmentReminders,
      bookingUpdates,
    ],
  );

  const fetchDashboardData = useCallback(async () => {
    try {
      let apptsList = [];
      if (isAuthenticated) {
        const appointmentsData = await patientApi.getAppointments();
        const allAppts = Array.isArray(appointmentsData)
          ? appointmentsData
          : appointmentsData.appointments ||
            appointmentsData?.data?.appointments ||
            [];

        apptsList = allAppts;
        setAllAppointments(allAppts);

        const upcomingAppts = allAppts.filter((a) => {
          if (!ACTIVE_APPT.has(String(a.status || ""))) return false;
          // Hide unpaid online payment holds from upcoming
          const mode = String(a.paymentMode || "").toLowerCase();
          const payStatus = String(a.paymentStatus || "").toLowerCase();
          if (mode === "online" && (payStatus === "pending" || payStatus === "cancelled")) {
            return false;
          }
          return true;
        });
        const completedAppts = allAppts.filter((a) => {
          const s = String(a.status || "");
          return s === "Completed" || s === "completed";
        });

        setUpcoming(upcomingAppts);
        setStats({
          totalAppointments: allAppts.length,
          completedCount: completedAppts.length,
        });
      } else {
        setUpcoming([]);
        setAllAppointments([]);
        setStats({ totalAppointments: 0, completedCount: 0 });
      }

      await refreshNotifications(apptsList);

      const docsData = await patientApi.getDoctors();
      let docs = [];
      if (Array.isArray(docsData)) {
        docs = docsData;
      } else if (docsData?.doctors && Array.isArray(docsData.doctors)) {
        docs = docsData.doctors;
      } else if (
        docsData?.data?.doctors &&
        Array.isArray(docsData.data.doctors)
      ) {
        docs = docsData.data.doctors;
      } else if (docsData?.data && Array.isArray(docsData.data)) {
        docs = docsData.data;
      }
      setDoctors(docs);
    } catch (err) {
      console.warn("Dashboard fetch warning:", err.message);
      await refreshNotifications([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [isAuthenticated, refreshNotifications]);

  useFocusEffect(
    useCallback(() => {
      fetchDashboardData();

      // Poll every 5 seconds for real-time status updates when screen is active
      const intervalId = setInterval(() => {
        fetchDashboardData();
      }, 5000);

      return () => {
        clearInterval(intervalId);
      };
    }, [fetchDashboardData])
  );

  const onRefresh = () => {
    setRefreshing(true);
    fetchDashboardData();
  };

  const unreadCount = notifications.filter(
    (n) => !readIds.includes(String(n.id)),
  ).length;

  const openNotifications = async () => {
    await refreshNotifications(allAppointments);
    setNotificationsOpen(true);
  };

  const handleMarkAllRead = async () => {
    try {
      const ids = notifications.map((n) => n.id).filter(Boolean);
      if (!ids.length) return;
      const next = await markNotificationsRead(ids);
      setReadIds(next);
    } catch (err) {
      console.warn("Mark all read failed:", err?.message || err);
    }
  };

  const handleDismissNotification = async (item) => {
    if (!item?.id) return;
    const dismissed = await dismissNotification(item.id);
    setNotifications((prev) => filterDismissedNotifications(prev, dismissed));
  };

  const handleNotificationPress = async (item) => {
    const next = await markNotificationsRead([item.id]);
    setReadIds(next);
    setNotificationsOpen(false);

    switch (item.action) {
      case "appointments":
        goAppointments();
        break;
      case "book":
        goBookOrLogin();
        break;
      case "payments":
        navigation.navigate("OnlinePayments");
        break;
      case "records":
        navigation.navigate("Records");
        break;
      case "profile":
        navigation.navigate("Profile");
        break;
      default:
        break;
    }
  };

  if (loading) {
    return <LoadingSpinner message="Fetching dashboard data..." />;
  }

  return (
    <View style={[styles.container, { backgroundColor: isDark ? colors.background : "#F2F8FB" }]}>
      <StatusBar barStyle="light-content" backgroundColor="#053B74" />

      <View style={styles.headerWrap}>
        <LinearGradient
          colors={
            isDark
              ? ["#042A52", "#0B3A6E", "#045F6E"]
              : ["#053B74", "#124E96", "#06ADC6"]
          }
          locations={[0, 0.5, 1]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.headerShell, { paddingTop: insets.top + 10 }]}
        >
          <View style={styles.header}>
          <TouchableOpacity
            style={styles.profileContainer}
            onPress={() => navigation.navigate("Profile")}
            activeOpacity={0.85}
          >
            {user?.profileImage ? (
              <View style={styles.avatarBorder}>
                <Image
                  source={{ uri: user.profileImage }}
                  style={styles.avatarCircleSmallImage}
                />
              </View>
            ) : (
              <View style={styles.avatarCircleSmall}>
                <Ionicons name="person" size={20} color="#124E96" />
              </View>
            )}
            <View style={styles.greetingContainer}>
              <Text style={styles.subGreeting}>{getTimeGreeting()} 👋</Text>
              <Text style={styles.mainGreeting} numberOfLines={1}>
                {user?.name || "Guest User"}
              </Text>
            </View>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.notificationButton}
            activeOpacity={0.85}
            onPress={openNotifications}
            accessibilityLabel="Open notifications"
          >
            <Ionicons name="notifications-outline" size={22} color="#FFFFFF" />
            {unreadCount > 0 ? (
              <View style={styles.notificationBadge}>
                <Text style={styles.notificationBadgeText}>
                  {unreadCount > 9 ? "9+" : String(unreadCount)}
                </Text>
              </View>
            ) : null}
          </TouchableOpacity>
        </View>
        </LinearGradient>
      </View>

      <NotificationPanel
        visible={notificationsOpen}
        notifications={notifications}
        readIds={readIds}
        onClose={() => setNotificationsOpen(false)}
        onMarkAllRead={handleMarkAllRead}
        onPressItem={handleNotificationPress}
        onDismissItem={handleDismissNotification}
      />

      {/* Home section background — light premium wash from banner colors */}
      <View style={styles.homeSection}>
        <LinearGradient
          pointerEvents="none"
          colors={
            isDark
              ? [colors.background, colors.surfaceMuted || colors.background]
              : ["#DCEAF6", "#E8F3F8", "#DFF5F8", "#F2F8FB"]
          }
          locations={[0, 0.32, 0.68, 1]}
          start={{ x: 0.1, y: 0 }}
          end={{ x: 0.9, y: 1 }}
          style={StyleSheet.absoluteFillObject}
        />

        <ScrollView
          showsVerticalScrollIndicator={false}
          style={styles.scroll}
          contentContainerStyle={[
            styles.scrollContent,
            { paddingBottom: getTabBarScrollPadding(insets.bottom) },
          ]}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={colors.primary}
            />
          }
        >
        {/* Dynamic & Premium Hospital Banner */}
        <LinearGradient
          colors={["#053B74", "#124E96", "#06ADC6"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.bannerCard}
        >
          <View style={styles.bannerTextContainer}>
            <View style={styles.bannerBadge}>
              <Ionicons name="shield-checkmark" size={12} color="#ffffff" style={{ marginRight: 4 }} />
              <Text style={styles.bannerBadgeText}>Brains Hospital Partner</Text>
            </View>
            <Text style={styles.bannerTitle}>
              Find & Book{"\n"}Your Best Doctor
            </Text>
            <Text style={styles.bannerSubtitle}>
              Connecting you with 150+ verified medical specialists near you.
            </Text>
            <TouchableOpacity
              style={styles.bannerButton}
              activeOpacity={0.9}
              onPress={goBookOrLogin}
            >
              <Text style={styles.bannerButtonText}>Book Appointment</Text>
              <Ionicons
                name="arrow-forward"
                size={14}
                color="#124E96"
                style={{ marginLeft: 4 }}
              />
            </TouchableOpacity>
          </View>
          <Image
            source={{
              uri: "https://images.unsplash.com/photo-1576091160399-112ba8d25d1d?auto=format&fit=crop&q=80&w=300",
            }}
            style={styles.bannerImage}
          />
        </LinearGradient>



        {/* Stats Dashboard */}
        <View style={styles.statsContainer}>
          {/* Card 1: Booked */}
          <LinearGradient
            colors={isDark ? ["#091D38", "#031226"] : ["#D5E4F8", "#ACCBF0"]}
            style={styles.statBox}
          >
            <View style={styles.statTopRow}>
              <View style={[styles.statIconWrapper, { backgroundColor: "#124E96" }]}>
                <Ionicons name="calendar" size={16} color="#ffffff" />
              </View>
              <Text style={[styles.statValue, { color: isDark ? "#ffffff" : "#053B74" }]}>
                {stats.totalAppointments}
              </Text>
            </View>
            <Text style={[styles.statLabel, { color: isDark ? "#93C5FD" : "#1A5AA6" }]}>
              Total Booked
            </Text>
            <Text style={styles.statSubText}>Appointments</Text>
          </LinearGradient>

          {/* Card 2: Done */}
          <LinearGradient
            colors={isDark ? ["#032E38", "#011D24"] : ["#C2EFF4", "#99E1EB"]}
            style={styles.statBox}
          >
            <View style={styles.statTopRow}>
              <View style={[styles.statIconWrapper, { backgroundColor: "#06ADC6" }]}>
                <Ionicons name="checkmark-done" size={16} color="#ffffff" />
              </View>
              <Text style={[styles.statValue, { color: isDark ? "#ffffff" : "#047A8C" }]}>
                {stats.completedCount}
              </Text>
            </View>
            <Text style={[styles.statLabel, { color: isDark ? "#8BE3F0" : "#058B9E" }]}>
              Done & Visited
            </Text>
            <Text style={styles.statSubText}>Recovered</Text>
          </LinearGradient>

          {/* Card 3: Upcoming */}
          <LinearGradient
            colors={isDark ? ["#3D250B", "#241402"] : ["#FFE8CC", "#FFD299"]}
            style={styles.statBox}
          >
            <View style={styles.statTopRow}>
              <View style={[styles.statIconWrapper, { backgroundColor: "#ED972B" }]}>
                <Ionicons name="time" size={16} color="#ffffff" />
              </View>
              <Text style={[styles.statValue, { color: isDark ? "#ffffff" : "#804E10" }]}>
                {upcoming.length}
              </Text>
            </View>
            <Text style={[styles.statLabel, { color: isDark ? "#FDE68A" : "#8C5611" }]}>
              Upcoming
            </Text>
            <Text style={styles.statSubText}>Active visits</Text>
          </LinearGradient>
        </View>

        {/* Upcoming Appointments Section */}
        <View style={styles.appointmentWidget}>
          <View style={styles.widgetHeader}>
            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>
              Upcoming Appointment
            </Text>
            <TouchableOpacity onPress={goAppointments}>
              <Text style={[styles.seeAllLink, { color: colors.primary }]}>View Details</Text>
            </TouchableOpacity>
          </View>
          {upcoming.length === 0 ? (
            <View
              style={[
                styles.emptyCard,
                {
                  backgroundColor: "#FFFFFF",
                  borderColor: colors.cardBorder,
                },
              ]}
            >
              <Ionicons
                name="calendar-clear-outline"
                size={28}
                color={colors.primary}
                style={{ marginBottom: 6 }}
              />
              <Text style={[styles.emptyText, { color: colors.textMuted }]}>
                No upcoming appointments scheduled.
              </Text>
            </View>
          ) : (
            upcoming.slice(0, 1).map((item) => {
              const doctorName =
                item.doctorId?.name || item.doctorName || "Dr. Specialist";
              const speciality =
                item.doctorId?.specialization ||
                item.speciality ||
                "General Medicine";
              const doctorImage =
                item.doctorId?.profileImage ||
                item.doctorProfileImage ||
                FALLBACK_DOCTOR_IMAGE;
              const dateStr = item.date
                ? new Date(item.date).toLocaleDateString(undefined, {
                    weekday: "short",
                    month: "short",
                    day: "numeric",
                  })
                : "N/A";
              const timeStr = item.timeSlot || item.time || "Scheduled";
              return (
                <View key={item._id || item.id}>
                  <LinearGradient
                    colors={["#053B74", "#124E96"]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={styles.appointmentCard}
                  >
                    <View style={styles.docRow}>
                      <View style={styles.widgetDocAvatarContainer}>
                        <Image
                          source={{ uri: doctorImage }}
                          style={styles.widgetDocAvatarImage}
                        />
                      </View>
                      <View style={styles.widgetDocDetails}>
                        <Text style={styles.widgetDocName}>{doctorName}</Text>
                        <Text style={styles.widgetDocSpecialty}>
                          {speciality} • Brains Clinic
                        </Text>
                      </View>
                      <View style={styles.statusPill}>
                        <Text style={styles.statusPillText}>
                          {item.status || "Confirmed"}
                        </Text>
                      </View>
                    </View>
                    <View style={styles.divider} />
                    <View style={styles.timeRow}>
                      <View style={styles.timeItem}>
                        <Ionicons
                          name="calendar-outline"
                          size={14}
                          color="#ffffff"
                          opacity={0.9}
                        />
                        <Text style={styles.timeText}>{dateStr}</Text>
                      </View>
                      <View style={styles.timeItem}>
                        <Ionicons
                          name="time-outline"
                          size={14}
                          color="#ffffff"
                          opacity={0.9}
                        />
                        <Text style={styles.timeText}>{timeStr}</Text>
                      </View>
                    </View>
                    <View style={styles.widgetActionsRow}>
                      <TouchableOpacity
                        style={styles.widgetViewBtn}
                        activeOpacity={0.85}
                        onPress={() => openAppointmentView(item)}
                      >
                        <Ionicons name="eye-outline" size={14} color="#ffffff" />
                        <Text style={styles.widgetViewText}>View</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.widgetRescheduleBtn}
                        activeOpacity={0.85}
                        onPress={() => handleReschedule(item)}
                      >
                        <Ionicons name="calendar-outline" size={14} color="#124E96" />
                        <Text style={styles.widgetRescheduleText}>Reschedule</Text>
                      </TouchableOpacity>
                    </View>
                  </LinearGradient>
                </View>
              );
            })
          )}
        </View>

        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>
            Featured Doctors
          </Text>
        </View>
        <View style={styles.doctorsList}>
          {doctors.length === 0 ? (
            <View
              style={[
                styles.emptyCard,
                {
                  backgroundColor: "#FFFFFF",
                  borderColor: colors.cardBorder,
                },
              ]}
            >
              <Ionicons
                name="people-outline"
                size={28}
                color={colors.primary}
                style={{ marginBottom: 6 }}
              />
              <Text style={[styles.emptyText, { color: colors.textMuted }]}>
                No doctors available in this category.
              </Text>
            </View>
          ) : (
            doctors.slice(0, 5).map((doc) => {
              const docId = doc._id || doc.id;
              const docName = formatDoctorDisplayName(doc.name || "Specialist");
              const docSpecialty =
                doc.specialization || doc.speciality || "General Practitioner";
              const docImage =
                doc.profileImage ||
                FALLBACK_DOCTOR_IMAGE;
              const availability = getDoctorAvailability(doc);
              const isFavorite = !!favoriteDoctorIds[String(docId)];

              return (
                <TouchableOpacity
                  key={docId}
                  style={[
                    styles.doctorCard,
                    {
                      backgroundColor: "#FFFFFF",
                      borderColor: colors.cardBorder,
                    },
                  ]}
                  onPress={() => openDoctorDetails(docId)}
                  activeOpacity={0.92}
                >
                  <LinearGradient
                    pointerEvents="none"
                    colors={
                      isDark
                        ? ["#0A2446", "#0C3768", "#0D4D81"]
                        : ["#053B74", "#124E96", "#06ADC6"]
                    }
                    locations={[0, 0.58, 1]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.doctorCardBgGradient}
                  />
                  <View style={styles.doctorTopRow}>
                    <View style={styles.imageContainer}>
                      <Image source={{ uri: docImage }} style={styles.doctorImage} />
                      <View style={styles.onlineIndicator} />
                    </View>

                    <View style={styles.doctorInfo}>
                      <Text
                        style={styles.doctorName}
                        numberOfLines={2}
                      >
                        {docName}
                      </Text>
                      <Text
                        style={styles.doctorSpecialty}
                        numberOfLines={1}
                      >
                        {docSpecialty}
                      </Text>
                      <Text style={styles.hospitalText} numberOfLines={1}>
                        Brains Hospital
                      </Text>
                    </View>

                    <TouchableOpacity
                      style={styles.favoriteBtn}
                      onPress={(e) => {
                        e?.stopPropagation?.();
                        toggleFavoriteDoctor(docId);
                      }}
                      hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
                      activeOpacity={0.75}
                    >
                      <Ionicons
                        name={isFavorite ? "heart" : "heart-outline"}
                        size={22}
                        color={isFavorite ? "#FF8B8B" : "#FFFFFF"}
                      />
                    </TouchableOpacity>
                  </View>

                  <View
                    style={[
                      styles.availabilityBox,
                      {
                        backgroundColor: isDark
                          ? "rgba(255,255,255,0.14)"
                          : "rgba(255,255,255,0.18)",
                      },
                    ]}
                  >
                    <Ionicons
                      name="calendar-outline"
                      size={20}
                      color="#FFFFFF"
                      style={styles.availabilityIcon}
                    />
                    <View style={styles.availabilityCopy}>
                      <Text
                        style={styles.availabilityLabel}
                        numberOfLines={1}
                      >
                        {availability.label}
                      </Text>
                      <Text style={styles.availabilityTime} numberOfLines={1}>
                        {availability.time}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.featuredActionsRow}>
                    <TouchableOpacity
                      style={styles.viewProfileBtn}
                      activeOpacity={0.85}
                      onPress={(e) => {
                        e?.stopPropagation?.();
                        openDoctorDetails(docId);
                      }}
                    >
                      <Ionicons name="person-outline" size={14} color="#ffffff" />
                      <Text style={styles.viewProfileBtnText} numberOfLines={1}>
                        View Profile
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.bookBtn}
                      activeOpacity={0.85}
                      onPress={(e) => {
                        e?.stopPropagation?.();
                        goBookOrLogin(docId);
                      }}
                    >
                      <Ionicons name="calendar-outline" size={14} color="#124E96" />
                      <Text style={styles.bookBtnText} numberOfLines={1}>
                        Book Appointment
                      </Text>
                    </TouchableOpacity>
                  </View>
                </TouchableOpacity>
              );
            })
          )}
        </View>

        <View style={{ height: 40 }} />
        </ScrollView>
      </View>

      <Modal
        visible={!!viewAppointment}
        transparent
        animationType="fade"
        onRequestClose={closeAppointmentView}
      >
        <Pressable style={styles.viewModalOverlay} onPress={closeAppointmentView}>
          <Pressable
            style={[
              styles.viewModalCard,
              {
                backgroundColor: "#FFFFFF",
                borderColor: colors.cardBorder,
              },
            ]}
            onPress={(e) => e?.stopPropagation?.()}
          >
            {viewAppointment ? (
              <>
                <View style={styles.viewModalHeader}>
                  <Text style={[styles.viewModalTitle, { color: colors.primaryDark }]}>
                    Appointment Details
                  </Text>
                  <TouchableOpacity
                    style={[styles.viewModalClose, { backgroundColor: colors.inputBackground }]}
                    onPress={closeAppointmentView}
                    accessibilityLabel="Close"
                  >
                    <Ionicons name="close" size={18} color={colors.textPrimary} />
                  </TouchableOpacity>
                </View>

                <View style={styles.viewModalDocRow}>
                  <Image
                    source={{
                      uri:
                        viewAppointment.doctorId?.profileImage ||
                        viewAppointment.doctorProfileImage ||
                        FALLBACK_DOCTOR_IMAGE,
                    }}
                    style={styles.viewModalAvatar}
                  />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.viewModalDocName, { color: colors.textPrimary }]}>
                      {viewAppointment.doctorId?.name ||
                        viewAppointment.doctorName ||
                        "Dr. Specialist"}
                    </Text>
                    <Text style={[styles.viewModalDocSpec, { color: colors.textSecondary }]}>
                      {viewAppointment.doctorId?.specialization ||
                        viewAppointment.speciality ||
                        "General Medicine"}
                    </Text>
                  </View>
                  <View
                    style={[
                      styles.viewModalStatus,
                      { backgroundColor: colors.primaryLight },
                    ]}
                  >
                    <Text style={[styles.viewModalStatusText, { color: colors.primary }]}>
                      {viewAppointment.status || "Confirmed"}
                    </Text>
                  </View>
                </View>

                <View style={[styles.viewModalDivider, { backgroundColor: colors.cardBorder }]} />

                <View style={styles.viewModalDetailRow}>
                  <Ionicons name="calendar-outline" size={16} color={colors.primary} />
                  <Text style={[styles.viewModalDetailText, { color: colors.textPrimary }]}>
                    {viewAppointment.date
                      ? new Date(viewAppointment.date).toLocaleDateString(undefined, {
                          weekday: "long",
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })
                      : "N/A"}
                  </Text>
                </View>
                <View style={styles.viewModalDetailRow}>
                  <Ionicons name="time-outline" size={16} color={colors.primary} />
                  <Text style={[styles.viewModalDetailText, { color: colors.textPrimary }]}>
                    {viewAppointment.timeSlot || viewAppointment.time || "Scheduled"}
                  </Text>
                </View>
                {viewAppointment.symptoms || viewAppointment.reason ? (
                  <View style={styles.viewModalDetailRow}>
                    <Ionicons name="document-text-outline" size={16} color={colors.primary} />
                    <Text
                      style={[styles.viewModalDetailText, { color: colors.textMuted }]}
                      numberOfLines={3}
                    >
                      {viewAppointment.symptoms || viewAppointment.reason}
                    </Text>
                  </View>
                ) : null}
                <View style={styles.viewModalDetailRow}>
                  <Ionicons name="business-outline" size={16} color={colors.primary} />
                  <Text style={[styles.viewModalDetailText, { color: colors.textPrimary }]}>
                    Brains Clinic
                  </Text>
                </View>

                <View style={styles.viewModalActions}>
                  <TouchableOpacity
                    style={[
                      styles.viewModalSecondaryBtn,
                      {
                        backgroundColor: colors.inputBackground,
                        borderColor: colors.cardBorder,
                      },
                    ]}
                    onPress={closeAppointmentView}
                  >
                    <Text style={[styles.viewModalSecondaryText, { color: colors.textPrimary }]}>
                      Close
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.viewModalPrimaryBtn, { backgroundColor: colors.primary }]}
                    onPress={() => {
                      const appt = viewAppointment;
                      closeAppointmentView();
                      handleReschedule(appt);
                    }}
                  >
                    <Text style={styles.viewModalPrimaryText}>Reschedule</Text>
                  </TouchableOpacity>
                </View>
              </>
            ) : null}
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F2F8FB",
  },
  headerWrap: {
    zIndex: 2,
    elevation: 8,
    shadowColor: "#053B74",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.18,
    shadowRadius: 12,
  },
  homeSection: {
    flex: 1,
    marginTop: -12,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    overflow: "hidden",
    zIndex: 1,
  },
  headerShell: {
    paddingHorizontal: 20,
    paddingBottom: 22,
    borderBottomLeftRadius: 18,
    borderBottomRightRadius: 18,
    overflow: "hidden",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    zIndex: 1,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#F5F6F8",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  profileContainer: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
  },
  avatarBorder: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 2,
    borderColor: "#FFFFFF",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
    overflow: "hidden",
    backgroundColor: "#FFFFFF",
  },
  avatarCircleSmall: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#FFFFFF",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.85)",
  },
  avatarCircleSmallImage: {
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  greetingContainer: {
    justifyContent: "center",
    flex: 1,
    minWidth: 0,
  },
  subGreeting: {
    fontSize: 12,
    color: "rgba(255,255,255,0.85)",
    fontWeight: "500",
    marginBottom: 2,
  },
  mainGreeting: {
    fontSize: 16,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  notificationButton: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.18)",
    justifyContent: "center",
    alignItems: "center",
    position: "relative",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.22)",
  },
  notificationBadge: {
    position: "absolute",
    top: 2,
    right: 2,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    paddingHorizontal: 3,
    backgroundColor: "#ED2B5F",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: "#ffffff",
  },
  notificationBadgeText: {
    color: "#fff",
    fontSize: 8,
    fontWeight: "800",
  },
  scroll: {
    flex: 1,
    backgroundColor: "transparent",
  },
  scrollContent: {
    paddingHorizontal: 12,
    paddingTop: 10,
  },
  bannerCard: {
    borderRadius: 24,
    padding: 22,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 12,
    marginBottom: 20,
    elevation: 4,
    shadowColor: "#165EB9",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    overflow: "hidden",
  },
  bannerTextContainer: {
    flex: 1,
    paddingRight: 12,
  },
  bannerTitle: {
    fontSize: 22,
    fontWeight: "800",
    color: "#ffffff",
    lineHeight: 28,
    marginBottom: 8,
    textShadowColor: "rgba(0, 0, 0, 0.1)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  bannerSubtitle: {
    fontSize: 12,
    color: "#EBF3FF",
    opacity: 0.9,
    marginBottom: 16,
    lineHeight: 16,
  },
  bannerButton: {
    backgroundColor: "#ffffff",
    paddingVertical: 9,
    paddingHorizontal: 18,
    borderRadius: 30,
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  bannerButtonText: {
    color: "#2B84ED",
    fontSize: 12,
    fontWeight: "700",
  },
  bannerImage: {
    width: 95,
    height: 115,
    borderRadius: 16,
    backgroundColor: "rgba(255, 255, 255, 0.1)",
  },
  statsContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 24,
    gap: 8,
  },
  statBox: {
    flex: 1,
    flexDirection: "column",
    alignItems: "flex-start",
    borderRadius: 16,
    paddingVertical: 10,
    paddingHorizontal: 8,
  },
  statTopRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 6,
  },
  statIconWrapper: {
    width: 26,
    height: 26,
    borderRadius: 13,
    justifyContent: "center",
    alignItems: "center",
  },
  statValue: {
    fontSize: 22,
    fontWeight: "800",
    lineHeight: 26,
  },
  statLabel: {
    fontSize: 12,
    fontWeight: "700",
    lineHeight: 16,
    marginBottom: -4,
  },
  statSubText: {
    fontSize: 11,
    opacity: 0.65,
    color: "#6B7280",
    marginTop: 3,
    fontWeight: "500",
  },
  appointmentWidget: {
    marginBottom: 24,
  },
  widgetHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  appointmentCard: {
    borderRadius: 20,
    padding: 18,
    marginBottom: 10,
    elevation: 4,
    shadowColor: "#0D3E73",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
  },
  docRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  widgetDocAvatarContainer: {
    width: 44,
    height: 44,
    borderRadius: 22,
    marginRight: 12,
    backgroundColor: "rgba(255, 255, 255, 0.15)",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.25)",
    overflow: "hidden",
  },
  widgetDocAvatarImage: {
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  widgetDocDetails: {
    flex: 1,
    justifyContent: "center",
  },
  widgetDocName: {
    fontSize: 16,
    fontWeight: "700",
    color: "#ffffff",
  },
  widgetDocSpecialty: {
    fontSize: 12,
    color: "#EBF3FF",
    opacity: 0.85,
    marginTop: 2,
  },
  statusPill: {
    backgroundColor: "rgba(255, 255, 255, 0.2)",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    alignSelf: "center",
  },
  statusPillText: {
    color: "#ffffff",
    fontSize: 10,
    fontWeight: "700",
    textTransform: "capitalize",
  },
  divider: {
    height: 1,
    backgroundColor: "rgba(255, 255, 255, 0.15)",
    marginVertical: 14,
  },
  timeRow: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  timeItem: {
    flexDirection: "row",
    alignItems: "center",
  },
  timeText: {
    fontSize: 11,
    color: "#ffffff",
    marginLeft: 6,
    fontWeight: "600",
  },
  widgetActionsRow: {
    marginTop: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  widgetViewBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: "rgba(255, 255, 255, 0.18)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.45)",
    borderRadius: 12,
    paddingVertical: 10,
  },
  widgetViewText: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "700",
  },
  widgetRescheduleBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: "#ffffff",
    borderRadius: 12,
    paddingVertical: 10,
  },
  widgetRescheduleText: {
    color: "#0D3E73",
    fontSize: 13,
    fontWeight: "700",
  },
  viewModalOverlay: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.55)",
    justifyContent: "center",
    paddingHorizontal: 22,
  },
  viewModalCard: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 18,
  },
  viewModalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  viewModalTitle: {
    fontSize: 17,
    fontWeight: "800",
  },
  viewModalClose: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  viewModalDocRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  viewModalAvatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
  },
  viewModalDocName: {
    fontSize: 16,
    fontWeight: "700",
  },
  viewModalDocSpec: {
    fontSize: 12,
    marginTop: 2,
  },
  viewModalStatus: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  viewModalStatusText: {
    fontSize: 10,
    fontWeight: "700",
    textTransform: "capitalize",
  },
  viewModalDivider: {
    height: 1,
    marginVertical: 14,
  },
  viewModalDetailRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    marginBottom: 10,
  },
  viewModalDetailText: {
    flex: 1,
    fontSize: 14,
    fontWeight: "600",
    lineHeight: 20,
  },
  viewModalActions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 10,
  },
  viewModalSecondaryBtn: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    paddingVertical: 12,
    alignItems: "center",
  },
  viewModalSecondaryText: {
    fontSize: 13,
    fontWeight: "700",
  },
  viewModalPrimaryBtn: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
  },
  viewModalPrimaryText: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "700",
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 14,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: "#1A1C1E",
  },
  seeAllLink: {
    fontSize: 13,
    color: "#2B84ED",
    fontWeight: "700",
  },
  doctorsList: {
    gap: 14,
  },
  doctorCard: {
    backgroundColor: "#ffffff",
    borderRadius: 22,
    padding: 16,
    borderWidth: 0,
    marginBottom: 2,
    overflow: "hidden",
    elevation: 4,
    shadowColor: "#0D3E73",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.14,
    shadowRadius: 14,
  },
  doctorCardBgGradient: {
    ...StyleSheet.absoluteFillObject,
  },
  doctorTopRow: {
    flexDirection: "row",
    alignItems: "flex-start",
  },
  imageContainer: {
    position: "relative",
    marginRight: 12,
  },
  doctorImage: {
    width: 72,
    height: 72,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.22)",
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.6)",
  },
  onlineIndicator: {
    position: "absolute",
    top: 3,
    right: 3,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: "#22C55E",
    borderWidth: 2,
    borderColor: "#FFFFFF",
  },
  doctorInfo: {
    flex: 1,
    paddingRight: 8,
    paddingTop: 2,
  },
  favoriteBtn: {
    paddingTop: 2,
    paddingLeft: 4,
  },
  doctorName: {
    fontSize: 16,
    fontWeight: "800",
    color: "#FFFFFF",
    letterSpacing: -0.2,
    lineHeight: 21,
  },
  doctorSpecialty: {
    fontSize: 13,
    color: "rgba(255,255,255,0.88)",
    fontWeight: "600",
    marginTop: 3,
  },
  hospitalText: {
    fontSize: 13,
    color: "rgba(255,255,255,0.95)",
    fontWeight: "700",
    marginTop: 4,
  },
  availabilityBox: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 14,
    backgroundColor: "#EAF3FF",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 14,
  },
  availabilityIcon: {
    marginRight: 10,
  },
  availabilityCopy: {
    flex: 1,
  },
  availabilityLabel: {
    fontSize: 12,
    color: "rgba(255,255,255,0.86)",
    fontWeight: "600",
  },
  availabilityTime: {
    fontSize: 15,
    color: "#FFFFFF",
    fontWeight: "800",
    marginTop: 1,
  },
  bookBtn: {
    flexGrow: 0,
    flexShrink: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: "#ffffff",
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  bookBtnText: {
    color: "#0D3E73",
    fontSize: 13,
    fontWeight: "700",
    flexShrink: 1,
  },
  featuredActionsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 14,
  },
  viewProfileBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: "rgba(255, 255, 255, 0.18)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.45)",
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 10,
  },
  viewProfileBtnText: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "700",
    flexShrink: 1,
  },
  emptyCard: {
    backgroundColor: "#FAFCFF",
    borderRadius: 20,
    padding: 24,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderColor: "#D2E3FC",
  },
  emptyText: {
    color: "#4B779A",
    fontSize: 13,
    fontWeight: "600",
    textAlign: "center",
  },
  bannerBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.2)",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    alignSelf: "flex-start",
    marginBottom: 10,
  },
  bannerBadgeText: {
    color: "#ffffff",
    fontSize: 10,
    fontWeight: "700",
  },
  servicesGrid: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 24,
    gap: 8,
  },
  serviceItem: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 14,
    borderRadius: 20,
    borderWidth: 1,
    elevation: 2,
    shadowColor: "#0D3E73",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
  },
  serviceIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 8,
  },
  serviceLabel: {
    fontSize: 12,
    fontWeight: "700",
  },
  specialtySection: {
    marginBottom: 24,
  },
  specialtyScroll: {
    paddingRight: 20,
    gap: 10,
  },
  specialtyChip: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 14,
    borderWidth: 1,
    elevation: 1,
    shadowColor: "#0D3E73",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.02,
    shadowRadius: 3,
  },
  specialtyText: {
    fontSize: 13,
    fontWeight: "700",
  },
});