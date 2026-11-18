import React from 'react';
import { TouchableOpacity, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { RADIUS, SPACING } from '../constants/theme';
import { useAppTheme } from '../context/SettingsContext';

export const CustomButton = ({
  title,
  onPress,
  variant = 'primary',
  loading = false,
  disabled = false,
  icon: IconComponent,
}) => {
  const { colors } = useAppTheme();

  const getStyles = () => {
    switch (variant) {
      case 'secondary':
        return { bg: colors.cardBorder, border: 'transparent', text: colors.textPrimary };
      case 'outline':
        return { bg: 'transparent', border: colors.primary, text: colors.primary };
      case 'danger':
        return { bg: colors.error, border: 'transparent', text: '#fff' };
      default:
        return { bg: colors.primary, border: 'transparent', text: '#fff' };
    }
  };

  const btnStyle = getStyles();

  return (
    <TouchableOpacity
      activeOpacity={0.8}
      disabled={disabled || loading}
      style={[
        styles.button,
        { backgroundColor: btnStyle.bg, borderColor: btnStyle.border },
        btnStyle.border !== 'transparent' ? styles.borderWidth : null,
        disabled ? styles.disabled : null,
      ]}
      onPress={onPress}
    >
      {loading ? (
        <ActivityIndicator color={btnStyle.text} size="small" />
      ) : (
        <>
          {IconComponent && <IconComponent color={btnStyle.text} size={18} style={styles.icon} />}
          <Text style={[styles.text, { color: btnStyle.text }]}>{title}</Text>
        </>
      )}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.lg,
    borderRadius: RADIUS.md,
    gap: SPACING.xs + 2,
  },
  borderWidth: {
    borderWidth: 1,
  },
  disabled: {
    opacity: 0.5,
  },
  text: {
    fontSize: 15,
    fontWeight: '600',
  },
  icon: {
    marginRight: 4,
  },
});
