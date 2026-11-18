import React, { useState } from 'react';
import { View, Text, TextInput, StyleSheet, TouchableOpacity } from 'react-native';
import { RADIUS, SPACING } from '../constants/theme';
import { useAppTheme } from '../context/SettingsContext';
import { Eye, EyeOff } from 'lucide-react-native';

export const CustomInput = ({
  label,
  value,
  onChangeText,
  placeholder,
  secureTextEntry,
  icon: IconComponent,
  error,
  keyboardType = 'default',
  multiline = false,
  numberOfLines = 1,
  editable = true,
}) => {
  const [showPassword, setShowPassword] = useState(false);
  const { colors } = useAppTheme();

  return (
    <View style={styles.container}>
      {label ? (
        <Text style={[styles.label, { color: colors.textSecondary }]}>{label}</Text>
      ) : null}
      <View
        style={[
          styles.inputWrapper,
          {
            backgroundColor: colors.inputBackground,
            borderColor: error ? colors.error : colors.cardBorder,
          },
          !editable ? styles.inputReadonly : null,
        ]}
      >
        {IconComponent && (
          <View style={styles.iconContainer}>
            <IconComponent color={colors.textMuted} size={18} />
          </View>
        )}
        <TextInput
          style={[
            styles.input,
            { color: colors.textPrimary },
            multiline ? { height: 80, textAlignVertical: 'top' } : null,
          ]}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={colors.textMuted}
          secureTextEntry={secureTextEntry && !showPassword}
          keyboardType={keyboardType}
          multiline={multiline}
          numberOfLines={numberOfLines}
          editable={editable}
        />
        {secureTextEntry && (
          <TouchableOpacity
            style={styles.eyeIcon}
            onPress={() => setShowPassword(!showPassword)}
          >
            {showPassword ? (
              <EyeOff color={colors.textMuted} size={18} />
            ) : (
              <Eye color={colors.textMuted} size={18} />
            )}
          </TouchableOpacity>
        )}
      </View>
      {error ? (
        <Text style={[styles.errorText, { color: colors.error }]}>{error}</Text>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginBottom: SPACING.md,
  },
  label: {
    fontSize: 13,
    fontWeight: '500',
    marginBottom: SPACING.xs,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.sm + 4,
  },
  inputReadonly: {
    opacity: 0.75,
  },
  iconContainer: {
    marginRight: SPACING.xs + 2,
  },
  input: {
    flex: 1,
    fontSize: 15,
    paddingVertical: SPACING.sm + 4,
  },
  eyeIcon: {
    padding: SPACING.xs,
  },
  errorText: {
    fontSize: 12,
    marginTop: 4,
  },
});
