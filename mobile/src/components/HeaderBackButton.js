import React from 'react';
import { TouchableOpacity, View, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useAppTheme } from '../context/SettingsContext';

export const headerBackStyles = StyleSheet.create({
  gradient: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  light: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  spacer: {
    width: 40,
    height: 40,
  },
});

export const HeaderBackSpacer = () => <View style={headerBackStyles.spacer} />;

export const HeaderBackButton = ({
  onPress,
  variant = 'gradient',
  iconColor,
  backgroundColor,
  style,
  fallbackRoute = 'Home',
  fallbackParams,
  accessibilityLabel = 'Go back',
  disabled = false,
}) => {
  const navigation = useNavigation();
  const { colors } = useAppTheme();

  const handlePress = () => {
    if (onPress) {
      onPress();
      return;
    }
    if (navigation.canGoBack()) {
      navigation.goBack();
      return;
    }
    const parent = navigation.getParent();
    if (parent?.canGoBack?.()) {
      parent.goBack();
      return;
    }
    if (fallbackRoute === 'Home') {
      try {
        navigation.navigate('Main', { screen: 'Home' });
      } catch (e) {
        navigation.navigate('Main');
      }
    } else if (fallbackParams != null) {
      try {
        navigation.navigate(fallbackRoute, fallbackParams);
      } catch (e) {
        navigation.navigate('Main');
      }
    } else {
      try {
        navigation.navigate(fallbackRoute);
      } catch (e) {
        navigation.navigate('Main');
      }
    }
  };

  const isGradient = variant === 'gradient';
  const resolvedIconColor =
    iconColor || (isGradient ? '#FFFFFF' : colors.textPrimary);
  const resolvedBg =
    backgroundColor || (isGradient ? undefined : colors.inputBackground);

  return (
    <TouchableOpacity
      style={[
        isGradient ? headerBackStyles.gradient : headerBackStyles.light,
        !isGradient && resolvedBg ? { backgroundColor: resolvedBg } : null,
        style,
      ]}
      onPress={handlePress}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      disabled={disabled}
    >
      <Ionicons name="chevron-back" size={22} color={resolvedIconColor} />
    </TouchableOpacity>
  );
};
