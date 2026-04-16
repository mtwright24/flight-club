/**
 * TradeRow Component
 * Compact 2-line row display for high-density feed
 * Line 1: Route • Trip • Type [$ incentive] [📷 screenshot]
 * Line 2: Date • Time • Credit mins (right: interest count)
 */

import React from 'react';
import {
  View,
  TouchableOpacity,
  Pressable,
  Text,
  StyleSheet,
} from 'react-native';
import type { TradePost } from '../../types/trades';
import { colors } from '../../styles/theme';

interface TradeRowProps {
  trade: TradePost;
  onPress: () => void;
  onInterestPress?: () => void;
  userInterested?: boolean;
}

export const TradeRow: React.FC<TradeRowProps> = ({
  trade,
  onPress,
  onInterestPress,
  userInterested,
}) => {
  // Format route display
  const routeDisplay = getRouteDisplay(trade);
  
  // Format time display
  const timeDisplay = trade.report_time ? formatTime(trade.report_time) : '--:--';
  
  // Format date display (relative)
  const dateDisplay = formatRelativeDate(trade.pairing_date);
  
  // Format minutes display
  const minutesDisplay = formatMinutes(trade.credit_minutes);
  
  // Interest count
  const interestCount = trade.interest_count || 0;

  const styles = getStyles();

  return (
    <View style={styles.container}>
      <Pressable style={styles.pressArea} onPress={onPress} android_ripple={{ color: '#EAEAEA' }}>
        {/* Line 1: Route, Trip, Type, Badges */}
        <View style={styles.line1}>
          <View style={styles.line1Left}>
            {/* Route */}
            <Text style={styles.routeText} numberOfLines={1}>
              {routeDisplay}
            </Text>

            {/* Type Badge */}
            <View style={[styles.typeBadge, getTypeBadgeStyle(trade.type)]}>
              <Text style={styles.typeBadgeText}>{trade.type.toUpperCase()}</Text>
            </View>

            {/* Incentive Badge (if has) */}
            {trade.has_incentive && trade.incentive_amount && (
              <View style={styles.incentiveBadge}>
                <Text style={styles.incentiveText}>
                  ${trade.incentive_amount}
                </Text>
              </View>
            )}

            {/* Screenshot Indicator */}
            {trade.has_screenshot && (
              <Text style={styles.screenshotIcon}>📷</Text>
            )}
          </View>

          {/* Interest Count (right aligned) */}
          <Text style={styles.interestCount}>
            {interestCount > 0 ? `${interestCount}` : ''}
          </Text>
        </View>

        {/* Line 2: Date, Time, Minutes */}
        <View style={styles.line2}>
          <Text style={styles.metaText} numberOfLines={1}>
            {dateDisplay} • {timeDisplay} • {minutesDisplay}
          </Text>
        </View>
      </Pressable>

      {/* Interest Button (optional, top right) */}
      {onInterestPress && (
        <TouchableOpacity
          style={[
            styles.interestButton,
            userInterested && styles.interestButtonActive,
          ]}
          onPress={onInterestPress}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={styles.interestButtonText}>
            {userInterested ? '❤️' : '🤍'}
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
};

/**
 * Helper Functions
 */

function getRouteDisplay(trade: TradePost): string {
  if (trade.route_from && trade.route_to) {
    return `${trade.route_from} ${trade.route_to}`;
  }
  if (trade.route_from) {
    return `${trade.route_from} · ?`;
  }
  if (trade.route_to) {
    return `? ${trade.route_to}`;
  }
  return 'Trip TBD';
}

function formatTime(time: string): string {
  try {
    const [hour, minute] = time.split(':');
    const h = parseInt(hour, 10);
    const m = minute;
    const ampm = h >= 12 ? 'p' : 'a';
    const displayH = h > 12 ? h - 12 : h === 0 ? 12 : h;
    return `${displayH}:${m}${ampm}`;
  } catch {
    return time;
  }
}

function formatRelativeDate(dateStr: string): string {
  try {
    const date = new Date(dateStr);
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const dateOnly = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const todayOnly = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const tomorrowOnly = new Date(tomorrow.getFullYear(), tomorrow.getMonth(), tomorrow.getDate());

    if (dateOnly.getTime() === todayOnly.getTime()) {
      return 'Today';
    }
    if (dateOnly.getTime() === tomorrowOnly.getTime()) {
      return 'Tomorrow';
    }

    // Format as "Jan 15" or "Dec 25"
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  } catch {
    return dateStr;
  }
}

function formatMinutes(minutes?: number): string {
  if (!minutes) return '-- CR';
  return `${minutes} CR`;
}

function getTypeBadgeStyle(type: string): any {
  const styles: Record<string, any> = {
    swap: {
      backgroundColor: '#1D4ED8',
    },
    drop: {
      backgroundColor: colors.headerRed,
    },
    pickup: {
      backgroundColor: '#16A34A',
    },
  };
  return styles[type] || styles.swap;
}

/**
 * Styles
 */

function getStyles() {
  return StyleSheet.create({
    container: {
      position: 'relative',
      borderBottomWidth: 1,
      borderBottomColor: '#E5E5E5',
      backgroundColor: '#FFFFFF',
    },

    pressArea: {
      paddingHorizontal: 16,
      paddingVertical: 10,
    },

    // Line 1: Route, Type, Badges
    line1: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 4,
    },

    line1Left: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      flex: 1,
    },

    routeText: {
      fontSize: 14,
      fontWeight: '600',
      color: '#000000',
    },

    typeBadge: {
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 4,
    },

    typeBadgeText: {
      fontSize: 10,
      fontWeight: '600',
      color: '#FFFFFF',
    },

    incentiveBadge: {
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 4,
      backgroundColor: '#FFB800',
    },

    incentiveText: {
      fontSize: 10,
      fontWeight: '700',
      color: '#FFFFFF',
    },

    screenshotIcon: {
      fontSize: 12,
    },

    interestCount: {
      fontSize: 12,
      fontWeight: '600',
      color: '#666666',
      marginLeft: 8,
    },

    // Line 2: Date, Time, Minutes
    line2: {
      flexDirection: 'row',
      justifyContent: 'space-between',
    },

    metaText: {
      fontSize: 12,
      color: '#666666',
    },

    // Interest button
    interestButton: {
      position: 'absolute',
      top: 8,
      right: 16,
      width: 28,
      height: 28,
      borderRadius: 14,
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: '#F0F0F0',
    },

    interestButtonActive: {
      backgroundColor: colors.headerRedTint,
    },

    interestButtonText: {
      fontSize: 14,
    },
  });
}
