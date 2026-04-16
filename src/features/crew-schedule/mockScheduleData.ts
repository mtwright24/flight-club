import type { CrewScheduleTrip } from './types';

/** Resolve a trip by id across nearby mock months (demo data only). */
export function getMockTripById(tripId: string): CrewScheduleTrip | undefined {
  const now = new Date();
  for (let i = -3; i <= 3; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
    const trips = getMockTripsForMonth(d.getFullYear(), d.getMonth() + 1);
    const found = trips.find((t) => t.id === tripId);
    if (found) return found;
  }
  return undefined;
}

/** Demo schedule for UI development — replace with API / import pipeline. */
export function getMockTripsForMonth(year: number, month: number): CrewScheduleTrip[] {
  const pad = (d: number) => String(d).padStart(2, '0');
  const y = year;
  const m = pad(month);

  const t = (
    id: string,
    startDay: number,
    endDay: number,
    partial: Omit<CrewScheduleTrip, 'id' | 'month' | 'year' | 'startDate' | 'endDate'>
  ): CrewScheduleTrip => ({
    id,
    month,
    year,
    startDate: `${y}-${m}-${pad(startDay)}`,
    endDate: `${y}-${m}-${pad(endDay)}`,
    ...partial,
  });

  return [
    t('demo-1', 24, 24, {
      pairingCode: 'J3409',
      base: 'JFK',
      dutyDays: 1,
      creditHours: 12,
      status: 'flying',
      routeSummary: 'SFO',
      origin: 'JFK',
      destination: 'SFO',
      layoverCity: 'San Francisco',
      legs: [
        {
          id: 'l1',
          departureAirport: 'JFK',
          arrivalAirport: 'SFO',
          reportLocal: '8:00 AM',
          departLocal: '10:15 AM',
          arriveLocal: '1:42 PM',
          releaseLocal: '2:30 PM',
          flightNumber: 'JB409',
        },
      ],
      hotel: {
        name: 'Airport West Hotel',
        city: 'SFO area',
        address: '100 Cargo Rd',
        shuttleNotes: 'Crew van :15 / :45',
      },
    }),
    t('demo-2', 25, 25, {
      pairingCode: 'J3409',
      base: 'JFK',
      dutyDays: 1,
      creditHours: 0,
      status: 'continuation',
      routeSummary: 'JFK',
      origin: 'SFO',
      destination: 'JFK',
      legs: [
        {
          id: 'l2',
          departureAirport: 'SFO',
          arrivalAirport: 'JFK',
          reportLocal: '6:00 AM',
          departLocal: '7:30 AM',
          arriveLocal: '4:10 PM',
          flightNumber: 'JB410',
        },
      ],
    }),
    t('demo-off', 26, 26, {
      pairingCode: '—',
      base: 'JFK',
      dutyDays: 0,
      status: 'off',
      routeSummary: 'OFF',
      legs: [],
    }),
    t('demo-rsv', 27, 27, {
      pairingCode: 'RSV1',
      base: 'JFK',
      dutyDays: 0,
      status: 'rsv',
      routeSummary: 'RSV',
      legs: [],
    }),
    t('demo-pto', 28, 28, {
      pairingCode: '—',
      base: 'JFK',
      dutyDays: 0,
      status: 'pto',
      routeSummary: 'PTO',
      legs: [],
    }),
    t('demo-dh', 29, 29, {
      pairingCode: 'DH',
      base: 'JFK',
      dutyDays: 1,
      creditHours: 3,
      status: 'deadhead',
      routeSummary: 'DH · BOS JFK',
      origin: 'BOS',
      destination: 'JFK',
      legs: [
        {
          id: 'l3',
          departureAirport: 'BOS',
          arrivalAirport: 'JFK',
          reportLocal: '5:30 AM',
          departLocal: '7:00 AM',
          arriveLocal: '8:05 AM',
          isDeadhead: true,
        },
      ],
    }),
  ];
}
