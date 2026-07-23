/**
 * Scan Orchestrator — POST /api/scans
 *
 * Flow:
 * 1. Create a scan record (status: "scanning")
 * 2. Geocode the city → bounding box
 * 3. Generate grid cells (capped at 25)
 * 4. Search each cell via Google Places API
 * 5. Deduplicate by place_id
 * 6. Insert unique businesses into the DB
 * 7. Update scan status to "completed"
 */

import { Hono } from "hono";
import { getDb } from "../db";
import { geocodeCity } from "../lib/geocode";
import { generateGrid } from "../lib/grid";
import { searchNearby, searchText } from "../lib/places";
import {
  getGoogleType,
  getTextSearchQuery,
  needsTextSearchFallback,
} from "../lib/categories";
import type { Database } from "bun:sqlite";

const scans = new Hono();

interface ScanRequest {
  country: string;
  province: string;
  city: string;
  category: string;
}

scans.post("/", async (c) => {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;

  // Validate API key early — if missing, fail clearly
  if (!apiKey) {
    return c.json(
      {
        error:
          "GOOGLE_PLACES_API_KEY environment variable is not set. " +
          "Please configure a Google Places API key to use the city scanner.",
      },
      500
    );
  }

  let body: ScanRequest;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }

  const { country, province, city, category } = body;

  if (!country?.trim() || !city?.trim() || !category?.trim()) {
    return c.json(
      { error: "country, city, and category are required" },
      400
    );
  }

  const db = getDb();

  // 1. Create scan record
  const insertScan = db.prepare(
    `INSERT INTO scans (city, province, country, category, status)
     VALUES (?, ?, ?, ?, 'scanning')`
  );
  const result = insertScan.run(
    city.trim(),
    province?.trim() ?? "",
    country.trim(),
    category.trim()
  );
  const scanId = Number(result.lastInsertRowid);

  try {
    // 2. Geocode the city
    const geo = await geocodeCity(
      country.trim(),
      province?.trim() ?? "",
      city.trim()
    );

    // 3. Generate grid cells
    const cells = generateGrid(geo.bounds);

    // 4. Determine search strategy
    const googleType = getGoogleType(category.trim());
    const useTextSearch = googleType === null;
    const textQuery = useTextSearch
      ? getTextSearchQuery(
          category.trim(),
          city.trim(),
          province?.trim() ?? ""
        )
      : null;

    // 5. Search each cell, collect all results
    const allBusinesses: Map<string, (typeof import("../lib/places"))["PlaceBusiness"]> =
      new Map();

    for (const cell of cells) {
      try {
        if (useTextSearch && textQuery) {
          // Text Search fallback (only once — not per cell, since it's not location-based)
          // We break after the first iteration since text search is global
          const results = await searchText(textQuery, apiKey);
          for (const biz of results) {
            if (!allBusinesses.has(biz.place_id)) {
              allBusinesses.set(biz.place_id, biz);
            }
          }
          break; // Text search is not location-scoped — one call is enough
        } else if (googleType) {
          // Nearby Search per grid cell
          const results = await searchNearby(
            cell.lat,
            cell.lng,
            googleType,
            apiKey
          );
          for (const biz of results) {
            if (!allBusinesses.has(biz.place_id)) {
              allBusinesses.set(biz.place_id, biz);
            }
          }
        }
      } catch (err) {
        // Log individual cell errors but continue scanning
        console.warn(
          `[scan ${scanId}] Cell search failed at (${cell.lat}, ${cell.lng}):`,
          (err as Error).message
        );
      }
    }

    // 6. Insert unique businesses
    const insertBiz = db.prepare(
      `INSERT INTO businesses (scan_id, name, place_id, website_url, phone, address, rating, review_count)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    );

    const insertMany = db.transaction(
      (businesses: (typeof import("../lib/places"))["PlaceBusiness"][]) => {
        for (const biz of businesses) {
          insertBiz.run(
            scanId,
            biz.name,
            biz.place_id,
            biz.websiteUri ?? null,
            biz.nationalPhoneNumber ?? null,
            biz.formattedAddress ?? null,
            biz.rating ?? 0,
            biz.userRatingCount ?? 0
          );
        }
      }
    );

    const bizArray = Array.from(allBusinesses.values());
    insertMany(bizArray);

    // 7. Update scan status
    db.prepare(
      `UPDATE scans
       SET status = 'completed',
           business_count = ?,
           updated_at = datetime('now')
       WHERE id = ?`
    ).run(bizArray.length, scanId);

    return c.json({
      scanId,
      businessCount: bizArray.length,
      message: `Scan complete: found ${bizArray.length} businesses in ${city}, ${province || country}`,
    });
  } catch (err) {
    // Mark scan as failed
    const errorMessage =
      err instanceof Error ? err.message : "Unknown error";
    db.prepare(
      `UPDATE scans
       SET status = 'failed',
           updated_at = datetime('now')
       WHERE id = ?`
    ).run(scanId);

    console.error(`[scan ${scanId}] Scan failed:`, errorMessage);
    return c.json(
      {
        error: errorMessage,
        scanId,
      },
      500
    );
  }
});

export default scans;
