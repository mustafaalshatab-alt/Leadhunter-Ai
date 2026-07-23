/**
 * Google Places API Client — search for businesses using
 * the new Places API (v1) Nearby Search and Text Search endpoints.
 */

export interface PlaceBusiness {
  place_id: string;
  name: string;
  formattedAddress?: string;
  nationalPhoneNumber?: string;
  websiteUri?: string;
  rating?: number;
  userRatingCount?: number;
  businessStatus?: string;
  types?: string[];
}

interface PlacesNearbyResponse {
  places?: Array<{
    id: string;
    displayName?: { text: string };
    formattedAddress?: string;
    nationalPhoneNumber?: string;
    websiteUri?: string;
    rating?: number;
    userRatingCount?: number;
    businessStatus?: string;
    types?: string[];
  }>;
}

interface PlacesTextResponse {
  places?: Array<{
    id: string;
    displayName?: { text: string };
    formattedAddress?: string;
    nationalPhoneNumber?: string;
    websiteUri?: string;
    rating?: number;
    userRatingCount?: number;
    businessStatus?: string;
    types?: string[];
  }>;
}

const PLACES_API_BASE = "https://places.googleapis.com/v1";
const FIELD_MASK =
  "places.id,places.displayName,places.formattedAddress," +
  "places.nationalPhoneNumber,places.websiteUri,places.rating," +
  "places.userRatingCount,places.businessStatus,places.types";

function getApiKey(): string {
  const key = process.env.GOOGLE_PLACES_API_KEY;
  if (!key) {
    throw new Error(
      "GOOGLE_PLACES_API_KEY environment variable is not set."
    );
  }
  return key;
}

function normalizePlace(raw: PlacesNearbyResponse["places"] extends (infer T)[] | undefined ? T : never): PlaceBusiness {
  return {
    place_id: raw.id,
    name: raw.displayName?.text ?? "Unknown",
    formattedAddress: raw.formattedAddress,
    nationalPhoneNumber: raw.nationalPhoneNumber,
    websiteUri: raw.websiteUri,
    rating: raw.rating,
    userRatingCount: raw.userRatingCount,
    businessStatus: raw.businessStatus,
    types: raw.types,
  };
}

/**
 * Search for businesses near a point using the Nearby Search endpoint.
 * Returns up to 20 results per call (Google's max per page).
 */
export async function searchNearby(
  lat: number,
  lng: number,
  googleType: string,
  apiKey?: string
): Promise<PlaceBusiness[]> {
  const key = apiKey ?? getApiKey();
  const url = `${PLACES_API_BASE}/places:searchNearby`;

  const body = {
    includedTypes: [googleType],
    maxResultCount: 20,
    locationRestriction: {
      circle: {
        center: { latitude: lat, longitude: lng },
        radius: 3000.0, // 3km search radius per cell
      },
    },
  };

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": key,
      "X-Goog-FieldMask": FIELD_MASK,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Places Nearby Search failed (HTTP ${response.status}): ${errorText}`
    );
  }

  const data = (await response.json()) as PlacesNearbyResponse;
  return (data.places ?? []).map(normalizePlace);
}

/**
 * Search for businesses using Text Search (fallback for categories
 * without a direct Google Places type).
 */
export async function searchText(
  textQuery: string,
  apiKey?: string
): Promise<PlaceBusiness[]> {
  const key = apiKey ?? getApiKey();
  const url = `${PLACES_API_BASE}/places:searchText`;

  const body = {
    textQuery,
    maxResultCount: 20,
  };

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": key,
      "X-Goog-FieldMask": FIELD_MASK,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Places Text Search failed (HTTP ${response.status}): ${errorText}`
    );
  }

  const data = (await response.json()) as PlacesTextResponse;
  return (data.places ?? []).map(normalizePlace);
}
