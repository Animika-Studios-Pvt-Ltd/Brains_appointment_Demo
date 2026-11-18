import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Switch,
  LayoutAnimation,
  Platform,
  UIManager,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { SPACING, RADIUS } from '../../constants/theme';
import { getTabBarScrollPadding } from '../../constants/layout';
import { useSettings, useAppTheme } from '../../context/SettingsContext';
import { useAuth } from '../../context/AuthContext';
import { HeaderBackButton, HeaderBackSpacer } from '../../components/HeaderBackButton';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const FAQ_ITEMS = [
  {
    q: 'How do I book an appointment?',
    a: 'Go to Home or Book, choose a doctor, pick an available date and time slot, then confirm. Make sure your profile has name, phone, and age filled in.',
  },
  {
    q: 'Can I reschedule or cancel?',
    a: 'Open Appointments, select an upcoming visit, then use Reschedule or Cancel. Limits may apply (for example, a maximum number of cancellations or reschedules).',
  },
  {
    q: 'Why do I need to complete my profile?',
    a: 'Name, phone, and age are required before booking so the clinic can contact you and prepare for your visit.',
  },
  {
    q: 'How do I change my password?',
    a: 'Open the Settings tab, then tap Change Password. Enter your current password and a new password of at least 8 characters.',
  },
  {
    q: 'Need more help?',
    a: 'Call +91 9148080000 or email callcenter@brains.org.in for support.',
  },
];

const SettingRow = ({ icon, title, subtitle, onPress, right, danger, colors }) => (
  <TouchableOpacity
    style={[styles.row, { borderBottomColor: colors.cardBorder }]}
    onPress={onPress}
    activeOpacity={onPress ? 0.75 : 1}
    disabled={!onPress}
  >
    <View
      style={[
        styles.rowIcon,
        { backgroundColor: colors.primaryLight },
        danger && { backgroundColor: colors.dangerSoft },
      ]}
    >
      <Ionicons name={icon} size={18} color={danger ? colors.error : colors.primary} />
    </View>
    <View style={styles.rowBody}>
      <Text style={[styles.rowTitle, { color: danger ? colors.error : colors.textPrimary }]}>
        {title}
      </Text>
      {subtitle ? (
        <Text style={[styles.rowSub, { color: colors.textSecondary }]}>{subtitle}</Text>
      ) : null}
    </View>
    {right ||
      (onPress ? (
        <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
      ) : null)}
  </TouchableOpacity>
);

