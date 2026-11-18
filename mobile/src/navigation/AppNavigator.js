import React, { useRef } from "react";
import {
  Platform,
  View,
  Text,
  StyleSheet,
  Animated,
  Pressable,
} from "react-native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { createBottomTabNavigator, BottomTabBar } from "@react-navigation/bottom-tabs";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { useAppTheme } from "../context/SettingsContext";

import { WebsiteLoginScreen } from "../screens/Auth/WebsiteLoginScreen";
import { RegisterScreen } from "../screens/Auth/RegisterScreen";

import { HomeScreen } from "../screens/Dashboard/HomeScreen";
import { AppointmentsScreen } from "../screens/Appointments/AppointmentsScreen";
import { BookAppointmentScreen } from "../screens/Booking/BookAppointmentScreen";
import { SelectDoctorScreen } from "../screens/Booking/SelectDoctorScreen";
import { MedicalRecordsScreen } from "../screens/Records/MedicalRecordsScreen";
import { OnlinePaymentsScreen } from "../screens/Records/OnlinePaymentsScreen";
import { MedicalHistoryScreen } from "../screens/Records/MedicalHistoryScreen";
import { DocumentsScreen } from "../screens/Records/DocumentsScreen";
import { ProfileScreen } from "../screens/Profile/ProfileScreen";
import { DoctorDetailsScreen } from "../screens/Doctors/DoctorDetailsScreen";
import { SettingsScreen } from "../screens/Settings/SettingsScreen";
import { ChangePasswordScreen } from "../screens/Settings/ChangePasswordScreen";
import { PrivacyPolicyScreen } from "../screens/Settings/PrivacyPolicyScreen";

import {
  Home,
  Calendar,
  Plus,
  FileText,
  Settings,
} from "lucide-react-native";

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

const FAB_SIZE = 60;
const FAB_LIFT = 36;



/** Clean labeled side tab — icon + caption, soft press. */
const SoftTabButton = ({
  Icon,
  label,
  onPress,
  onLongPress,
  accessibilityState,
  accessibilityLabel,
  style,
}) => {
  const { isDark } = useAppTheme();
  const focused = !!accessibilityState?.selected;
  const scale = useRef(new Animated.Value(1)).current;

  const bump = (to) => {
    Animated.spring(scale, {
      toValue: to,
      useNativeDriver: true,
      friction: 6,
      tension: 220,
    }).start();
  };

  const active = "#124E96";
  const idle = isDark ? "#8B93A7" : "#9AA6B8";

  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      onPressIn={() => bump(0.92)}
      onPressOut={() => bump(1)}
      accessibilityRole="button"
      accessibilityState={accessibilityState}
      accessibilityLabel={accessibilityLabel || label}
      style={[styles.tabBtnHit, style]}
    >
      <Animated.View style={[styles.tabItem, { transform: [{ scale }] }]}>
        <View
          style={[
            styles.tabIconWell,
            focused && {
              backgroundColor: isDark
                ? "rgba(18,78,150,0.25)"
                : "rgba(18,78,150,0.09)",
            },
          ]}
        >
          <Icon
            color={focused ? active : idle}
            size={21}
            strokeWidth={focused ? 2.4 : 2}
          />
        </View>
        <Text
          style={[
            styles.tabLabel,
            { color: focused ? active : idle },
            focused && styles.tabLabelActive,
          ]}
          numberOfLines={1}
        >
          {label}
        </Text>
      </Animated.View>
    </Pressable>
  );
};

