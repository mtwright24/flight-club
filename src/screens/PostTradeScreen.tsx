/**
 * PostTradeScreen
 * Form to create a new trade with optional screenshot upload
 */

import React, { useState } from 'react';
import {
  View,
  TouchableOpacity,
  Text,
  StyleSheet,
  useColorScheme,
  ScrollView,
  FlatList,
  TextInput,
  Switch,
  Alert,
  ActivityIndicator,
  Image,
  Platform,
  Modal,
  Pressable,
  ToastAndroid,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../hooks/useAuth';
import * as ImagePicker from 'expo-image-picker';
import type { PostTradeFormData, TradeType } from '../types/trades';
import AppHeader from '../components/AppHeader';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';

export const PostTradeScreen: React.FC = () => {
  const router = useRouter();
  const params = useLocalSearchParams();
  const boardIdParam = params?.boardId;
  const boardId = Array.isArray(boardIdParam) ? boardIdParam[0] : boardIdParam;
  const tradeIdParam = params?.tradeId;
  const tradeId = Array.isArray(tradeIdParam) ? tradeIdParam[0] : tradeIdParam;
  const { session } = useAuth();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const styles = getStyles(isDark);

  const [form, setForm] = useState<PostTradeFormData>({
    type: 'swap',
    pairing_date: new Date().toISOString().split('T')[0],
    has_incentive: false,
  });

  const [screenshot, setScreenshot] = useState<{
    uri: string;
    name: string;
  } | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [loadingTrade, setLoadingTrade] = useState(false);
  const [existingScreenshotUrl, setExistingScreenshotUrl] = useState<string | null>(null);
  const [removeExistingScreenshot, setRemoveExistingScreenshot] = useState(false);
  const [resolvedBoardId, setResolvedBoardId] = useState<string | undefined>(boardId);
  /** Avoids infinite loops: `params` from useLocalSearchParams is a new object every render. */
  const lastSchedulePrefillKey = React.useRef<string | null>(null);

  const isEditing = !!tradeId;

  const [showDatePicker, setShowDatePicker] = useState(false);
  const [datePickerField, setDatePickerField] = useState<'pairing_date' | 'end_date' | null>(null);
  const [datePickerValue, setDatePickerValue] = useState<Date>(new Date());

  const [showTimePicker, setShowTimePicker] = useState(false);
  const [timePickerValue, setTimePickerValue] = useState<Date>(new Date());

  const [showAirportPicker, setShowAirportPicker] = useState(false);
  const [airportPickerField, setAirportPickerField] = useState<'route_from' | 'route_to' | null>(null);
  const [airportSearch, setAirportSearch] = useState('');

  const AIRPORTS = [
    { code: 'JFK', name: 'New York (JFK)' },
    { code: 'LGA', name: 'New York (LGA)' },
    { code: 'EWR', name: 'Newark (EWR)' },
    { code: 'BOS', name: 'Boston (BOS)' },
    { code: 'FLL', name: 'Fort Lauderdale (FLL)' },
    { code: 'MCO', name: 'Orlando (MCO)' },
    { code: 'MIA', name: 'Miami (MIA)' },
    { code: 'LAX', name: 'Los Angeles (LAX)' },
    { code: 'SFO', name: 'San Francisco (SFO)' },
    { code: 'SEA', name: 'Seattle (SEA)' },
    { code: 'PDX', name: 'Portland (PDX)' },
    { code: 'DEN', name: 'Denver (DEN)' },
    { code: 'ORD', name: 'Chicago (ORD)' },
    { code: 'IAH', name: 'Houston (IAH)' },
    { code: 'ATL', name: 'Atlanta (ATL)' },
    { code: 'DTW', name: 'Detroit (DTW)' },
    { code: 'MSP', name: 'Minneapolis (MSP)' },
    { code: 'SLC', name: 'Salt Lake City (SLC)' },
    { code: 'PHX', name: 'Phoenix (PHX)' },
    { code: 'LAS', name: 'Las Vegas (LAS)' },
    { code: 'CLT', name: 'Charlotte (CLT)' },
    { code: 'DFW', name: 'Dallas/Fort Worth (DFW)' },
    { code: 'DAL', name: 'Dallas Love (DAL)' },
    { code: 'MDW', name: 'Chicago Midway (MDW)' },
    { code: 'BWI', name: 'Baltimore (BWI)' },
    { code: 'ANC', name: 'Anchorage (ANC)' },
  ];

  const showToast = (message: string) => {
    if (Platform.OS === 'android') {
      ToastAndroid.show(message, ToastAndroid.SHORT);
    } else {
      setToastMessage(message);
      setTimeout(() => setToastMessage(null), 1200);
    }
  };

  const formatDateDisplay = (value?: string) => {
    if (!value) return '';
    const [year, month, day] = value.split('-').map(Number);
    const date = new Date(year, month - 1, day);
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const formatDateValue = (date: Date) => date.toISOString().split('T')[0];

  const formatTimeDisplay = (value?: string) => {
    if (!value) return '';
    const [hours, minutes] = value.split(':').map(Number);
    const date = new Date();
    date.setHours(hours, minutes, 0, 0);
    return date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  };

  const formatTimeValue = (date: Date) => {
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${hours}:${minutes}`;
  };

  const parseDateValue = (value?: string) => {
    if (!value) return new Date();
    const [year, month, day] = value.split('-').map(Number);
    return new Date(year, month - 1, day);
  };

  const parseTimeValue = (value?: string) => {
    const date = new Date();
    if (!value) return date;
    const [hours, minutes] = value.split(':').map(Number);
    date.setHours(hours, minutes, 0, 0);
    return date;
  };

  const openDatePicker = (field: 'pairing_date' | 'end_date') => {
    setDatePickerField(field);
    setDatePickerValue(parseDateValue(form[field]));
    setShowDatePicker(true);
  };

  const openTimePicker = () => {
    setTimePickerValue(parseTimeValue(form.report_time));
    setShowTimePicker(true);
  };

  const openAirportPicker = (field: 'route_from' | 'route_to') => {
    setAirportPickerField(field);
    setAirportSearch('');
    setShowAirportPicker(true);
  };

  const confirmDatePicker = () => {
    if (!datePickerField) return;
    setForm({
      ...form,
      [datePickerField]: formatDateValue(datePickerValue),
    });
    setShowDatePicker(false);
  };

  const confirmTimePicker = () => {
    setForm({
      ...form,
      report_time: formatTimeValue(timePickerValue),
    });
    setShowTimePicker(false);
  };

  const filteredAirports = AIRPORTS.filter((airport) => {
    const term = airportSearch.toLowerCase().trim();
    if (!term) return true;
    return (
      airport.code.toLowerCase().includes(term) ||
      airport.name.toLowerCase().includes(term)
    );
  });

  const handleSelectAirport = (code: string) => {
    if (!airportPickerField) return;
    setForm({
      ...form,
      [airportPickerField]: code,
    });
    setShowAirportPicker(false);
  };

  React.useEffect(() => {
    const loadTrade = async () => {
      if (!tradeId) return;
      setLoadingTrade(true);
      try {
        const { data, error } = await supabase
          .from('trade_posts')
          .select('*')
          .eq('id', tradeId)
          .single();

        if (error) throw error;
        if (!data) return;

        setResolvedBoardId(data.board_id);
        setForm({
          type: data.type,
          pairing_date: data.pairing_date,
          end_date: data.end_date || undefined,
          report_time: data.report_time || undefined,
          route_from: data.route_from || undefined,
          route_to: data.route_to || undefined,
          trip_number: data.trip_number || undefined,
          credit_minutes: data.credit_minutes || undefined,
          block_minutes: data.block_minutes || undefined,
          duty_minutes: data.duty_minutes || undefined,
          tafb_minutes: data.tafb_minutes || undefined,
          notes: data.notes || undefined,
          has_incentive: data.has_incentive,
          incentive_amount: data.incentive_amount || undefined,
          incentive_note: data.incentive_note || undefined,
        });

        setExistingScreenshotUrl(data.screenshot_url || null);
        setRemoveExistingScreenshot(false);
      } catch (err) {
        Alert.alert('Error', 'Failed to load trade for editing');
      } finally {
        setLoadingTrade(false);
      }
    };

    loadTrade();
  }, [tradeId]);

  /** Schedule module prefill (Crew Schedule → Post trip). */
  React.useEffect(() => {
    if (tradeId) {
      lastSchedulePrefillKey.current = null;
      return;
    }
    const p = params as Record<string, string | string[] | undefined>;
    const str = (k: string) => {
      const v = p[k];
      const raw = Array.isArray(v) ? v[0] : v;
      return typeof raw === 'string' && raw.length > 0 ? raw : undefined;
    };
    const start = str('prefillStart');
    if (!start) return;

    const prefillKey = [
      start,
      str('prefillEnd') || '',
      str('prefillPairing') || '',
      str('prefillRoute') || '',
      str('prefillFrom') || '',
      str('prefillTo') || '',
      str('prefillBase') || '',
    ].join('\u001e');

    if (lastSchedulePrefillKey.current === prefillKey) return;
    lastSchedulePrefillKey.current = prefillKey;

    const end = str('prefillEnd') || start;
    const routeNote = str('prefillRoute');
    setForm((prev) => ({
      ...prev,
      pairing_date: start,
      end_date: end !== start ? end : prev.end_date,
      trip_number: str('prefillPairing') || prev.trip_number,
      route_from: str('prefillFrom') || prev.route_from,
      route_to: str('prefillTo') || prev.route_to,
      notes:
        prev.notes ||
        [routeNote && `Schedule: ${routeNote}`, str('prefillBase') && `Base ${str('prefillBase')}`]
          .filter(Boolean)
          .join(' · '),
    }));
  }, [tradeId, params]);

  const handleSelectScreenshot = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [4, 3],
        quality: 0.8,
      });

      if (!result.canceled) {
        const asset = result.assets[0];
        const filename = asset.uri.split('/').pop() || 'screenshot.jpg';
        setScreenshot({
          uri: asset.uri,
          name: filename,
        });
      }
    } catch (err) {
      Alert.alert('Error', 'Failed to select image');
    }
  };

  const handleCameraCapture = async () => {
    try {
      const result = await ImagePicker.launchCameraAsync({
        allowsEditing: true,
        aspect: [4, 3],
        quality: 0.8,
      });

      if (!result.canceled) {
        const asset = result.assets[0];
        const filename = asset.uri.split('/').pop() || 'screenshot.jpg';
        setScreenshot({
          uri: asset.uri,
          name: filename,
        });
      }
    } catch (err) {
      Alert.alert('Error', 'Failed to capture image');
    }
  };

  const handleRemoveScreenshot = () => {
    setScreenshot(null);
  };

  const handleSubmit = async () => {
    const user = session?.user;
    if (!user) {
      Alert.alert('Error', 'You must be logged in');
      return;
    }

    const targetBoardId = resolvedBoardId || boardId;
    if (!targetBoardId) {
      Alert.alert('Error', 'Missing tradeboard context. Please go back and try again.');
      return;
    }

    if (!form.pairing_date) {
      Alert.alert('Error', 'Pairing date is required');
      return;
    }

    setSubmitting(true);

    try {
      let screenshotUrl: string | undefined = existingScreenshotUrl || undefined;

      // Upload screenshot if provided
      if (screenshot) {
        const fileExt = screenshot.name.split('.').pop();
        const fileName = `${user.id}_${Date.now()}.${fileExt}`;
        const filePath = `${targetBoardId}/${fileName}`;

        // Read file as binary
        const response = await fetch(screenshot.uri);
        const blob = await response.blob();

        const { error: uploadError } = await supabase.storage
          .from('trade-screenshots')
          .upload(filePath, blob, { upsert: false });

        if (uploadError) throw uploadError;

        // Get public URL
        const { data } = supabase.storage
          .from('trade-screenshots')
          .getPublicUrl(filePath);

        screenshotUrl = data.publicUrl;
      } else if (removeExistingScreenshot) {
        screenshotUrl = undefined;
      }

      const payload = {
        board_id: targetBoardId,
        user_id: user.id,
        type: form.type,
        pairing_date: form.pairing_date,
        end_date: form.end_date || null,
        report_time: form.report_time || null,
        route_from: form.route_from || null,
        route_to: form.route_to || null,
        trip_number: form.trip_number || null,
        credit_minutes: form.credit_minutes || null,
        block_minutes: form.block_minutes || null,
        duty_minutes: form.duty_minutes || null,
        tafb_minutes: form.tafb_minutes || null,
        notes: form.notes || null,
        has_screenshot: !!screenshotUrl,
        screenshot_url: screenshotUrl || null,
        has_incentive: form.has_incentive,
        incentive_amount: form.has_incentive ? form.incentive_amount || null : null,
        incentive_note: form.has_incentive ? form.incentive_note || null : null,
      };

      if (isEditing && tradeId) {
        const { error: updateError } = await supabase
          .from('trade_posts')
          .update(payload)
          .eq('id', tradeId)
          .eq('user_id', user.id);

        if (updateError) throw updateError;
      } else {
        const { error: insertError } = await supabase
          .from('trade_posts')
          .insert(payload);

        if (insertError) throw insertError;
      }

      showToast(isEditing ? 'Post updated' : 'Post submitted');
      setTimeout(() => router.back(), 500);
    } catch (err) {
      console.error('Error posting trade:', err);
      Alert.alert('Error', 'Failed to post trade');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom', 'left', 'right']}>
      <AppHeader title="Crew Exchange" showLogo={false} />

      {/* Subheader */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          disabled={submitting}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={styles.backButton}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{isEditing ? 'Edit Trade' : 'Post Trade'}</Text>
        <TouchableOpacity
          style={[styles.submitButton, submitting && styles.submitButtonDisabled]}
          onPress={handleSubmit}
          disabled={submitting}
        >
          {submitting ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <Text style={styles.submitButtonText}>{isEditing ? 'Save' : 'Post'}</Text>
          )}
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Trade Type (Required) */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Trade Type *</Text>
          <View style={styles.typeGrid}>
            {(['swap', 'drop', 'pickup'] as TradeType[]).map((type) => (
              <TouchableOpacity
                key={type}
                style={[
                  styles.typeButton,
                  form.type === type && styles.typeButtonActive,
                ]}
                onPress={() => setForm({ ...form, type })}
                disabled={submitting || loadingTrade}
              >
                <Text
                  style={[
                    styles.typeButtonText,
                    form.type === type && styles.typeButtonTextActive,
                  ]}
                >
                  {type.charAt(0).toUpperCase() + type.slice(1)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Pairing Date (Required) */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Pairing Date *</Text>
          <Pressable
            style={styles.pickerInput}
            onPress={() => openDatePicker('pairing_date')}
            disabled={submitting || loadingTrade}
          >
            <Text style={form.pairing_date ? styles.pickerText : styles.pickerPlaceholder}>
              {form.pairing_date ? formatDateDisplay(form.pairing_date) : 'Select date'}
            </Text>
            <Ionicons name="calendar-outline" size={18} color={isDark ? '#FFFFFF' : '#000000'} />
          </Pressable>
        </View>

        {/* End Date (Optional) */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>End Date (Multi-day)</Text>
          <Pressable
            style={styles.pickerInput}
            onPress={() => openDatePicker('end_date')}
            disabled={submitting || loadingTrade}
          >
            <Text style={form.end_date ? styles.pickerText : styles.pickerPlaceholder}>
              {form.end_date ? formatDateDisplay(form.end_date) : 'Select end date'}
            </Text>
            <Ionicons name="calendar-outline" size={18} color={isDark ? '#FFFFFF' : '#000000'} />
          </Pressable>
        </View>

        {/* Report Time (Optional) */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Report Time</Text>
          <Pressable
            style={styles.pickerInput}
            onPress={openTimePicker}
            disabled={submitting || loadingTrade}
          >
            <Text style={form.report_time ? styles.pickerText : styles.pickerPlaceholder}>
              {form.report_time ? formatTimeDisplay(form.report_time) : 'Select time'}
            </Text>
            <Ionicons name="time-outline" size={18} color={isDark ? '#FFFFFF' : '#000000'} />
          </Pressable>
        </View>

        {/* Route From */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Route From</Text>
          <Pressable
            style={styles.pickerInput}
            onPress={() => openAirportPicker('route_from')}
            disabled={submitting || loadingTrade}
          >
            <Text style={form.route_from ? styles.pickerText : styles.pickerPlaceholder}>
              {form.route_from || 'Select airport'}
            </Text>
            <Ionicons name="chevron-down" size={18} color={isDark ? '#FFFFFF' : '#000000'} />
          </Pressable>
        </View>

        {/* Route To */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Route To</Text>
          <Pressable
            style={styles.pickerInput}
            onPress={() => openAirportPicker('route_to')}
            disabled={submitting || loadingTrade}
          >
            <Text style={form.route_to ? styles.pickerText : styles.pickerPlaceholder}>
              {form.route_to || 'Select airport'}
            </Text>
            <Ionicons name="chevron-down" size={18} color={isDark ? '#FFFFFF' : '#000000'} />
          </Pressable>
        </View>

        {/* Trip Number */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Trip Number</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g., 123A"
            placeholderTextColor={isDark ? '#666' : '#999'}
            value={form.trip_number || ''}
            onChangeText={(text) =>
              setForm({ ...form, trip_number: text || undefined })
            }
            editable={!submitting && !loadingTrade}
          />
        </View>

        {/* Metrics */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Flight Metrics (minutes)</Text>

          <View style={styles.metricsRow}>
            <TextInput
              style={[styles.input, styles.metricsInput]}
              placeholder="Credit"
              placeholderTextColor={isDark ? '#666' : '#999'}
              keyboardType="number-pad"
              value={form.credit_minutes ? String(form.credit_minutes) : ''}
              onChangeText={(text) =>
                setForm({
                  ...form,
                  credit_minutes: text ? parseInt(text, 10) : undefined,
                })
              }
              editable={!submitting && !loadingTrade}
            />
            <TextInput
              style={[styles.input, styles.metricsInput]}
              placeholder="Block"
              placeholderTextColor={isDark ? '#666' : '#999'}
              keyboardType="number-pad"
              value={form.block_minutes ? String(form.block_minutes) : ''}
              onChangeText={(text) =>
                setForm({
                  ...form,
                  block_minutes: text ? parseInt(text, 10) : undefined,
                })
              }
              editable={!submitting && !loadingTrade}
            />
          </View>

          <View style={styles.metricsRow}>
            <TextInput
              style={[styles.input, styles.metricsInput]}
              placeholder="Duty"
              placeholderTextColor={isDark ? '#666' : '#999'}
              keyboardType="number-pad"
              value={form.duty_minutes ? String(form.duty_minutes) : ''}
              onChangeText={(text) =>
                setForm({
                  ...form,
                  duty_minutes: text ? parseInt(text, 10) : undefined,
                })
              }
              editable={!submitting && !loadingTrade}
            />
            <TextInput
              style={[styles.input, styles.metricsInput]}
              placeholder="TAFB"
              placeholderTextColor={isDark ? '#666' : '#999'}
              keyboardType="number-pad"
              value={form.tafb_minutes ? String(form.tafb_minutes) : ''}
              onChangeText={(text) =>
                setForm({
                  ...form,
                  tafb_minutes: text ? parseInt(text, 10) : undefined,
                })
              }
              editable={!submitting && !loadingTrade}
            />
          </View>
        </View>

        {/* Notes */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Notes</Text>
          <TextInput
            style={[styles.input, { height: 100 }]}
            placeholder="Any additional details..."
            placeholderTextColor={isDark ? '#666' : '#999'}
            multiline
            value={form.notes || ''}
            onChangeText={(text) => setForm({ ...form, notes: text || undefined })}
            editable={!submitting && !loadingTrade}
          />
        </View>

        {/* Incentive Toggle */}
        <View style={styles.section}>
          <View style={styles.switchRow}>
            <Text style={styles.sectionTitle}>Offering Incentive ($)?</Text>
            <Switch
              value={form.has_incentive}
              onValueChange={(val) =>
                setForm({ ...form, has_incentive: val })
              }
              disabled={submitting || loadingTrade}
            />
          </View>

          {form.has_incentive && (
            <>
              <TextInput
                style={styles.input}
                placeholder="Amount ($)"
                placeholderTextColor={isDark ? '#666' : '#999'}
                keyboardType="number-pad"
                value={
                  form.incentive_amount ? String(form.incentive_amount) : ''
                }
                onChangeText={(text) =>
                  setForm({
                    ...form,
                    incentive_amount: text ? parseInt(text, 10) : undefined,
                  })
                }
                editable={!submitting && !loadingTrade}
              />
              <TextInput
                style={[styles.input, { marginTop: 8 }]}
                placeholder="Incentive note (optional)"
                placeholderTextColor={isDark ? '#666' : '#999'}
                value={form.incentive_note || ''}
                onChangeText={(text) =>
                  setForm({
                    ...form,
                    incentive_note: text || undefined,
                  })
                }
                editable={!submitting && !loadingTrade}
              />
            </>
          )}
        </View>

        {/* Screenshot Upload */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Screenshot (Optional)</Text>

          {screenshot ? (
            <View style={styles.screenshotPreview}>
              <Image
                source={{ uri: screenshot.uri }}
                style={styles.screenshotImage}
              />
              <TouchableOpacity
                style={styles.removeScreenshotButton}
                onPress={handleRemoveScreenshot}
                disabled={submitting || loadingTrade}
              >
                <Text style={styles.removeScreenshotButtonText}>✕</Text>
              </TouchableOpacity>
            </View>
          ) : existingScreenshotUrl && !removeExistingScreenshot ? (
            <View style={styles.screenshotPreview}>
              <Image
                source={{ uri: existingScreenshotUrl }}
                style={styles.screenshotImage}
              />
              <TouchableOpacity
                style={styles.removeScreenshotButton}
                onPress={() => {
                  setRemoveExistingScreenshot(true);
                  setExistingScreenshotUrl(null);
                }}
                disabled={submitting || loadingTrade}
              >
                <Text style={styles.removeScreenshotButtonText}>✕</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.screenshotButtonGroup}>
              <TouchableOpacity
                style={styles.screenshotButton}
                onPress={handleSelectScreenshot}
                disabled={submitting || loadingTrade}
              >
                <Text style={styles.screenshotButtonText}>📁 Choose Photo</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.screenshotButton}
                onPress={handleCameraCapture}
                disabled={submitting || loadingTrade}
              >
                <Text style={styles.screenshotButtonText}>📷 Take Photo</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        <View style={{ height: 20 }} />
      </ScrollView>

      {/* Date Picker Modal */}
      <Modal
        visible={showDatePicker}
        transparent
        animationType="slide"
        onRequestClose={() => setShowDatePicker(false)}
      >
        <Pressable style={styles.pickerOverlay} onPress={() => setShowDatePicker(false)}>
          <Pressable style={styles.pickerSheet}>
            <DateTimePicker
              value={datePickerValue}
              mode="date"
              display={Platform.OS === 'ios' ? 'spinner' : 'default'}
              onChange={(_, selectedDate) => {
                if (selectedDate) setDatePickerValue(selectedDate);
              }}
            />
            <View style={styles.pickerActions}>
              <TouchableOpacity onPress={() => setShowDatePicker(false)}>
                <Text style={styles.pickerActionText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={confirmDatePicker}>
                <Text style={[styles.pickerActionText, styles.pickerActionPrimary]}>Done</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Time Picker Modal */}
      <Modal
        visible={showTimePicker}
        transparent
        animationType="slide"
        onRequestClose={() => setShowTimePicker(false)}
      >
        <Pressable style={styles.pickerOverlay} onPress={() => setShowTimePicker(false)}>
          <Pressable style={styles.pickerSheet}>
            <DateTimePicker
              value={timePickerValue}
              mode="time"
              display={Platform.OS === 'ios' ? 'spinner' : 'default'}
              onChange={(_, selectedDate) => {
                if (selectedDate) setTimePickerValue(selectedDate);
              }}
            />
            <View style={styles.pickerActions}>
              <TouchableOpacity onPress={() => setShowTimePicker(false)}>
                <Text style={styles.pickerActionText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={confirmTimePicker}>
                <Text style={[styles.pickerActionText, styles.pickerActionPrimary]}>Done</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Airport Picker Modal */}
      <Modal
        visible={showAirportPicker}
        transparent
        animationType="fade"
        onRequestClose={() => setShowAirportPicker(false)}
      >
        <Pressable style={styles.airportOverlay} onPress={() => setShowAirportPicker(false)}>
          <Pressable style={styles.airportModal}>
            <Text style={styles.airportTitle}>Select Airport</Text>
            <TextInput
              style={styles.airportSearch}
              placeholder="Search by code or city"
              placeholderTextColor={isDark ? '#666' : '#999'}
              value={airportSearch}
              onChangeText={setAirportSearch}
            />
            <FlatList
              data={filteredAirports}
              keyExtractor={(item) => item.code}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.airportItem}
                  onPress={() => handleSelectAirport(item.code)}
                >
                  <Text style={styles.airportCode}>{item.code}</Text>
                  <Text style={styles.airportName}>{item.name}</Text>
                </TouchableOpacity>
              )}
              showsVerticalScrollIndicator={false}
            />
          </Pressable>
        </Pressable>
      </Modal>

      {toastMessage && (
        <View style={styles.toast}>
          <Text style={styles.toastText}>{toastMessage}</Text>
        </View>
      )}
    </SafeAreaView>
  );
};

/**
 * Styles
 */

function getStyles(isDark: boolean) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: isDark ? '#1A1A1A' : '#FFFFFF',
    },

    header: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: isDark ? '#2A3A4A' : '#E5E5E5',
    },

    backButton: {
      fontSize: 14,
      fontWeight: '600',
      color: '#DC3545',
    },

    headerTitle: {
      fontSize: 16,
      fontWeight: '700',
      color: isDark ? '#FFFFFF' : '#000000',
    },

    submitButton: {
      paddingHorizontal: 16,
      paddingVertical: 8,
      borderRadius: 6,
      backgroundColor: '#DC3545',
    },

    submitButtonDisabled: {
      opacity: 0.6,
    },

    submitButtonText: {
      fontSize: 13,
      fontWeight: '600',
      color: '#FFFFFF',
    },

    content: {
      flex: 1,
      paddingHorizontal: 16,
      paddingVertical: 12,
    },

    section: {
      marginBottom: 20,
    },

    sectionTitle: {
      fontSize: 12,
      fontWeight: '700',
      color: isDark ? '#A0A0A0' : '#666666',
      marginBottom: 8,
      textTransform: 'uppercase',
    },

    input: {
      borderRadius: 6,
      borderWidth: 1,
      borderColor: isDark ? '#3A3A3A' : '#E0E0E0',
      paddingHorizontal: 12,
      paddingVertical: 10,
      fontSize: 13,
      color: isDark ? '#FFFFFF' : '#000000',
      backgroundColor: isDark ? '#2A2A2A' : '#F9F9F9',
    },

    pickerInput: {
      borderRadius: 6,
      borderWidth: 1,
      borderColor: isDark ? '#3A3A3A' : '#E0E0E0',
      paddingHorizontal: 12,
      paddingVertical: 10,
      backgroundColor: isDark ? '#2A2A2A' : '#F9F9F9',
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },

    pickerText: {
      fontSize: 13,
      color: isDark ? '#FFFFFF' : '#000000',
      fontWeight: '600',
    },

    pickerPlaceholder: {
      fontSize: 13,
      color: isDark ? '#666666' : '#999999',
    },

    typeGrid: {
      flexDirection: 'row',
      gap: 10,
    },

    typeButton: {
      flex: 1,
      paddingVertical: 10,
      paddingHorizontal: 12,
      borderRadius: 6,
      borderWidth: 1,
      borderColor: isDark ? '#3A3A3A' : '#E0E0E0',
      alignItems: 'center',
    },

    typeButtonActive: {
      borderColor: '#DC3545',
      backgroundColor: isDark ? '#3A2A2A' : '#FFE8E8',
    },

    typeButtonText: {
      fontSize: 12,
      fontWeight: '600',
      color: isDark ? '#FFFFFF' : '#000000',
    },

    typeButtonTextActive: {
      color: '#DC3545',
      fontWeight: '700',
    },

    metricsRow: {
      flexDirection: 'row',
      gap: 8,
      marginBottom: 8,
    },

    metricsInput: {
      flex: 1,
    },

    switchRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 12,
    },

    screenshotPreview: {
      position: 'relative',
      borderRadius: 6,
      overflow: 'hidden',
      backgroundColor: isDark ? '#2A2A2A' : '#F0F0F0',
    },

    screenshotImage: {
      width: '100%',
      height: 200,
    },

    removeScreenshotButton: {
      position: 'absolute',
      top: 8,
      right: 8,
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: 'rgba(0, 0, 0, 0.6)',
      justifyContent: 'center',
      alignItems: 'center',
    },

    removeScreenshotButtonText: {
      fontSize: 18,
      color: '#FFFFFF',
    },

    screenshotButtonGroup: {
      flexDirection: 'row',
      gap: 10,
    },

    screenshotButton: {
      flex: 1,
      paddingVertical: 12,
      paddingHorizontal: 12,
      borderRadius: 6,
      borderWidth: 1,
      borderColor: isDark ? '#3A3A3A' : '#E0E0E0',
      alignItems: 'center',
    },

    screenshotButtonText: {
      fontSize: 12,
      fontWeight: '600',
      color: isDark ? '#FFFFFF' : '#000000',
    },

    pickerOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0, 0, 0, 0.5)',
      justifyContent: 'flex-end',
    },

    pickerSheet: {
      backgroundColor: isDark ? '#2A2A2A' : '#FFFFFF',
      paddingHorizontal: 16,
      paddingTop: 12,
      paddingBottom: 24,
      borderTopLeftRadius: 16,
      borderTopRightRadius: 16,
    },

    pickerActions: {
      marginTop: 12,
      flexDirection: 'row',
      justifyContent: 'space-between',
    },

    pickerActionText: {
      fontSize: 14,
      color: isDark ? '#FFFFFF' : '#000000',
    },

    pickerActionPrimary: {
      color: '#DC3545',
      fontWeight: '700',
    },

    airportOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0, 0, 0, 0.5)',
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: 16,
    },

    airportModal: {
      width: '100%',
      maxWidth: 420,
      maxHeight: 500,
      backgroundColor: isDark ? '#2A2A2A' : '#FFFFFF',
      borderRadius: 12,
      padding: 16,
    },

    airportTitle: {
      fontSize: 16,
      fontWeight: '700',
      color: isDark ? '#FFFFFF' : '#000000',
      marginBottom: 10,
    },

    airportSearch: {
      borderRadius: 6,
      borderWidth: 1,
      borderColor: isDark ? '#3A3A3A' : '#E0E0E0',
      paddingHorizontal: 12,
      paddingVertical: 8,
      fontSize: 13,
      color: isDark ? '#FFFFFF' : '#000000',
      backgroundColor: isDark ? '#1A1A1A' : '#F9F9F9',
      marginBottom: 10,
    },

    airportItem: {
      paddingVertical: 10,
      borderBottomWidth: 1,
      borderBottomColor: isDark ? '#3A3A3A' : '#F0F0F0',
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },

    airportCode: {
      fontSize: 13,
      fontWeight: '700',
      color: '#DC3545',
      width: 50,
    },

    airportName: {
      fontSize: 13,
      color: isDark ? '#FFFFFF' : '#000000',
      flex: 1,
    },

    toast: {
      position: 'absolute',
      bottom: 24,
      left: 16,
      right: 16,
      backgroundColor: '#111111',
      paddingVertical: 10,
      paddingHorizontal: 16,
      borderRadius: 8,
      alignItems: 'center',
    },

    toastText: {
      color: '#FFFFFF',
      fontSize: 13,
      fontWeight: '600',
    },
  });
}
