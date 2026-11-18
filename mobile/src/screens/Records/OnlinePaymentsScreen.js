import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  RefreshControl,
  TouchableOpacity,
  ActivityIndicator,
  StatusBar,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { SPACING, RADIUS } from '../../constants/theme';
import { getTabBarScrollPadding } from '../../constants/layout';
import { useAppTheme } from '../../context/SettingsContext';
import { patientApi } from '../../api/patient.api';
import { LoadingSpinner } from '../../components/LoadingSpinner';
import { HeaderBackButton, HeaderBackSpacer } from '../../components/HeaderBackButton';
import { AppDialog } from '../../components/AppDialog';
import { promptDownloadReceipt } from '../../utils/paymentReceipt';

const parseAppointments = (apptRes) => {
  const appts = Array.isArray(apptRes)
    ? apptRes
    : apptRes?.appointments ||
      apptRes?.data?.appointments ||
      apptRes?.records ||
      [];
  return Array.isArray(appts) ? appts : [];
};

const normalizePaymentStatus = (pay) => {
  const raw = String(pay?.paymentStatus || '').toLowerCase();
  const apptStatus = String(pay?.status || '').toLowerCase();
  if (raw === 'paid') return 'paid';
  if (raw === 'cancelled' || raw === 'canceled') return 'canceled';
  if (apptStatus === 'cancelled' || apptStatus === 'canceled') return 'canceled';
  if (raw === 'pending') return 'pending';
  if (raw === 'unpaid') return 'unpaid';
  return raw || 'pending';
};

const statusMeta = (status, colors) => {
  if (status === 'paid') {
    return { label: 'Paid', color: colors.success || '#059669' };
  }
  if (status === 'canceled') {
    return { label: 'Canceled', color: colors.error || '#DC2626' };
  }
  if (status === 'pending') {
    return { label: 'Pending', color: '#ED972B' };
  }
  return { label: status || 'Unknown', color: colors.textMuted };
};