/** Floating Book (+) — simple gradient circle. */
const BookTabButton = ({ onPress, onLongPress, accessibilityState, style }) => {
  const { isDark } = useAppTheme();
  const focused = !!accessibilityState?.selected;
  const scale = useRef(new Animated.Value(1)).current;

  const bump = (to) => {
    Animated.spring(scale, {
      toValue: to,
      useNativeDriver: true,
      friction: 5,
      tension: 200,
    }).start();
  };

  const active = "#124E96";
  const idle = isDark ? "#8B93A7" : "#9AA6B8";

  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      onPressIn={() => bump(0.9)}
      onPressOut={() => bump(1)}
      accessibilityRole="button"
      accessibilityState={accessibilityState}
      accessibilityLabel="Book"
      style={[styles.tabBtnHit, style, { position: "relative" }]}
    >
      <Animated.View style={[styles.tabItem, { transform: [{ scale }] }]}>
        {/* Placeholder of identical size to tabIconWell so the text aligns perfectly */}
        <View style={{ width: 40, height: 28 }} />
        <Text
          style={[
            styles.tabLabel,
            { color: focused ? active : idle },
            focused && styles.tabLabelActive,
          ]}
          numberOfLines={1}
        >
          Book
        </Text>
      </Animated.View>

      <Animated.View
        style={[
          styles.bookFabOuter,
          focused && styles.bookFabFocused,
          {
            position: "absolute",
            marginTop: 0,
            top: -30,
            alignSelf: "center",
            transform: [{ scale }],
          },
        ]}
      >
        <LinearGradient
          colors={["#124E96", "#06ADC6"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.bookFabFill}
        >
          <Plus color="#ffffff" size={28} strokeWidth={2.5} />
        </LinearGradient>
      </Animated.View>
    </Pressable>
  );
};

/** Flat white curved footer — root uses page wash so curved corners don't show gaps. */
const PAGE_WASH = "#F2F8FB";

const AppTabBar = (props) => {
  const { colors, isDark } = useAppTheme();
  const barBg = isDark ? colors.tabBarBackground : "#FFFFFF";
  const behindBarBg = isDark ? colors.background : PAGE_WASH;

  return (
    <View style={[styles.tabBarRoot, { backgroundColor: behindBarBg }]}>
      <View
        style={[
          styles.tabBarShell,
          {
            backgroundColor: barBg,
            borderTopColor: isDark ? colors.cardBorder : "rgba(5,59,116,0.08)",
            shadowColor: isDark ? "#000" : "#0A2540",
          },
        ]}
      >
        <BottomTabBar {...props} />
      </View>
    </View>
  );
};

const MainTabNavigator = () => {
  const { colors, isDark } = useAppTheme();
  const insets = useSafeAreaInsets();

  // Dynamically calculate bottom padding based on the device's safe area bottom inset.
  // If the device has a bottom inset (like notch/gesture area on iOS or Android), use it directly.
  // Otherwise, use a default minimal pad (6 for iOS, 2 for Android) to rest beautifully above screen edge.
  const bottomPad = insets.bottom > 0 ? insets.bottom : (Platform.OS === "ios" ? 6 : 2);
  const tabBarHeight = 64 + bottomPad;
  const inactiveColor = isDark ? colors.textMuted : "#6B7A99";
  const sceneBg = isDark ? colors.background : PAGE_WASH;

  return (
    <Tab.Navigator
      tabBar={(props) => <AppTabBar {...props} />}
      sceneContainerStyle={{ backgroundColor: sceneBg }}
      screenOptions={{
        headerShown: false,
        tabBarHideOnKeyboard: true,
        tabBarShowLabel: false,
        safeAreaInsets: { bottom: 0 },
        tabBarStyle: {
          backgroundColor: "transparent",
          borderTopWidth: 0,
          height: tabBarHeight,
          paddingBottom: bottomPad,
          paddingTop: 6,
          elevation: 0,
          shadowOpacity: 0,
          overflow: "visible",
        },
        tabBarActiveTintColor: "#124E96",
        tabBarInactiveTintColor: inactiveColor,
        tabBarItemStyle: {
          paddingTop: 0,
          justifyContent: "center",
        },
      }}
    >
      <Tab.Screen
        name="Home"
        component={HomeScreen}
        options={{
          tabBarAccessibilityLabel: "Home",
          tabBarIcon: () => null,
          tabBarButton: (props) => (
            <SoftTabButton {...props} Icon={Home} label="Home" />
          ),
        }}
      />
      <Tab.Screen
        name="Appointments"
        component={AppointmentsScreen}
        options={{
          tabBarAccessibilityLabel: "Appointments",
          tabBarIcon: () => null,
          tabBarButton: (props) => (
            <SoftTabButton {...props} Icon={Calendar} label="Visits" />
          ),
        }}
      />
      <Tab.Screen
        name="SelectDoctor"
        component={SelectDoctorScreen}
        options={{
          tabBarAccessibilityLabel: "Book",
          tabBarIcon: () => null,
          tabBarButton: (props) => <BookTabButton {...props} />,
        }}
      />
      <Tab.Screen
        name="Records"
        component={OnlinePaymentsScreen}
        options={{
          tabBarAccessibilityLabel: "Online Payments",
          tabBarIcon: () => null,
          tabBarButton: (props) => (
            <SoftTabButton {...props} Icon={FileText} label="Records" />
          ),
        }}
      />
      <Tab.Screen
        name="Settings"
        component={SettingsScreen}
        options={{
          tabBarAccessibilityLabel: "Settings",
          tabBarIcon: () => null,
          tabBarButton: (props) => (
            <SoftTabButton {...props} Icon={Settings} label="Settings" />
          ),
        }}
      />
    </Tab.Navigator>
  );
};

