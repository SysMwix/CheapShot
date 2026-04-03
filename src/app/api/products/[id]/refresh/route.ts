import { NextRequest, NextResponse } from "next/server";
import { getDb, Product, ProductSource } from "@/lib/db";
import { extractPriceFromUrl } from "@/services/price-extractor";

type RouteContext = { params: Promise<{ id: string }> };

// POST /api/products/[id]/refresh — re-check live prices by fetching each source URL
export async function POST(request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  const body = await request.json().catch(() => ({}));
  const { currency } = body;

  const db = getDb();
  const product = db.prepare("SELECT * FROM products WHERE id = ?").get(id) as Product | undefined;

  if (!product) {
    return NextResponse.json({ error: "Product not found" }, { status: 404 });
  }

  const sources = db
    .prepare("SELECT * FROM product_sources WHERE product_id = ?")
    .all(id) as ProductSource[];

  if (sources.length === 0) {
    return NextResponse.json({ error: "No sources to refresh" }, { status: 400 });
  }

  db.prepare("UPDATE products SET search_status = 'searching', updated_at = datetime('now') WHERE id = ?").run(id);

  try {
    const curr = currency || product.currency;

    // Fetch all source URLs in parallel and extract live prices
    console.log(`[Refresh] Checking ${sources.length} URLs for "${product.name}"...`);
    const results = await Promise.all(
      sources.map(async (source) => {
        const extracted = await extractPriceFromUrl(source.url, product.name, curr);
        return { sourceId: source.id, extracted };
      })
    );

    const updateSource = db.prepare(
      "UPDATE product_sources SET previous_price = current_price, current_price = ?, image_url = COALESCE(?, image_url), last_checked_at = datetime('now') WHERE id = ?"
    );
    const insertHistory = db.prepare(
      "INSERT INTO price_history (source_id, price) VALUES (?, ?)"
    );

    let updated = 0;
    for (const { sourceId, extracted } of results) {
      if (extracted.price != null && extracted.price > 0) {
        // Check source still exists (product may have been deleted mid-refresh)
        const exists = db.prepare("SELECT id FROM product_sources WHERE id = ?").get(sourceId);
        if (!exists) continue;

        updateSource.run(extracted.price, extracted.image_url, sourceId);
        insertHistory.run(sourceId, extracted.price);
        updated++;
      }
    }

    console.log(`[Refresh] Updated ${updated}/${sources.length} prices`);

    db.prepare("UPDATE products SET search_status = 'done', updated_at = datetime('now') WHERE id = ?").run(id);

    const updatedSources = db
      .prepare("SELECT * FROM product_sources WHERE product_id = ? ORDER BY current_price ASC")
      .all(id) as ProductSource[];

    return NextResponse.json({
      product: { ...product, search_status: "done" },
      sources: updatedSources,
      updated,
      total: sources.length,
    });
  } catch (err) {
    console.error("Refresh failed:", err);
    db.prepare("UPDATE products SET search_status = 'done', updated_at = datetime('now') WHERE id = ?").run(id);
    return NextResponse.json({ error: "Refresh failed" }, { status: 500 });
  }
}
