/**
 * Category Mapper — maps LeadHunter AI categories to Google Places API types.
 *
 * For categories without a direct Google Places type, we return null
 * and the caller should fall back to Text Search with the category name.
 */

/** Maps our display category names to Google Places API v1 place types */
const CATEGORY_TO_GOOGLE_TYPE: Record<string, string> = {
  Roofing: "roofing_contractor",
  Plumbing: "plumber",
  Dental: "dentist",
  "Law Firm": "lawyer",
  "Real Estate Agent": "real_estate_agency",
  Restaurant: "restaurant",
  Gym: "gym",
  Salon: "beauty_salon",
  "Auto Repair": "car_repair",
  Electrician: "electrician",
  HVAC: "hvac_contractor",
  Landscaping: "landscaper",
  Painting: "painter",
  "Cleaning Service": "house_cleaning_service",
  Chiropractor: "chiropractor",
  Veterinarian: "veterinary_care",
  Accountant: "accounting",
  "Insurance Agent": "insurance_agency",
  Photographer: "photographer",
  Bakery: "bakery",
  Florist: "florist",
  "Massage Therapy": "massage_therapist",
  "Moving Company": "moving_company",
  "Pest Control": "pest_control_service",
  Locksmith: "locksmith",
  Daycare: "day_care",
  "Funeral Home": "funeral_home",
};

/**
 * Categories that don't have a direct Google Places type.
 * These must use Text Search fallback with the category name + city.
 */
const TEXT_SEARCH_FALLBACKS: Record<string, string> = {
  "Pet Grooming": "pet grooming",
  Tutoring: "tutoring service",
  Catering: "catering company",
};

/**
 * Returns the Google Places API type for a given category, or null if Text Search should be used.
 */
export function getGoogleType(category: string): string | null {
  return CATEGORY_TO_GOOGLE_TYPE[category] ?? null;
}

/**
 * Returns the text query string for categories that need Text Search fallback.
 * Returns null if the category has a direct Google type mapping (use Nearby Search instead).
 */
export function getTextSearchQuery(
  category: string,
  city: string,
  province: string
): string | null {
  const fallback = TEXT_SEARCH_FALLBACKS[category];
  if (!fallback) return null;
  return `${fallback} in ${city}, ${province}`;
}

/**
 * Returns true if this category needs Text Search fallback (no direct Google type).
 */
export function needsTextSearchFallback(category: string): boolean {
  return category in TEXT_SEARCH_FALLBACKS;
}
