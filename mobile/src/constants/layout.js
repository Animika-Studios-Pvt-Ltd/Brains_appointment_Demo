import { Platform } from 'react-native';

/**
 * Extra padding under scroll content so the last items clear the tab bar.
 * Android lift strip varies by device; keep a comfortable minimum.
 */
export function getTabBarScrollPadding(_bottomInset = 0) {
  if (Platform.OS === 'ios') return 36;
  const inset = Math.max(Number(_bottomInset) || 0, 0);
  // Icon row + raised Book FAB + lift strip — content padding above bar
  return Math.max(40, inset + 20);
}