export const SettingsScreen = ({ navigation }) => {
  const { user } = useAuth();
  const isGoogleUser = !!user?.googleId || user?.authProvider === 'google';
  const showChangePassword = !isGoogleUser;

  console.log('⚙️ SettingsScreen safe user state check:', {
    id: user?.id || user?._id,
    email: user?.email,
    authProvider: user?.authProvider,
    googleId: !!user?.googleId,
    hasPassword: user?.hasPassword,
    isGoogleUser,
    showChangePassword,
  });

  const {
    darkMode,
    setDarkMode,
    notificationsEnabled,
    setNotificationsEnabled,
    appointmentReminders,
    setAppointmentReminders,
    bookingUpdates,
    setBookingUpdates,
  } = useSettings();
  const { colors, isDark } = useAppTheme();
  const insets = useSafeAreaInsets();

  const [openFaq, setOpenFaq] = useState(null);
  const [showNotifDetails, setShowNotifDetails] = useState(false);

  const toggleFaq = (index) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setOpenFaq((prev) => (prev === index ? null : index));
  };

  const faqItemsToDisplay = FAQ_ITEMS.filter((item) =>
    !showChangePassword ? item.q !== 'How do I change my password?' : true
  );

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
            <Text style={styles.curveHeaderTitle}>Settings</Text>
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

        <ScrollView
          contentContainerStyle={[
            styles.content,
            { paddingTop: 28, paddingBottom: getTabBarScrollPadding(insets.bottom) },
          ]}
          showsVerticalScrollIndicator={false}
        >
          {showChangePassword ? (
            <>
              <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>Account</Text>
              <View
                style={[
                  styles.card,
                  {
                    backgroundColor: isDark ? colors.cardBackground : '#FFFFFF',
                    borderColor: isDark ? colors.cardBorder : 'rgba(18,78,150,0.08)',
                  },
                ]}
              >
                <SettingRow
                  colors={colors}
                  icon="lock-closed-outline"
                  title="Change Password"
                  subtitle="Update your account password"
                  onPress={() => navigation.navigate('ChangePassword')}
                />
              </View>
            </>
          ) : null}

          <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>Appearance</Text>
          <View
            style={[
              styles.card,
              {
                backgroundColor: isDark ? colors.cardBackground : '#FFFFFF',
                borderColor: isDark ? colors.cardBorder : 'rgba(18,78,150,0.08)',
              },
            ]}
          >
            <SettingRow
              colors={colors}
              icon="moon-outline"
              title="Dark Mode"
              subtitle={darkMode ? 'On' : 'Off'}
              right={
                <Switch
                  value={darkMode}
                  onValueChange={setDarkMode}
                  trackColor={{ false: '#D1D5DB', true: '#93C5FD' }}
                  thumbColor={darkMode ? colors.primary : '#f4f3f4'}
                />
              }
            />
          </View>

          <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>Notifications</Text>
          <View
            style={[
              styles.card,
              {
                backgroundColor: isDark ? colors.cardBackground : '#FFFFFF',
                borderColor: isDark ? colors.cardBorder : 'rgba(18,78,150,0.08)',
              },
            ]}
          >
            <SettingRow
              colors={colors}
              icon="notifications-outline"
              title="Notification Settings"
              subtitle={notificationsEnabled ? 'Enabled' : 'Disabled'}
              onPress={() => {
                LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                setShowNotifDetails((v) => !v);
              }}
              right={
                <Ionicons
                  name={showNotifDetails ? 'chevron-up' : 'chevron-down'}
                  size={18}
                  color={colors.textMuted}
                />
              }
            />
            {showNotifDetails ? (
              <View
                style={[
                  styles.nested,
                  {
                    backgroundColor: colors.surfaceMuted,
                    borderTopColor: colors.cardBorder,
                  },
                ]}
              >
                <SettingRow
                  colors={colors}
                  icon="power-outline"
                  title="All notifications"
                  subtitle="Master switch for in-app alerts"
                  right={
                    <Switch
                      value={notificationsEnabled}
                      onValueChange={setNotificationsEnabled}
                      trackColor={{ false: '#D1D5DB', true: '#93C5FD' }}
                      thumbColor={notificationsEnabled ? colors.primary : '#f4f3f4'}
                    />
                  }
                />
                <SettingRow
                  colors={colors}
                  icon="calendar-outline"
                  title="Appointment reminders"
                  subtitle="Upcoming visit alerts"
                  right={
                    <Switch
                      value={appointmentReminders && notificationsEnabled}
                      onValueChange={setAppointmentReminders}
                      disabled={!notificationsEnabled}
                      trackColor={{ false: '#D1D5DB', true: '#93C5FD' }}
                      thumbColor={
                        appointmentReminders && notificationsEnabled
                          ? colors.primary
                          : '#f4f3f4'
                      }
                    />
                  }
                />
                <SettingRow
                  colors={colors}
                  icon="checkmark-done-outline"
                  title="Booking updates"
                  subtitle="Confirm, cancel, and reschedule alerts"
                  right={
                    <Switch
                      value={bookingUpdates && notificationsEnabled}
                      onValueChange={setBookingUpdates}
                      disabled={!notificationsEnabled}
                      trackColor={{ false: '#D1D5DB', true: '#93C5FD' }}
                      thumbColor={
                        bookingUpdates && notificationsEnabled ? colors.primary : '#f4f3f4'
                      }
                    />
                  }
                />
              </View>
            ) : null}
          </View>

          <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>Help</Text>
          <View
            style={[
              styles.card,
              {
                backgroundColor: isDark ? colors.cardBackground : '#FFFFFF',
                borderColor: isDark ? colors.cardBorder : 'rgba(18,78,150,0.08)',
              },
            ]}
          >
            <SettingRow
              colors={colors}
              icon="help-circle-outline"
              title="FAQ"
              subtitle="Common questions"
            />
            {faqItemsToDisplay.map((item, index) => (
              <View
                key={item.q}
                style={[styles.faqItem, { borderTopColor: colors.cardBorder }]}
              >
                <TouchableOpacity
                  style={styles.faqQ}
                  onPress={() => toggleFaq(index)}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.faqQText, { color: colors.textPrimary }]}>{item.q}</Text>
                  <Ionicons
                    name={openFaq === index ? 'remove' : 'add'}
                    size={18}
                    color={colors.primary}
                  />
                </TouchableOpacity>
                {openFaq === index ? (
                  <Text style={[styles.faqA, { color: colors.textMuted }]}>{item.a}</Text>
                ) : null}
              </View>
            ))}
          </View>

          <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>Legal</Text>
          <View
            style={[
              styles.card,
              {
                backgroundColor: isDark ? colors.cardBackground : '#FFFFFF',
                borderColor: isDark ? colors.cardBorder : 'rgba(18,78,150,0.08)',
              },
            ]}
          >
            <SettingRow
              colors={colors}
              icon="shield-checkmark-outline"
              title="Privacy Policy"
              subtitle="Read our privacy policy"
              onPress={() => navigation.navigate('PrivacyPolicy')}
            />
          </View>

          <View style={{ height: 16 }} />
        </ScrollView>
      </View>
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
  curveHeaderTitle: {
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
    marginTop: -16,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: 'hidden',
    zIndex: 1,
  },
  content: {
    padding: SPACING.md,
  },
  sectionLabel: {
    marginTop: SPACING.md,
    marginBottom: SPACING.sm,
    marginLeft: 4,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  card: {
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: SPACING.md,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowBody: {
    flex: 1,
    minWidth: 0,
  },
  rowTitle: {
    fontSize: 15,
    fontWeight: '700',
  },
  rowSub: {
    marginTop: 2,
    fontSize: 12,
  },
  nested: {
    borderTopWidth: 1,
  },
  faqItem: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: SPACING.md,
    paddingVertical: 12,
  },
  faqQ: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  faqQText: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
  },
  faqA: {
    marginTop: 8,
    fontSize: 13,
    lineHeight: 19,
  },
});
