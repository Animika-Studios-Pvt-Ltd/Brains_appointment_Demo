import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  Animated,
  ScrollView,
  Pressable,
  useWindowDimensions,
  Platform,
} from 'react-native';
import {
  GestureHandlerRootView,
  PanGestureHandler,
  State,
} from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { SPACING } from '../constants/theme';
import { useAppTheme } from '../context/SettingsContext';
import {
  formatRelativeTime,
  groupNotificationsByDay,
} from '../utils/notifications';

const TYPE_META = {
  appointment: { icon: 'calendar-outline', key: 'primary' },
  success: { icon: 'checkmark-circle-outline', key: 'success' },
  payment: { icon: 'card-outline', key: 'success' },
  warning: { icon: 'alert-circle-outline', key: 'warning' },
  info: { icon: 'information-circle-outline', key: 'info' },
};

export const NotificationPanel = ({
  visible,
  notifications = [],
  readIds = [],
  onClose,
  onMarkAllRead,
  onPressItem,
  onDismissItem,
}) => {
  const { colors, isDark } = useAppTheme();
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();

  const fullHeight = useMemo(() => {
    return Math.round(windowHeight);
  }, [windowHeight]);

  const partialHeight = useMemo(
    () => Math.round(windowHeight * 0.55),
    [windowHeight]
  );

  const heightAnim = useRef(new Animated.Value(0)).current;
  const backdrop = useRef(new Animated.Value(0)).current;
  const dragStartRef = useRef(partialHeight);
  const heightRef = useRef(0);
  const expandedRef = useRef(false);
  const fullRef = useRef(fullHeight);
  const partialRef = useRef(partialHeight);
  const [isExpanded, setIsExpanded] = useState(false);

  fullRef.current = fullHeight;
  partialRef.current = partialHeight;

  useEffect(() => {
    const id = heightAnim.addListener(({ value }) => {
      heightRef.current = value;
    });
    return () => heightAnim.removeListener(id);
  }, [heightAnim]);

  const snapTo = useCallback(
    (toValue, expanded) => {
      expandedRef.current = expanded;
      setIsExpanded(expanded);
      Animated.spring(heightAnim, {
        toValue,
        useNativeDriver: false,
        tension: 65,
        friction: 11,
      }).start(() => {
        heightAnim.setValue(toValue);
        heightRef.current = toValue;
      });
    },
    [heightAnim]
  );

  const closeAnimated = useCallback(() => {
    Animated.parallel([
      Animated.timing(heightAnim, {
        toValue: 0,
        duration: 200,
        useNativeDriver: false,
      }),
      Animated.timing(backdrop, {
        toValue: 0,
        duration: 180,
        useNativeDriver: true,
      }),
    ]).start(({ finished }) => {
      if (finished) {
        expandedRef.current = false;
        setIsExpanded(false);
        onClose?.();
      }
    });
  }, [heightAnim, backdrop, onClose]);

  const closeRef = useRef(closeAnimated);
  const snapRef = useRef(snapTo);
  closeRef.current = closeAnimated;
  snapRef.current = snapTo;

  useEffect(() => {
    if (visible) {
      expandedRef.current = false;
      setIsExpanded(false);
      heightAnim.setValue(0);
      Animated.parallel([
        Animated.spring(heightAnim, {
          toValue: partialRef.current,
          useNativeDriver: false,
          tension: 65,
          friction: 11,
        }),
        Animated.timing(backdrop, {
          toValue: 1,
          duration: 220,
          useNativeDriver: true,
        }),
      ]).start(() => {
        heightAnim.setValue(partialRef.current);
        heightRef.current = partialRef.current;
      });
    } else {
      heightAnim.setValue(0);
      backdrop.setValue(0);
      expandedRef.current = false;
      setIsExpanded(false);
    }
  }, [visible, heightAnim, backdrop, partialHeight]);

  const onGestureEvent = useCallback(
    (event) => {
      const dy = event.nativeEvent.translationY;
      const maxH = fullRef.current;
      const next = Math.max(0, Math.min(maxH, dragStartRef.current + dy));
      heightAnim.setValue(next);
      heightRef.current = next;
    },
    [heightAnim]
  );

  const onHandlerStateChange = useCallback((event) => {
    const { state, translationY, velocityY } = event.nativeEvent;
    const partial = partialRef.current;
    const full = fullRef.current;

    if (state === State.BEGAN || state === State.ACTIVE) {
      if (state === State.BEGAN) {
        dragStartRef.current = heightRef.current || partialRef.current;
      }
      return;
    }

    if (state !== State.END && state !== State.CANCELLED) return;

    const current = Math.max(0, Math.min(full, dragStartRef.current + translationY));
    const dy = translationY;
    const vy = velocityY || 0;

    if (dy > 12 || vy > 800) {
      snapRef.current(full, true);
      return;
    }

    if (dy < -80 || vy < -1200 || current < partial * 0.4) {
      closeRef.current();
      return;
    }

    if (expandedRef.current && dy < -20) {
      snapRef.current(partial, false);
      return;
    }

    if (current > (partial + full) / 2) {
      snapRef.current(full, true);
    } else {
      snapRef.current(partial, false);
    }
  }, []);

  const expandFully = useCallback(() => {
    snapTo(fullRef.current, true);
  }, [snapTo]);

  const unreadCount = notifications.filter((n) => !readIds.includes(String(n.id))).length;
  const { today, earlier } = useMemo(
    () => groupNotificationsByDay(notifications),
    [notifications]
  );

  const panelBg = isDark ? colors.background : '#F4F8FC';
  const glassCard = isDark ? colors.cardBackground : '#FFFFFF';
  const glassBorder = isDark ? colors.cardBorder : 'rgba(18,78,150,0.10)';
  const glassHeader = isDark ? colors.headerBackground : '#FFFFFF';
  const glassBar = isDark ? colors.headerBackground : '#FFFFFF';

  const renderCard = (item) => {
    const meta = TYPE_META[item.type] || TYPE_META.info;
    const metaColor = colors[meta.key] || colors.primary;
    const unread = !readIds.includes(String(item.id));
    const relative = formatRelativeTime(item.createdAt || item.slotStartIso);
    const subtitle =
      item.subtitle ||
      (item.doctorName ? `With ${item.doctorName}` : null) ||
      item.body;
    const dateLabel = item.dateLabel || '';
    const timeLabel = item.timeLabel || '';

    // Dynamically match status colors to create a premium, clean palette
    const iconBg = isDark
      ? meta.key === 'success'
        ? 'rgba(52, 211, 153, 0.15)'
        : meta.key === 'warning'
        ? 'rgba(251, 191, 36, 0.15)'
        : meta.key === 'error'
        ? 'rgba(248, 113, 113, 0.15)'
        : 'rgba(77, 138, 255, 0.15)'
      : meta.key === 'success'
      ? '#E6F4EA'
      : meta.key === 'warning'
      ? '#FEF3C7'
      : meta.key === 'error'
      ? '#FCE8E6'
      : '#EAF2FC';

    // Unread cards get a subtle glowing border/background and left-side indicator
    const cardBg = unread
      ? isDark
        ? 'rgba(30, 41, 59, 0.85)'
        : '#F2F6FE'
      : glassCard;

    const cardBorderColor = unread
      ? isDark
        ? 'rgba(77, 138, 255, 0.4)'
        : 'rgba(0, 87, 255, 0.22)'
      : glassBorder;

    return (
      <View
        key={item.id}
        style={[
          styles.card,
          {
            backgroundColor: cardBg,
            borderColor: cardBorderColor,
            shadowColor: isDark ? '#000000' : '#124E96',
            shadowOpacity: unread ? 0.08 : 0.03,
          },
        ]}
      >
        <TouchableOpacity
          style={styles.cardInner}
          activeOpacity={0.88}
          onPress={() => onPressItem?.(item)}
        >
          <View
            style={[
              styles.iconWrap,
              {
                backgroundColor: iconBg,
              },
            ]}
          >
            <Ionicons name={meta.icon} size={22} color={metaColor} />
          </View>

          <View style={styles.cardBody}>
            <View style={styles.cardTopRow}>
              <View style={styles.titleCluster}>
                <Text
                  style={[styles.cardTitle, { color: colors.textPrimary }]}
                  numberOfLines={1}
                >
                  {item.title}
                </Text>
                {unread ? (
                  <View style={[styles.unreadDot, { backgroundColor: colors.primary }]} />
                ) : null}
              </View>
              {relative ? (
                <Text style={[styles.relativeTime, { color: colors.primary }]}>
                  {relative}
                </Text>
              ) : null}
            </View>

            {subtitle ? (
              <Text
                style={[styles.cardSubtitle, { color: colors.textSecondary }]}
                numberOfLines={2}
              >
                {subtitle}
              </Text>
            ) : null}

            {dateLabel || timeLabel ? (
              <View style={styles.metaRow}>
                {dateLabel ? (
                  <View style={styles.metaItem}>
                    <Ionicons name="calendar-outline" size={13} color={colors.primary} />
                    <Text style={[styles.metaText, { color: colors.textMuted }]}>
                      {dateLabel}
                    </Text>
                  </View>
                ) : null}
                {dateLabel && timeLabel ? (
                  <Text style={[styles.metaDot, { color: colors.textMuted }]}>•</Text>
                ) : null}
                {timeLabel ? (
                  <View style={styles.metaItem}>
                    <Ionicons name="time-outline" size={13} color={colors.primary} />
                    <Text style={[styles.metaText, { color: colors.textMuted }]}>
                      {timeLabel}
                    </Text>
                  </View>
                ) : null}
              </View>
            ) : null}
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.dismissBtn,
            {
              backgroundColor: isDark ? colors.inputBackground : '#F0F5FA',
              borderColor: glassBorder,
            },
          ]}
          onPress={() => onDismissItem?.(item)}
          hitSlop={8}
          accessibilityLabel="Dismiss notification"
        >
          <Ionicons name="close" size={16} color={colors.textMuted} />
        </TouchableOpacity>
      </View>
    );
  };

  const renderSection = (label, items) => {
    if (!items?.length) return null;
    return (
      <View style={styles.section} key={label}>
        <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>
          {label}
        </Text>
        <View style={styles.sectionList}>{items.map(renderCard)}</View>
      </View>
    );
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={closeAnimated}
      statusBarTranslucent
    >
      <GestureHandlerRootView style={styles.root}>
        <Pressable style={StyleSheet.absoluteFill} onPress={closeAnimated}>
          <Animated.View
            style={[
              styles.backdrop,
              {
                opacity: backdrop.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, 1],
                }),
              },
            ]}
          >
            <BlurView
              intensity={isDark ? 30 : 20}
              tint={isDark ? 'dark' : 'light'}
              style={StyleSheet.absoluteFill}
            />
            <View
              style={[
                StyleSheet.absoluteFill,
                {
                  backgroundColor: isDark ? 'rgba(0, 0, 0, 0.45)' : 'rgba(11, 18, 32, 0.18)',
                },
              ]}
            />
          </Animated.View>
        </Pressable>

        <Animated.View
          style={[
            styles.panel,
            isExpanded && styles.panelFull,
            {
              height: heightAnim,
              paddingTop: Math.max(insets.top, 8),
              borderColor: glassBorder,
              backgroundColor: isDark ? '#0F172A' : '#FFFFFF',
            },
          ]}
        >
          <LinearGradient
            colors={
              isDark
                ? ['#1E293B', '#0F172A', '#020617']
                : ['#FFFFFF', '#F8FAFC', '#EFF6FF']
            }
            locations={[0, 0.5, 1]}
            style={StyleSheet.absoluteFill}
          />

          <View
            style={[
              styles.headerRow,
              {
                borderBottomColor: glassBorder,
                backgroundColor: isDark ? 'rgba(15, 23, 42, 0.25)' : 'rgba(255, 255, 255, 0.25)',
              },
            ]}
          >
            <View style={{ flex: 1 }}>
              <Text style={[styles.title, { color: colors.textPrimary }]}>Notifications</Text>
              <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
                {unreadCount > 0 ? `${unreadCount} unread` : 'You are all caught up'}
              </Text>
            </View>
            <View style={styles.headerActions}>
              {notifications.length > 0 ? (
                <TouchableOpacity
                  onPress={() => onMarkAllRead?.()}
                  hitSlop={10}
                  accessibilityRole="button"
                  accessibilityLabel="Mark all notifications as read"
                >
                  <Text style={[styles.markAll, { color: colors.primary }]}>Mark all read</Text>
                </TouchableOpacity>
              ) : null}
              <TouchableOpacity
                onPress={closeAnimated}
                style={[
                  styles.closeBtn,
                  {
                    backgroundColor: isDark ? colors.inputBackground : '#EEF4FA',
                    borderColor: glassBorder,
                  },
                ]}
                hitSlop={8}
              >
                <Ionicons name="close" size={20} color={colors.textPrimary} />
              </TouchableOpacity>
            </View>
          </View>

          <ScrollView
            style={styles.list}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            nestedScrollEnabled
            bounces={false}
          >
            {notifications.length === 0 ? (
              <View style={[styles.empty, { backgroundColor: isDark ? 'rgba(30, 41, 59, 0.4)' : '#FFFFFF', borderColor: glassBorder }]}>
                <Ionicons name="notifications-off-outline" size={36} color={colors.primary} />
                <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>
                  No notifications yet
                </Text>
                <Text style={[styles.emptyBody, { color: colors.textSecondary }]}>
                  Booking updates and reminders will show up here.
                </Text>
              </View>
            ) : (
              <>
                {renderSection('Today', today)}
                {renderSection(today.length ? 'Earlier' : 'All', earlier)}
              </>
            )}
          </ScrollView>

          <PanGestureHandler
            onGestureEvent={onGestureEvent}
            onHandlerStateChange={onHandlerStateChange}
            activeOffsetY={[-8, 8]}
            failOffsetX={[-40, 40]}
          >
            <Animated.View
              style={[
                styles.bottomBar,
                {
                  paddingBottom: Math.max(insets.bottom, Platform.OS === 'android' ? 18 : 10),
                  borderTopColor: glassBorder,
                  backgroundColor: isDark ? 'rgba(15, 23, 42, 0.25)' : 'rgba(255, 255, 255, 0.25)',
                },
              ]}
            >
              <Pressable
                onPress={isExpanded ? undefined : expandFully}
                style={styles.handleHit}
                hitSlop={12}
              >
                <View
                  style={[
                    styles.handle,
                    {
                      backgroundColor: isDark
                        ? 'rgba(255,255,255,0.35)'
                        : 'rgba(0, 87, 255, 0.28)',
                    },
                  ]}
                />
                {!isExpanded ? (
                  <Text style={[styles.dragHint, { color: colors.primary }]}>
                    Tap or drag down to expand
                  </Text>
                ) : (
                  <Text style={[styles.dragHint, { color: colors.textMuted }]}>
                    Drag up to close
                  </Text>
                )}
              </Pressable>
            </Animated.View>
          </PanGestureHandler>
        </Animated.View>
      </GestureHandlerRootView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-start' },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  panel: {
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
    overflow: 'hidden',
    elevation: 18,
    borderWidth: StyleSheet.hairlineWidth,
    shadowColor: '#053B74',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.18,
    shadowRadius: 24,
  },
  panelFull: {
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
  },
  handle: {
    width: 48,
    height: 5,
    borderRadius: 3,
  },
  handleHit: {
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    paddingVertical: 4,
  },
  dragHint: {
    marginTop: 8,
    fontSize: 11,
    fontWeight: '600',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.sm,
    paddingBottom: SPACING.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
  },
  subtitle: {
    marginTop: 2,
    fontSize: 12,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  markAll: {
    fontSize: 13,
    fontWeight: '600',
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
  },
  list: { flex: 1, backgroundColor: 'transparent' },
  listContent: {
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.md,
    paddingBottom: 20,
    flexGrow: 1,
  },
  section: {
    marginBottom: 18,
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 10,
    marginLeft: 2,
  },
  sectionList: {
    gap: 10,
  },
  empty: {
    alignItems: 'center',
    paddingVertical: SPACING.xl,
    paddingHorizontal: SPACING.lg,
    borderRadius: 20,
    borderWidth: 1,
  },
  emptyTitle: {
    marginTop: SPACING.sm,
    fontSize: 16,
    fontWeight: '700',
  },
  emptyBody: {
    marginTop: 6,
    fontSize: 13,
    textAlign: 'center',
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 18,
    borderWidth: 1,
    paddingVertical: 14,
    paddingLeft: 12,
    paddingRight: 10,
    elevation: 3,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 14,
  },
  cardInner: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    minWidth: 0,
  },
  iconWrap: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  cardBody: {
    flex: 1,
    minWidth: 0,
    paddingRight: 4,
  },
  cardTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  titleCluster: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minWidth: 0,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    flexShrink: 0,
  },
  cardTitle: {
    flexShrink: 1,
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  relativeTime: {
    fontSize: 12,
    fontWeight: '600',
    flexShrink: 0,
  },
  cardSubtitle: {
    marginTop: 3,
    fontSize: 13,
    fontWeight: '500',
    lineHeight: 18,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    marginTop: 8,
    gap: 6,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  metaText: {
    fontSize: 12,
    fontWeight: '500',
  },
  metaDot: {
    fontSize: 12,
    marginHorizontal: 2,
  },
  dismissBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 4,
    flexShrink: 0,
  },
  bottomBar: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 10,
    minHeight: 52,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
});
