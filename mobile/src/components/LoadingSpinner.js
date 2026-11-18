import React from 'react';
import { View, Text, ActivityIndicator, StyleSheet } from 'react-native';
import { SPACING } from '../constants/theme';
import { useAppTheme } from '../context/SettingsContext';

export const LoadingSpinner = ({ message = 'Loading...' }) => {
  const { colors } = useAppTheme();

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ActivityIndicator size="large" color={colors.primary} />
      {message ? (
        <Text style={[styles.text, { color: colors.textSecondary }]}>{message}</Text>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: SPACING.md,
  },
  text: {
    marginTop: SPACING.md,
    fontSize: 14,
  },
});
