import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Image,
  RefreshControl,
  TextInput,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { SPACING } from '../../constants/theme';
import { getTabBarScrollPadding } from '../../constants/layout';
import { useAppTheme } from '../../context/SettingsContext';
import { useAuth } from '../../context/AuthContext';
import { patientApi } from '../../api/patient.api';
import { LoadingSpinner } from '../../components/LoadingSpinner';
import { HeaderBackButton, HeaderBackSpacer } from '../../components/HeaderBackButton';

const FALLBACK_DOCTOR_IMAGE =
  'https://images.unsplash.com/photo-1559839734-2b71ea197ec2?auto=format&fit=crop&q=80&w=300';

const parseDoctors = (data) => {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.doctors)) return data.doctors;
  if (Array.isArray(data?.data?.doctors)) return data.data.doctors;
  if (Array.isArray(data?.data)) return data.data;
  return [];
};

const formatDoctorName = (name) => {
  const raw = String(name || 'Specialist').trim();
  return /^dr\.?\s/i.test(raw) ? raw.replace(/^dr\.?\s*/i, 'Dr. ') : `Dr. ${raw}`;
};

export const SelectDoctorScreen = ({ navigation }) => {
  const { colors, isDark } = useAppTheme();
  const { isAuthenticated } = useAuth();
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [doctors, setDoctors] = useState([]);
  const [query, setQuery] = useState('');

  const fetchDoctors = useCallback(async () => {
    try {
      const data = await patientApi.getDoctors();
      setDoctors(parseDoctors(data));
    } catch (err) {
      console.warn('Error loading doctors:', err?.message || err);
      setDoctors([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchDoctors();
    }, [fetchDoctors])
  );

  const openBook = (doctorId) => {
    if (!isAuthenticated) {
      navigation.navigate('WebsiteLogin');
      return;
    }
    const parent = navigation.getParent();
    if (parent) {
      parent.navigate('BookAppointment', { doctorId: String(doctorId) });
      return;
    }
    navigation.navigate('BookAppointment', { doctorId: String(doctorId) });
  };

  const filtered = doctors.filter((doc) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    const name = String(doc.name || '').toLowerCase();
    const spec = String(doc.specialization || doc.speciality || '').toLowerCase();
    return name.includes(q) || spec.includes(q);
  });

  if (loading) {
    return <LoadingSpinner message="Loading doctors..." />;
  }

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
            <Text style={styles.headerTitle}>Select Doctor</Text>
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

        <View
          style={[
            styles.searchBox,
            {
              backgroundColor: isDark ? colors.cardBackground : '#FFFFFF',
              borderColor: isDark ? colors.cardBorder : 'rgba(18,78,150,0.08)',
            },
          ]}
        >
          <Ionicons name="search-outline" size={18} color={colors.textMuted} />
          <TextInput
            style={[styles.searchInput, { color: colors.textPrimary }]}
            placeholder="Search by name or specialty"
            placeholderTextColor={colors.textMuted}
            value={query}
            onChangeText={setQuery}
          />
          {query ? (
            <TouchableOpacity onPress={() => setQuery('')} hitSlop={8}>
              <Ionicons name="close-circle" size={18} color={colors.textMuted} />
            </TouchableOpacity>
          ) : null}
        </View>

        <FlatList
          data={filtered}
          keyExtractor={(item) => String(item._id || item.id)}
          contentContainerStyle={[
            styles.list,
            { paddingBottom: getTabBarScrollPadding(insets.bottom) },
          ]}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                fetchDoctors();
              }}
              tintColor={colors.primary}
            />
          }
          ListEmptyComponent={
            <View
              style={[
                styles.emptyCard,
                {
                  backgroundColor: '#FFFFFF',
                  borderColor: isDark ? colors.cardBorder : 'rgba(18,78,150,0.08)',
                },
              ]}
            >
              <Ionicons name="people-outline" size={28} color="#124E96" />
              <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>
                No doctors found
              </Text>
              <Text style={[styles.emptyBody, { color: colors.textMuted }]}>
                Try a different search, or pull to refresh.
              </Text>
            </View>
          }
          renderItem={({ item }) => {
            const id = item._id || item.id;
            const name = formatDoctorName(item.name || 'Specialist');
            const specialty =
              item.specialization || item.speciality || 'General Medicine';
            const image = item.profileImage || FALLBACK_DOCTOR_IMAGE;
            const fees = item.fees != null ? `₹${item.fees}` : null;

            return (
              <TouchableOpacity
                style={[
                  styles.card,
                  {
                    backgroundColor: isDark ? colors.cardBackground : '#FFFFFF',
                    borderColor: isDark ? colors.cardBorder : 'rgba(18,78,150,0.08)',
                  },
                ]}
                activeOpacity={0.9}
                onPress={() => openBook(id)}
              >
                <Image source={{ uri: image }} style={styles.avatar} />
                <View style={styles.copy}>
                  <Text style={[styles.name, { color: colors.textPrimary }]} numberOfLines={1}>
                    {name}
                  </Text>
                  <Text style={[styles.spec, { color: colors.primary }]} numberOfLines={1}>
                    {specialty}
                  </Text>
                  <Text style={[styles.clinic, { color: colors.textMuted }]} numberOfLines={1}>
                    Brains Hospital
                    {fees ? ` · ${fees}` : ''}
                  </Text>
                </View>
                <View style={styles.cta}>
                  <Text style={styles.ctaText}>Book</Text>
                  <Ionicons name="chevron-forward" size={14} color="#FFFFFF" />
                </View>
              </TouchableOpacity>
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
    marginTop: -12,
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
    overflow: 'hidden',
    zIndex: 1,
  },
  searchBox: {
    marginHorizontal: SPACING.md,
    marginTop: 28,
    marginBottom: 12,
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 12,
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    paddingVertical: 10,
  },
  list: {
    paddingHorizontal: SPACING.md,
    flexGrow: 1,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 18,
    padding: 12,
    marginBottom: 12,
    gap: 12,
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 16,
    backgroundColor: '#EAF2FC',
  },
  copy: { flex: 1, minWidth: 0 },
  name: { fontSize: 15, fontWeight: '800' },
  spec: { fontSize: 13, fontWeight: '600', marginTop: 2 },
  clinic: { fontSize: 12, fontWeight: '500', marginTop: 2 },
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    backgroundColor: '#124E96',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  ctaText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  emptyCard: {
    marginTop: 40,
    borderRadius: 20,
    borderWidth: 1,
    paddingVertical: 36,
    paddingHorizontal: 24,
    alignItems: 'center',
    gap: 8,
  },
  emptyTitle: { fontSize: 16, fontWeight: '800', marginTop: 6 },
  emptyBody: { fontSize: 13, textAlign: 'center', lineHeight: 19 },
});
