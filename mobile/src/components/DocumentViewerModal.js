import React, { useMemo, useState } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Dimensions,
  ScrollView,
  StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { WebView } from 'react-native-webview';
import { Ionicons } from '@expo/vector-icons';
import { SPACING } from '../constants/theme';
import { useAppTheme } from '../context/SettingsContext';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

const isPdfDoc = (doc) => {
  const mime = String(doc?.mimeType || '').toLowerCase();
  const name = String(doc?.fileName || doc?.url || '').toLowerCase();
  return mime.includes('pdf') || name.endsWith('.pdf') || name.includes('/raw/');
};

const isImageDoc = (doc) => {
  if (isPdfDoc(doc)) return false;
  const mime = String(doc?.mimeType || '').toLowerCase();
  if (mime.startsWith('image/')) return true;
  const name = String(doc?.fileName || doc?.url || '').toLowerCase();
  return /\.(jpg|jpeg|png|webp|gif|heic|heif)(\?|$)/i.test(name);
};

/**
 * Full-screen in-app document viewer (images + PDFs).
 */
export const DocumentViewerModal = ({ visible, document, onClose }) => {
  const { colors, isDark } = useAppTheme();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const url = String(document?.url || '').trim();
  const title = document?.title || document?.fileName || 'Document';
  const pdf = useMemo(() => isPdfDoc(document), [document]);
  const image = useMemo(() => isImageDoc(document), [document]);

  const pdfViewerUrl = useMemo(() => {
    if (!url || !pdf) return '';
    // Google viewer is more reliable for remote PDFs inside WebView
    return `https://docs.google.com/gview?embedded=1&url=${encodeURIComponent(url)}`;
  }, [url, pdf]);

  const resetState = () => {
    setLoading(true);
    setError('');
  };

  const handleClose = () => {
    resetState();
    onClose?.();
  };

  return (
    <Modal
      visible={!!visible && !!url}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={handleClose}
      onShow={resetState}
    >
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
      <SafeAreaView
        style={[styles.container, { backgroundColor: colors.background }]}
        edges={['top', 'left', 'right', 'bottom']}
      >
        <View style={[styles.header, { borderBottomColor: colors.cardBorder }]}>
          <TouchableOpacity
            style={[styles.iconBtn, { backgroundColor: colors.inputBackground }]}
            onPress={handleClose}
            activeOpacity={0.85}
          >
            <Ionicons name="close" size={22} color={colors.textPrimary} />
          </TouchableOpacity>
          <View style={styles.headerText}>
            <Text style={[styles.title, { color: colors.textPrimary }]} numberOfLines={1}>
              {title}
            </Text>
            {document?.fileName ? (
              <Text style={[styles.subtitle, { color: colors.textMuted }]} numberOfLines={1}>
                {document.fileName}
              </Text>
            ) : null}
          </View>
          <View style={styles.headerSpacer} />
        </View>

        <View style={styles.body}>
          {loading ? (
            <View style={styles.loadingOverlay} pointerEvents="none">
              <ActivityIndicator size="large" color={colors.primary} />
              <Text style={[styles.loadingText, { color: colors.textSecondary }]}>Loading…</Text>
            </View>
          ) : null}

          {error ? (
            <View style={styles.errorWrap}>
              <Ionicons name="alert-circle-outline" size={36} color={colors.error} />
              <Text style={[styles.errorTitle, { color: colors.textPrimary }]}>
                Couldn’t open document
              </Text>
              <Text style={[styles.errorBody, { color: colors.textSecondary }]}>{error}</Text>
              <TouchableOpacity
                style={[styles.retryBtn, { backgroundColor: colors.primary }]}
                onPress={resetState}
                activeOpacity={0.88}
              >
                <Text style={styles.retryText}>Retry</Text>
              </TouchableOpacity>
            </View>
          ) : image ? (
            <ScrollView
              style={styles.flex}
              contentContainerStyle={styles.imageScroll}
              maximumZoomScale={4}
              minimumZoomScale={1}
              centerContent
              bouncesZoom
            >
              <Image
                source={{ uri: url }}
                style={styles.image}
                contentFit="contain"
                onLoadStart={() => {
                  setLoading(true);
                  setError('');
                }}
                onLoad={() => setLoading(false)}
                onError={() => {
                  setLoading(false);
                  setError('The image could not be loaded.');
                }}
              />
            </ScrollView>
          ) : (
            <WebView
              source={{ uri: pdf ? pdfViewerUrl : url }}
              style={styles.flex}
              startInLoadingState
              onLoadStart={() => {
                setLoading(true);
                setError('');
              }}
              onLoadEnd={() => setLoading(false)}
              onError={() => {
                setLoading(false);
                setError('The document could not be loaded.');
              }}
              onHttpError={() => {
                setLoading(false);
                setError('The document could not be loaded.');
              }}
              allowsFullscreenVideo
              scalesPageToFit
              setSupportMultipleWindows={false}
            />
          )}
        </View>
      </SafeAreaView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    paddingVertical: 10,
    borderBottomWidth: 1,
    gap: 10,
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerText: { flex: 1, minWidth: 0 },
  title: { fontSize: 16, fontWeight: '800' },
  subtitle: { fontSize: 12, marginTop: 2 },
  headerSpacer: { width: 40 },
  body: { flex: 1, position: 'relative' },
  flex: { flex: 1 },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.35)',
    gap: 10,
  },
  loadingText: { fontSize: 13, fontWeight: '600' },
  imageScroll: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: SPACING.md,
    minHeight: SCREEN_H * 0.7,
  },
  image: {
    width: SCREEN_W - SPACING.md * 2,
    height: SCREEN_H * 0.72,
  },
  errorWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SPACING.xl,
    gap: 8,
  },
  errorTitle: { fontSize: 17, fontWeight: '800', marginTop: 6 },
  errorBody: { fontSize: 14, textAlign: 'center', lineHeight: 20 },
  retryBtn: {
    marginTop: 12,
    paddingHorizontal: 22,
    paddingVertical: 12,
    borderRadius: 12,
  },
  retryText: { color: '#fff', fontWeight: '700', fontSize: 14 },
});
