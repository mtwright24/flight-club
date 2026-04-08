/**
 * AdvancedFilterSheet Component
 * iOS-clean advanced filter controls
 */

import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  TouchableOpacity,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  Modal,
  Pressable,
  Switch,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { TradeFilter, TradeType } from '../../types/trades';
import { DatePickerField } from './filters/DatePickerField';
import { TimePickerField } from './filters/TimePickerField';
import { AirportPickerField } from './filters/AirportPickerField';
import { StepperField } from './filters/StepperField';

interface AdvancedFilterSheetProps {
  filters: TradeFilter;
  onFilterChange: (updates: Partial<TradeFilter>) => void;
  onClose: () => void;
  visible: boolean;
  onSaveAsAlert?: (name: string) => void;
}

export const AdvancedFilterSheet: React.FC<AdvancedFilterSheetProps> = ({
  filters,
  onFilterChange,
  onClose,
  visible,
  onSaveAsAlert,
}) => {
  const styles = getStyles();

  const [localFilters, setLocalFilters] = useState<TradeFilter>({});
  const [showSaveAlert, setShowSaveAlert] = useState(false);
  const [alertName, setAlertName] = useState('');

  useEffect(() => {
    if (visible) {
      setLocalFilters(filters || {});
    }
  }, [visible, filters]);

  const hasActiveFilters = useMemo(() => {
    const values = Object.values(localFilters);
    return values.some((value) => {
      if (Array.isArray(value)) return value.length > 0;
      return value !== undefined && value !== null && value !== false && value !== '';
    });
  }, [localFilters]);

  const updateLocal = (updates: Partial<TradeFilter>) => {
    setLocalFilters((prev) => ({ ...prev, ...updates }));
  };

  const handleSaveAsAlert = () => {
    if (alertName.trim()) {
      onSaveAsAlert?.(alertName.trim());
      setAlertName('');
      setShowSaveAlert(false);
    }
  };

  const toggleType = (type?: TradeType) => {
    if (!type) {
      updateLocal({ types: undefined });
      return;
    }
    const current = localFilters.types || [];
    const next = current.includes(type) ? current.filter((t) => t !== type) : [...current, type];
    updateLocal({ types: next.length ? next : undefined });
  };

  const setQuickDate = (range: TradeFilter['date_range']) => {
    const today = new Date();
    const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    let from = start;
    let to = start;

    switch (range) {
      case 'tomorrow': {
        from = new Date(start);
        from.setDate(from.getDate() + 1);
        to = new Date(from);
        break;
      }
      case 'next7': {
        to = new Date(start);
        to.setDate(to.getDate() + 6);
        break;
      }
      case 'weekend': {
        const day = start.getDay();
        const saturday = new Date(start);
        const sunday = new Date(start);
        if (day === 6) {
          sunday.setDate(sunday.getDate() + 1);
          from = saturday;
          to = sunday;
        } else if (day === 0) {
          from = sunday;
          to = sunday;
        } else {
          const daysUntilSaturday = (6 - day + 7) % 7;
          saturday.setDate(saturday.getDate() + daysUntilSaturday);
          sunday.setDate(saturday.getDate() + 1);
          from = saturday;
          to = sunday;
        }
        break;
      }
      default:
        break;
    }

    updateLocal({
      date_range: range,
      date_from: from.toISOString().split('T')[0],
      date_to: to.toISOString().split('T')[0],
    });
  };

  const setTimeShortcut = (start: string, end: string) => {
    updateLocal({ report_start_time: start, report_end_time: end });
  };

  const applyFilters = () => {
    const normalized: Partial<TradeFilter> = {
      ...localFilters,
      types: localFilters.types && localFilters.types.length ? localFilters.types : undefined,
      contains_airports:
        localFilters.contains_airports && localFilters.contains_airports.length
          ? localFilters.contains_airports
          : undefined,
      exclude_airports:
        localFilters.exclude_airports && localFilters.exclude_airports.length
          ? localFilters.exclude_airports
          : undefined,
      search_notes: localFilters.search_notes?.trim() || undefined,
    };

    onFilterChange(normalized);
    onClose();
  };

  const resetFilters = () => {
    setLocalFilters({});
    onFilterChange({
      types: undefined,
      date_range: undefined,
      date_from: undefined,
      date_to: undefined,
      report_start_time: undefined,
      report_end_time: undefined,
      day_parts: undefined,
      has_incentive_only: false,
      min_incentive: undefined,
      has_screenshot_only: false,
      route_from: undefined,
      route_to: undefined,
      contains_airports: undefined,
      exclude_airports: undefined,
      trip_length: undefined,
      min_credit_minutes: undefined,
      max_credit_minutes: undefined,
      min_block_minutes: undefined,
      max_block_minutes: undefined,
      min_duty_minutes: undefined,
      max_duty_minutes: undefined,
      search_notes: undefined,
    });
  };

  if (!visible) return null;

  return (
    <>
      <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
        <View style={styles.container}>
          <View style={styles.header}>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={22} color="#000000" />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Advanced Filters</Text>
            <TouchableOpacity onPress={() => setShowSaveAlert(true)} disabled={!hasActiveFilters}>
              <Ionicons
                name="bookmark"
                size={18}
                color={hasActiveFilters ? '#DC3545' : '#BBBBBB'}
              />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
            <View style={styles.card}>
              <Text style={styles.sectionTitle}>Trade Type</Text>
              <View style={styles.chipRow}>
                {['All', 'Swap', 'Drop', 'Pickup'].map((label) => {
                  const isAll = label === 'All';
                  const typeValue = label.toLowerCase() as TradeType;
                  const active = isAll
                    ? !localFilters.types || localFilters.types.length === 0
                    : localFilters.types?.includes(typeValue);
                  return (
                    <TouchableOpacity
                      key={label}
                      style={[styles.chip, active && styles.chipActive]}
                      onPress={() => toggleType(isAll ? undefined : typeValue)}
                    >
                      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            <View style={styles.card}>
              <Text style={styles.sectionTitle}>Date Range</Text>
              <View style={styles.rowGap}>
                <DatePickerField
                  label="From Date"
                  value={localFilters.date_from}
                  onChange={(val) => updateLocal({ date_from: val, date_range: 'custom' })}
                />
                <DatePickerField
                  label="To Date"
                  value={localFilters.date_to}
                  onChange={(val) => updateLocal({ date_to: val, date_range: 'custom' })}
                />
              </View>
              <View style={styles.chipRow}>
                {['Today', 'Tomorrow', 'Weekend', 'Next 7 days'].map((label) => (
                  <TouchableOpacity
                    key={label}
                    style={styles.chip}
                    onPress={() =>
                      setQuickDate(
                        label === 'Today'
                          ? 'today'
                          : label === 'Tomorrow'
                          ? 'tomorrow'
                          : label === 'Weekend'
                          ? 'weekend'
                          : 'next7'
                      )
                    }
                  >
                    <Text style={styles.chipText}>{label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <View style={styles.card}>
              <Text style={styles.sectionTitle}>Report Time Window</Text>
              <View style={styles.rowGap}>
                <TimePickerField
                  label="Start Time"
                  value={localFilters.report_start_time}
                  onChange={(val) => updateLocal({ report_start_time: val })}
                />
                <TimePickerField
                  label="End Time"
                  value={localFilters.report_end_time}
                  onChange={(val) => updateLocal({ report_end_time: val })}
                />
              </View>
              <View style={styles.chipRow}>
                <TouchableOpacity style={styles.chip} onPress={() => setTimeShortcut('05:00', '11:59')}>
                  <Text style={styles.chipText}>AM</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.chip} onPress={() => setTimeShortcut('12:00', '16:59')}>
                  <Text style={styles.chipText}>Mid</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.chip} onPress={() => setTimeShortcut('17:00', '21:59')}>
                  <Text style={styles.chipText}>PM</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.chip} onPress={() => setTimeShortcut('22:00', '04:59')}>
                  <Text style={styles.chipText}>Red-eye</Text>
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.card}>
              <Text style={styles.sectionTitle}>Airports</Text>
              <View style={styles.rowGap}>
                <AirportPickerField
                  label="From Airport"
                  value={localFilters.route_from}
                  onChange={(val) => updateLocal({ route_from: val as string })}
                />
                <AirportPickerField
                  label="To Airport"
                  value={localFilters.route_to}
                  onChange={(val) => updateLocal({ route_to: val as string })}
                />
                <AirportPickerField
                  label="Contains Airport"
                  values={localFilters.contains_airports || []}
                  multiSelect
                  placeholder="Select airports"
                  onChange={(val) => updateLocal({ contains_airports: val as string[] })}
                />
                <AirportPickerField
                  label="Exclude Airport"
                  values={localFilters.exclude_airports || []}
                  multiSelect
                  placeholder="Select airports"
                  onChange={(val) => updateLocal({ exclude_airports: val as string[] })}
                />
              </View>
            </View>

            <View style={styles.card}>
              <Text style={styles.sectionTitle}>Trip Length</Text>
              <View style={styles.chipRow}>
                {[1, 2, 3].map((length) => {
                  const label = length === 3 ? '3+ day' : `${length}-day`;
                  const active = localFilters.trip_length === length;
                  return (
                    <TouchableOpacity
                      key={label}
                      style={[styles.chip, active && styles.chipActive]}
                      onPress={() => updateLocal({ trip_length: active ? undefined : (length as 1 | 2 | 3) })}
                    >
                      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            <View style={styles.card}>
              <Text style={styles.sectionTitle}>Metrics</Text>
              <View style={styles.rowSplit}>
                <StepperField
                  label="Credit Min"
                  value={localFilters.min_credit_minutes}
                  step={10}
                  onChange={(val) => updateLocal({ min_credit_minutes: val })}
                />
                <StepperField
                  label="Credit Max"
                  value={localFilters.max_credit_minutes}
                  step={10}
                  onChange={(val) => updateLocal({ max_credit_minutes: val })}
                />
              </View>
              <View style={styles.rowSplit}>
                <StepperField
                  label="Block Min"
                  value={localFilters.min_block_minutes}
                  step={10}
                  onChange={(val) => updateLocal({ min_block_minutes: val })}
                />
                <StepperField
                  label="Block Max"
                  value={localFilters.max_block_minutes}
                  step={10}
                  onChange={(val) => updateLocal({ max_block_minutes: val })}
                />
              </View>
              <View style={styles.rowSplit}>
                <StepperField
                  label="Duty Min"
                  value={localFilters.min_duty_minutes}
                  step={10}
                  onChange={(val) => updateLocal({ min_duty_minutes: val })}
                />
                <StepperField
                  label="Duty Max"
                  value={localFilters.max_duty_minutes}
                  step={10}
                  onChange={(val) => updateLocal({ max_duty_minutes: val })}
                />
              </View>
              <View style={styles.rowSplit}>
                <StepperField
                  label="Min Incentive"
                  value={localFilters.min_incentive}
                  step={25}
                  onChange={(val) => updateLocal({ min_incentive: val })}
                />
              </View>
            </View>

            <View style={styles.card}>
              <Text style={styles.sectionTitle}>Flags</Text>
              <View style={styles.toggleRow}>
                <Text style={styles.toggleLabel}>Has Screenshot</Text>
                <Switch
                  value={!!localFilters.has_screenshot_only}
                  onValueChange={(val) => updateLocal({ has_screenshot_only: val })}
                />
              </View>
              <View style={styles.toggleRow}>
                <Text style={styles.toggleLabel}>Has Incentive</Text>
                <Switch
                  value={!!localFilters.has_incentive_only}
                  onValueChange={(val) => updateLocal({ has_incentive_only: val })}
                />
              </View>
              <View style={styles.toggleRow}>
                <Text style={styles.toggleLabel}>Verified Only</Text>
                <Switch value={false} onValueChange={() => {}} />
              </View>
            </View>

            <View style={styles.card}>
              <Text style={styles.sectionTitle}>Notes Search</Text>
              <TextInput
                style={styles.input}
                placeholder="Search notes"
                placeholderTextColor="#999"
                value={localFilters.search_notes || ''}
                onChangeText={(text) => updateLocal({ search_notes: text || undefined })}
              />
            </View>

            <View style={{ height: 20 }} />
          </ScrollView>

          <View style={styles.footer}>
            <TouchableOpacity style={styles.resetButton} onPress={resetFilters}>
              <Text style={styles.resetButtonText}>Reset</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.applyButton} onPress={applyFilters}>
              <Text style={styles.applyButtonText}>Apply</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={showSaveAlert} transparent animationType="fade" onRequestClose={() => setShowSaveAlert(false)}>
        <Pressable style={styles.alertOverlay} onPress={() => setShowSaveAlert(false)}>
          <View style={styles.alertBox}>
            <Text style={styles.alertTitle}>Save as Alert</Text>
            <Text style={styles.alertSubtitle}>Give this filter set a name for quick access</Text>
            <TextInput
              style={styles.alertInput}
              placeholder="e.g., 'JFK swaps'"
              placeholderTextColor="#999"
              value={alertName}
              onChangeText={setAlertName}
              autoFocus
            />
            <View style={styles.alertButtonRow}>
              <TouchableOpacity style={styles.alertButtonCancel} onPress={() => setShowSaveAlert(false)}>
                <Text style={styles.alertButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.alertButtonSave} onPress={handleSaveAsAlert}>
                <Text style={styles.alertButtonTextSave}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Pressable>
      </Modal>
    </>
  );
};

function getStyles() {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: '#FFFFFF',
      paddingTop: 44,
    },
    header: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: '#E5E5E5',
    },
    headerTitle: {
      fontSize: 16,
      fontWeight: '700',
      color: '#000000',
    },
    content: {
      flex: 1,
      paddingHorizontal: 16,
      paddingVertical: 12,
    },
    card: {
      borderRadius: 12,
      borderWidth: 1,
      borderColor: '#E6E6E6',
      backgroundColor: '#F8F8F8',
      padding: 12,
      marginBottom: 12,
      gap: 10,
    },
    sectionTitle: {
      fontSize: 12,
      fontWeight: '700',
      color: '#666666',
      textTransform: 'uppercase',
    },
    rowGap: {
      gap: 10,
    },
    rowSplit: {
      flexDirection: 'row',
      gap: 10,
    },
    chipRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },
    chip: {
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: '#E0E0E0',
      backgroundColor: '#F0F0F0',
    },
    chipActive: {
      backgroundColor: '#DC3545',
      borderColor: '#DC3545',
    },
    chipText: {
      fontSize: 12,
      color: '#000000',
      fontWeight: '600',
    },
    chipTextActive: {
      color: '#FFFFFF',
    },
    input: {
      borderRadius: 10,
      borderWidth: 1,
      borderColor: '#E0E0E0',
      paddingHorizontal: 12,
      paddingVertical: 10,
      fontSize: 13,
      color: '#000000',
      backgroundColor: '#F9F9F9',
    },
    toggleRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: 6,
    },
    toggleLabel: {
      fontSize: 13,
      color: '#000000',
      fontWeight: '600',
    },
    footer: {
      flexDirection: 'row',
      gap: 12,
      paddingHorizontal: 16,
      paddingBottom: 20,
      paddingTop: 12,
      borderTopWidth: 1,
      borderTopColor: '#E5E5E5',
    },
    resetButton: {
      flex: 1,
      paddingVertical: 12,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: '#E0E0E0',
      alignItems: 'center',
    },
    resetButtonText: {
      fontSize: 14,
      fontWeight: '700',
      color: '#000000',
    },
    applyButton: {
      flex: 1,
      paddingVertical: 12,
      borderRadius: 10,
      backgroundColor: '#DC3545',
      alignItems: 'center',
    },
    applyButtonText: {
      fontSize: 14,
      fontWeight: '700',
      color: '#FFFFFF',
    },
    alertOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0, 0, 0, 0.5)',
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: 16,
    },
    alertBox: {
      borderRadius: 12,
      backgroundColor: '#FFFFFF',
      paddingHorizontal: 16,
      paddingVertical: 20,
      minWidth: 280,
    },
    alertTitle: {
      fontSize: 16,
      fontWeight: '700',
      color: '#000000',
      marginBottom: 4,
    },
    alertSubtitle: {
      fontSize: 12,
      color: '#666666',
      marginBottom: 12,
    },
    alertInput: {
      borderRadius: 6,
      borderWidth: 1,
      borderColor: '#E0E0E0',
      paddingHorizontal: 12,
      paddingVertical: 10,
      fontSize: 13,
      color: '#000000',
      backgroundColor: '#F9F9F9',
      marginBottom: 16,
    },
    alertButtonRow: {
      flexDirection: 'row',
      gap: 8,
    },
    alertButtonCancel: {
      flex: 1,
      paddingVertical: 10,
      borderRadius: 6,
      borderWidth: 1,
      borderColor: '#E0E0E0',
    },
    alertButtonSave: {
      flex: 1,
      paddingVertical: 10,
      borderRadius: 6,
      backgroundColor: '#DC3545',
    },
    alertButtonText: {
      textAlign: 'center',
      fontSize: 13,
      fontWeight: '600',
      color: '#000000',
    },
    alertButtonTextSave: {
      textAlign: 'center',
      fontSize: 13,
      fontWeight: '600',
      color: '#FFFFFF',
    },
  });
}
