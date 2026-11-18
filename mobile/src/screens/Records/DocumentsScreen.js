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
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import * as DocumentPicker from 'expo-document-picker';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { SPACING, RADIUS } from '../../constants/theme';
import { useAppTheme } from '../../context/SettingsContext';
import { patientApi } from '../../api/patient.api';
import { LoadingSpinner } from '../../components/LoadingSpinner';
import { HeaderBackButton, headerBackStyles } from '../../components/HeaderBackButton';
import { AppDialog } from '../../components/AppDialog';
import { DocumentViewerModal } from '../../components/DocumentViewerModal';

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

export const DocumentsScreen = ({ navigation }) => {
  const { colors, isDark } = useAppTheme();
  const insets = useSafeAreaInsets();
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [popup, setPopup] = useState({ visible: false });
  const [deleteTargetId, setDeleteTargetId] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [viewerDoc, setViewerDoc] = useState(null);

  const closePopup = () => setPopup({ visible: false });
  const showPopup = (cfg) => setPopup({ visible: true, ...cfg });

  const fetchDocs = useCallback(async () => {
    try {
      const docsRes = await patientApi.getMedicalDocuments().catch(() => null);
      const payload = docsRes?.data || docsRes || {};
      const docList = Array.isArray(payload.documents) ? payload.documents : [];
      setDocuments(docList.filter((d) => d && d.url));
    } catch (err) {
      console.warn('Error fetching documents:', err?.message || err);
      setDocuments([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchDocs();
    }, [fetchDocs])
  );

  const confirmDeleteDocument = async () => {
    if (!deleteTargetId || deleting) return;
    setDeleting(true);
    try {
      const res = await patientApi.deleteMedicalDocument(deleteTargetId);
      const list = res?.documents || res?.data?.documents;
      if (Array.isArray(list)) setDocuments(list.filter((d) => d && d.url));
      else await fetchDocs();
      setDeleteTargetId(null);
      showPopup({
        variant: 'success',
        title: 'Deleted',
        message: 'Document removed from your medical records.',
        primaryLabel: 'Done',
      });
    } catch (err) {
      setDeleteTargetId(null);
      showPopup({
        variant: 'error',
        title: 'Could not delete',
        message: 'Please try again in a moment.',
        primaryLabel: 'OK',
      });
    } finally {
      setDeleting(false);
    }
  };

  const uploadForm = async ({ type, title, file }) => {
    if (!file?.uri) {
      showPopup({
        variant: 'warning',
        title: 'File required',
        message: 'Please choose a file to upload.',
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
      else await fetchDocs();
      showPopup({
        variant: 'success',
        title: 'Saved',
        message: 'Your document was uploaded successfully.',
        primaryLabel: 'Done',
      });
    } catch (err) {
      const serverMsg =
        err?.response?.data?.message ||
        (Array.isArray(err?.response?.data?.errors)
          ? err.response.data.errors.join(', ')
          : null);
      showPopup({
        variant: 'error',
        title: 'Upload failed',
        message:
          serverMsg ||
          err.message ||
          'Could not save document. Check your connection and try again.',
        primaryLabel: 'Try again',
      });
    } finally {
      setUploading(false);
    }
  };

  const pickDocument = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf', 'image/*'],
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (result.canceled || !result.assets?.length) return;
      const asset = result.assets[0];
      const mime = String(asset.mimeType || '').toLowerCase();
      const name = asset.name || `document-${Date.now()}.pdf`;
      const isPdf = mime.includes('pdf') || String(name).toLowerCase().endsWith('.pdf');
      await uploadForm({
        type: isPdf ? 'pdf' : 'image',
        title: isPdf ? 'Document' : 'Image',
        file: {
          uri: asset.uri,
          name,
          mimeType: mime || (isPdf ? 'application/pdf' : 'image/jpeg'),
        },
      });
    } catch (err) {
      showPopup({
        variant: 'error',
        title: 'Could not open files',
        message: err.message || 'Please try again.',
        primaryLabel: 'OK',
      });
    }
  };

  if (loading) {
    return <LoadingSpinner message="Loading documents..." />;
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
            <Text style={styles.curveHeaderTitle}>Documents</Text>
            <TouchableOpacity
              style={headerBackStyles.gradient}
              onPress={pickDocument}
              disabled={uploading}
              activeOpacity={0.85}
            >
              <Ionicons name="add" size={22} color="#FFFFFF" />
            </TouchableOpacity>
          </View>
        </LinearGradient>
      </View>

      <View
        style={[
          styles.contentSheet,
          { backgroundColor: isDark ? colors.background : '#F2F8FB' },
        ]}
      >
        {uploading ? (
          <View style={[styles.uploadingRow, { paddingHorizontal: SPACING.md, paddingTop: SPACING.md }]}>
            <ActivityIndicator color={colors.primary} />
            <Text style={[styles.uploadingText, { color: colors.textSecondary }]}>
              Uploading…
            </Text>
          </View>
        ) : null}

        <FlatList
          data={documents}
          keyExtractor={(item) => String(item._id || item.id)}
          contentContainerStyle={[
            styles.listContainer,
            documents.length === 0 ? styles.libraryEmptyWrap : null,
            { paddingTop: 28, paddingBottom: Math.max(insets.bottom, 16) + 16 },
          ]}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                fetchDocs();
              }}
              tintColor={colors.primary}
            />
          }
          ListEmptyComponent={
            <View
              style={[
                styles.emptyDocsCard,
                {
                  backgroundColor: colors.cardBackground,
                  borderColor: colors.cardBorder,
                  alignItems: 'center',
                },
              ]}
            >
              <Ionicons name="folder-open-outline" size={36} color={colors.textMuted} />
              <Text style={[styles.emptyDocsText, { color: colors.textMuted, textAlign: 'center' }]}>
                No documents yet. Tap + to upload a PDF or file.
              </Text>
              <TouchableOpacity
                style={[styles.libraryUploadBtn, { backgroundColor: colors.primary }]}
                onPress={pickDocument}
                activeOpacity={0.88}
              >
                <Ionicons name="cloud-upload-outline" size={18} color="#fff" />
                <Text style={styles.libraryUploadBtnText}>Upload document</Text>
              </TouchableOpacity>
            </View>
          }
          renderItem={({ item: doc }) => (
            <View
              style={[
                styles.docCard,
                {
                  backgroundColor: colors.cardBackground,
                  borderColor: colors.cardBorder,
                },
              ]}
            >
              <View style={styles.docInfoCol}>
                <View style={styles.docTitleRow}>
                  <Ionicons
                    name={
                      doc.mimeType?.includes('pdf') || doc.type === 'pdf'
                        ? 'document-outline'
                        : 'image-outline'
                    }
                    size={18}
                    color={colors.primary}
                  />
                  <Text
                    style={[styles.docTitle, { color: colors.textPrimary }]}
                    numberOfLines={1}
                  >
                    {doc.title || 'Untitled Document'}
                  </Text>
                </View>
                <Text style={[styles.docMeta, { color: colors.textSecondary }]} numberOfLines={1}>
                  {doc.fileName || 'document'}
                </Text>
                <Text style={[styles.docDate, { color: colors.textMuted }]}>
                  Uploaded:{' '}
                  {doc.uploadedAt
                    ? new Date(doc.uploadedAt).toLocaleDateString('en-IN')
                    : '—'}
                </Text>
              </View>
              <View style={styles.docActions}>
                {doc.url ? (
                  <TouchableOpacity
                    style={[styles.actionIconBtn, { backgroundColor: colors.primaryLight }]}
                    onPress={() => setViewerDoc(doc)}
                  >
                    <Ionicons name="eye-outline" size={18} color={colors.primary} />
                  </TouchableOpacity>
                ) : null}
                <TouchableOpacity
                  style={[styles.actionIconBtn, { backgroundColor: colors.dangerSoft }]}
                  onPress={() => setDeleteTargetId(doc._id || doc.id)}
                >
                  <Ionicons name="trash-outline" size={18} color={colors.error} />
                </TouchableOpacity>
              </View>
            </View>
          )}
        />
      </View>

      <DocumentViewerModal
        visible={!!viewerDoc}
        document={viewerDoc}
        onClose={() => setViewerDoc(null)}
      />

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
        secondaryLabel={popup.secondaryLabel}
        onSecondary={popup.onSecondary}
      />

      <AppDialog
        visible={!!deleteTargetId}
        onClose={() => !deleting && setDeleteTargetId(null)}
        variant="warning"
        title="Delete document?"
        message="This file will be permanently removed from your medical records."
        primaryLabel={deleting ? 'Deleting…' : 'Delete'}
        onPrimary={confirmDeleteDocument}
        secondaryLabel="Cancel"
        onSecondary={() => setDeleteTargetId(null)}
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
  libraryEmptyWrap: {
    justifyContent: 'center',
  },
  uploadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  uploadingText: {
    fontSize: 13,
    fontWeight: '600',
  },
  emptyDocsCard: {
    borderWidth: 1,
    borderRadius: RADIUS.md,
    padding: 24,
    gap: 12,
  },
  emptyDocsText: {
    fontSize: 13,
    lineHeight: 18,
  },
  libraryUploadBtn: {
    marginTop: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
  },
  libraryUploadBtnText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
  },
  docCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: RADIUS.md,
    padding: 12,
    marginBottom: 10,
    gap: 12,
  },
  docInfoCol: { flex: 1, minWidth: 0 },
  docTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  docTitle: { fontSize: 14, fontWeight: '700', flex: 1 },
  docMeta: { fontSize: 12, marginTop: 4 },
  docDate: { fontSize: 11, marginTop: 2 },
  docActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  actionIconBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