const styles = StyleSheet.create({
  tabBarRoot: {
    overflow: "visible",
  },
  tabBarShell: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    overflow: "visible",
    borderTopWidth: StyleSheet.hairlineWidth,
    elevation: 14,
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
  },
  tabBtnHit: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  tabItem: {
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
  },
  tabIconWell: {
    width: 40,
    height: 28,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  tabLabel: {
    fontSize: 10,
    fontWeight: "500",
    letterSpacing: 0.1,
  },
  tabLabelActive: {
    fontWeight: "700",
  },
  bookTabWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    overflow: "visible",
  },
  bookFabOuter: {
    width: FAB_SIZE,
    height: FAB_SIZE,
    borderRadius: FAB_SIZE / 2,
    marginTop: -FAB_LIFT,
    padding: 3,
    backgroundColor: "#FFFFFF",
    elevation: 10,
    shadowColor: "#124E96",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.28,
    shadowRadius: 10,
  },
  bookFabFocused: {
    shadowOpacity: 0.36,
  },
  bookFabFill: {
    flex: 1,
    width: "100%",
    borderRadius: (FAB_SIZE - 6) / 2,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
});

export const AppNavigator = () => {
  return (
    <Stack.Navigator
      initialRouteName="Main"
      screenOptions={{ headerShown: false }}
    >
      <Stack.Screen name="Main" component={MainTabNavigator} />
      <Stack.Screen
        name="BookAppointment"
        component={BookAppointmentScreen}
        options={{ animation: "slide_from_right" }}
      />
      <Stack.Screen
        name="DoctorDetails"
        component={DoctorDetailsScreen}
        options={{ animation: "slide_from_right" }}
      />
      <Stack.Screen
        name="Profile"
        component={ProfileScreen}
        options={{ animation: "slide_from_right" }}
      />
      <Stack.Screen
        name="SettingsPage"
        component={SettingsScreen}
        options={{ animation: "slide_from_right" }}
      />
      <Stack.Screen
        name="ChangePassword"
        component={ChangePasswordScreen}
        options={{ animation: "slide_from_right" }}
      />
      <Stack.Screen
        name="PrivacyPolicy"
        component={PrivacyPolicyScreen}
        options={{ animation: "slide_from_right" }}
      />
      <Stack.Screen
        name="OnlinePayments"
        component={OnlinePaymentsScreen}
        options={{ animation: "slide_from_right" }}
      />
      <Stack.Screen
        name="MedicalHistory"
        component={MedicalHistoryScreen}
        options={{ animation: "slide_from_right" }}
      />
      <Stack.Screen
        name="Documents"
        component={DocumentsScreen}
        options={{ animation: "slide_from_right" }}
      />
      <Stack.Screen
        name="WebsiteLogin"
        component={WebsiteLoginScreen}
        options={{ animation: "slide_from_bottom", presentation: "modal" }}
      />
      <Stack.Screen
        name="Login"
        component={WebsiteLoginScreen}
        options={{ animation: "slide_from_bottom", presentation: "modal" }}
      />
      <Stack.Screen
        name="Register"
        component={RegisterScreen}
        options={{ animation: "slide_from_bottom", presentation: "modal" }}
      />
    </Stack.Navigator>
  );
};
