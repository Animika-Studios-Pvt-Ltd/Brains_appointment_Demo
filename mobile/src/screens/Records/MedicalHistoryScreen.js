import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  RefreshControl,
  TouchableOpacity,
  StatusBar,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { SPACING, RADIUS } from '../../constants/theme';
import { useAppTheme } from '../../context/SettingsContext';
import { patientApi } from '../../api/patient.api';
import { LoadingSpinner } from '../../components/LoadingSpinner';
import { HeaderBackButton, HeaderBackSpacer } from '../../components/HeaderBackButton';

const parseAppointments = (apptRes) => {
  const appts = Array.isArray(apptRes)
    ? apptRes
    : apptRes?.appointments ||
      apptRes?.data?.appointments ||
      apptRes?.records ||
      [];
  return Array.isArray(appts) ? appts : [];
};

/** Only completed visits; skip cancelled / holds / duplicates. */
const isCompletedVisit = (a) => {
  if (!a) return false;
  return String(a.status || '').toLowerCase() === 'completed';
};

const visitDedupeKey = (a) => {
  const doctor = String(a.doctorId?._id || a.doctorId || a.doctorName || '');
  const whenRaw = a.slotStartIso || a.date || a.createdAt;
  let day = '';
  try {
    const d = new Date(whenRaw);
    if (!Number.isNaN(d.getTime())) {
      day = `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
    }
  } catch {
    day = String(whenRaw || '');
  }
  const symptoms = String(a.symptoms || '').trim().toLowerCase();
  return `doc:${doctor}|day:${day}|sx:${symptoms}`;
};

const uniqueCompletedVisits = (list = []) => {
  const seen = new Set();
  const out = [];
  const sorted = [...list].sort((a, b) => {
    const ta = new Date(a.slotStartIso || a.date || a.createdAt || 0).getTime();
    const tb = new Date(b.slotStartIso || b.date || b.createdAt || 0).getTime();
    return tb - ta;
  });
  for (const item of sorted) {
    if (!isCompletedVisit(item)) continue;
    const idKey = `id:${String(item._id || item.id || '')}`;
    const contentKey = visitDedupeKey(item);
    if (idKey !== 'id:' && seen.has(idKey)) continue;
    if (seen.has(contentKey)) continue;
    if (idKey !== 'id:') seen.add(idKey);
    seen.add(contentKey);
    out.push(item);
  }
  return out;
};

const statusMeta = (status, colors) => {
  const s = String(status || '').toLowerCase();
  if (s === 'completed') {
    return { label: 'Completed', color: colors.success || '#059669' };
  }
  return { label: status || 'Visit', color: colors.textMuted };
};

const formatWhen = (isoOrDate) => {
  if (!isoOrDate) return 'Date N/A';
  try {
    const d = new Date(isoOrDate);
    if (Number.isNaN(d.getTime())) return 'Date N/A';
    return d.toLocaleString(undefined, {
      weekday: 'short',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return 'Date N/A';
  }
};

export const MedicalHistoryScreen = ({ navigation }) => {
  const { colors, isDark } = useAppTheme();
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [visits, setVisits] = useState([]);

  const fetchVisits = useCallback(async () => {
    try {
      const apptRes = await patientApi.getAppointments(undefined, { limit: 200 }).catch(() => null);
      const list = parseAppointments(apptRes);
      const completed = uniqueCompletedVisits(list).sort((a, b) => {
        const ta = new Date(a.slotStartIso || a.date || a.createdAt || 0).getTime();
        const tb = new Date(b.slotStartIso || b.date || b.createdAt || 0).getTime();
        return tb - ta;
      });
      setVisits(completed);
    } catch (err) {
      console.warn('Error fetching medical history:', err?.message || err);
      setVisits([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchVisits();
    }, [fetchVisits])
  );

  if (loading) {
    return <LoadingSpinner message="Loading medical history..." />;
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
            <Text style={styles.curveHeaderTitle}>Medical History</Text>
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
          data={visits}
          keyExtractor={(item) => String(item._id || item.id)}
          contentContainerStyle={[
            styles.listContainer,
            { paddingTop: 28, paddingBottom: Math.max(insets.bottom, 16) + 16 },
          ]}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                fetchVisits();
              }}
              tintColor={colors.primary}
            />
          }
          ListHeaderComponent={
            visits.length > 0 ? (
              <Text style={[styles.countText, { color: colors.textMuted }]}>
                {visits.length} visit{visits.length === 1 ? '' : 's'} on record
              </Text>
            ) : null
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons name="medkit-outline" size={40} color={colors.textMuted} />
              <Text style={[styles.emptyText, { color: colors.textMuted }]}>
                No completed appointments yet. After a visit is marked completed, symptoms from booking will appear here.
              </Text>
            </View>
          }
          renderItem={({ item }) => {
            const when = formatWhen(item.slotStartIso || item.date || item.createdAt);
            const doctor = item.doctorId?.name || item.doctorName || 'Doctor';
            const specialization = item.doctorId?.specialization || '';
            const symptoms = String(item.symptoms || '').trim();
            const { label, color: statusColor } = statusMeta(item.status, colors);

            return (
              <View
                style={[
                  styles.card,
                  {
                    backgroundColor: colors.cardBackground,
                    borderColor: colors.cardBorder,
                  },
                ]}
              >
                <View style={styles.cardTop}>
                  <View style={[styles.iconBox, { backgroundColor: '#ECFDF5' }]}>
                    <Ionicons name="medkit-outline" size={20} color="#059669" />
                  </View>
                  <View style={styles.cardTopBody}>
                    <View style={styles.titleRow}>
                      <Text
                        style={[styles.doctorName, { color: colors.textPrimary, flex: 1 }]}
                        numberOfLines={1}
                      >
                        {doctor}
                      </Text>
                      <View style={[styles.badge, { backgroundColor: `${statusColor}22` }]}>
                        <Text style={[styles.badgeText, { color: statusColor }]}>{label}</Text>
                      </View>
                    </View>
                    {specialization ? (
                      <Text style={[styles.meta, { color: colors.textSecondary }]} numberOfLines={1}>
                        {specialization}
                      </Text>
                    ) : null}
                    <Text style={[styles.meta, { color: colors.textMuted }]}>{when}</Text>
                  </View>
                </View>

                <View style={[styles.symptomsBox, { backgroundColor: colors.inputBackground }]}>
                  <Text style={[styles.symptomsLabel, { color: colors.textMuted }]}>
                    Symptoms (at booking)
                  </Text>
                  <Text style={[styles.symptomsText, { color: colors.textPrimary }]}>
                    {symptoms || 'No symptoms noted for this visit.'}
                  </Text>
                </View>
              </View>
            );
          }}
        />
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
  countText: {
    fontSize: 12,
    fontWeight: '600',
    marginBottom: SPACING.sm,
  },
  card: {
    borderWidth: 1,
    borderRadius: RADIUS.md,
    padding: 12,
    marginBottom: 10,
    gap: 12,
  },
  cardTop: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'flex-start',
  },
  iconBox: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTopBody: { flex: 1, minWidth: 0 },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  doctorName: { fontSize: 14, fontWeight: '700' },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '700',
  },
  meta: { fontSize: 12, marginTop: 2 },
  symptomsBox: {
    borderRadius: RADIUS.md,
    padding: 12,
  },
  symptomsLabel: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
    marginBottom: 6,
  },
  symptomsText: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '500',
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
