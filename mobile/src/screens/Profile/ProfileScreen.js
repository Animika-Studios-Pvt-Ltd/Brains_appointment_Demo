import React, { useState, useEffect, useCallback, useMemo, useRef, useContext } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Platform,
  Image,
  StatusBar,
  LayoutAnimation,
  UIManager,
  TextInput,
  Animated,
  Pressable,
  Dimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as ImagePicker from 'expo-image-picker';
import DateTimePicker from '@react-native-community/datetimepicker';
import { DatePickerModal } from '../../components/DatePickerModal';
import { useAuth } from '../../context/AuthContext';
import { useAppTheme } from '../../context/SettingsContext';
import { patientApi } from '../../api/patient.api';
import { CustomButton } from '../../components/CustomButton';
import { LoadingSpinner } from '../../components/LoadingSpinner';
import { AppDialog } from '../../components/AppDialog';
import { HeaderBackButton, HeaderBackSpacer, headerBackStyles } from '../../components/HeaderBackButton';
import { getTabBarScrollPadding } from '../../constants/layout';
import {
  User,
  Mail,
  Phone,
  MapPin,
  LogOut,
  Calendar,
  Heart,
} from 'lucide-react-native';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

/** Same header + page wash as Settings, Appointments, Records tabs */
const APP_HEADER = {
  top: '#053B74',
  mid: '#124E96',
  bottom: '#06ADC6',
};
const APP_PAGE_WASH = '#F2F8FB';
const APP_SHEET_GRADIENT_LIGHT = ['#DCEAF6', '#E8F3F8', '#DFF5F8', APP_PAGE_WASH];

const PROFILE = {
  headerTop: APP_HEADER.top,
  headerMid: APP_HEADER.mid,
  headerBottom: APP_HEADER.bottom,
  bg: APP_PAGE_WASH,
  sheet: APP_PAGE_WASH,
  card: '#FFFFFF',
  cardBorder: 'rgba(18,78,150,0.08)',
  text: '#16213D',
  textSecondary: '#6B7A99',
  accent: '#124E96',
  emergency: '#F43F5E',
  medical: '#8B5CF6',
  logout: '#EF4444',
  personalIconBg: '#EEF4FF',
  emergencyIconBg: '#FFF0F3',
  medicalIconBg: '#F6EEFF',
  logoutIconBg: '#FFF4EB',
  fieldBg: '#FFFFFF',
  fieldBorder: 'rgba(18,78,150,0.08)',
  fieldIconBg: '#EEF4FF',
};

const getProfilePalette = (isDark, colors) => {
  const header = {
    headerTop: APP_HEADER.top,
    headerMid: APP_HEADER.mid,
    headerBottom: APP_HEADER.bottom,
  };

  if (!isDark) {
    return {
      ...header,
      bg: APP_PAGE_WASH,
      sheet: APP_PAGE_WASH,
      card: '#FFFFFF',
      cardBorder: 'rgba(18,78,150,0.08)',
      text: colors.textPrimary,
      textSecondary: colors.textSecondary,
      accent: '#124E96',
      emergency: colors.error,
      medical: PROFILE.medical,
      logout: colors.error,
      personalIconBg: '#EEF4FF',
      emergencyIconBg: colors.dangerSoft,
      medicalIconBg: PROFILE.medicalIconBg,
      logoutIconBg: colors.dangerSoft,
      fieldBg: '#FFFFFF',
      fieldBorder: 'rgba(18,78,150,0.08)',
      fieldIconBg: '#EEF4FF',
      chipSelectedBg: '#EEF4FF',
      fieldDisabled: colors.surfaceMuted,
      guestCardGradient: ['#FFFFFF', '#F0F5FF', '#FFFFFF'],
      guestFeatureRowBg: '#FFFFFF',
      sheetGradient: APP_SHEET_GRADIENT_LIGHT,
    };
  }

  return {
    ...header,
    bg: colors.background,
    sheet: colors.background,
    card: colors.cardBackground,
    cardBorder: colors.cardBorder,
    text: colors.textPrimary,
    textSecondary: colors.textSecondary,
    accent: colors.primary,
    emergency: colors.error,
    medical: '#A78BFA',
    logout: colors.error,
    personalIconBg: colors.primaryLight,
    emergencyIconBg: colors.dangerSoft,
    medicalIconBg: 'rgba(167, 139, 250, 0.15)',
    logoutIconBg: colors.dangerSoft,
    fieldBg: colors.inputBackground,
    fieldBorder: colors.cardBorder,
    fieldIconBg: colors.primaryLight,
    chipSelectedBg: colors.primaryLight,
    fieldDisabled: colors.surfaceMuted,
    guestCardGradient: [colors.cardBackground, colors.surfaceMuted, colors.cardBackground],
    guestFeatureRowBg: colors.inputBackground,
    sheetGradient: [colors.background, colors.surfaceMuted || colors.background, colors.background],
  };
};

const ProfileThemeContext = React.createContext(PROFILE);
const useProfileTheme = () => useContext(ProfileThemeContext);

const AgeIcon = ({ color, size }) => (
  <Ionicons name="gift-outline" size={size} color={color} />
);
const AllergiesIcon = ({ color, size }) => (
  <Ionicons name="alert-circle-outline" size={size} color={color} />
);
const MedicationsIcon = ({ color, size }) => (
  <Ionicons name="medkit-outline" size={size} color={color} />
);
const ConditionsIcon = ({ color, size }) => (
  <Ionicons name="fitness-outline" size={size} color={color} />
);

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const formatPhoneDisplay = (phone) => {
  const raw = String(phone || '').trim();
  if (!raw) return 'Add phone number';
  if (raw.startsWith('+')) return raw;
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 10) return `+91 ${digits.slice(0, 5)} ${digits.slice(5)}`;
  if (digits.length === 12 && digits.startsWith('91')) {
    return `+91 ${digits.slice(2, 7)} ${digits.slice(7)}`;
  }
  return raw;
};

