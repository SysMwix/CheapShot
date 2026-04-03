import { NextRequest, NextResponse } from "next/server";
import { getDb, Product, ProductSource } from "@/lib/db";
import { searchProducts } from "@/services/ai-search";

type RouteContext = { params: Promise<{ id: string }> };

// POST /api/products/[id]/search — trigger AI search for sources
export async function POST(request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  const body = await request.json().catch(() => ({}));
  const { country, currency, excludeRetailers } = body;

  const db = getDb();
  const product = db.prepare("SELECT * FROM products WHERE id = ?").get(id) as Product | undefined;

  if (!product) {
    return NextResponse.json({ error: "Product not found" }, { status: 404 });
  }

  // Check current source count
  const existingCount = db
    .prepare("SELECT COUNT(*) as count FROM product_sources WHERE product_id = ?")
    .get(id) as { count: number };

  if (existingCount.count >= 10) {
    return NextResponse.json({ error: "Maximum 10 sources per product" }, { status: 400 });
  }

  // Mark as searching
  db.prepare("UPDATE products SET search_status = 'searching', updated_at = datetime('now') WHERE id = ?").run(id);

  try {
    // Get existing retailers to exclude
    const existingSources = db
      .prepare("SELECT retailer FROM product_sources WHERE product_id = ?")
      .all(id) as { retailer: string }[];
    const allExcluded = [
      ...existingSources.map((s) => s.retailer),
      ...(excludeRetailers || []),
    ];

    const slotsLeft = 10 - existingCount.count;
    const offers = await searchProducts(
      product.name,
      country,
      currency || product.currency,
      allExcluded.length > 0 ? allExcluded : undefined
    );

    // Insert sources (up to remaining slots)
    const toInsert = offers.slice(0, slotsLeft);
    const insertStmt = db.prepare(
      `INSERT INTO product_sources (product_id, retailer, url, image_url, current_price, currency, last_checked_at)
       VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`
    );
    const insertHistory = db.prepare(
      `INSERT INTO price_history (source_id, price) VALUES (?, ?)`
    );

    for (const offer of toInsert) {
      const result = insertStmt.run(
        id,
        offer.retailer,
        offer.url,
        offer.image_url || null,
        offer.price,
        offer.currency || product.currency
      );
      // Log initial price to history
      if (offer.price) {
        insertHistory.run(result.lastInsertRowid, offer.price);
      }
    }

    db.prepare("UPDATE products SET search_status = 'done', updated_at = datetime('now') WHERE id = ?").run(id);

    const sources = db
      .prepare("SELECT * FROM product_sources WHERE product_id = ? ORDER BY current_price ASC")
      .all(id) as ProductSource[];

    return NextResponse.json({ product: { ...product, search_status: "done" }, sources });
  } catch (err) {
    console.error("Search failed:", err);
    db.prepare("UPDATE products SET search_status = 'error', updated_at = datetime('now') WHERE id = ?").run(id);
    return NextResponse.json({ error: "Search failed" }, { status: 500 });
  }
}
