export const flightTrackerKeys = {
  search: (query: string, date: string) => ['flightTracker', 'search', query, date] as const,
  status: (carrierCode: string, flightNumber: string, date: string) =>
    ['flightTracker', 'status', carrierCode, flightNumber, date] as const,
  trackedFlights: (userId: string) => ['flightTracker', 'tracked', userId] as const,
  airportBoard: (airportCode: string, boardType: string) =>
    ['flightTracker', 'board', airportCode, boardType] as const,
  inbound: (flightId: string) => ['flightTracker', 'inbound', flightId] as const,
  searchHistory: (userId: string) => ['flightTracker', 'history', userId] as const,
};
