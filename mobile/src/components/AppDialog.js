import React from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Pressable,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { RADIUS, SPACING } from '../constants/theme';
import { useAppTheme } from '../context/SettingsContext';

const VARIANT = {
  info: { icon: 'information-circle', color: '#0057FF', softLight: '#E8EEFF', softDark: 'rgba(0,87,255,0.14)' },
  success: { icon: 'checkmark-circle', color: '#12B76A', softLight: '#ECFDF3', softDark: 'rgba(18,183,106,0.14)' },
  error: { icon: 'close-circle', color: '#DC2626', softLight: '#FEF2F2', softDark: 'rgba(248,113,113,0.14)' },
  warning: { icon: 'alert-circle', color: '#D97706', softLight: '#FFFBEB', softDark: 'rgba(251,191,36,0.14)' },
  confirm: { icon: 'help-circle', color: '#0057FF', softLight: '#E8EEFF', softDark: 'rgba(0,87,255,0.14)' },
  danger: { icon: 'trash', color: '#DC2626', softLight: '#FEF2F2', softDark: 'rgba(248,113,113,0.14)' },
};

/**
 * Shared styled popup used across the patient app.
 */
export const AppDialog = ({
  visible,
  onClose,
  variant = 'info',
  title,
  message,
  icon,
  details,
  options,
  primaryLabel,
  onPrimary,
  secondaryLabel,
  onSecondary,
  loading = false,
  dismissOnBackdrop = true,
}) => {
  const { colors, isDark } = useAppTheme();
  const theme = VARIANT[variant] || VARIANT.info;
  const accent = theme.color;
  const softBg = isDark ? theme.softDark : theme.softLight;
  const iconName = icon || theme.icon;

  const hasOptions = Array.isArray(options) && options.length > 0;
  const showPrimary =
    primaryLabel !== null &&
    primaryLabel !== false &&
    (primaryLabel != null || !hasOptions);
  const showSecondary = !!secondaryLabel;

  const handlePrimary = () => {
    if (loading) return;
    if (onPrimary) onPrimary();
    else onClose?.();
  };

  const handleSecondary = () => {
    if (loading) return;
    if (onSecondary) onSecondary();
    else onClose?.();
  };

  return (
    <Modal visible={!!visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={dismissOnBackdrop && !loading ? onClose : undefined}
        />
        <View
          style={[
            styles.card,
            {
              backgroundColor: colors.cardBackground,
              borderColor: colors.cardBorder,
            },
          ]}
        >
          <View style={[styles.iconRing, { backgroundColor: softBg }]}>
            <View style={[styles.iconCircle, { backgroundColor: accent }]}>
              <Ionicons name={iconName} size={28} color="#fff" />
            </View>
          </View>

          {title ? (
            <Text style={[styles.title, { color: colors.textPrimary }]}>{title}</Text>
          ) : null}

          {message ? (
            <Text style={[styles.body, { color: colors.textSecondary }]}>{message}</Text>
          ) : null}

          {Array.isArray(details) && details.length > 0 ? (
            <View
              style={[
                styles.infoBox,
                {
                  backgroundColor: isDark ? colors.inputBackground : colors.surfaceMuted || '#F8F7F4',
                  borderColor: colors.cardBorder,
                },
              ]}
            >
              {details.map((row, idx) => (
                <View
                  key={`${row.label}-${idx}`}
                  style={[styles.infoRow, idx > 0 ? styles.infoRowSpaced : null]}
                >
                  <Text style={[styles.infoLabel, { color: colors.textMuted }]}>{row.label}</Text>
                  <Text
                    style={[
                      styles.infoValue,
                      { color: row.accent ? accent : colors.textPrimary },
                    ]}
                  >
                    {row.value}
                  </Text>
                </View>
              ))}
            </View>
          ) : null}

          {hasOptions ? (
            <View style={styles.optionsWrap}>
              {options.map((opt, idx) => {
                const tone =
                  opt.tone === 'danger' ? colors.error || '#DC2626' : colors.primary;
                return (
                  <TouchableOpacity
                    key={`${opt.label}-${idx}`}
                    style={[
                      styles.optionBtn,
                      {
                        borderColor: colors.cardBorder,
                        backgroundColor: isDark ? colors.inputBackground : colors.surfaceMuted || '#F8F7F4',
                      },
                    ]}
                    onPress={() => {
                      if (loading) return;
                      opt.onPress?.();
                    }}
                    activeOpacity={0.85}
                    disabled={loading}
                  >
                    {opt.icon ? (
                      <Ionicons name={opt.icon} size={18} color={tone} />
                    ) : null}
                    <Text style={[styles.optionText, { color: colors.textPrimary }]}>
                      {opt.label}
                    </Text>
                    <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
                  </TouchableOpacity>
                );
              })}
            </View>
          ) : null}

          {(showPrimary || showSecondary) && (
            <View style={styles.actions}>
              {showSecondary ? (
                <TouchableOpacity
                  style={[
                    styles.secondaryBtn,
                    {
                      borderColor: colors.cardBorder,
                      backgroundColor: colors.inputBackground,
                      opacity: loading ? 0.7 : 1,
                      flex: showPrimary ? 1 : undefined,
                      width: showPrimary ? undefined : '100%',
                    },
                  ]}
                  onPress={handleSecondary}
                  activeOpacity={0.85}
                  disabled={loading}
                >
                  <Text style={[styles.secondaryText, { color: colors.textPrimary }]}>
                    {secondaryLabel}
                  </Text>
                </TouchableOpacity>
              ) : null}

              {showPrimary ? (
                <TouchableOpacity
                  style={[
                    styles.primaryBtn,
                    {
                      backgroundColor:
                        variant === 'danger' || variant === 'error'
                          ? colors.error || accent
                          : variant === 'success'
                            ? colors.primary
                            : accent,
                      opacity: loading ? 0.75 : 1,
                      flex: showSecondary ? 1 : undefined,
                      width: showSecondary ? undefined : '100%',
                    },
                  ]}
                  onPress={handlePrimary}
                  activeOpacity={0.88}
                  disabled={loading}
                >
                  {loading ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.primaryText}>{primaryLabel || 'Got it'}</Text>
                  )}
                </TouchableOpacity>
              ) : null}
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(11, 18, 32, 0.55)',
    justifyContent: 'center',
    paddingHorizontal: SPACING.lg,
  },
  card: {
    borderRadius: 24,
    borderWidth: 1,
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.lg + 6,
    paddingBottom: SPACING.lg,
    alignItems: 'center',
    width: '100%',
    zIndex: 1,
    elevation: 8,
    shadowColor: '#0057FF',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
  },
  iconRing: {
    width: 84,
    height: 84,
    borderRadius: 42,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.md,
  },
  iconCircle: {
    width: 58,
    height: 58,
    borderRadius: 29,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 8,
    letterSpacing: -0.3,
  },
  body: {
    fontSize: 14,
    lineHeight: 21,
    textAlign: 'center',
    marginBottom: SPACING.md,
    paddingHorizontal: 4,
  },
  infoBox: {
    alignSelf: 'stretch',
    borderWidth: 1,
    borderRadius: RADIUS.lg,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm + 4,
    marginBottom: SPACING.md,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  infoRowSpaced: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(148,163,184,0.45)',
  },
  infoLabel: {
    fontSize: 12,
    fontWeight: '600',
  },
  infoValue: {
    flex: 1,
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'right',
  },
  optionsWrap: {
    alignSelf: 'stretch',
    gap: 8,
    marginBottom: SPACING.md,
  },
  optionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  optionText: {
    flex: 1,
    fontSize: 15,
    fontWeight: '700',
  },
  actions: {
    alignSelf: 'stretch',
    width: '100%',
    flexDirection: 'row',
    gap: 10,
  },
  primaryBtn: {
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  primaryText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
  secondaryBtn: {
    borderRadius: 14,
    borderWidth: 1,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  secondaryText: {
    fontSize: 15,
    fontWeight: '700',
  },
});
