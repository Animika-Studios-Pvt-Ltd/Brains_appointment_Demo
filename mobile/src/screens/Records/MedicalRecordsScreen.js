import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';
import { SPACING, RADIUS } from '../../constants/theme';
import { getTabBarScrollPadding } from '../../constants/layout';
import { useAppTheme } from '../../context/SettingsContext';
import { patientApi } from '../../api/patient.api';
import { LoadingSpinner } from '../../components/LoadingSpinner';
import { AppDialog } from '../../components/AppDialog';
import { HeaderBackButton, HeaderBackSpacer } from '../../components/HeaderBackButton';
import { Ionicons } from '@expo/vector-icons';

const RECORD_OPTIONS = [
  {
    key: 'online_payments',
    title: 'Online Payments',
    subtitle: 'Razorpay receipts',
    icon: 'card-outline',
    color: '#0D9488',
  },
];

const TYPE_LABEL = {
  image: 'Image',
  pdf: 'Document',
  scan: 'Scan',
};

const guessMime = (name = '', fallback = 'image/jpeg') => {
  const lower = String(name).toLowerCase();
  if (lower.endsWith('.pdf')) return 'application/pdf';
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  return fallback;
};

const normalizeUploadUri = (uri) => {
  const raw = String(uri || '').trim();
  if (!raw) return raw;
  if (Platform.OS === 'ios') return raw;
  if (raw.startsWith('file://') || raw.startsWith('content://') || raw.startsWith('ph://')) {
    return raw;
  }
  return `file://${raw}`;
};

const buildUploadFile = (file) => {
  const name = String(file?.name || `upload-${Date.now()}.jpg`).replace(/\s+/g, '_');
  const hasExt = /\.[a-z0-9]+$/i.test(name);
  const fallbackExt = String(file?.mimeType || '').includes('pdf') ? '.pdf' : '.jpg';
  const safeName = hasExt ? name : `${name}${fallbackExt}`;
  let mime = String(file?.mimeType || '').trim().toLowerCase();
  if (!mime || mime === 'application/octet-stream' || mime === 'image') {
    mime = guessMime(safeName, fallbackExt === '.pdf' ? 'application/pdf' : 'image/jpeg');
  }
  if (mime === 'image/jpg') mime = 'image/jpeg';
  return {
    uri: normalizeUploadUri(file.uri),
    name: safeName,
    type: mime,
  };
};

const parseAppointments = (apptRes) => {
  const appts = Array.isArray(apptRes)
    ? apptRes
    : apptRes?.appointments ||
      apptRes?.data?.appointments ||
      apptRes?.records ||
      [];
  return Array.isArray(appts) ? appts : [];
};

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

