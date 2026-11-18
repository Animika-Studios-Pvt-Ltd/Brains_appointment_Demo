import React from 'react';
import { View, Image, ActivityIndicator, StyleSheet } from 'react-native';

export const AppSplashScreen = () => (
  <View style={styles.root}>
    <Image
      source={require('../../assets/brains-logo.png')}
      style={styles.logo}
      resizeMode="contain"
      accessibilityLabel="Brains Super Speciality Hospital"
    />
    <ActivityIndicator size="large" color="#06ADC6" style={styles.spinner} />
  </View>
);

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#000000',
    paddingHorizontal: 32,
  },
  logo: {
    width: 260,
    height: 200,
  },
  spinner: {
    marginTop: 28,
  },
});
