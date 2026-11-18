import React, { useMemo, useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  Pressable,
} from 'react-native';
import { ChevronLeft, ChevronRight, X } from 'lucide-react-native';
import { COLORS, SPACING, RADIUS } from '../constants/theme';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const toYmd = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const parseYmd = (ymd) => {
  const [y, m, d] = String(ymd || '').split('-').map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d, 12, 0, 0, 0);
};

const startOfDay = (d) => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
};

export const DatePickerModal = ({
  visible,
  selectedDate,
  onClose,
  onSelect,
  minDate,
  maxDate,
}) => {
  const min = startOfDay(minDate || new Date());
  const max = startOfDay(
    maxDate ||
      (() => {
        const d = new Date();
        d.setDate(d.getDate() + 30);
        return d;
      })()
  );

  const selected = parseYmd(selectedDate) || min;

  const [viewYear, setViewYear] = useState(selected.getFullYear());
  const [viewMonth, setViewMonth] = useState(selected.getMonth());

  useEffect(() => {
    if (!visible) return;
    const s = parseYmd(selectedDate) || min;
    setViewYear(s.getFullYear());
    setViewMonth(s.getMonth());
  }, [visible, selectedDate]);

  const monthLabel = useMemo(() => {
    const d = new Date(viewYear, viewMonth, 1);
    return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  }, [viewYear, viewMonth]);

  const cells = useMemo(() => {
    const first = new Date(viewYear, viewMonth, 1);
    const startPad = first.getDay();
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    const list = [];

    for (let i = 0; i < startPad; i++) {
      list.push({ key: `e-${i}`, empty: true });
    }
    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(viewYear, viewMonth, day, 12, 0, 0, 0);
      const ymd = toYmd(date);
      const disabled = startOfDay(date) < min || startOfDay(date) > max;
      list.push({
        key: ymd,
        day,
        ymd,
        disabled,
        selected: ymd === selectedDate,
        today: ymd === toYmd(new Date()),
      });
    }
    return list;
  }, [viewYear, viewMonth, min, max, selectedDate]);

  const canGoPrev = useMemo(() => {
    const prevMonthLast = new Date(viewYear, viewMonth, 0);
    return startOfDay(prevMonthLast) >= min;
  }, [viewYear, viewMonth, min]);

  const canGoNext = useMemo(() => {
    const nextMonthFirst = new Date(viewYear, viewMonth + 1, 1);
    return startOfDay(nextMonthFirst) <= max;
  }, [viewYear, viewMonth, max]);

  const goPrev = () => {
    if (!canGoPrev) return;
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear((y) => y - 1);
    } else {
      setViewMonth((m) => m - 1);
    }
  };

  const goNext = () => {
    if (!canGoNext) return;
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear((y) => y + 1);
    } else {
      setViewMonth((m) => m + 1);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>Select date</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn} hitSlop={8}>
              <X color={COLORS.textPrimary} size={18} />
            </TouchableOpacity>
          </View>

          <View style={styles.monthRow}>
            <TouchableOpacity
              onPress={goPrev}
              disabled={!canGoPrev}
              style={[styles.navBtn, !canGoPrev && styles.navDisabled]}
            >
              <ChevronLeft color={canGoPrev ? COLORS.primary : COLORS.textMuted} size={20} />
            </TouchableOpacity>
            <Text style={styles.monthLabel}>{monthLabel}</Text>
            <TouchableOpacity
              onPress={goNext}
              disabled={!canGoNext}
              style={[styles.navBtn, !canGoNext && styles.navDisabled]}
            >
              <ChevronRight color={canGoNext ? COLORS.primary : COLORS.textMuted} size={20} />
            </TouchableOpacity>
          </View>

          <View style={styles.weekRow}>
            {WEEKDAYS.map((w) => (
              <Text key={w} style={styles.weekLabel}>
                {w}
              </Text>
            ))}
          </View>

          <View style={styles.grid}>
            {cells.map((cell) => {
              if (cell.empty) {
                return <View key={cell.key} style={styles.dayCell} />;
              }
              return (
                <TouchableOpacity
                  key={cell.key}
                  style={[
                    styles.dayCell,
                    cell.selected && styles.daySelected,
                    cell.today && !cell.selected && styles.dayToday,
                    cell.disabled && styles.dayDisabled,
                  ]}
                  disabled={cell.disabled}
                  onPress={() => {
                    onSelect?.(cell.ymd);
                    onClose?.();
                  }}
                >
                  <Text
                    style={[
                      styles.dayText,
                      cell.selected && styles.dayTextSelected,
                      cell.disabled && styles.dayTextDisabled,
                    ]}
                  >
                    {cell.day}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(11, 18, 32, 0.45)',
    justifyContent: 'center',
    padding: SPACING.lg,
  },
  sheet: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: SPACING.md,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: SPACING.sm,
  },
  sheetTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F0F0F3',
    alignItems: 'center',
    justifyContent: 'center',
  },
  monthRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: SPACING.sm,
  },
  navBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navDisabled: {
    backgroundColor: '#F0F0F3',
  },
  monthLabel: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  weekRow: {
    flexDirection: 'row',
    marginBottom: 4,
  },
  weekLabel: {
    width: `${100 / 7}%`,
    textAlign: 'center',
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  dayCell: {
    width: `${100 / 7}%`,
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: RADIUS.md,
  },
  daySelected: {
    backgroundColor: COLORS.primary,
  },
  dayToday: {
    borderWidth: 1,
    borderColor: COLORS.primary,
  },
  dayDisabled: {
    opacity: 0.35,
  },
  dayText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textPrimary,
  },
  dayTextSelected: {
    color: '#fff',
  },
  dayTextDisabled: {
    color: COLORS.textMuted,
  },
});
