/**
 * Approximate airport centroids for map pins (listings only store IATA base_airport).
 * Extend as needed for new bases.
 */
const IATA_COORDS: Record<string, { latitude: number; longitude: number }> = {
  ATL: { latitude: 33.6407, longitude: -84.4277 },
  BOS: { latitude: 42.3656, longitude: -71.0096 },
  BWI: { latitude: 39.1774, longitude: -76.6684 },
  CLT: { latitude: 35.214, longitude: -80.9431 },
  DCA: { latitude: 38.8512, longitude: -77.0402 },
  DEN: { latitude: 39.8561, longitude: -104.6737 },
  DFW: { latitude: 32.8998, longitude: -97.0403 },
  DTW: { latitude: 42.2162, longitude: -83.3554 },
  EWR: { latitude: 40.6895, longitude: -74.1745 },
  FLL: { latitude: 26.0742, longitude: -80.1506 },
  HNL: { latitude: 21.3245, longitude: -157.9251 },
  HOU: { latitude: 29.6454, longitude: -95.2789 },
  IAD: { latitude: 38.9531, longitude: -77.4565 },
  JFK: { latitude: 40.6413, longitude: -73.7781 },
  LAS: { latitude: 36.084, longitude: -115.1537 },
  LAX: { latitude: 33.9416, longitude: -118.4085 },
  LGA: { latitude: 40.7769, longitude: -73.874 },
  MCO: { latitude: 28.4312, longitude: -81.308 },
  MIA: { latitude: 25.7959, longitude: -80.287 },
  MSP: { latitude: 44.8848, longitude: -93.2223 },
  ORD: { latitude: 41.9742, longitude: -87.9073 },
  PDX: { latitude: 45.5898, longitude: -122.5951 },
  PHL: { latitude: 39.8729, longitude: -75.2437 },
  PHX: { latitude: 33.4346, longitude: -112.0114 },
  SAN: { latitude: 32.7338, longitude: -117.1933 },
  SEA: { latitude: 47.4502, longitude: -122.3088 },
  SFO: { latitude: 37.6213, longitude: -122.379 },
  SLC: { latitude: 40.7899, longitude: -111.9791 },
  STL: { latitude: 38.7487, longitude: -90.37 },
  TPA: { latitude: 27.9755, longitude: -82.5332 },
};

const US_CENTER = { latitude: 39.8283, longitude: -98.5795 };

/** Small spread so multiple pins at one airport don’t stack exactly. */
export function listingCoordinateJitter(id: string): { dLat: number; dLng: number } {
  let h = 0;
  for (let i = 0; i < id.length; i++) {
    h = (h * 31 + id.charCodeAt(i)) | 0;
  }
  const a = (Math.abs(h) % 1000) / 1000 - 0.5;
  const b = ((Math.abs(h / 1000) | 0) % 1000) / 1000 - 0.5;
  return { dLat: a * 0.04, dLng: b * 0.04 };
}

export function coordinateForBaseAirport(iata: string | null | undefined): { latitude: number; longitude: number } {
  const code = (iata || '').trim().toUpperCase();
  const base = IATA_COORDS[code] || US_CENTER;
  return { ...base };
}

export function regionForCoordinates(
  coords: { latitude: number; longitude: number }[],
  padding = 0.35
): { latitude: number; longitude: number; latitudeDelta: number; longitudeDelta: number } {
  if (!coords.length) {
    return {
      ...US_CENTER,
      latitudeDelta: 28,
      longitudeDelta: 48,
    };
  }
  let minLat = coords[0].latitude;
  let maxLat = coords[0].latitude;
  let minLng = coords[0].longitude;
  let maxLng = coords[0].longitude;
  for (const c of coords) {
    minLat = Math.min(minLat, c.latitude);
    maxLat = Math.max(maxLat, c.latitude);
    minLng = Math.min(minLng, c.longitude);
    maxLng = Math.max(maxLng, c.longitude);
  }
  const latD = Math.max(0.08, (maxLat - minLat) * (1 + padding) || 0.5);
  const lngD = Math.max(0.08, (maxLng - minLng) * (1 + padding) || 0.5);
  return {
    latitude: (minLat + maxLat) / 2,
    longitude: (minLng + maxLng) / 2,
    latitudeDelta: latD,
    longitudeDelta: lngD,
  };
}
