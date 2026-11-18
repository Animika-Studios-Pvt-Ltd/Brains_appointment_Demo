import React, { useRef, useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Platform,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import { useFocusEffect } from '@react-navigation/native';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import { COLORS, SPACING } from '../../constants/theme';
import { CONFIG } from '../../constants/config';
import { useAuth } from '../../context/AuthContext';
import { HeaderBackButton, HeaderBackSpacer } from '../../components/HeaderBackButton';

WebBrowser.maybeCompleteAuthSession();

const API_ORIGIN = CONFIG.API_BASE_URL.replace(/\/api\/?$/, '');
const WEB_ORIGIN = CONFIG.WEB_BASE_URL.replace(/\/$/, '');
const OAUTH_API_ORIGIN = String(CONFIG.OAUTH_API_ORIGIN || '').replace(/\/$/, '');

// Google blocks embedded WebView UAs ("disallowed_useragent" / Access blocked).
// Email/password stays in WebView; Google OAuth opens in system browser.
const CHROME_MOBILE_UA =
  Platform.OS === 'ios'
    ? 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
    : 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36';

const isWebsiteDashboardUrl = (url) => {
  if (!url || typeof url !== 'string') return false;
  try {
    const u = new URL(url);
    const path = u.pathname || '';
    return (
      path.includes('/patient') ||
      path.includes('/doctor') ||
      path.includes('/admin') ||
      path.includes('/receptionist') ||
      path === '/' ||
      path === ''
    );
  } catch {
    return /\/(patient|doctor|admin|receptionist)/i.test(url);
  }
};

const isGoogleOAuthNavigation = (url) => {
  if (!url || typeof url !== 'string') return false;
  if (/accounts\.google\.com/i.test(url)) return true;
  try {
    const u = new URL(url);
    return (
      u.pathname.includes('/api/auth/google') &&
      !u.pathname.includes('/callback')
    );
  } catch {
    return /\/api\/auth\/google(?!\/callback)/i.test(url);
  }
};

export const WebsiteLoginScreen = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const webRef = useRef(null);
  const handledRef = useRef(false);
  const googleSessionRef = useRef(false);
  const [loading, setLoading] = useState(true);
  const [completing, setCompleting] = useState(false);
  const [pageUrl, setPageUrl] = useState(CONFIG.WEB_LOGIN_URL);
  const [webviewKey, setWebviewKey] = useState(0);
  const { loginWithToken } = useAuth();

  useFocusEffect(
    useCallback(() => {
      handledRef.current = false;
      googleSessionRef.current = false;
      setCompleting(false);
      setPageUrl(CONFIG.WEB_LOGIN_URL);
      setWebviewKey((k) => k + 1);
      setLoading(true);

      const timer = setTimeout(() => {
        setLoading(false);
      }, 2500);

      return () => clearTimeout(timer);
    }, [])
  );

  const injectedBeforeContent = useMemo(
    () => `
      (function () {
        try {
          window.__BRAINS_API_ORIGIN__ = ${JSON.stringify(API_ORIGIN)};
          if (window.location.search.indexOf('token=') === -1) {
            localStorage.removeItem('token');
            localStorage.removeItem('user');
          }
        } catch (e) {}
      })();
      true;
    `,
    []
  );

  const injectedAfterLoad = useMemo(
    () => `
(function () {
  try {
    window.__BRAINS_API_ORIGIN__ = ${JSON.stringify(API_ORIGIN)};
  } catch (e) {}

  function rewriteLocal(url) {
    if (!url || typeof url !== 'string') return url;
    return url
      .replace(/https?:\\/\\/(localhost|127\\.0\\.0\\.1):8000/gi, ${JSON.stringify(API_ORIGIN)})
      .replace(/https?:\\/\\/(localhost|127\\.0\\.0\\.1):5173/gi, ${JSON.stringify(CONFIG.WEB_BASE_URL)});
  }

  var _assign = window.location.assign.bind(window.location);
  var _replace = window.location.replace.bind(window.location);
  window.location.assign = function (url) { return _assign(rewriteLocal(String(url))); };
  window.location.replace = function (url) { return _replace(rewriteLocal(String(url))); };

  if (!window.__brainsGoogleClickHook) {
    window.__brainsGoogleClickHook = true;
    document.addEventListener('click', function (e) {
      var el = e.target;
      while (el && el !== document.body) {
        var text = (el.innerText || el.textContent || '').toLowerCase();
        if (
          (el.tagName === 'BUTTON' || el.getAttribute('role') === 'button') &&
          text.indexOf('google') !== -1
        ) {
          e.preventDefault();
          e.stopPropagation();
          if (window.ReactNativeWebView) {
            window.ReactNativeWebView.postMessage(JSON.stringify({
              type: 'START_GOOGLE_LOGIN'
            }));
          }
          return false;
        }
        el = el.parentElement;
      }
    }, true);
  }

  if (window.__brainsMobileAuthBridge) return;
  window.__brainsMobileAuthBridge = true;

  function apiOrigin() {
    return window.__BRAINS_API_ORIGIN__ || ${JSON.stringify(API_ORIGIN)};
  }

  function clearWebAuth() {
    try {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
    } catch (e) {}
  }

  function postAuth(token, user) {
    if (!window.ReactNativeWebView) return;
    window.ReactNativeWebView.postMessage(JSON.stringify({
      type: 'AUTH_SUCCESS',
      token: token,
      user: user
    }));
  }

  function verifyAndSend() {
    try {
      var token = localStorage.getItem('token');
      if (!token) return false;

      fetch(apiOrigin() + '/api/auth/verify', {
        headers: { Authorization: 'Bearer ' + token }
      })
        .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
        .then(function (res) {
          if (res.ok && res.j && res.j.success && res.j.user) {
            localStorage.setItem('user', JSON.stringify(res.j.user));
            postAuth(token, res.j.user);
          } else {
            clearWebAuth();
          }
        })
        .catch(function () {});

      return true;
    } catch (e) {
      return false;
    }
  }

  var tries = 0;
  var timer = setInterval(function () {
    tries += 1;
    if (verifyAndSend() || tries > 120) clearInterval(timer);
  }, 800);
})();
true;
`,
    []
  );

  const rewriteLocalhostUrl = useCallback((url) => {
    if (!url || typeof url !== 'string') return url;
    return url
      .replace(/https?:\/\/(localhost|127\.0\.0\.1):8000/gi, API_ORIGIN)
      .replace(/https?:\/\/(localhost|127\.0\.0\.1):5173/gi, CONFIG.WEB_BASE_URL);
  }, []);

  const finishAndClose = useCallback(() => {
    navigation.navigate('Main', { screen: 'Home' });
  }, [navigation]);

  const handleAuthPayload = useCallback(
    async (payload, options = {}) => {
      if (handledRef.current) return;
      if (!payload?.token || !payload?.user) return;

      handledRef.current = true;
      setLoading(false);

      try {
        await loginWithToken(payload.token, payload.user, options);
        finishAndClose();
      } catch (err) {
        handledRef.current = false;
        Alert.alert(
          'Login Failed',
          err?.response?.data?.message ||
            err.message ||
            'Could not complete website login for this app.'
        );
      }
    },
    [loginWithToken, finishAndClose]
  );

  const completeWithToken = useCallback(
    async (token) => {
      if (!token || handledRef.current) return;
      setLoading(false);
      try {
        // Token was issued by the HTTPS OAuth API (Railway) — verify there
        const verifyBase = OAUTH_API_ORIGIN || API_ORIGIN;
        const res = await fetch(`${verifyBase}/api/auth/verify`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data?.success || !data?.user) {
          throw new Error(
            data?.message || 'Could not verify Google sign-in session.'
          );
        }
        await handleAuthPayload(
          { token, user: data.user },
          { alreadyVerified: true }
        );
      } catch (err) {
        handledRef.current = false;
        Alert.alert(
          'Google sign-in failed',
          err?.message || 'Please try again or use email and password.'
        );
      }
    },
    [handleAuthPayload]
  );

  const startGoogleAuthSession = useCallback(
    async () => {
      if (googleSessionRef.current || handledRef.current || completing) return;
      googleSessionRef.current = true;
      setLoading(true);

      // App deep link — closes system browser and returns into the mobile app
      // (not the website). Google callback itself stays on HTTPS Railway.
      const redirectUri = Linking.createURL('oauth');
      const authUrl = `${OAUTH_API_ORIGIN}/api/auth/google?type=patient&returnTo=${encodeURIComponent(
        redirectUri
      )}&mobile=1`;

      let gotToken = false;
      try {
        const result = await WebBrowser.openAuthSessionAsync(authUrl, redirectUri);

        if (result.type === 'success' && result.url) {
          const parsed = Linking.parse(result.url);
          const err = parsed.queryParams?.error;
          const token = parsed.queryParams?.token;
          if (err) {
            Alert.alert(
              'Google sign-in failed',
              'Sign-in was cancelled or blocked. Try again or use email and password.'
            );
          } else if (token) {
            gotToken = true;
            setCompleting(true);
            setLoading(true);
            await completeWithToken(String(token));
          }
        }
      } catch (err) {
        Alert.alert(
          'Google sign-in failed',
          err?.message || 'Could not open Google sign-in. Please try again.'
        );
      } finally {
        if (!gotToken) {
          googleSessionRef.current = false;
          setLoading(false);
        }
      }
    },
    [completeWithToken, completing]
  );

  const onMessage = useCallback(
    async (event) => {
      try {
        const data = JSON.parse(event.nativeEvent.data);
        if (data?.type === 'START_GOOGLE_LOGIN') {
          await startGoogleAuthSession();
          return;
        }
        if (data?.type === 'AUTH_SUCCESS') {
          await handleAuthPayload(data);
          return;
        }
        if (data?.type === 'CLOSE_WEBVIEW') {
          finishAndClose();
          return;
        }
      } catch {
        // ignore non-JSON messages
      }
    },
    [handleAuthPayload, startGoogleAuthSession, finishAndClose]
  );

  const onShouldStartLoadWithRequest = useCallback(
    (request) => {
      const original = request?.url;
      if (original) {
        try {
          const u = new URL(original);
          if (isWebsiteDashboardUrl(original) && !u.search.includes('token=')) {
            finishAndClose();
            return false;
          }
        } catch {}
      }

      if (handledRef.current || completing) {
        if (isWebsiteDashboardUrl(original) && String(original).startsWith(WEB_ORIGIN)) {
          return false;
        }
      }

      if (isGoogleOAuthNavigation(original)) {
        startGoogleAuthSession();
        return false;
      }

      const rewritten = rewriteLocalhostUrl(original);
      if (rewritten && rewritten !== original) {
        setPageUrl(rewritten);
        return false;
      }
      return true;
    },
    [rewriteLocalhostUrl, completing, startGoogleAuthSession, finishAndClose]
  );

  const onNavigationStateChange = useCallback(
    (navState) => {
      setLoading(false);
      if (handledRef.current || completing) return;
      const url = navState?.url;
      if (isGoogleOAuthNavigation(url)) {
        startGoogleAuthSession();
        return;
      }
      const rewritten = rewriteLocalhostUrl(url);
      if (rewritten && url && rewritten !== url) {
        setPageUrl(rewritten);
      }
    },
    [rewriteLocalhostUrl, completing, startGoogleAuthSession]
  );

  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      <LinearGradient
        colors={['#053B74', '#124E96', '#06ADC6']}
        locations={[0, 0.55, 1]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.header, { paddingTop: insets.top + 8, paddingBottom: 16 }]}
      >
        <HeaderBackButton
          variant="gradient"
          onPress={() => navigation.goBack()}
          disabled={completing}
          accessibilityLabel="Close login"
        />
        <Text style={styles.headerTitle}>Login</Text>
        <HeaderBackSpacer />
      </LinearGradient>

      <View style={styles.webviewWrap}>
        <WebView
          ref={webRef}
          key={`login-${webviewKey}`}
          source={{ uri: pageUrl }}
          style={styles.webview}
          userAgent={CHROME_MOBILE_UA}
          onLoadStart={() => {
            if (!handledRef.current) setLoading(true);
          }}
          onLoadEnd={() => setLoading(false)}
          onMessage={onMessage}
          onShouldStartLoadWithRequest={onShouldStartLoadWithRequest}
          onNavigationStateChange={onNavigationStateChange}
          onError={(syntheticEvent) => {
            setLoading(false);
            const url = syntheticEvent?.nativeEvent?.url;
            const rewritten = rewriteLocalhostUrl(url);
            if (rewritten && rewritten !== url) {
              setPageUrl(rewritten);
            }
          }}
          onHttpError={(syntheticEvent) => {
            setLoading(false);
            const desc = syntheticEvent?.nativeEvent?.description;
            if (desc) {
              console.warn('WebsiteLogin HTTP error:', desc, syntheticEvent?.nativeEvent?.url);
            }
          }}
          injectedJavaScriptBeforeContentLoaded={injectedBeforeContent}
          injectedJavaScript={injectedAfterLoad}
          javaScriptEnabled
          domStorageEnabled
          sharedCookiesEnabled
          thirdPartyCookiesEnabled
          setSupportMultipleWindows={false}
          allowsBackForwardNavigationGestures
          originWhitelist={['*']}
          androidLayerType={Platform.OS === 'android' ? 'hardware' : undefined}
        />

        {loading || completing ? (
          <View style={styles.loadingOverlay}>
            <ActivityIndicator color={COLORS.primary} size="large" />
            <Text style={styles.loadingTitle}>
              {completing ? 'Signing into your account…' : 'Loading login screen…'}
            </Text>
            <Text style={styles.loadingSub}>
              {completing ? 'Completing authentication…' : `Connecting to ${CONFIG.WEB_BASE_URL}`}
            </Text>
          </View>
        ) : null}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
  },
  backBtn: {
    padding: SPACING.sm,
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  headerSpacer: {
    width: 38,
  },
  signUpHeaderBtn: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 8,
  },
  signUpHeaderText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: COLORS.background,
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    paddingHorizontal: SPACING.xl,
  },
  loadingTitle: {
    marginTop: SPACING.md,
    fontSize: 17,
    fontWeight: '700',
    color: COLORS.primaryDark,
  },
  loadingSub: {
    fontSize: 13,
    color: COLORS.textMuted,
  },
  webviewWrap: {
    flex: 1,
    position: 'relative',
  },
  webview: {
    flex: 1,
    backgroundColor: '#fff',
  },
  completingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: COLORS.background,
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    paddingHorizontal: SPACING.xl,
  },
  completingTitle: {
    marginTop: SPACING.md,
    fontSize: 17,
    fontWeight: '700',
    color: COLORS.primaryDark,
  },
  completingSub: {
    fontSize: 13,
    color: COLORS.textMuted,
  },
});
