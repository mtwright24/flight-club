export type Airline = {
  code: string;
  name: string;
  bases: string[];
  logo?: any;
};

export const AIRLINES: Airline[] = [
  { code: 'B6', name: 'JetBlue', bases: ['JFK', 'BOS', 'FLL', 'LGA', 'EWR', 'LAX', 'SFO', 'MCO'] },
  { code: 'UA', name: 'United', bases: ['EWR', 'IAD', 'ORD', 'DEN', 'IAH', 'LAX', 'SFO'] },
  { code: 'DL', name: 'Delta', bases: ['ATL', 'JFK', 'LGA', 'DTW', 'MSP', 'SLC', 'LAX', 'SEA', 'BOS'] },
  { code: 'AA', name: 'American', bases: ['DFW', 'CLT', 'MIA', 'PHX', 'PHL', 'ORD', 'JFK', 'LAX'] },
  { code: 'WN', name: 'Southwest', bases: ['DAL', 'HOU', 'DEN', 'PHX', 'LAS', 'MDW', 'BWI', 'LAX', 'OAK'] },
];

export function getBasesForAirline(code?: string) {
  if (!code) return [];
  const a = AIRLINES.find((x) => x.code === code);
  return a ? a.bases : [];
}

export function getAirlineByCode(code?: string) {
  if (!code) return undefined;
  return AIRLINES.find((x) => x.code === code);
}

export default AIRLINES;
