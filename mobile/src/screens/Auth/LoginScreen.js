import React, { useEffect } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { COLORS, SPACING } from '../../constants/theme';

/** Native email login removed — always use Website Login (single login). */
export const LoginScreen = ({ navigation }) => {
  useEffect(() => {
    navigation.replace('WebsiteLogin');
  }, [navigation]);

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right', 'bottom']}>
      <View style={styles.center}>
        <ActivityIndicator color={COLORS.primary} size="large" />
        <Text style={styles.text}>Opening login…</Text>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: SPACING.sm },
  text: { color: COLORS.textSecondary, fontSize: 14, fontWeight: '600' },
});