export const MedicalRecordsScreen = ({ navigation }) => {
  const { colors, isDark } = useAppTheme();
  const insets = useSafeAreaInsets();
  const [paymentCount, setPaymentCount] = useState(0);
  const [historyCount, setHistoryCount] = useState(0);
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [popup, setPopup] = useState({ visible: false });

  const closePopup = () => setPopup({ visible: false });
  const showPopup = (cfg) => setPopup({ visible: true, ...cfg });

  const fetchAll = useCallback(async () => {
    try {
      const [apptRes, docsRes] = await Promise.all([
        patientApi.getAppointments(undefined, { limit: 200 }).catch(() => null),
        patientApi.getMedicalDocuments().catch(() => null),
      ]);

      const list = parseAppointments(apptRes);
      setPaymentCount(
        list.filter((a) => String(a?.paymentMode || '').toLowerCase() === 'online').length
      );
      setHistoryCount(uniqueCompletedVisits(list).length);

      const payload = docsRes?.data || docsRes || {};
      const docList = Array.isArray(payload.documents) ? payload.documents : [];
      setDocuments(docList.filter(d => d && d.url));
    } catch (err) {
      console.warn('Error fetching medical records:', err?.message || err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const uploadForm = async ({ type, title, file }) => {
    if (!file?.uri) {
      showPopup({
        variant: 'warning',
        title: 'File required',
        message: 'Please choose a photo or scan to upload.',
        primaryLabel: 'OK',
      });
      return;
    }

    const formData = new FormData();
    formData.append('type', type);
    if (title) formData.append('title', title);
    formData.append('file', buildUploadFile(file));

    setUploading(true);
    try {
      const res = await patientApi.uploadMedicalDocument(formData);
      const list = res?.documents || res?.data?.documents;
      if (Array.isArray(list)) setDocuments(list.filter((d) => d && d.url));
      else await fetchAll();
      (navigation.getParent() || navigation).navigate('Documents');
    } catch (err) {
      const serverMsg =
        err?.response?.data?.message ||
        (Array.isArray(err?.response?.data?.errors)
          ? err.response.data.errors.join(', ')
          : null);
      console.warn('Medical upload failed:', err?.response?.data || err?.message || err);
      showPopup({
        variant: 'error',
        title: 'Upload failed',
        message:
          serverMsg ||
          err.message ||
          'Could not save record. Check your connection and try again.',
        primaryLabel: 'Try again',
      });
    } finally {
      setUploading(false);
    }
  };

  const pickImage = async (type = 'image', fromCamera = false) => {
    try {
      if (fromCamera) {
        const cam = await ImagePicker.requestCameraPermissionsAsync();
        if (!cam.granted) {
          showPopup({
            variant: 'warning',
            title: 'Camera permission needed',
            message: 'Allow camera access in settings to scan documents.',
            primaryLabel: 'OK',
          });
          return;
        }
      } else {
        const lib = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!lib.granted) {
          showPopup({
            variant: 'warning',
            title: 'Photos permission needed',
            message: 'Allow photo library access to upload report images.',
            primaryLabel: 'OK',
          });
          return;
        }
      }

      const result = fromCamera
        ? await ImagePicker.launchCameraAsync({
            quality: 0.85,
            allowsEditing: false,
          })
        : await ImagePicker.launchImageLibraryAsync({
            quality: 0.85,
            allowsEditing: false,
            mediaTypes: ['images'],
          });

      if (result.canceled || !result.assets?.length) return;
      const asset = result.assets[0];
      await uploadForm({
        type,
        title: TYPE_LABEL[type] || 'Image',
        file: {
          uri: asset.uri,
          name: asset.fileName || `${type}-${Date.now()}.jpg`,
          mimeType: asset.mimeType || 'image/jpeg',
        },
      });
    } catch (err) {
      showPopup({
        variant: 'error',
        title: 'Could not open picker',
        message: err.message || 'Please try again.',
        primaryLabel: 'OK',
      });
    }
  };

  const handleOptionPress = (key) => {
    if (uploading) return;
    switch (key) {
      case 'image':
        pickImage('image', false);
        break;
      case 'documents':
        (navigation.getParent() || navigation).navigate('Documents');
        break;
      case 'medical_history':
        (navigation.getParent() || navigation).navigate('MedicalHistory');
        break;
      case 'online_payments':
        (navigation.getParent() || navigation).navigate('OnlinePayments');
        break;
      default:
        break;
    }
  };

  if (loading) {
    return <LoadingSpinner message="Loading records..." />;
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
            styles.listContainer,
            { paddingTop: 28, paddingBottom: getTabBarScrollPadding(insets.bottom) },
          ]}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                fetchAll();
              }}
              tintColor={colors.primary}
            />
          }
        >
          <View style={styles.optionsGrid}>
            {RECORD_OPTIONS.map((opt) => {
              let subtitle = opt.subtitle;
              if (opt.key === 'online_payments' && paymentCount > 0) {
                subtitle = `${paymentCount} receipt${paymentCount === 1 ? '' : 's'}`;
              }
              if (opt.key === 'medical_history' && historyCount > 0) {
                subtitle = `${historyCount} visit${historyCount === 1 ? '' : 's'}`;
              }
              if (opt.key === 'documents') {
                subtitle =
                  documents.length > 0
                    ? `${documents.length} file${documents.length === 1 ? '' : 's'} stored`
                    : 'All uploaded files';
              }
              return (
                <TouchableOpacity
                  key={opt.key}
                  style={[
                    styles.optionCard,
                    {
                      backgroundColor: isDark ? colors.cardBackground : '#FFFFFF',
                      borderColor: isDark ? colors.cardBorder : 'rgba(18,78,150,0.08)',
                    },
                  ]}
                  activeOpacity={0.85}
                  onPress={() => handleOptionPress(opt.key)}
                  disabled={uploading}
                >
                  <View style={[styles.optionIcon, { backgroundColor: `${opt.color}22` }]}>
                    <Ionicons name={opt.icon} size={22} color={opt.color} />
                  </View>
                  <Text style={[styles.optionTitle, { color: colors.textPrimary }]} numberOfLines={2}>
                    {opt.title}
                  </Text>
                  <Text style={[styles.optionSub, { color: colors.textSecondary }]} numberOfLines={2}>
                    {subtitle}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {uploading ? (
            <View style={styles.uploadingRow}>
              <ActivityIndicator color={colors.primary} />
              <Text style={[styles.uploadingText, { color: colors.textSecondary }]}>
                Uploading…
              </Text>
            </View>
          ) : null}
        </ScrollView>
      </View>

      <AppDialog
        visible={popup.visible}
        onClose={closePopup}
        variant={popup.variant || 'info'}
        icon={popup.icon}
        title={popup.title}
        message={popup.message}
        details={popup.details}
        options={popup.options}
        primaryLabel={popup.primaryLabel}
        onPrimary={popup.onPrimary || closePopup}
        secondaryLabel={popup.secondaryLabel}
        onSecondary={popup.onSecondary || closePopup}
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
    paddingBottom: 20,
    borderBottomLeftRadius: 12,
    borderBottomRightRadius: 12,
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitleContainer: {
    flex: 1,
    alignItems: 'center',
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
  },
  subtitle: {
    fontSize: 12,
    marginTop: 2,
    textAlign: 'center',
  },
  listContainer: {
    padding: SPACING.md,
  },
  optionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  optionCard: {
    width: '100%',
    borderWidth: 1,
    borderRadius: RADIUS.md,
    padding: 16,
    gap: 6,
  },
  optionIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  optionTitle: {
    fontSize: 14,
    fontWeight: '700',
  },
  optionSub: {
    fontSize: 11,
    lineHeight: 15,
  },
  uploadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: SPACING.md,
  },
  uploadingText: { fontSize: 13 },
});
