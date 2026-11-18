import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { COLORS, RADIUS, SPACING } from '../constants/theme';

export const Badge = ({ status = 'pending', label }) => {
  const getBadgeStyle = () => {
    const s = (status || '').toLowerCase();
    if (s.includes('confirm') || s === 'approved' || s === 'scheduled' || s.includes('progress')) {
      return { bg: 'rgba(59, 130, 246, 0.15)', text: COLORS.statusCompleted };
    }
    if (s.includes('comple')) {
      return { bg: 'rgba(16, 185, 129, 0.15)', text: COLORS.statusConfirmed };
    }
    if (s.includes('cancel') || s === 'rejected') {
      return { bg: 'rgba(239, 68, 68, 0.15)', text: COLORS.statusCancelled };
    }
    return { bg: 'rgba(245, 158, 11, 0.15)', text: COLORS.statusPending };
  };

  const styleConfig = getBadgeStyle();

  return (
    <View style={[styles.badge, { backgroundColor: styleConfig.bg }]}>
      <Text style={[styles.text, { color: styleConfig.text }]}>
        {label || status.toUpperCase()}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: SPACING.sm + 2,
    paddingVertical: SPACING.xs,
    borderRadius: RADIUS.full,
    alignSelf: 'flex-start',
  },
  text: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
});