export const OnlinePaymentsScreen = ({ navigation }) => {
  const { colors, isDark } = useAppTheme();
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [payments, setPayments] = useState([]);
  const [downloadingId, setDownloadingId] = useState(null);
  const [popup, setPopup] = useState({ visible: false });

  const closePopup = () => setPopup({ visible: false });
  const showPopup = (cfg) => setPopup({ visible: true, ...cfg });

  const fetchPayments = useCallback(async () => {
    try {
      const apptRes = await patientApi.getMedicalRecords().catch(() => null);
      const list = parseAppointments(apptRes)
        .filter((a) => String(a?.paymentMode || '').toLowerCase() === 'online')
        .sort((a, b) => {
          const ta = new Date(a.createdAt || a.slotStartIso || 0).getTime();
          const tb = new Date(b.createdAt || b.slotStartIso || 0).getTime();
          return tb - ta;
        });
      setPayments(list);
    } catch (err) {
      console.warn('Error fetching online payments:', err?.message || err);
      setPayments([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchPayments();
    }, [fetchPayments])
  );

  const handleDownload = (pay) => {
    const id = String(pay._id || pay.id);
    promptDownloadReceipt(pay, {
      onStart: () => setDownloadingId(id),
      onDone: () => setDownloadingId(null),
      onError: () => setDownloadingId(null),
      onNotify: showPopup,
    });
  };

  if (loading) {
    return <LoadingSpinner message="Loading payments..." />;
  }

  return (
    <View style={[styles.container, { backgroundColor: isDark ? colors.background : '#F2F8FB' }]}>
      <StatusBar barStyle="light-content" />
      <View style={styles.headerWrap}>
        <LinearGradient
          colors={['#053B74', '#124E96', '#06ADC6']}
          locations={[0, 0.55, 1]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.headerShell, { paddingTop: insets.top + 10 }]}
        >
          <View style={styles.headerTop}>
            <HeaderBackButton
              fallbackRoute="Main"
              fallbackParams={{ screen: 'Records' }}
            />
            <Text style={styles.curveHeaderTitle}>Online Payments</Text>
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
        <FlatList
          data={payments}
          keyExtractor={(item) => String(item._id || item.id)}
          contentContainerStyle={[
            styles.listContainer,
            { paddingTop: 28, paddingBottom: getTabBarScrollPadding(insets.bottom) },
          ]}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                fetchPayments();
              }}
              tintColor={colors.primary}
            />
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons name="card-outline" size={40} color={colors.textMuted} />
              <Text style={[styles.emptyText, { color: colors.textMuted }]}>
                No online payments yet. Book with Online payment to see receipts here.
              </Text>
            </View>
          }
          renderItem={({ item: pay }) => {
            const status = normalizePaymentStatus(pay);
            const { label, color: statusColor } = statusMeta(status, colors);
            const when = pay.slotStartIso || pay.date || pay.createdAt;
            const amount =
              pay.paymentAmount != null
                ? Number(pay.paymentAmount)
                : pay.doctorId?.fees != null
                  ? Number(pay.doctorId.fees)
                  : null;
            const id = String(pay._id || pay.id);
            const isDownloading = downloadingId === id;
            const canDownload = status === 'paid';

            return (
              <View
                style={[
                  styles.paymentCard,
                  {
                    backgroundColor: colors.cardBackground,
                    borderColor: colors.cardBorder,
                  },
                ]}
              >
                <View style={[styles.iconBox, { backgroundColor: '#CCFBF122' }]}>
                  <Ionicons name="card-outline" size={20} color="#0D9488" />
                </View>
                <View style={styles.body}>
                  <View style={styles.titleRow}>
                    <Text
                      style={[styles.docTitle, { color: colors.textPrimary, flex: 1 }]}
                      numberOfLines={1}
                    >
                      {pay.doctorId?.name || pay.doctorName || 'Consultation'}
                    </Text>
                    <View style={[styles.badge, { backgroundColor: `${statusColor}22` }]}>
                      <Text style={[styles.badgeText, { color: statusColor }]}>{label}</Text>
                    </View>
                  </View>
                  <Text style={[styles.meta, { color: colors.textSecondary }]}>
                    {amount != null && !Number.isNaN(amount) ? `₹${amount}` : 'Fee N/A'}
                    {when ? ` · ${new Date(when).toLocaleString()}` : ''}
                  </Text>
                  {pay.razorpayPaymentId ? (
                    <Text style={[styles.notes, { color: colors.textMuted }]} numberOfLines={1}>
                      Payment ID: {pay.razorpayPaymentId}
                    </Text>
                  ) : null}
                  {pay.razorpayOrderId ? (
                    <Text style={[styles.notes, { color: colors.textMuted }]} numberOfLines={1}>
                      Order ID: {pay.razorpayOrderId}
                    </Text>
                  ) : null}

                  {canDownload ? (
                    <TouchableOpacity
                      style={[
                        styles.downloadBtn,
                        { backgroundColor: `${colors.primary}14` },
                      ]}
                      activeOpacity={0.85}
                      disabled={isDownloading}
                      onPress={() => handleDownload(pay)}
                    >
                      {isDownloading ? (
                        <ActivityIndicator size="small" color={colors.primary} />
                      ) : (
                        <Ionicons name="download-outline" size={16} color={colors.primary} />
                      )}
                      <Text style={[styles.downloadText, { color: colors.primary }]}>
                        {isDownloading ? 'Preparing…' : 'Download receipt'}
                      </Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
              </View>
            );
          }}
        />
      </View>

      <AppDialog
        visible={popup.visible}
        onClose={closePopup}
        variant={popup.variant || 'success'}
        icon={popup.icon}
        title={popup.title}
        message={popup.message}
        details={popup.details}
        primaryLabel={popup.primaryLabel || 'Done'}
        onPrimary={popup.onPrimary || closePopup}
      />
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
    gap: 12,
  },
  curveBackBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.16)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.28)',
  },
  curveHeaderTitle: {
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
    marginTop: -12,
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
    overflow: 'hidden',
    zIndex: 1,
  },
  listContainer: {
    paddingHorizontal: SPACING.md,
    flexGrow: 1,
  },
  paymentCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderWidth: 1,
    borderRadius: RADIUS.md,
    padding: 12,
    marginBottom: 10,
    gap: 12,
  },
  iconBox: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: { flex: 1, minWidth: 0 },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  docTitle: { fontSize: 14, fontWeight: '700' },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'capitalize',
  },
  meta: { fontSize: 12, marginTop: 2 },
  notes: { fontSize: 12, marginTop: 4 },
  downloadBtn: {
    marginTop: 10,
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 10,
  },
  downloadText: {
    fontSize: 12,
    fontWeight: '700',
  },
  emptyContainer: {
    paddingVertical: SPACING.xl,
    alignItems: 'center',
    gap: 12,
  },
  emptyText: {
    fontSize: 13,
    textAlign: 'center',
    paddingHorizontal: SPACING.lg,
    lineHeight: 18,
  },
});
