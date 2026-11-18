import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  StatusBar,
  Modal,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { SPACING, RADIUS } from '../../constants/theme';
import { useAppTheme } from '../../context/SettingsContext';
import { CustomInput } from '../../components/CustomInput';
import { CustomButton } from '../../components/CustomButton';
import { HeaderBackButton, HeaderBackSpacer } from '../../components/HeaderBackButton';
import { authApi } from '../../api/auth.api';
import { Lock, Shield, ShieldCheck, AlertCircle, CheckCircle2 } from 'lucide-react-native';

const getPasswordStrength = (pwd) => {
  if (!pwd) return { score: 0, label: '', color: '#D1D5DB' };
  let score = 0;
  if (pwd.length >= 8) score += 1;
  if (/[A-Z]/.test(pwd) && /[a-z]/.test(pwd)) score += 1;
  if (/[0-9]/.test(pwd)) score += 1;
  if (/[^A-Za-z0-9]/.test(pwd)) score += 1;
  
  if (score === 0) return { score: 0, label: '', color: '#D1D5DB' };
  if (score === 1) return { score: 1, label: 'Weak', color: '#F04438' };
  if (score === 2) return { score: 2, label: 'Fair', color: '#F79009' };
  if (score === 3) return { score: 3, label: 'Good', color: '#3380FF' };
  return { score: 4, label: 'Strong', color: '#12B76A' };
};

