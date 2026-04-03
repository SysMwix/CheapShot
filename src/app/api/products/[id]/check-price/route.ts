import { NextRequest, NextResponse } from "next/server";
import { getDb, Product } from "@/lib/db";
import { getScraperForUrl } from "@/services/scraper";

type RouteContext = { params: Promise<{ id: string }> };

// POST /api/products/[id]/check-price — trigger a price fetch
export async function POST(_request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  const db = getDb();
  const product = db.prepare("SELECT * FROM products WHERE id = ?").get(id) as Product | undefined;

  if (!product) {
    return NextResponse.json({ error: "Product not found" }, { status: 404 });
  }

  const scraper = getScraperForUrl(product.url);
  const result = await scraper.scrape(product.url);

  if (result.price == null) {
    return NextResponse.json(
      { error: "Could not fetch price", result },
      { status: 422 }
    );
  }

  // Update current price
  db.prepare(
    `UPDATE products SET current_price = ?, updated_at = datetime('now') WHERE id = ?`
  ).run(result.price, id);

  // Log to price history
  db.prepare(
    `INSERT INTO price_history (product_id, price) VALUES (?, ?)`
  ).run(id, result.price);

  const updated = db.prepare("SELECT * FROM products WHERE id = ?").get(id) as Product;

  return NextResponse.json({
    product: updated,
    scraped: result,
  });
}
