import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { NavigationContainer, DefaultTheme, DarkTheme } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import {
  useFonts,
  Manrope_400Regular,
  Manrope_500Medium,
  Manrope_600SemiBold,
  Manrope_700Bold,
  Manrope_800ExtraBold,
} from '@expo-google-fonts/manrope';
import { AuthProvider, useAuth } from './src/context/AuthContext';
import { SettingsProvider, useSettings } from './src/context/SettingsContext';
import { AppNavigator } from './src/navigation/AppNavigator';
import { Preloader } from './src/components/Preloader';
import { LIGHT_COLORS, DARK_COLORS, FONTS } from './src/constants/theme';
import { applyManropeFont } from './src/utils/applyManropeFont';

SplashScreen.preventAutoHideAsync().catch(() => {});

const AppLightTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    primary: LIGHT_COLORS.primary,
    background: LIGHT_COLORS.background,
    card: LIGHT_COLORS.cardBackground,
    border: LIGHT_COLORS.cardBorder,
    text: LIGHT_COLORS.textPrimary,
  },
  fonts: {
    regular: { fontFamily: FONTS.regular, fontWeight: '400' },
    medium: { fontFamily: FONTS.medium, fontWeight: '500' },
    bold: { fontFamily: FONTS.bold, fontWeight: '700' },
    heavy: { fontFamily: FONTS.extraBold, fontWeight: '800' },
  },
};

const AppDarkTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: DARK_COLORS.background,
    card: DARK_COLORS.cardBackground,
    border: DARK_COLORS.cardBorder,
    text: DARK_COLORS.textPrimary,
    primary: DARK_COLORS.primary,
  },
  fonts: {
    regular: { fontFamily: FONTS.regular, fontWeight: '400' },
    medium: { fontFamily: FONTS.medium, fontWeight: '500' },
    bold: { fontFamily: FONTS.bold, fontWeight: '700' },
    heavy: { fontFamily: FONTS.extraBold, fontWeight: '800' },
  },
};

function AppNavigation() {
  const { darkMode } = useSettings();
  return (
    <NavigationContainer theme={darkMode ? AppDarkTheme : AppLightTheme}>
      <StatusBar style={darkMode ? 'light' : 'dark'} />
      <AppNavigator />
    </NavigationContainer>
  );
}

function AppRoot({ fontsLoaded, showPreloader, setShowPreloader }) {
  const { isLoading: authLoading } = useAuth();

  if (showPreloader || !fontsLoaded || authLoading) {
    return <Preloader onComplete={() => setShowPreloader(false)} />;
  }

  return <AppNavigation />;
}

export default function App() {
  const [showPreloader, setShowPreloader] = useState(true);
  const [fontsLoaded] = useFonts({
    Manrope_400Regular,
    Manrope_500Medium,
    Manrope_600SemiBold,
    Manrope_700Bold,
    Manrope_800ExtraBold,
  });

  if (fontsLoaded) {
    applyManropeFont();
  }

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: '#FFFFFF' }}>
      <SafeAreaProvider>
        <AuthProvider>
          <SettingsProvider>
            <AppRoot
              fontsLoaded={fontsLoaded}
              showPreloader={showPreloader}
              setShowPreloader={setShowPreloader}
            />
          </SettingsProvider>
        </AuthProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