export const ChangePasswordScreen = ({ navigation }) => {
  const { colors, isDark } = useAppTheme();
  const insets = useSafeAreaInsets();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [modalConfig, setModalConfig] = useState({
    visible: false,
    type: 'error', // 'error' | 'success'
    title: '',
    message: '',
    onConfirm: null,
  });

  const strength = getPasswordStrength(newPassword);

  const showPopup = (title, message, type = 'error', onConfirm = null) => {
    setModalConfig({
      visible: true,
      type,
      title,
      message,
      onConfirm,
    });
  };

  const closeModal = () => {
    const callback = modalConfig.onConfirm;
    setModalConfig((prev) => ({ ...prev, visible: false }));
    if (callback) {
      setTimeout(() => callback(), 200);
    }
  };

  const handleSubmit = async () => {
    if (!currentPassword.trim()) {
      showPopup('Required Field', 'Please enter your current password.', 'error');
      return;
    }
    if (newPassword.length < 8) {
      showPopup('Password Too Short', 'New password must be at least 8 characters.', 'error');
      return;
    }
    if (newPassword !== confirmPassword) {
      showPopup('Password Mismatch', 'New password and confirmation do not match.', 'error');
      return;
    }

    setLoading(true);
    try {
      const data = await authApi.changePassword({
        currentPassword,
        newPassword,
      });
      if (!data?.success) {
        throw new Error(data?.message || 'Could not update password.');
      }
      showPopup(
        'Password Updated!',
        'Your password has been changed successfully. Please use your new password the next time you sign in.',
        'success',
        () => navigation.goBack()
      );
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      showPopup(
        'Unable to Update Password',
        err?.response?.data?.message || err.message || 'Could not update password. Please verify your current password.',
        'error'
      );
    } finally {
      setLoading(false);
    }
  };

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
            <Text style={styles.headerTitle}>Change Password</Text>
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

        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <ScrollView
            contentContainerStyle={[
              styles.content,
              { paddingTop: 28 }
            ]}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>Security</Text>
            <View
              style={[
                styles.card,
                {
                  backgroundColor: isDark ? colors.cardBackground : '#FFFFFF',
                  borderColor: isDark ? colors.cardBorder : 'rgba(18,78,150,0.08)',
                  padding: SPACING.md,
                },
              ]}
            >
              <View style={styles.cardHeader}>
                <View style={[styles.shieldIconWrap, { backgroundColor: isDark ? colors.primaryLight : '#E8EEFF' }]}>
                  <Shield color={colors.primary} size={20} />
                </View>
                <View style={styles.cardHeaderCopy}>
                  <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>Security</Text>
                  <Text style={[styles.hint, { color: colors.textSecondary }]}>
                    Choose a strong password with at least{' '}
                    <Text style={{ color: colors.primary, fontWeight: '700' }}>8 characters.</Text>
                  </Text>
                </View>
              </View>

              <CustomInput
                label="Current password"
                value={currentPassword}
                onChangeText={setCurrentPassword}
                secureTextEntry
                placeholder="Enter current password"
                icon={Lock}
              />
              
              <CustomInput
                label="New password"
                value={newPassword}
                onChangeText={setNewPassword}
                secureTextEntry
                placeholder="Enter new password"
                icon={Lock}
              />

              {newPassword.length > 0 ? (
                <View style={styles.strengthContainer}>
                  <View style={styles.strengthBars}>
                    {[1, 2, 3, 4].map((index) => {
                      const active = strength.score >= index;
                      return (
                        <View
                          key={index}
                          style={[
                            styles.strengthBar,
                            {
                              backgroundColor: active
                                ? strength.color
                                : isDark
                                  ? '#243044'
                                  : '#E6E4DF',
                            },
                          ]}
                        />
                      );
                    })}
                  </View>
                  {strength.label ? (
                    <Text style={[styles.strengthLabel, { color: strength.color }]}>
                      {strength.label}
                    </Text>
                  ) : null}
                </View>
              ) : null}

              <CustomInput
                label="Confirm new password"
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                secureTextEntry
                placeholder="Re-enter new password"
                icon={Lock}
              />

              {confirmPassword.length > 0 ? (
                <Text
                  style={[
                    styles.matchText,
                    {
                      color:
                        newPassword === confirmPassword
                          ? colors.success
                          : colors.error,
                    },
                  ]}
                >
                  {newPassword === confirmPassword
                    ? 'Passwords match'
                    : 'Passwords do not match'}
                </Text>
              ) : (
                <Text style={[styles.matchText, { color: colors.textMuted }]}>
                  Make sure both passwords match
                </Text>
              )}
            </View>

            <View style={{ height: 16 }} />

            <View
              style={[
                styles.tipCard,
                {
                  backgroundColor: isDark ? colors.surfaceMuted : '#E8EEFF',
                  borderColor: colors.cardBorder,
                },
              ]}
            >
              <View style={[styles.tipIconWrap, { backgroundColor: isDark ? colors.cardBackground : '#FFFFFF' }]}>
                <ShieldCheck color={colors.primary} size={20} />
              </View>
              <View style={styles.tipCopy}>
                <Text style={[styles.tipTitle, { color: colors.primaryDark }]}>Password tips</Text>
                <Text style={[styles.tipText, { color: colors.textSecondary }]}>
                  Use a mix of uppercase, lowercase, numbers and special characters for better security.
                </Text>
              </View>
            </View>

            <View style={{ height: 24 }} />
            
            <TouchableOpacity
              onPress={handleSubmit}
              disabled={loading}
              activeOpacity={0.85}
              style={styles.submitBtnWrap}
            >
              <LinearGradient
                colors={['#124E96', '#06ADC6']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.submitBtn}
              >
                <Lock color="#FFFFFF" size={16} />
                <Text style={styles.submitBtnText}>Update Password</Text>
              </LinearGradient>
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>
      </View>

      <Modal
        visible={modalConfig.visible}
        transparent
        animationType="fade"
        onRequestClose={closeModal}
      >
        <View style={styles.modalOverlay}>
          <TouchableOpacity style={StyleSheet.absoluteFillObject} activeOpacity={1} onPress={closeModal} />
          <View
            style={[
              styles.modalCard,
              {
                backgroundColor: isDark ? colors.cardBackground : '#FFFFFF',
                borderColor: isDark ? colors.cardBorder : 'rgba(18,78,150,0.12)',
              },
            ]}
          >
            <View
              style={[
                styles.modalIconWrap,
                modalConfig.type === 'success' ? styles.modalIconWrapSuccess : styles.modalIconWrapError,
              ]}
            >
              <LinearGradient
                colors={
                  modalConfig.type === 'success'
                    ? ['#10B981', '#059669']
                    : ['#EF4444', '#DC2626']
                }
                style={styles.modalIconGrad}
              >
                {modalConfig.type === 'success' ? (
                  <CheckCircle2 color="#FFFFFF" size={30} />
                ) : (
                  <AlertCircle color="#FFFFFF" size={30} />
                )}
              </LinearGradient>
            </View>

            <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>
              {modalConfig.title}
            </Text>

            <Text style={[styles.modalMessage, { color: colors.textSecondary }]}>
              {modalConfig.message}
            </Text>

            <TouchableOpacity
              onPress={closeModal}
              activeOpacity={0.85}
              style={styles.modalBtnWrap}
            >
              <LinearGradient
                colors={
                  modalConfig.type === 'success'
                    ? ['#10B981', '#059669']
                    : ['#124E96', '#06ADC6']
                }
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.modalBtn}
              >
                <Text style={styles.modalBtnText}>
                  {modalConfig.type === 'success' ? 'Great, thanks' : 'Got it'}
                </Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
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
    marginTop: -16,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: 'hidden',
    zIndex: 1,
  },
  content: {
    padding: SPACING.md,
    paddingBottom: SPACING.xxl,
  },
  hint: {
    marginBottom: SPACING.md,
    fontSize: 13,
    lineHeight: 18,
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
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(18,78,150,0.06)',
    paddingBottom: SPACING.sm + 4,
  },
  shieldIconWrap: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardHeaderCopy: {
    flex: 1,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 2,
  },
  strengthContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginTop: -SPACING.xs,
    marginBottom: SPACING.md,
    paddingHorizontal: 4,
  },
  strengthBars: {
    flexDirection: 'row',
    gap: 6,
    flex: 1,
  },
  strengthBar: {
    height: 4,
    flex: 1,
    borderRadius: 2,
  },
  strengthLabel: {
    fontSize: 12,
    fontWeight: '700',
    minWidth: 48,
    textAlign: 'right',
  },
  matchText: {
    fontSize: 12,
    fontWeight: '600',
    marginTop: -SPACING.xs,
    marginBottom: SPACING.md,
    marginLeft: 4,
  },
  tipCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    padding: SPACING.md,
    borderRadius: RADIUS.md,
    borderWidth: 1,
  },
  tipIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  tipCopy: {
    flex: 1,
  },
  tipTitle: {
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 2,
  },
  tipText: {
    fontSize: 12,
    lineHeight: 18,
  },
  submitBtnWrap: {
    borderRadius: RADIUS.md,
    overflow: 'hidden',
    shadowColor: '#124E96',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
  },
  submitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    gap: 8,
  },
  submitBtnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: -0.1,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(5, 59, 116, 0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: SPACING.lg,
  },
  modalCard: {
    width: '100%',
    maxWidth: 340,
    borderRadius: 24,
    borderWidth: 1,
    padding: SPACING.lg,
    alignItems: 'center',
    elevation: 12,
    shadowColor: '#053B74',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
  },
  modalIconWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    marginBottom: SPACING.md,
    padding: 3,
  },
  modalIconWrapSuccess: {
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
  },
  modalIconWrapError: {
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
  },
  modalIconGrad: {
    flex: 1,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalTitle: {
    fontSize: 19,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: SPACING.xs,
    letterSpacing: -0.2,
  },
  modalMessage: {
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    marginBottom: SPACING.lg,
  },
  modalBtnWrap: {
    width: '100%',
    borderRadius: RADIUS.md,
    overflow: 'hidden',
  },
  modalBtn: {
    paddingVertical: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
});
