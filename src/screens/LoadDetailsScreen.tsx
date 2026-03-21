import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Modal,
  TextInput,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { getFlight, createLoadReport, NonRevLoadReport } from '../lib/supabase/loads';
import { LoadStatusPill } from '../components/loads/FlightCard';

export default function LoadDetailsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const flightId = params.id as string;

  const [flight, setFlight] = useState<any>(null);
  const [reports, setReports] = useState<NonRevLoadReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showReportModal, setShowReportModal] = useState(false);

  useEffect(() => {
    loadFlightDetails();
  }, [flightId]);

  const loadFlightDetails = async () => {
    try {
      setLoading(true);
      setError(null);

      const { flight: data, reports: reportList, error: getError } = await getFlight(flightId);

      if (getError) {
        setError(getError);
      } else {
        setFlight(data);
        setReports(reportList);
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to load flight');
    } finally {
      setLoading(false);
    }
  };

  const formatTime = (isoString: string) => {
    const date = new Date(isoString);
    return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
  };

  const calculateDuration = (from: string, to: string) => {
    const durationMs = new Date(to).getTime() - new Date(from).getTime();
    const hours = Math.floor(durationMs / 3600000);
    const minutes = Math.floor((durationMs % 3600000) / 60000);
    return `${hours}h ${minutes}m`;
  };

  const getMostCommonStatus = () => {
    if (reports.length === 0) return null;
    const counts: Record<string, number> = {};
    reports.forEach((r) => {
      counts[r.status] = (counts[r.status] || 0) + 1;
    });
    return Object.keys(counts).reduce((a, b) => (counts[a] > counts[b] ? a : b)) as
      | 'LIGHT'
      | 'MEDIUM'
      | 'HEAVY'
      | 'FULL';
  };

  const timeAgo = (date: string) => {
    const now = new Date().getTime();
    const then = new Date(date).getTime();
    const diff = now - then;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return 'just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    return `${days}d ago`;
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()}>
            <Ionicons name="chevron-back" size={24} color="#fff" />
          </Pressable>
          <Text style={styles.headerTitle}>Flight Details</Text>
          <View style={{ width: 24 }} />
        </View>
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#DC3545" />
        </View>
      </View>
    );
  }

  if (error || !flight) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()}>
            <Ionicons name="chevron-back" size={24} color="#fff" />
          </Pressable>
          <Text style={styles.headerTitle}>Flight Details</Text>
          <View style={{ width: 24 }} />
        </View>
        <View style={styles.centerContainer}>
          <Ionicons name="alert-circle" size={48} color="#DC3545" />
          <Text style={styles.errorText}>{error || 'Flight not found'}</Text>
        </View>
      </View>
    );
  }

  const commonStatus = getMostCommonStatus();

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={24} color="#fff" />
        </Pressable>
        <Text style={styles.headerTitle}>{flight.flight_number}</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Flight Info Card */}
        <View style={styles.card}>
          <View style={styles.cardRow}>
            <View style={styles.airlineBadge}>
              <Text style={styles.airlineBadgeText}>{flight.airline_code}</Text>
            </View>
            <View style={styles.flightInfo}>
              <Text style={styles.flightRoute}>
                {flight.from_airport} → {flight.to_airport}
              </Text>
              <Text style={styles.flightDate}>{flight.travel_date}</Text>
            </View>
          </View>

          <View style={styles.timingRow}>
            <View style={styles.timing}>
              <Text style={styles.timingLabel}>Depart</Text>
              <Text style={styles.timingValue}>{formatTime(flight.depart_at)}</Text>
            </View>
            <View style={styles.timing}>
              <Text style={styles.timingLabel}>Duration</Text>
              <Text style={styles.timingValue}>
                {calculateDuration(flight.depart_at, flight.arrive_at)}
              </Text>
            </View>
            <View style={styles.timing}>
              <Text style={styles.timingLabel}>Arrive</Text>
              <Text style={styles.timingValue}>{formatTime(flight.arrive_at)}</Text>
            </View>
          </View>
        </View>

        {/* Community Load Reports Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Community Load Reports</Text>

          {reports.length === 0 ? (
            <View style={styles.noReportsBox}>
              <Ionicons name="bar-chart-outline" size={32} color="#ddd" />
              <Text style={styles.noReportsText}>No reports yet</Text>
              <Text style={styles.noReportsSubtext}>Be the first to report this flight</Text>
            </View>
          ) : (
            <>
              {/* Summary Bar */}
              <View style={styles.summaryBar}>
                <View style={styles.summaryContent}>
                  <Text style={styles.summaryLabel}>Looks</Text>
                  {commonStatus && <LoadStatusPill status={commonStatus} size="md" />}
                  <Text style={styles.reportCountText}>
                    {reports.length} {reports.length === 1 ? 'report' : 'reports'}
                  </Text>
                </View>
              </View>

              {/* Reports List */}
              <View style={styles.reportsList}>
                {reports.slice(0, 5).map((report) => (
                  <View key={report.id} style={styles.reportRow}>
                    <View style={styles.reportAvatar}>
                      <Text style={styles.reportAvatarText}>
                        {report.user?.display_name?.charAt(0).toUpperCase() || '?'}
                      </Text>
                    </View>
                    <View style={styles.reportContent}>
                      <View style={styles.reportHeader}>
                        <Text style={styles.reportName}>
                          {report.user?.display_name || 'Anonymous'}
                        </Text>
                        <Text style={styles.reportTime}>{timeAgo(report.created_at)}</Text>
                      </View>
                      <View style={styles.reportDetails}>
                        <LoadStatusPill status={report.status} size="sm" />
                        {report.notes && <Text style={styles.reportNotes}>{report.notes}</Text>}
                      </View>
                    </View>
                  </View>
                ))}
              </View>
            </>
          )}
        </View>

        {/* Disclaimer */}
        <View style={styles.disclaimerBox}>
          <Ionicons name="information-circle" size={16} color="#666" />
          <Text style={styles.disclaimerText}>
            Community reports are crowdsourced. Always verify load status in official systems.
          </Text>
        </View>
      </ScrollView>

      {/* Report Button */}
      <View style={styles.footer}>
        <Pressable style={styles.reportButton} onPress={() => setShowReportModal(true)}>
          <Ionicons name="add-circle" size={18} color="#fff" />
          <Text style={styles.reportButtonText}>Report Load</Text>
        </Pressable>
      </View>

      {/* Report Modal */}
      <ReportLoadModal
        visible={showReportModal}
        onClose={() => setShowReportModal(false)}
        onSubmit={async (status, notes) => {
          // In full impl, would call createLoadReport and refresh
          console.log('Report:', status, notes);
          setShowReportModal(false);
        }}
      />
    </View>
  );
}