const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
const GENDERS = [
  { value: 'male', label: 'Male', icon: 'male-outline' },
  { value: 'female', label: 'Female', icon: 'female-outline' },
  { value: 'other', label: 'Other', icon: 'person-outline' },
];
const RELATIONSHIPS = [
  { value: 'spouse', label: 'Spouse' },
  { value: 'parent', label: 'Parent' },
  { value: 'child', label: 'Child' },
  { value: 'sibling', label: 'Sibling' },
  { value: 'friend', label: 'Friend' },
  { value: 'relative', label: 'Relative' },
  { value: 'other', label: 'Other' },
];

const RequiredLabel = ({ text, required }) => {
  const palette = useProfileTheme();
  return (
    <Text style={[styles.piLabel, { color: palette.text }]}>
      {text}
      {required ? <Text style={[styles.piRequired, { color: palette.logout }]}> *</Text> : null}
    </Text>
  );
};

const ProfileField = ({
  label,
  required,
  value,
  onChangeText,
  placeholder,
  icon: IconComponent,
  editable = true,
  keyboardType = 'default',
  right,
  onPress,
  multiline = false,
  numberOfLines = 1,
}) => {
  const palette = useProfileTheme();
  const content = (
    <View
      style={[
        styles.piInputRow,
        {
          borderColor: palette.fieldBorder,
          backgroundColor: palette.fieldBg,
        },
        multiline && styles.piInputRowMultiline,
        !editable && { backgroundColor: palette.fieldDisabled },
      ]}
    >
      {IconComponent ? (
        <View
          style={[
            styles.piIconBox,
            { backgroundColor: palette.fieldIconBg },
            multiline && styles.piIconBoxTop,
          ]}
        >
          <IconComponent color={palette.accent} size={18} />
        </View>
      ) : null}
      {onPress ? (
        <Text
          style={[
            styles.piInputText,
            { color: palette.text },
            !value && { color: palette.textSecondary },
          ]}
          numberOfLines={1}
        >
          {value || placeholder}
        </Text>
      ) : (
        <TextInput
          style={[styles.piTextInput, { color: palette.text }, multiline && styles.piTextInputMultiline]}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={palette.textSecondary}
          editable={editable}
          keyboardType={keyboardType}
          multiline={multiline}
          numberOfLines={multiline ? numberOfLines : 1}
          textAlignVertical={multiline ? 'top' : 'center'}
        />
      )}
      {right}
    </View>
  );

  return (
    <View style={styles.piField}>
      <RequiredLabel text={label} required={required} />
      {onPress ? (
        <TouchableOpacity onPress={onPress} activeOpacity={0.85}>
          {content}
        </TouchableOpacity>
      ) : (
        content
      )}
    </View>
  );
};

