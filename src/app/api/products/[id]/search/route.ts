import { NextRequest, NextResponse } from "next/server";
import { getDb, Product, ProductSource } from "@/lib/db";
import { searchProducts } from "@/services/ai-search";
import { getTrustScore } from "@/services/trust-score";

type RouteContext = { params: Promise<{ id: string }> };

// POST /api/products/[id]/search — find sources and verify live prices
export async function POST(request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  const body = await request.json().catch(() => ({}));
  const { country, currency, excludeRetailers, sizePrefs, searchHint } = body;

  const db = getDb();
  const product = db.prepare("SELECT * FROM products WHERE id = ?").get(id) as Product | undefined;

  if (!product) {
    return NextResponse.json({ error: "Product not found" }, { status: 404 });
  }

  const existingCount = db
    .prepare("SELECT COUNT(*) as count FROM product_sources WHERE product_id = ?")
    .get(id) as { count: number };

  if (existingCount.count >= 10) {
    return NextResponse.json({ error: "Maximum 10 sources per product" }, { status: 400 });
  }

  db.prepare("UPDATE products SET search_status = 'searching', updated_at = datetime('now') WHERE id = ?").run(id);

  try {
    const existingSources = db
      .prepare("SELECT retailer FROM product_sources WHERE product_id = ?")
      .all(id) as { retailer: string }[];
    const blacklisted: string[] = JSON.parse(product.excluded_retailers || "[]");
    const allExcluded = [
      ...existingSources.map((s) => s.retailer),
      ...blacklisted,
      ...(excludeRetailers || []),
    ];

    const slotsLeft = 10 - existingCount.count;

    console.log(`[Search] Finding retailers for "${product.name}"...`);
    const verifiedOffers = await searchProducts(
      product.name,
      country,
      currency || product.currency,
      allExcluded.length > 0 ? allExcluded : undefined,
      sizePrefs || undefined,
      searchHint || undefined
    );

    const insertStmt = db.prepare(
      `INSERT INTO product_sources (product_id, retailer, url, image_url, current_price, currency, variant_name, last_checked_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))`
    );
    const insertHistory = db.prepare(
      `INSERT INTO price_history (source_id, price) VALUES (?, ?)`
    );

    const toInsert = verifiedOffers.slice(0, slotsLeft);
    const newSourceIds: number[] = [];
    for (const offer of toInsert) {
      if (!offer.price || offer.price <= 0) continue;

      const result = insertStmt.run(
        id,
        offer.retailer,
        offer.url,
        offer.image_url,
        offer.price,
        offer.currency,
        offer.variant || null
      );
      insertHistory.run(result.lastInsertRowid, offer.price);
      newSourceIds.push(Number(result.lastInsertRowid));
    }

    db.prepare("UPDATE products SET search_status = 'done', updated_at = datetime('now') WHERE id = ?").run(id);

    const sources = db
      .prepare("SELECT * FROM product_sources WHERE product_id = ? ORDER BY current_price ASC")
      .all(id) as ProductSource[];

    // Fire off trust scores in the background
    scoreSources(newSourceIds);

    return NextResponse.json({ product: { ...product, search_status: "done" }, sources });
  } catch (err) {
    console.error("Search failed:", err);
    db.prepare("UPDATE products SET search_status = 'error', updated_at = datetime('now') WHERE id = ?").run(id);
    return NextResponse.json({ error: "Search failed" }, { status: 500 });
  }
}

/**
 * Score all sources concurrently with idempotency.
 */
async function scoreSources(sourceIds: number[]) {
  const db = getDb();

  db.prepare(
    "DELETE FROM trust_scoring_locks WHERE datetime(locked_at, '+5 minutes') < datetime('now')"
  ).run();

  await Promise.all(sourceIds.map((id) => scoreOneSource(db, id)));
}

async function scoreOneSource(db: ReturnType<typeof getDb>, sourceId: number) {
  try {
    const source = db.prepare("SELECT * FROM product_sources WHERE id = ?").get(sourceId) as ProductSource | undefined;
    if (!source) return;

    const domain = extractDomain(source.url);

    const cached = checkCache(db, domain);
    if (cached) {
      applyScore(db, sourceId, cached.score, cached.summary);
      console.log(`[Trust] ${source.retailer}: ${cached.score}/100 (cached)`);
      return;
    }

    const gotLock = tryAcquireLock(db, domain);

    if (gotLock) {
      try {
        const result = await getTrustScore(source.retailer, source.url);

        db.prepare(
          "INSERT OR REPLACE INTO trust_cache (domain, retailer, score, summary, details_json, checked_at) VALUES (?, ?, ?, ?, ?, datetime('now'))"
        ).run(domain, source.retailer, result.score, result.summary, JSON.stringify({ categories: result.categories, factors: result.factors }));

        applyScore(db, sourceId, result.score, result.summary);
        console.log(`[Trust] ${source.retailer}: ${result.score}/100`);
      } finally {
        db.prepare("DELETE FROM trust_scoring_locks WHERE domain = ?").run(domain);
      }
    } else {
      console.log(`[Trust] ${source.retailer}: waiting for another worker to score ${domain}...`);
      const result = await waitForCache(db, domain);
      if (result) {
        applyScore(db, sourceId, result.score, result.summary);
        console.log(`[Trust] ${source.retailer}: ${result.score}/100 (waited)`);
      } else {
        console.log(`[Trust] ${source.retailer}: timed out waiting for score`);
      }
    }
  } catch (err) {
    console.error(`[Trust] Failed for source ${sourceId}:`, err);
  }
}

function checkCache(db: ReturnType<typeof getDb>, domain: string) {
  return db.prepare(
    "SELECT score, summary, details_json FROM trust_cache WHERE domain = ? AND datetime(checked_at, '+7 days') > datetime('now')"
  ).get(domain) as { score: number; summary: string; details_json: string | null } | undefined;
}

function tryAcquireLock(db: ReturnType<typeof getDb>, domain: string): boolean {
  const result = db.prepare(
    "INSERT OR IGNORE INTO trust_scoring_locks (domain, status, locked_at) VALUES (?, 'locked', datetime('now'))"
  ).run(domain);
  return result.changes > 0;
}

function applyScore(db: ReturnType<typeof getDb>, sourceId: number, score: number, summary: string) {
  db.prepare(
    "UPDATE product_sources SET trust_score = ?, trust_summary = ? WHERE id = ?"
  ).run(score, summary, sourceId);
}

async function waitForCache(db: ReturnType<typeof getDb>, domain: string, maxWaitMs = 60000): Promise<{ score: number; summary: string } | null> {
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    const cached = checkCache(db, domain);
    if (cached) return cached;

    const lock = db.prepare("SELECT * FROM trust_scoring_locks WHERE domain = ?").get(domain);
    if (!lock) {
      const finalCheck = checkCache(db, domain);
      if (finalCheck) return finalCheck;
      return null;
    }

    await new Promise((r) => setTimeout(r, 500));
  }
  return null;
}

function extractDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}
