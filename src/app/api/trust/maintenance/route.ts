import { NextResponse } from "next/server";
import { getDb, ProductSource } from "@/lib/db";
import { getTrustScore } from "@/services/trust-score";

/**
 * POST /api/trust/maintenance
 *
 * Trust score maintenance job. Should be called periodically (e.g. daily).
 *
 * 1. Find all trust_cache entries older than 7 days.
 * 2. For each: check if any product_source still references that domain.
 *    - Still in use? Re-score it.
 *    - Not in use? Delete from cache.
 * 3. Clean up stale scoring locks.
 */
export async function POST() {
  const db = getDb();

  // Clean up stale locks first
  const staleLocks = db.prepare(
    "DELETE FROM trust_scoring_locks WHERE datetime(locked_at, '+5 minutes') < datetime('now')"
  ).run();
  if (staleLocks.changes > 0) {
    console.log(`[TrustMaintenance] Cleaned ${staleLocks.changes} stale locks`);
  }

  // Find all expired cache entries (older than 7 days)
  const expired = db.prepare(
    "SELECT domain, retailer FROM trust_cache WHERE datetime(checked_at, '+7 days') < datetime('now')"
  ).all() as { domain: string; retailer: string }[];

  if (expired.length === 0) {
    console.log("[TrustMaintenance] No expired entries");
    return NextResponse.json({ refreshed: 0, cleaned: 0 });
  }

  console.log(`[TrustMaintenance] Found ${expired.length} expired trust entries`);

  let refreshed = 0;
  let cleaned = 0;

  for (const { domain, retailer } of expired) {
    // Check if any source still uses this domain
    const inUse = db.prepare(
      "SELECT id, url FROM product_sources WHERE url LIKE ? LIMIT 1"
    ).get(`%${domain}%`) as { id: number; url: string } | undefined;

    if (!inUse) {
      // No product uses this domain anymore — delete from cache
      db.prepare("DELETE FROM trust_cache WHERE domain = ?").run(domain);
      console.log(`[TrustMaintenance] Cleaned orphaned cache: ${domain}`);
      cleaned++;
      continue;
    }

    // Still in use — re-score it
    try {
      // Acquire lock
      const lock = db.prepare(
        "INSERT OR IGNORE INTO trust_scoring_locks (domain, status, locked_at) VALUES (?, 'locked', datetime('now'))"
      ).run(domain);
      if (lock.changes === 0) {
        console.log(`[TrustMaintenance] ${domain} already being scored, skipping`);
        continue;
      }

      try {
        const result = await getTrustScore(retailer, inUse.url);

        // Update cache
        db.prepare(
          "INSERT OR REPLACE INTO trust_cache (domain, retailer, score, summary, details_json, checked_at) VALUES (?, ?, ?, ?, ?, datetime('now'))"
        ).run(domain, retailer, result.score, result.summary, JSON.stringify({ categories: result.categories, factors: result.factors }));

        // Update ALL sources that use this domain
        const sources = db.prepare(
          "SELECT id FROM product_sources WHERE url LIKE ?"
        ).all(`%${domain}%`) as { id: number }[];

        for (const source of sources) {
          db.prepare(
            "UPDATE product_sources SET trust_score = ?, trust_summary = ? WHERE id = ?"
          ).run(result.score, result.summary, source.id);
        }

        console.log(`[TrustMaintenance] Refreshed ${domain}: ${result.score}/100 (updated ${sources.length} sources)`);
        refreshed++;
      } finally {
        db.prepare("DELETE FROM trust_scoring_locks WHERE domain = ?").run(domain);
      }
    } catch (err) {
      console.error(`[TrustMaintenance] Failed for ${domain}:`, err);
      db.prepare("DELETE FROM trust_scoring_locks WHERE domain = ?").run(domain);
    }
  }

  console.log(`[TrustMaintenance] Done: ${refreshed} refreshed, ${cleaned} cleaned`);
  return NextResponse.json({ refreshed, cleaned, total: expired.length });
}