const GenderSelect = ({ value, onChange }) => {
  const palette = useProfileTheme();
  return (
    <View style={styles.piField}>
      <RequiredLabel text="Gender" />
      <View style={styles.genderRow}>
        {GENDERS.map((opt) => {
          const selected = value === opt.value;
          return (
            <TouchableOpacity
              key={opt.value}
              style={[
                styles.genderChip,
                {
                  borderColor: palette.fieldBorder,
                  backgroundColor: palette.fieldBg,
                },
                selected && {
                  borderColor: palette.accent,
                  backgroundColor: palette.chipSelectedBg,
                },
              ]}
              onPress={() => onChange(selected ? '' : opt.value)}
              activeOpacity={0.85}
            >
              <Ionicons
                name={opt.icon}
                size={16}
                color={selected ? palette.accent : palette.textSecondary}
              />
              <Text
                style={[
                  styles.genderChipText,
                  { color: palette.textSecondary },
                  selected && { color: palette.accent },
                ]}
              >
                {opt.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
};

const ChipScroll = ({ options, value, onChange, label }) => {
  const palette = useProfileTheme();
  return (
    <View style={styles.piField}>
      <RequiredLabel text={label} />
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.bloodScrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {options.map((opt) => {
          const key = typeof opt === 'string' ? opt : opt.value;
          const text = typeof opt === 'string' ? opt : opt.label;
          const selected = value === key;
          return (
            <TouchableOpacity
              key={key}
              style={[
                styles.bloodChip,
                {
                  borderColor: palette.fieldBorder,
                  backgroundColor: palette.fieldBg,
                },
                selected && {
                  borderColor: palette.accent,
                  backgroundColor: palette.chipSelectedBg,
                },
              ]}
              onPress={() => onChange(selected ? '' : key)}
              activeOpacity={0.85}
            >
              <Text
                style={[
                  styles.bloodChipText,
                  { color: palette.textSecondary },
                  selected && { color: palette.accent },
                ]}
              >
                {text}
              </Text>
              {selected ? (
                <View style={[styles.bloodCheck, { backgroundColor: palette.accent }]}>
                  <Ionicons name="checkmark" size={10} color="#FFFFFF" />
                </View>
              ) : null}
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
};

const ScalePress = ({ onPress, children }) => {
  const scale = useRef(new Animated.Value(1)).current;
  const animate = (to) =>
    Animated.spring(scale, {
      toValue: to,
      useNativeDriver: true,
      friction: 6,
      tension: 160,
    }).start();

  return (
    <Pressable
      onPress={onPress}
      onPressIn={() => animate(0.98)}
      onPressOut={() => animate(1)}
      android_ripple={{ color: 'rgba(37,99,235,0.06)' }}
    >
      <Animated.View style={{ transform: [{ scale }] }}>{children}</Animated.View>
    </Pressable>
  );
};

const MedicalCross = () => (
  <View style={styles.medicalCross} pointerEvents="none">
    <View style={styles.crossBarV} />
    <View style={styles.crossBarH} />
  </View>
);

const FooterDecor = () => (
  <View style={styles.footerDecor} pointerEvents="none">
    <Ionicons name="leaf-outline" size={54} color="rgba(37,99,235,0.08)" style={styles.leafL} />
    <View style={styles.shieldWrap}>
      <Ionicons name="shield" size={72} color="rgba(37,99,235,0.10)" />
      <Text style={styles.shieldPlus}>+</Text>
    </View>
    <Ionicons name="leaf-outline" size={54} color="rgba(37,99,235,0.08)" style={styles.leafR} />
  </View>
);

const pickPatientFromResponse = (res) => {
  if (!res) return null;
  if (res.data && (res.data._id || res.data.id || res.data.email)) return res.data;
  if (res.user && (res.user._id || res.user.id || res.user.email)) return res.user;
  if (res._id || res.id || res.email) return res;
  return null;
};

const calculateAgeFromDob = (dobString) => {
  if (!dobString) return '';
  const birthDate = new Date(dobString);
  if (Number.isNaN(birthDate.getTime())) return '';
  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const m = today.getMonth() - birthDate.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) age -= 1;
  return age >= 0 ? String(age) : '';
};

const formatDobDisplay = (dobString) => {
  if (!dobString) return 'Select date of birth';
  const d = new Date(dobString);
  if (Number.isNaN(d.getTime())) return dobString;
  const day = String(d.getDate()).padStart(2, '0');
  const month = d.toLocaleString('en-US', { month: 'short' });
  const year = d.getFullYear();
  return `${day}-${month}-${year}`;
};

const SaveButton = ({ onPress, loading }) => {
  const palette = useProfileTheme();
  return (
    <TouchableOpacity
      style={[styles.piSaveBtn, { backgroundColor: palette.accent }, loading && { opacity: 0.75 }]}
      onPress={onPress}
      activeOpacity={0.88}
      disabled={loading}
    >
      <Ionicons name="save-outline" size={18} color="#FFFFFF" />
      <Text style={styles.piSaveBtnText}>{loading ? 'Saving...' : 'Save Changes'}</Text>
    </TouchableOpacity>
  );
};

export const ProfileScreen = ({ navigation }) => {
  const { user, logout, updateUserData, isAuthenticated } = useAuth();
  const { colors, isDark } = useAppTheme();
  const palette = useMemo(() => getProfilePalette(isDark, colors), [isDark, colors]);
  const insets = useSafeAreaInsets();
  const scrollRef = useRef(null);
  const progressAnim = useRef(new Animated.Value(0)).current;

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [dob, setDob] = useState('');
  const [age, setAge] = useState('');
  const [gender, setGender] = useState('');
  const [bloodGroup, setBloodGroup] = useState('');
  const [address, setAddress] = useState('');
  const [ecName, setEcName] = useState('');
  const [ecPhone, setEcPhone] = useState('');
  const [ecRelationship, setEcRelationship] = useState('');
  const [allergies, setAllergies] = useState('');
  const [medications, setMedications] = useState('');
  const [chronicConditions, setChronicConditions] = useState('');
  const [loading, setLoading] = useState(false);
  const [booting, setBooting] = useState(true);
  const [localImageUri, setLocalImageUri] = useState(null);
  const [localImageFile, setLocalImageFile] = useState(null);
  const [showDobPicker, setShowDobPicker] = useState(false);
  const [openSection, setOpenSection] = useState(null);
  const [popup, setPopup] = useState({ visible: false });

  const closePopup = () => setPopup({ visible: false });
  const showPopup = (cfg) => setPopup({ visible: true, ...cfg });

  const toggleSection = (key) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setOpenSection((prev) => (prev === key ? null : key));
  };

  const completionPercentage = useMemo(() => {
    let filledCount = 0;
    if (name?.trim()) filledCount += 1;
    if (phone?.trim()) filledCount += 1;
    if (dob) filledCount += 1;
    if (age !== undefined && age !== null && String(age).trim() !== '') filledCount += 1;
    if (gender) filledCount += 1;
    if (bloodGroup) filledCount += 1;
    if (ecName?.trim()) filledCount += 1;
    if (ecPhone?.trim()) filledCount += 1;
    if (ecRelationship) filledCount += 1;
    const hasMed =
      allergies?.trim() || medications?.trim() || chronicConditions?.trim();
    return Math.round(((filledCount + (hasMed ? 1 : 0)) / 10) * 100);
  }, [
    name,
    phone,
    dob,
    age,
    gender,
    bloodGroup,
    ecName,
    ecPhone,
    ecRelationship,
    allergies,
    medications,
    chronicConditions,
  ]);

  useEffect(() => {
    Animated.timing(progressAnim, {
      toValue: completionPercentage,
      duration: 650,
      useNativeDriver: false,
    }).start();
  }, [completionPercentage, progressAnim]);

  const clearForm = useCallback(() => {
    setName('');
    setPhone('');
    setDob('');
    setAge('');
    setGender('');
    setBloodGroup('');
    setAddress('');
    setEcName('');
    setEcPhone('');
    setEcRelationship('');
    setAllergies('');
    setMedications('');
    setChronicConditions('');
    setLocalImageUri(null);
    setLocalImageFile(null);
  }, []);

  const applyUserToForm = useCallback(
    (profile) => {
      if (!profile) {
        clearForm();
        return;
      }
      setName(profile.name || '');
      setPhone(profile.phone || '');
      setDob(profile.dob ? new Date(profile.dob).toISOString().slice(0, 10) : '');
      setAge(profile.age != null && profile.age !== '' ? String(profile.age) : '');
      setGender(profile.gender || '');
      setBloodGroup(profile.bloodGroup || '');
      setAddress(profile.address || '');
      setEcName(profile.emergencyContact?.name || '');
      setEcPhone(profile.emergencyContact?.phone || '');
      setEcRelationship(profile.emergencyContact?.relationship || '');
      setAllergies(profile.medicalHistory?.allergies || '');
      setMedications(profile.medicalHistory?.currentMedications || '');
      setChronicConditions(profile.medicalHistory?.chronicConditions || '');
    },
    [clearForm]
  );

  const loadProfile = useCallback(async () => {
    if (!isAuthenticated) {
      clearForm();
      setBooting(false);
      return;
    }
    try {
      const res = await patientApi.getProfile();
      const profile = pickPatientFromResponse(res);
      if (profile) {
        updateUserData(profile);
        applyUserToForm(profile);
      } else {
        applyUserToForm(user);
      }
    } catch (err) {
      console.warn('Load profile warning:', err?.message || err);
      applyUserToForm(user);
    } finally {
      setBooting(false);
    }
  }, [applyUserToForm, updateUserData, user, isAuthenticated, clearForm]);

  useEffect(() => {
    loadProfile();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated) clearForm();
  }, [isAuthenticated, clearForm]);

  const handleDobChange = (_event, selectedDate) => {
    if (Platform.OS === 'android') setShowDobPicker(false);
    if (_event?.type === 'dismissed') return;
    if (!selectedDate) return;
    const iso = selectedDate.toISOString().slice(0, 10);
    setDob(iso);
    const calculated = calculateAgeFromDob(iso);
    if (calculated !== '') setAge(calculated);
  };

  const handleSelectImage = async () => {
    try {
      const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permissionResult.granted) {
        showPopup({
          variant: 'warning',
          title: 'Permission needed',
          message:
            'Allow photo library access so you can update your profile picture.',
          primaryLabel: 'OK',
        });
        return;
      }
      const pickerResult = await ImagePicker.launchImageLibraryAsync({
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });
      if (pickerResult.canceled || !pickerResult.assets?.length) return;
      const selectedAsset = pickerResult.assets[0];
      setLocalImageUri(selectedAsset.uri);
      setLocalImageFile(selectedAsset);
    } catch (err) {
      console.error('Image selection error:', err);
      showPopup({
        variant: 'error',
        title: 'Couldn’t select image',
        message: 'Something went wrong while picking your photo. Please try again.',
        primaryLabel: 'OK',
      });
    }
  };

  const handleUpdate = async () => {
    if (!name.trim() || !phone.trim() || !age.trim()) {
      showPopup({
        variant: 'warning',
        title: 'Required fields',
        message: 'Please fill in Name, Phone, and Age before saving.',
        primaryLabel: 'OK',
      });
      return;
    }
    const ageNum = parseInt(age, 10);
    if (Number.isNaN(ageNum) || ageNum < 0 || ageNum > 120) {
      showPopup({
        variant: 'warning',
        title: 'Invalid age',
        message: 'Enter a valid age between 0 and 120.',
        primaryLabel: 'OK',
      });
      return;
    }

    setLoading(true);
    try {
      let updatedUser = null;
      if (localImageUri && localImageFile) {
        const formData = new FormData();
        formData.append('profileImage', {
          uri: localImageUri,
          name: localImageFile.fileName || 'profile.jpg',
          type: localImageFile.mimeType || 'image/jpeg',
        });
        const avatarRes = await patientApi.updateAvatar(formData);
        updatedUser = pickPatientFromResponse(avatarRes) || updatedUser;
      }

      const payload = {
        name: name.trim(),
        phone: phone.trim(),
        age: ageNum,
        address: address.trim(),
        emergencyContact: {
          name: ecName.trim(),
          phone: ecPhone.trim(),
          relationship: ecRelationship || '',
        },
        medicalHistory: {
          allergies: allergies.trim(),
          currentMedications: medications.trim(),
          chronicConditions: chronicConditions.trim(),
        },
      };
      if (dob) payload.dob = dob;
      if (gender) payload.gender = gender;
      if (bloodGroup) payload.bloodGroup = bloodGroup;

      const res = await patientApi.updateProfile(payload);
      updatedUser = pickPatientFromResponse(res) || updatedUser;
      try {
        const fresh = pickPatientFromResponse(await patientApi.getProfile());
        if (fresh) updatedUser = fresh;
      } catch {
        // keep updatedUser
      }
      if (!updatedUser) throw new Error('Server did not return updated profile.');

      updateUserData(updatedUser);
      applyUserToForm(updatedUser);
      setLocalImageUri(null);
      setLocalImageFile(null);
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setOpenSection(null);
      showPopup({
        variant: 'success',
        title: 'Profile updated',
        message: 'Your details were saved successfully.',
        primaryLabel: 'Done',
      });
    } catch (err) {
      console.error('Update profile error:', err);
      const msg =
        err.response?.data?.message ||
        err.response?.data?.errors?.[0]?.msg ||
        err.message ||
        'Failed to update profile.';
      showPopup({
        variant: 'error',
        title: 'Update failed',
        message: msg,
        primaryLabel: 'Try again',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    showPopup({
      variant: 'danger',
      title: 'Log out?',
      message: 'You’ll need to sign in again to manage appointments and profile.',
      primaryLabel: 'Yes, logout',
      secondaryLabel: 'Cancel',
      onPrimary: async () => {
        closePopup();
        clearForm();
        await logout();
        navigation.navigate('Main', { screen: 'Home' });
      },
      onSecondary: closePopup,
    });
  };

  if (booting && isAuthenticated) {
    return <LoadingSpinner message="Loading profile..." />;
  }

  if (!isAuthenticated) {
    return (
      <ProfileThemeContext.Provider value={palette}>
        <View style={[styles.container, { backgroundColor: palette.bg }]}>
          <StatusBar barStyle="light-content" backgroundColor={palette.headerTop} />

          <LinearGradient
            colors={[palette.headerTop, palette.headerMid, palette.headerBottom]}
            locations={[0, 0.55, 1]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[styles.heroHeader, styles.guestHeroHeader, { paddingTop: insets.top + 8 }]}
          >
            <MedicalCross />
            <View style={styles.heroGlow} />

            <View style={styles.heroTopRow}>
              <HeaderBackButton fallbackRoute="Home" />
              <HeaderBackSpacer />
            </View>

            <View style={styles.heroProfileRow}>
              <View style={styles.heroAvatarRing}>
                <View style={[styles.heroAvatarFallback, { backgroundColor: palette.fieldIconBg }]}>
                  <Ionicons name="person" size={38} color="#94A3B8" />
                </View>
              </View>
              <View style={styles.heroCopy}>
                <Text style={styles.heroName}>Guest</Text>
                <Text style={styles.heroPhone}>Sign in to access your profile</Text>
              </View>
            </View>
          </LinearGradient>

          <View style={[styles.sheet, { backgroundColor: palette.sheet }]}>
            <LinearGradient
              pointerEvents="none"
              colors={palette.sheetGradient}
              locations={isDark ? [0, 0.5, 1] : [0, 0.32, 0.68, 1]}
              start={{ x: 0.1, y: 0 }}
              end={{ x: 0.9, y: 1 }}
              style={StyleSheet.absoluteFillObject}
            />
            <ScrollView
              contentContainerStyle={[
                styles.guestSheetContent,
                { paddingBottom: getTabBarScrollPadding(insets.bottom) + 28 },
              ]}
              showsVerticalScrollIndicator={false}
            >
              <LinearGradient
                colors={palette.guestCardGradient}
                locations={[0, 0.5, 1]}
                style={[styles.guestCard, { borderColor: palette.cardBorder }]}
              >
                <View style={[styles.guestCardIcon, { backgroundColor: palette.personalIconBg }]}>
                  <User color={palette.accent} size={34} />
                </View>
                <Text style={[styles.guestCardTitle, { color: palette.text }]}>
                  Log in to create your profile
                </Text>
                <Text style={[styles.guestCardSub, { color: palette.textSecondary }]}>
                  Sign in to access your appointments, medical records, and account settings.
                </Text>

                <View style={{ width: '100%', marginTop: 6 }}>
                  <CustomButton title="Login" onPress={() => navigation.navigate('WebsiteLogin')} />
                </View>
              </LinearGradient>

              <FooterDecor />
            </ScrollView>
          </View>
        </View>
      </ProfileThemeContext.Provider>
    );
  }

  const dobDate = dob ? new Date(dob) : new Date(1995, 0, 1);
  const displayName = user?.name || name || 'Patient Name';
  const displayPhone = formatPhoneDisplay(phone || user?.phone);
  const avatarUri = localImageUri || user?.profileImage || null;
  const progressWidth = progressAnim.interpolate({
    inputRange: [0, 100],
    outputRange: ['0%', '100%'],
    extrapolate: 'clamp',
  });

  const scrollToForm = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setOpenSection('personal');
    setTimeout(() => scrollRef.current?.scrollTo?.({ y: 0, animated: true }), 60);
  };

  const renderCard = ({
    id,
    title,
    subtitle,
    iconBg,
    icon,
    titleColor,
    chevronColor,
    body,
  }) => {
    const open = openSection === id;
    return (
      <View style={[styles.menuCard, { backgroundColor: palette.card, borderColor: palette.cardBorder }]}>
        <ScalePress onPress={() => (id === 'logout' ? handleLogout() : toggleSection(id))}>
          <View style={styles.menuRow}>
            <View style={[styles.menuIconWrap, { backgroundColor: iconBg }]}>{icon}</View>
            <View style={styles.menuCopy}>
              <Text style={[styles.menuTitle, { color: titleColor || palette.text }]}>
                {title}
              </Text>
              <Text style={[styles.menuSub, { color: palette.textSecondary }]}>{subtitle}</Text>
            </View>
            <Ionicons
              name={id !== 'logout' && open ? 'chevron-up' : 'chevron-forward'}
              size={18}
              color={chevronColor || palette.textSecondary}
            />
          </View>
        </ScalePress>
        {open && body ? (
          <View style={[styles.menuBody, { borderTopColor: palette.cardBorder }]}>{body}</View>
        ) : null}
      </View>
    );
  };

  return (
    <ProfileThemeContext.Provider value={palette}>
      <View style={[styles.container, { backgroundColor: palette.bg }]}>
        <StatusBar barStyle="light-content" backgroundColor={palette.headerTop} />

        <LinearGradient
          colors={[palette.headerTop, palette.headerMid, palette.headerBottom]}
          locations={[0, 0.55, 1]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.heroHeader, { paddingTop: insets.top + 8 }]}
        >
        <MedicalCross />
        <View style={styles.heroGlow} />

        <View style={styles.heroTopRow}>
          <HeaderBackButton fallbackRoute="Home" />
          <TouchableOpacity
            style={headerBackStyles.gradient}
            onPress={() => navigation.navigate('SettingsPage')}
            activeOpacity={0.85}
          >
            <Ionicons name="settings-outline" size={20} color="#FFFFFF" />
          </TouchableOpacity>
        </View>

        <View style={styles.heroProfileRow}>
          <TouchableOpacity
            style={styles.heroAvatarRing}
            onPress={handleSelectImage}
            activeOpacity={0.88}
          >
            {avatarUri ? (
              <Image source={{ uri: avatarUri }} style={styles.heroAvatarImage} />
            ) : (
              <View style={[styles.heroAvatarFallback, { backgroundColor: palette.fieldIconBg }]}>
                <Ionicons name="person" size={38} color="#94A3B8" />
              </View>
            )}
          </TouchableOpacity>

          <View style={styles.heroCopy}>
            <Text style={styles.heroName} numberOfLines={1}>
              {displayName}
            </Text>
            <Text style={styles.heroPhone} numberOfLines={1}>
              {displayPhone}
            </Text>
            <TouchableOpacity
              style={styles.editProfileBtn}
              onPress={scrollToForm}
              activeOpacity={0.9}
            >
              <Ionicons name="pencil" size={14} color={palette.accent} />
              <Text style={[styles.editProfileBtnText, { color: palette.accent }]}>Edit Profile</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.completionBlock}>
          <Text style={styles.completionLabel}>
            Profile {completionPercentage}% Complete
          </Text>
          <View style={styles.completionRow}>
            <View style={styles.completionTrack}>
              <Animated.View style={[styles.completionFill, { width: progressWidth }]} />
            </View>
            <Text style={styles.completionPct}>{completionPercentage}%</Text>
          </View>
        </View>
      </LinearGradient>

      <View style={[styles.sheet, { backgroundColor: palette.sheet }]}>
        <LinearGradient
          pointerEvents="none"
          colors={palette.sheetGradient}
          locations={isDark ? [0, 0.5, 1] : [0, 0.32, 0.68, 1]}
          start={{ x: 0.1, y: 0 }}
          end={{ x: 0.9, y: 1 }}
          style={StyleSheet.absoluteFillObject}
        />
        <ScrollView
          ref={scrollRef}
          style={styles.scroll}
          contentContainerStyle={[
            styles.scrollContent,
            { paddingBottom: getTabBarScrollPadding(insets.bottom) + 28 },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {renderCard({
            id: 'personal',
            title: 'Personal Information',
            subtitle: 'View and update your personal details',
            iconBg: palette.personalIconBg,
            icon: <Ionicons name="person-outline" size={26} color={palette.accent} />,
            body: (
              <>
                <ProfileField
                  label="Full Name"
                  required
                  value={name}
                  onChangeText={setName}
                  placeholder="Enter full name"
                  icon={User}
                />
                <ProfileField
                  label="Email (Read-only)"
                  value={user?.email || ''}
                  onChangeText={() => {}}
                  icon={Mail}
                  editable={false}
                />
                <ProfileField
                  label="Phone Number"
                  required
                  value={phone}
                  onChangeText={setPhone}
                  placeholder="Enter phone number"
                  icon={Phone}
                  keyboardType="phone-pad"
                />
                <ProfileField
                  label="Date of Birth"
                  required
                  value={dob ? formatDobDisplay(dob) : ''}
                  placeholder="Select date of birth"
                  icon={Calendar}
                  onPress={() => setShowDobPicker(true)}
                  right={
                    <Ionicons
                      name="calendar-outline"
                      size={18}
                      color={palette.accent}
                      style={{ marginRight: 4 }}
                    />
                  }
                />
                {Platform.OS === 'ios' ? (
                  <DatePickerModal
                    visible={showDobPicker}
                    selectedDate={dob}
                    minDate={new Date(1900, 0, 1)}
                    maxDate={new Date()}
                    onClose={() => setShowDobPicker(false)}
                    onSelect={(ymd) => {
                      setDob(ymd);
                      const calculated = calculateAgeFromDob(ymd);
                      if (calculated !== '') setAge(calculated);
                    }}
                  />
                ) : showDobPicker ? (
                  <DateTimePicker
                    value={Number.isNaN(dobDate.getTime()) ? new Date(1995, 0, 1) : dobDate}
                    mode="date"
                    display="default"
                    maximumDate={new Date()}
                    onChange={handleDobChange}
                  />
                ) : null}
                <GenderSelect value={gender} onChange={setGender} />
                <ChipScroll
                  label="Blood Group"
                  options={BLOOD_GROUPS}
                  value={bloodGroup}
                  onChange={setBloodGroup}
                />
                <ProfileField
                  label="Age"
                  required
                  value={age}
                  onChangeText={setAge}
                  placeholder="e.g. 30"
                  icon={AgeIcon}
                  keyboardType="number-pad"
                  right={<Text style={[styles.yearsSuffix, { color: palette.accent }]}>Years</Text>}
                />
                <ProfileField
                  label="Address"
                  value={address}
                  onChangeText={setAddress}
                  placeholder="Enter address"
                  icon={MapPin}
                />
                <SaveButton onPress={handleUpdate} loading={loading} />
              </>
            ),
          })}

          {renderCard({
            id: 'emergency',
            title: 'Emergency Contact',
            subtitle: 'Manage your emergency contacts',
            iconBg: palette.emergencyIconBg,
            icon: <Ionicons name="people-outline" size={26} color={palette.emergency} />,
            body: (
              <>
                <ProfileField
                  label="Full Name"
                  value={ecName}
                  onChangeText={setEcName}
                  placeholder="Enter contact name"
                  icon={User}
                />
                <ProfileField
                  label="Phone Number"
                  value={ecPhone}
                  onChangeText={setEcPhone}
                  placeholder="Enter phone number"
                  icon={Phone}
                  keyboardType="phone-pad"
                />
                <ChipScroll
                  label="Relationship"
                  options={RELATIONSHIPS}
                  value={ecRelationship}
                  onChange={setEcRelationship}
                />
                <SaveButton onPress={handleUpdate} loading={loading} />
              </>
            ),
          })}

          {renderCard({
            id: 'medical',
            title: 'Medical Information',
            subtitle: 'Update your medical history',
            iconBg: palette.medicalIconBg,
            icon: <Heart color={palette.medical} size={24} />,
            body: (
              <>
                <ProfileField
                  label="Allergies"
                  value={allergies}
                  onChangeText={setAllergies}
                  placeholder="Enter allergies"
                  icon={AllergiesIcon}
                  multiline
                  numberOfLines={3}
                />
                <ProfileField
                  label="Current Medications"
                  value={medications}
                  onChangeText={setMedications}
                  placeholder="Enter current medications"
                  icon={MedicationsIcon}
                  multiline
                  numberOfLines={3}
                />
                <ProfileField
                  label="Chronic Conditions"
                  value={chronicConditions}
                  onChangeText={setChronicConditions}
                  placeholder="Enter chronic conditions"
                  icon={ConditionsIcon}
                  multiline
                  numberOfLines={3}
                />
                <SaveButton onPress={handleUpdate} loading={loading} />
              </>
            ),
          })}

          {renderCard({
            id: 'logout',
            title: 'Logout',
            subtitle: 'Sign out from your account',
            iconBg: palette.logoutIconBg,
            icon: <LogOut color={palette.logout} size={24} />,
            titleColor: palette.logout,
            chevronColor: palette.logout,
          })}

          <FooterDecor />
        </ScrollView>
      </View>

      <AppDialog
        visible={popup.visible}
        onClose={closePopup}
        variant={popup.variant || 'info'}
        icon={popup.icon}
        title={popup.title}
        message={popup.message}
        details={popup.details}
        primaryLabel={popup.primaryLabel}
        onPrimary={popup.onPrimary || closePopup}
        secondaryLabel={popup.secondaryLabel}
        onSecondary={popup.onSecondary || closePopup}
      />
      </View>
    </ProfileThemeContext.Provider>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  heroHeader: {
    paddingHorizontal: 24,
    paddingBottom: 36,
    minHeight: SCREEN_H * 0.34,
    overflow: 'hidden',
  },
  medicalCross: {
    position: 'absolute',
    top: SCREEN_H * 0.1,
    alignSelf: 'center',
    left: SCREEN_W / 2 - 55,
    width: 110,
    height: 110,
    opacity: 0.08,
    alignItems: 'center',
    justifyContent: 'center',
  },
  crossBarV: {
    position: 'absolute',
    width: 34,
    height: 110,
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
  },
  crossBarH: {
    position: 'absolute',
    width: 110,
    height: 34,
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
  },
  heroGlow: {
    position: 'absolute',
    top: -40,
    right: -30,
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: 'rgba(255,255,255,0.07)',
  },
  heroTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
    zIndex: 2,
  },
  heroProfileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    zIndex: 2,
  },
  heroAvatarRing: {
    width: 88,
    height: 88,
    borderRadius: 44,
    borderWidth: 4,
    borderColor: '#FFFFFF',
    backgroundColor: '#FFFFFF',
    overflow: 'hidden',
    marginRight: 16,
  },
  heroAvatarImage: {
    width: '100%',
    height: '100%',
  },
  heroAvatarFallback: {
    flex: 1,
    backgroundColor: '#EEF2FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroCopy: {
    flex: 1,
    minWidth: 0,
  },
  heroName: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.3,
    textTransform: 'uppercase',
  },
  heroPhone: {
    color: 'rgba(255,255,255,0.92)',
    fontSize: 14,
    fontWeight: '500',
    marginTop: 4,
  },
  editProfileBtn: {
    alignSelf: 'flex-start',
    marginTop: 12,
    backgroundColor: '#FFFFFF',
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 9,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    shadowColor: '#0033A0',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.16,
    shadowRadius: 10,
    elevation: 3,
  },
  editProfileBtnText: {
    color: PROFILE.accent,
    fontSize: 13,
    fontWeight: '700',
  },
  completionBlock: {
    marginTop: 20,
    zIndex: 2,
  },
  completionLabel: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 8,
  },
  completionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  completionTrack: {
    flex: 1,
    height: 7,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.28)',
    overflow: 'hidden',
  },
  completionFill: {
    height: '100%',
    borderRadius: 999,
    backgroundColor: '#FFFFFF',
  },
  completionPct: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
    minWidth: 34,
    textAlign: 'right',
  },
  sheet: {
    flex: 1,
    marginTop: -12,
    backgroundColor: PROFILE.sheet,
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
    overflow: 'hidden',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 22,
    gap: 14,
  },
  menuCard: {
    backgroundColor: PROFILE.card,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: PROFILE.cardBorder,
    shadowColor: '#173D82',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.08,
    shadowRadius: 18,
    elevation: 5,
  },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 16,
  },
  menuIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  menuCopy: {
    flex: 1,
    minWidth: 0,
    marginRight: 8,
  },
  menuTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: PROFILE.text,
    letterSpacing: -0.2,
  },
  menuSub: {
    marginTop: 3,
    fontSize: 12,
    fontWeight: '500',
    color: PROFILE.textSecondary,
    lineHeight: 17,
  },
  menuBody: {
    borderTopWidth: 1,
    borderTopColor: PROFILE.cardBorder,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 18,
  },
  footerDecor: {
    marginTop: 28,
    marginBottom: 8,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    height: 100,
  },
  shieldWrap: {
    width: 80,
    height: 80,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shieldPlus: {
    position: 'absolute',
    color: 'rgba(255,255,255,0.95)',
    fontSize: 28,
    fontWeight: '700',
    top: 22,
  },
  leafL: {
    marginRight: 8,
    transform: [{ rotate: '-25deg' }],
  },
  leafR: {
    marginLeft: 8,
    transform: [{ scaleX: -1 }, { rotate: '-25deg' }],
  },
  piField: { marginBottom: 14 },
  piLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: PROFILE.text,
    marginBottom: 8,
  },
  piRequired: { color: '#EF4444', fontWeight: '800' },
  piInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: PROFILE.fieldBorder,
    borderRadius: 14,
    paddingVertical: 6,
    paddingLeft: 6,
    paddingRight: 12,
    minHeight: 52,
    backgroundColor: PROFILE.fieldBg,
  },
  piInputRowDisabled: { backgroundColor: '#F3F6FF' },
  piInputRowMultiline: {
    alignItems: 'flex-start',
    minHeight: 96,
    paddingTop: 8,
    paddingBottom: 10,
  },
  piIconBox: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
    backgroundColor: PROFILE.fieldIconBg,
  },
  piIconBoxTop: { marginTop: 2 },
  piTextInput: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    color: PROFILE.text,
    paddingVertical: 8,
  },
  piTextInputMultiline: {
    minHeight: 72,
    paddingTop: 10,
    paddingBottom: 8,
  },
  piInputText: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    color: PROFILE.text,
    paddingVertical: 8,
  },
  piPlaceholder: {
    color: PROFILE.textSecondary,
    fontWeight: '500',
  },
  yearsSuffix: {
    fontSize: 12,
    fontWeight: '700',
    marginLeft: 8,
    color: PROFILE.accent,
  },
  genderRow: { flexDirection: 'row', gap: 8 },
  genderChip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 1.5,
    borderColor: PROFILE.fieldBorder,
    borderRadius: 14,
    paddingVertical: 12,
    backgroundColor: PROFILE.fieldBg,
  },
  genderChipSelected: {
    borderColor: PROFILE.accent,
    backgroundColor: '#F0F5FF',
  },
  genderChipText: {
    fontSize: 12,
    fontWeight: '700',
    color: PROFILE.textSecondary,
  },
  genderChipTextSelected: { color: PROFILE.accent },
  bloodScrollContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 4,
    paddingRight: 8,
  },
  bloodChip: {
    minWidth: 56,
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: PROFILE.fieldBorder,
    borderRadius: 14,
    paddingVertical: 12,
    position: 'relative',
    marginTop: 4,
    backgroundColor: PROFILE.fieldBg,
  },
  bloodChipSelected: {
    borderColor: PROFILE.accent,
    backgroundColor: '#F0F5FF',
  },
  bloodChipText: {
    fontSize: 12,
    fontWeight: '700',
    color: PROFILE.textSecondary,
  },
  bloodChipTextSelected: { color: PROFILE.accent },
  bloodCheck: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#FFFFFF',
    backgroundColor: PROFILE.accent,
  },
  piSaveBtn: {
    marginTop: 6,
    borderRadius: 16,
    paddingVertical: 15,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: PROFILE.accent,
    shadowColor: '#173D82',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.16,
    shadowRadius: 12,
    elevation: 4,
  },
  piSaveBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  dobDone: {
    alignSelf: 'flex-end',
    paddingVertical: 8,
    marginBottom: 8,
  },
  dobDoneText: {
    color: PROFILE.accent,
    fontSize: 14,
    fontWeight: '700',
  },
  guestHeroHeader: {
    minHeight: SCREEN_H * 0.28,
    paddingBottom: 28,
  },
  guestSheetContent: {
    paddingHorizontal: 20,
    paddingTop: 22,
    gap: 14,
  },
  guestCard: {
    borderRadius: 24,
    borderWidth: 1,
    borderColor: PROFILE.cardBorder,
    paddingHorizontal: 24,
    paddingVertical: 32,
    alignItems: 'center',
    shadowColor: '#173D82',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.08,
    shadowRadius: 18,
    elevation: 5,
  },
  guestCardIcon: {
    width: 76,
    height: 76,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    shadowColor: '#124E96',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 2,
  },
  guestCardTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: PROFILE.text,
    textAlign: 'center',
    marginBottom: 8,
    letterSpacing: -0.3,
  },
  guestCardSub: {
    fontSize: 14,
    fontWeight: '500',
    color: PROFILE.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 18,
  },
  guestFeatureList: {
    width: '100%',
    gap: 10,
    marginBottom: 20,
  },
  guestFeatureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: 'rgba(255,255,255,0.72)',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: PROFILE.cardBorder,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  guestFeatureIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: PROFILE.personalIconBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  guestFeatureText: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    color: PROFILE.text,
  },
});
