import React, { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, TouchableOpacity, View, useColorScheme } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';

interface DatePickerFieldProps {
  label?: string;
  value?: string;
  placeholder?: string;
  onChange: (value?: string) => void;
}

export const DatePickerField: React.FC<DatePickerFieldProps> = ({
  label,
  value,
  placeholder = 'Select date',
  onChange,
}) => {
  const isDark = useColorScheme() === 'dark';
  const styles = getStyles(isDark);
  const [open, setOpen] = useState(false);
  const [dateValue, setDateValue] = useState<Date>(value ? new Date(value) : new Date());

  const display = value
    ? new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
    : '';

  const confirm = () => {
    const iso = dateValue.toISOString().split('T')[0];
    onChange(iso);
    setOpen(false);
  };

  return (
    <View>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <Pressable style={styles.field} onPress={() => setOpen(true)}>
        <Text style={display ? styles.valueText : styles.placeholder}>{display || placeholder}</Text>
        <Ionicons name="calendar-outline" size={18} color={isDark ? '#FFFFFF' : '#000000'} />
      </Pressable>

      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.overlay} onPress={() => setOpen(false)}>
          <Pressable style={styles.sheet}>
            <DateTimePicker
              value={dateValue}
              mode="date"
              display="spinner"
              onChange={(_, selected) => {
                if (selected) setDateValue(selected);
              }}
            />
            <View style={styles.actions}>
              <TouchableOpacity onPress={() => setOpen(false)}>
                <Text style={styles.actionText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={confirm}>
                <Text style={[styles.actionText, styles.actionPrimary]}>Done</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
};

const getStyles = (isDark: boolean) =>
  StyleSheet.create({
    label: {
      fontSize: 12,
      fontWeight: '700',
      color: isDark ? '#A0A0A0' : '#666666',
      marginBottom: 6,
      textTransform: 'uppercase',
    },
    field: {
      borderRadius: 10,
      borderWidth: 1,
      borderColor: isDark ? '#3A3A3A' : '#E0E0E0',
      paddingHorizontal: 12,
      paddingVertical: 10,
      backgroundColor: isDark ? '#2A2A2A' : '#F9F9F9',
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    valueText: {
      fontSize: 13,
      fontWeight: '600',
      color: isDark ? '#FFFFFF' : '#000000',
    },
    placeholder: {
      fontSize: 13,
      color: isDark ? '#666666' : '#999999',
    },
    overlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.5)',
      justifyContent: 'flex-end',
    },
    sheet: {
      backgroundColor: isDark ? '#2A2A2A' : '#FFFFFF',
      paddingHorizontal: 16,
      paddingTop: 12,
      paddingBottom: 24,
      borderTopLeftRadius: 16,
      borderTopRightRadius: 16,
    },
    actions: {
      marginTop: 12,
      flexDirection: 'row',
      justifyContent: 'space-between',
    },
    actionText: {
      fontSize: 14,
      color: isDark ? '#FFFFFF' : '#000000',
    },
    actionPrimary: {
      color: '#DC3545',
      fontWeight: '700',
    },
  });
