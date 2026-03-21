import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View, useColorScheme } from 'react-native';

interface StepperFieldProps {
  label: string;
  value?: number;
  min?: number;
  max?: number;
  step?: number;
  onChange: (value?: number) => void;
}

export const StepperField: React.FC<StepperFieldProps> = ({
  label,
  value,
  min = 0,
  max = 9999,
  step = 10,
  onChange,
}) => {
  const isDark = useColorScheme() === 'dark';
  const styles = getStyles(isDark);

  const decrement = () => {
    if (value === undefined) return onChange(min);
    const next = Math.max(min, value - step);
    onChange(next);
  };

  const increment = () => {
    const next = Math.min(max, (value ?? min) + step);
    onChange(next);
  };

  return (
    <View style={styles.container}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.stepper}>
        <TouchableOpacity style={styles.button} onPress={decrement}>
          <Text style={styles.buttonText}>–</Text>
        </TouchableOpacity>
        <Text style={[styles.value, value === undefined && styles.valueMuted]}>
          {value === undefined ? 'Any' : value}
        </Text>
        <TouchableOpacity style={styles.button} onPress={increment}>
          <Text style={styles.buttonText}>+</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const getStyles = (isDark: boolean) =>
  StyleSheet.create({
    container: {
      flex: 1,
    },
    label: {
      fontSize: 11,
      fontWeight: '700',
      color: isDark ? '#A0A0A0' : '#666666',
      marginBottom: 6,
      textTransform: 'uppercase',
    },
    stepper: {
      borderRadius: 10,
      borderWidth: 1,
      borderColor: isDark ? '#3A3A3A' : '#E0E0E0',
      backgroundColor: isDark ? '#2A2A2A' : '#F9F9F9',
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 8,
      paddingVertical: 8,
    },
    button: {
      width: 28,
      height: 28,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: isDark ? '#3A3A3A' : '#E6E6E6',
    },
    buttonText: {
      fontSize: 16,
      fontWeight: '700',
      color: isDark ? '#FFFFFF' : '#000000',
    },
    value: {
      fontSize: 13,
      fontWeight: '700',
      color: isDark ? '#FFFFFF' : '#000000',
    },
    valueMuted: {
      color: isDark ? '#777777' : '#999999',
      fontWeight: '600',
    },
  });
