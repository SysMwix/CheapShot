import Database from "better-sqlite3";
import path from "path";

const DB_PATH = path.join(process.cwd(), "cheapshot.db");

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma("journal_mode = WAL");
    db.pragma("foreign_keys = ON");
    migrate(db);
  }
  return db;
}

function addColumnIfMissing(db: Database.Database, table: string, column: string, definition: string) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  if (!cols.some((c) => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

function migrate(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      desired_price REAL,
      currency TEXT NOT NULL DEFAULT 'GBP',
      search_status TEXT NOT NULL DEFAULT 'pending',
      check_frequency TEXT NOT NULL DEFAULT 'manual',
      check_day INTEGER,
      min_trust_score INTEGER NOT NULL DEFAULT 0,
      excluded_retailers TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS product_sources (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER NOT NULL,
      retailer TEXT NOT NULL,
      url TEXT NOT NULL,
      image_url TEXT,
      current_price REAL,
      previous_price REAL,
      currency TEXT NOT NULL DEFAULT 'GBP',
      trust_score REAL,
      trust_summary TEXT,
      last_checked_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS price_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source_id INTEGER NOT NULL,
      price REAL NOT NULL,
      checked_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (source_id) REFERENCES product_sources(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS trust_cache (
      domain TEXT PRIMARY KEY,
      retailer TEXT NOT NULL,
      score REAL NOT NULL,
      summary TEXT,
      details_json TEXT,
      checked_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
}

export type CheckFrequency = "manual" | "daily" | "weekly" | "monthly";

export interface Product {
  id: number;
  name: string;
  desired_price: number | null;
  currency: string;
  search_status: "pending" | "searching" | "done" | "error";
  check_frequency: CheckFrequency;
  check_day: number | null;
  min_trust_score: number;
  excluded_retailers: string; // JSON array string
  created_at: string;
  updated_at: string;
}

export interface ProductSource {
  id: number;
  product_id: number;
  retailer: string;
  url: string;
  image_url: string | null;
  current_price: number | null;
  previous_price: number | null;
  currency: string;
  trust_score: number | null;
  trust_summary: string | null;
  last_checked_at: string | null;
  created_at: string;
}

export interface PriceHistory {
  id: number;
  source_id: number;
  price: number;
  checked_at: string;
}
