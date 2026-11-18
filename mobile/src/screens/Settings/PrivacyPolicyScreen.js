import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  StatusBar,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Shield } from 'lucide-react-native';
import { SPACING, RADIUS } from '../../constants/theme';
import { useAppTheme } from '../../context/SettingsContext';
import { HeaderBackButton, HeaderBackSpacer } from '../../components/HeaderBackButton';

const PRIVACY_SECTIONS = [
  {
    title: 'Commitment to Privacy',
    content: 'Brains Super Speciality Hospital has created this privacy statement in order to demonstrate the organization’s commitment to the right of privacy. The following information reveals our data assembly and dissemination practices for the site.',
  },
  {
    title: 'IP Addresses & Session Tracking',
    content: 'We use your IP address to help diagnose problems with our server and/or to administer our Web site. This gives us an understanding of which sections of the site users are visiting. We do not link IP addresses to anything personally identifiable. This means that a user’s session will be tracked, but the user will be anonymous.',
  },
  {
    title: 'Inquiry Forms & External Links',
    content: 'Our site’s inquiry form requires you to give us contact information like your name and email address. We use this contact information from the form to send you information about our company. This site contains links to other sites. Brains Super Speciality Hospital is not responsible for the privacy practices or the content of such Web sites.',
  },
  {
    title: 'Security Measures',
    content: 'This site has security measures in place to protect the loss, misuse, and/or alteration of information under our control. The data resides behind a firewall, with access restricted to authorized personnel only.',
  },
  {
    title: 'Contacting the Web Site',
    content: 'If you have any questions about this privacy statement, the practices of this site, or your dealings with this website, you can contact Brains Super Speciality Hospital:\n\n• Helpline: +91 91480 80000 / +91 8073012345\n\n• OPD Hours: Monday to Saturday, 9:00 AM to 5:00 PM, 5:00 PM to 8:00 PM\n\n• Location: 192, T Mariyappa Road, Lalbagh, Siddapura, Jayanagar 1st Block, Bengaluru - 560011, Karnataka India.',
  },
];

export const PrivacyPolicyScreen = () => {
  const { colors, isDark } = useAppTheme();
  const insets = useSafeAreaInsets();

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
            <Text style={styles.headerTitle}>Privacy Policy</Text>
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

        <ScrollView
          contentContainerStyle={[
            styles.content,
            { paddingTop: 28, paddingBottom: insets.bottom + 28 }
          ]}
          showsVerticalScrollIndicator={false}
        >
          <View style={[styles.heroCard, { backgroundColor: isDark ? colors.cardBackground : '#FFFFFF', borderColor: isDark ? colors.cardBorder : 'rgba(18,78,150,0.08)' }]}>
            <View style={[styles.shieldIconWrap, { backgroundColor: isDark ? colors.primaryLight : '#E8EEFF' }]}>
              <Shield color={colors.primary} size={24} />
            </View>
            <Text style={[styles.heroTitle, { color: colors.textPrimary }]}>Data Privacy</Text>
            <Text style={[styles.heroSubtitle, { color: colors.textSecondary }]}>
              Learn how Brains Hospital gathers, uses, and secures your information.
            </Text>
          </View>

          <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>Policy Details</Text>

          {PRIVACY_SECTIONS.map((sec, idx) => (
            <View
              key={idx}
              style={[
                styles.card,
                {
                  backgroundColor: isDark ? colors.cardBackground : '#FFFFFF',
                  borderColor: isDark ? colors.cardBorder : 'rgba(18,78,150,0.08)',
                  marginBottom: 16,
                },
              ]}
            >
              <Text style={[styles.cardTitle, { color: colors.primary }]}>{sec.title}</Text>
              <Text style={[styles.cardBody, { color: colors.textPrimary }]}>{sec.content}</Text>
            </View>
          ))}

          <View style={styles.footer}>
            <Text style={[styles.footerText, { color: colors.textMuted }]}>
              © 2019-2026. Brains Super Speciality Hospital. All rights reserved.
            </Text>
          </View>
        </ScrollView>
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
  heroCard: {
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    padding: 24,
    alignItems: 'center',
    marginBottom: 20,
    elevation: 2,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
  },
  shieldIconWrap: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  heroTitle: {
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 6,
  },
  heroSubtitle: {
    fontSize: 13,
    lineHeight: 18,
    textAlign: 'center',
    paddingHorizontal: 8,
  },
  sectionLabel: {
    marginBottom: SPACING.sm,
    marginLeft: 4,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  card: {
    borderRadius: RADIUS.md,
    borderWidth: 1,
    padding: 16,
    elevation: 2,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '800',
    marginBottom: 8,
  },
  cardBody: {
    fontSize: 13,
    lineHeight: 20,
  },
  footer: {
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 16,
  },
  footerText: {
    fontSize: 11,
    textAlign: 'center',
  },
});
