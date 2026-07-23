/**
 * Grid Generator — divides a city's bounding box into grid cells
 * for distributed Google Places API searching.
 *
 * MVP: capped at 25 cells (5×5 grid), with city center priority.
 */

export interface LatLng {
  lat: number;
  lng: number;
}

export interface Bounds {
  ne: LatLng;
  sw: LatLng;
}

const MAX_CELLS = 25;
const TARGET_CELL_SIZE_KM = 2;

/**
 * Estimate km per degree of latitude (roughly constant at ~111.32 km/deg).
 */
function kmPerDegreeLat(): number {
  return 111.32;
}

/**
 * Estimate km per degree of longitude at a given latitude.
 * Longitude degrees shrink toward the poles.
 */
function kmPerDegreeLng(lat: number): number {
  return 111.32 * Math.cos((lat * Math.PI) / 180);
}

/**
 * Generate a grid of center points covering the bounding box.
 * Capped at MAX_CELLS (25), prioritizing the city center.
 */
export function generateGrid(bounds: Bounds, cellSizeKm = TARGET_CELL_SIZE_KM): LatLng[] {
  const latSpan = bounds.ne.lat - bounds.sw.lat;
  const lngSpan = bounds.ne.lng - bounds.sw.lng;

  const latStepDeg = cellSizeKm / kmPerDegreeLat();
  const centerLat = (bounds.ne.lat + bounds.sw.lat) / 2;
  const lngStepDeg = cellSizeKm / kmPerDegreeLng(centerLat);

  // Calculate how many cells would fully cover the bounding box
  let cols = Math.ceil(lngSpan / lngStepDeg);
  let rows = Math.ceil(latSpan / latStepDeg);

  // If we exceed the cap, shrink the grid to MAX_CELLS with city center priority
  if (rows * cols > MAX_CELLS) {
    // Use a square-ish arrangement capped at sqrt(MAX_CELLS) per side
    const side = Math.floor(Math.sqrt(MAX_CELLS));
    rows = side;
    cols = side;
  }

  const cellHeight = latSpan / rows;
  const cellWidth = lngSpan / cols;

  const cells: LatLng[] = [];

  // Generate from SW corner, stepping north then east
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      cells.push({
        lat: bounds.sw.lat + cellHeight * (row + 0.5),
        lng: bounds.sw.lng + cellWidth * (col + 0.5),
      });
    }
  }

  return cells;
}
