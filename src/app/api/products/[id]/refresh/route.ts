import { NextRequest, NextResponse } from "next/server";
import { getDb, Product, ProductSource } from "@/lib/db";
import { searchProducts } from "@/services/ai-search";

type RouteContext = { params: Promise<{ id: string }> };

// POST /api/products/[id]/refresh — re-check prices for all existing sources
export async function POST(request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  const body = await request.json().catch(() => ({}));
  const { country, currency } = body;

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
    // Ask AI to look up current prices for the specific retailers we're tracking
    const retailerList = sources.map((s) => `${s.retailer} (${s.url})`).join(", ");
    const region = country || "United Kingdom";
    const curr = currency || product.currency;

    const offers = await searchProducts(
      `${product.name} current price at: ${retailerList}`,
      region,
      curr
    );

    // Match returned offers to existing sources and update prices
    const updateSource = db.prepare(
      "UPDATE product_sources SET current_price = ?, last_checked_at = datetime('now') WHERE id = ?"
    );
    const insertHistory = db.prepare(
      "INSERT INTO price_history (source_id, price) VALUES (?, ?)"
    );

    for (const source of sources) {
      // Try to match by retailer name (case-insensitive)
      const match = offers.find(
        (o) => o.retailer.toLowerCase() === source.retailer.toLowerCase()
      );

      if (match && typeof match.price === "number") {
        updateSource.run(match.price, source.id);
        insertHistory.run(source.id, match.price);
      }
    }

    db.prepare("UPDATE products SET search_status = 'done', updated_at = datetime('now') WHERE id = ?").run(id);

    const updatedSources = db
      .prepare("SELECT * FROM product_sources WHERE product_id = ? ORDER BY current_price ASC")
      .all(id) as ProductSource[];

    return NextResponse.json({ product: { ...product, search_status: "done" }, sources: updatedSources });
  } catch (err) {
    console.error("Refresh failed:", err);
    db.prepare("UPDATE products SET search_status = 'done', updated_at = datetime('now') WHERE id = ?").run(id);
    return NextResponse.json({ error: "Refresh failed" }, { status: 500 });
  }
}
