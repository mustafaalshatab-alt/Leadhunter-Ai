/**
 * Geocoding Utility — converts city/province/country to lat/lng bounding box
 * using the Google Geocoding API.
 *
 * Results are cached in-memory since city+province combos don't change.
 */

export interface GeocodeResult {
  lat: number;
  lng: number;
  bounds: {
    ne: { lat: number; lng: number };
    sw: { lat: number; lng: number };
  };
}

// In-memory cache keyed by "country|province|city"
const cache = new Map<string, GeocodeResult>();

function cacheKey(country: string, province: string, city: string): string {
  return `${country}|${province}|${city}`;
}

/**
 * Geocode a city using Google Geocoding API.
 * Returns the viewport bounding box and center coordinates.
 * Throws if the API key is missing or the geocoding fails.
 */
export async function geocodeCity(
  country: string,
  province: string,
  city: string
): Promise<GeocodeResult> {
  const key = cacheKey(country, province, city);
  const cached = cache.get(key);
  if (cached) return cached;

  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) {
    throw new Error(
      "GOOGLE_PLACES_API_KEY environment variable is not set. " +
      "Please configure your Google API key to use the city scanner."
    );
  }

  const address = [city, province, country].filter(Boolean).join(", ");
  const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${apiKey}`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Geocoding API returned HTTP ${response.status}`);
  }

  const data = (await response.json()) as {
    status: string;
    results: Array<{
      geometry: {
        viewport: {
          northeast: { lat: number; lng: number };
          southwest: { lat: number; lng: number };
        };
        location: { lat: number; lng: number };
      };
    }>;
  };

  if (data.status !== "OK" || !data.results?.length) {
    throw new Error(
      `Geocoding failed for "${address}". Status: ${data.status}. ` +
      "Check that the city, province, and country combination is valid."
    );
  }

  const result = data.results[0];
  const geo: GeocodeResult = {
    lat: result.geometry.location.lat,
    lng: result.geometry.location.lng,
    bounds: {
      ne: {
        lat: result.geometry.viewport.northeast.lat,
        lng: result.geometry.viewport.northeast.lng,
      },
      sw: {
        lat: result.geometry.viewport.southwest.lat,
        lng: result.geometry.viewport.southwest.lng,
      },
    },
  };

  cache.set(key, geo);
  return geo;
}
