import { Database } from "bun:sqlite";
import { join } from "path";

const DB_PATH = join(import.meta.dir, "..", "leadhunter.db");

let db: Database;

export function getDb(): Database {
  if (!db) {
    db = new Database(DB_PATH);
    db.exec("PRAGMA journal_mode = WAL");
    db.exec("PRAGMA foreign_keys = ON");
    runMigrations(db);
  }
  return db;
}

function runMigrations(db: Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS scans (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      city TEXT NOT NULL,
      province TEXT NOT NULL,
      country TEXT NOT NULL,
      category TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      business_count INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS businesses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      scan_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      place_id TEXT,
      website_url TEXT,
      phone TEXT,
      address TEXT,
      rating REAL DEFAULT 0,
      review_count INTEGER DEFAULT 0,
      lead_score REAL DEFAULT 0,
      analysis_json TEXT DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (scan_id) REFERENCES scans(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_businesses_scan_id ON businesses(scan_id);
    CREATE INDEX IF NOT EXISTS idx_scans_status ON scans(status);
  `);

  // Migration: add columns that may be missing from older DBs
  migrateAddColumn(db, "businesses", "phone", "TEXT");
  migrateAddColumn(db, "businesses", "address", "TEXT");
  migrateAddColumn(db, "businesses", "rating", "REAL DEFAULT 0");
  migrateAddColumn(db, "businesses", "review_count", "INTEGER DEFAULT 0");
  migrateAddColumn(db, "scans", "business_count", "INTEGER NOT NULL DEFAULT 0");

  console.log("📦 Database ready — tables migrated.");
}

/** Safely add a column if it doesn't already exist (SQLite doesn't support IF NOT EXISTS for ALTER TABLE) */
function migrateAddColumn(
  db: Database,
  table: string,
  column: string,
  type: string
): void {
  try {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
  } catch {
    // Column already exists — ignore
  }
}
