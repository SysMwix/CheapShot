import { NextRequest, NextResponse } from "next/server";
import { getDb, Product, ProductSource } from "@/lib/db";
import { searchProducts } from "@/services/ai-search";
import { getTrustScore } from "@/services/trust-score";

type RouteContext = { params: Promise<{ id: string }> };

// POST /api/products/[id]/search — find sources and verify live prices
export async function POST(request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  const body = await request.json().catch(() => ({}));
  const { country, currency, excludeRetailers } = body;

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
    // Combine: existing sources + blacklisted retailers + request exclusions
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

    // AI finds retailers + Cheerio verifies live prices
    console.log(`[Search] Finding retailers for "${product.name}"...`);
    const verifiedOffers = await searchProducts(
      product.name,
      country,
      currency || product.currency,
      allExcluded.length > 0 ? allExcluded : undefined
    );

    // Insert sources with verified prices
    const insertStmt = db.prepare(
      `INSERT INTO product_sources (product_id, retailer, url, image_url, current_price, currency, last_checked_at)
       VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`
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
        offer.currency
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

async function scoreSources(sourceIds: number[]) {
  const db = getDb();
  for (const sourceId of sourceIds) {
    try {
      const source = db.prepare("SELECT * FROM product_sources WHERE id = ?").get(sourceId) as ProductSource | undefined;
      if (!source) continue;

      const domain = extractDomain(source.url);

      // Check cache first (valid for 7 days)
      const cached = db.prepare(
        "SELECT * FROM trust_cache WHERE domain = ? AND datetime(checked_at, '+7 days') > datetime('now')"
      ).get(domain) as { score: number; summary: string; details_json: string | null } | undefined;

      if (cached) {
        db.prepare(
          "UPDATE product_sources SET trust_score = ?, trust_summary = ? WHERE id = ?"
        ).run(cached.score, cached.summary, sourceId);
        console.log(`[Trust] ${source.retailer}: ${cached.score}/100 (cached)`);
        continue;
      }

      // Fetch fresh detailed score
      const result = await getTrustScore(source.retailer, source.url);
      db.prepare(
        "UPDATE product_sources SET trust_score = ?, trust_summary = ? WHERE id = ?"
      ).run(result.score, result.summary, sourceId);

      // Update cache with full details
      db.prepare(
        "INSERT OR REPLACE INTO trust_cache (domain, retailer, score, summary, details_json, checked_at) VALUES (?, ?, ?, ?, ?, datetime('now'))"
      ).run(domain, source.retailer, result.score, result.summary, JSON.stringify({ categories: result.categories, factors: result.factors }));

      console.log(`[Trust] ${source.retailer}: ${result.score}/100`);
    } catch (err) {
      console.error(`[Trust] Failed for source ${sourceId}:`, err);
    }
  }
}

function extractDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}
