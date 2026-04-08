import React, { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';

interface TimePickerFieldProps {
  label?: string;
  value?: string;
  placeholder?: string;
  onChange: (value?: string) => void;
}

export const TimePickerField: React.FC<TimePickerFieldProps> = ({
  label,
  value,
  placeholder = 'Select time',
  onChange,
}) => {
  const styles = getStyles();
  const [open, setOpen] = useState(false);

  const toDate = (val?: string) => {
    const date = new Date();
    if (!val) return date;
    const [h, m] = val.split(':').map(Number);
    date.setHours(h, m, 0, 0);
    return date;
  };

  const [timeValue, setTimeValue] = useState<Date>(toDate(value));

  const display = value
    ? toDate(value).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
    : '';

  const confirm = () => {
    const hours = String(timeValue.getHours()).padStart(2, '0');
    const minutes = String(timeValue.getMinutes()).padStart(2, '0');
    onChange(`${hours}:${minutes}`);
    setOpen(false);
  };

  return (
    <View>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <Pressable style={styles.field} onPress={() => setOpen(true)}>
        <Text style={display ? styles.valueText : styles.placeholder}>{display || placeholder}</Text>
        <Ionicons name="time-outline" size={18} color="#000000" />
      </Pressable>

      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.overlay} onPress={() => setOpen(false)}>
          <Pressable style={styles.sheet}>
            <DateTimePicker
              value={timeValue}
              mode="time"
              display="spinner"
              onChange={(_, selected) => {
                if (selected) setTimeValue(selected);
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

const getStyles = () =>
  StyleSheet.create({
    label: {
      fontSize: 12,
      fontWeight: '700',
      color: '#666666',
      marginBottom: 6,
      textTransform: 'uppercase',
    },
    field: {
      borderRadius: 10,
      borderWidth: 1,
      borderColor: '#E0E0E0',
      paddingHorizontal: 12,
      paddingVertical: 10,
      backgroundColor: '#F9F9F9',
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    valueText: {
      fontSize: 13,
      fontWeight: '600',
      color: '#000000',
    },
    placeholder: {
      fontSize: 13,
      color: '#999999',
    },
    overlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.5)',
      justifyContent: 'flex-end',
    },
    sheet: {
      backgroundColor: '#FFFFFF',
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
      color: '#000000',
    },
    actionPrimary: {
      color: '#DC3545',
      fontWeight: '700',
    },
  });