interface ReportLoadModalProps {
  visible: boolean;
  onClose: () => void;
  onSubmit: (status: 'LIGHT' | 'MEDIUM' | 'HEAVY' | 'FULL', notes?: string) => void;
}

const ReportLoadModal: React.FC<ReportLoadModalProps> = ({ visible, onClose, onSubmit }) => {
  const [selected, setSelected] = useState<'LIGHT' | 'MEDIUM' | 'HEAVY' | 'FULL' | null>(null);
  const [notes, setNotes] = React.useState('');

  const statuses: Array<'LIGHT' | 'MEDIUM' | 'HEAVY' | 'FULL'> = [
    'LIGHT',
    'MEDIUM',
    'HEAVY',
    'FULL',
  ];

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <View style={styles.modalHeader}>
            <Pressable onPress={onClose}>
              <Text style={styles.modalClose}>Cancel</Text>
            </Pressable>
            <Text style={styles.modalTitle}>Report Load Status</Text>
            <Pressable
              onPress={() => {
                if (selected) {
                  onSubmit(selected, notes || undefined);
                }
              }}
              disabled={!selected}
            >
              <Text
                style={[
                  styles.modalClose,
                  !selected && { color: '#ccc' },
                  selected && { color: '#DC3545', fontWeight: '700' },
                ]}
              >
                Send
              </Text>
            </Pressable>
          </View>

          <Text style={styles.modalLabel}>Load Status</Text>

          <View style={styles.statusGrid}>
            {statuses.map((status) => (
              <Pressable
                key={status}
                style={[
                  styles.statusButton,
                  selected === status && styles.statusButtonSelected,
                ]}
                onPress={() => setSelected(status)}
              >
                <Text
                  style={[
                    styles.statusButtonText,
                    selected === status && styles.statusButtonTextSelected,
                  ]}
                >
                  {status}
                </Text>
              </Pressable>
            ))}
          </View>

          <Text style={styles.modalLabel}>Notes (Optional)</Text>
          <TextInput
            style={styles.notesInput}
            placeholder="Add details..."
            value={notes}
            onChangeText={setNotes}
            multiline
            maxLength={200}
            placeholderTextColor="#ccc"
          />

          <Text style={styles.charCount}>{notes.length}/200</Text>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    paddingTop: 44,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#DC3545',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
  },
  content: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorText: {
    marginTop: 12,
    fontSize: 16,
    color: '#DC3545',
    fontWeight: '600',
  },
  card: {
    backgroundColor: '#f9f9f9',
    borderRadius: 12,
    padding: 12,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#eee',
  },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
  },
  airlineBadge: {
    width: 40,
    height: 40,
    borderRadius: 8,
    backgroundColor: '#DC3545',
    justifyContent: 'center',
    alignItems: 'center',
  },
  airlineBadgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
  flightInfo: {
    flex: 1,
  },
  flightRoute: {
    fontSize: 15,
    fontWeight: '700',
    color: '#000',
  },
  flightDate: {
    fontSize: 12,
    color: '#999',
    marginTop: 2,
  },
  timingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  timing: {
    flex: 1,
    alignItems: 'center',
  },
  timingLabel: {
    fontSize: 11,
    color: '#999',
    fontWeight: '500',
  },
  timingValue: {
    fontSize: 14,
    fontWeight: '700',
    color: '#000',
    marginTop: 4,
  },
  section: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#000',
    marginBottom: 12,
  },
  noReportsBox: {
    paddingVertical: 32,
    alignItems: 'center',
    backgroundColor: '#f9f9f9',
    borderRadius: 12,
  },
  noReportsText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000',
    marginTop: 12,
  },
  noReportsSubtext: {
    fontSize: 13,
    color: '#999',
    marginTop: 4,
  },
  summaryBar: {
    paddingHorizontal: 12,
    paddingVertical: 12,
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    marginBottom: 12,
  },
  summaryContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  summaryLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#666',
  },
  reportCountText: {
    fontSize: 12,
    color: '#999',
    marginLeft: 'auto',
  },
  reportsList: {
    gap: 12,
  },
  reportRow: {
    flexDirection: 'row',
    gap: 12,
    padding: 12,
    backgroundColor: '#f9f9f9',
    borderRadius: 8,
  },
  reportAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#DC3545',
    justifyContent: 'center',
    alignItems: 'center',
  },
  reportAvatarText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
  },
  reportContent: {
    flex: 1,
  },
  reportHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  reportName: {
    fontSize: 13,
    fontWeight: '600',
    color: '#000',
  },
  reportTime: {
    fontSize: 11,
    color: '#999',
  },
  reportDetails: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  reportNotes: {
    fontSize: 12,
    color: '#666',
    marginLeft: 4,
  },
  disclaimerBox: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    backgroundColor: '#f9f9f9',
    borderRadius: 8,
    marginBottom: 20,
  },
  disclaimerText: {
    flex: 1,
    fontSize: 12,
    color: '#666',
    lineHeight: 16,
  },
  footer: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: '#eee',
    backgroundColor: '#fff',
  },
  reportButton: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#DC3545',
    borderRadius: 8,
  },
  reportButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#fff',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 32,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#000',
  },
  modalClose: {
    fontSize: 14,
    color: '#DC3545',
  },
  modalLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#999',
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  statusGrid: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 20,
  },
  statusButton: {
    flex: 1,
    paddingHorizontal: 8,
    paddingVertical: 10,
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    alignItems: 'center',
  },
  statusButtonSelected: {
    backgroundColor: '#DC3545',
  },
  statusButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#666',
  },
  statusButtonTextSelected: {
    color: '#fff',
  },
  notesInput: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    marginBottom: 6,
    fontSize: 14,
    color: '#000',
    minHeight: 80,
    textAlignVertical: 'top',
  },
  charCount: {
    fontSize: 11,
    color: '#999',
    textAlign: 'right',
  },
});
