import { NextRequest, NextResponse } from "next/server";
import { getDb, Product, ProductSource } from "@/lib/db";
import { extractPriceFromUrl } from "@/services/price-extractor";

type RouteContext = { params: Promise<{ id: string }> };

// POST /api/products/[id]/sources/manual — add a source by URL
export async function POST(request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  const body = await request.json();
  const { url, currency } = body;

  if (!url || !url.startsWith("http")) {
    return NextResponse.json({ error: "Valid URL required" }, { status: 400 });
  }

  const db = getDb();
  const product = db.prepare("SELECT * FROM products WHERE id = ?").get(id) as Product | undefined;
  if (!product) {
    return NextResponse.json({ error: "Product not found" }, { status: 404 });
  }

  const sourceCount = db
    .prepare("SELECT COUNT(*) as count FROM product_sources WHERE product_id = ?")
    .get(id) as { count: number };

  if (sourceCount.count >= 10) {
    return NextResponse.json({ error: "Maximum 10 sources per product" }, { status: 400 });
  }

  // Check for duplicate URL
  const existing = db
    .prepare("SELECT id FROM product_sources WHERE product_id = ? AND url = ?")
    .get(id, url);
  if (existing) {
    return NextResponse.json({ error: "URL already tracked" }, { status: 400 });
  }

  const curr = currency || product.currency;

  // Extract price from the URL
  console.log(`[Manual] Extracting price from ${url}...`);
  const extracted = await extractPriceFromUrl(url, product.name, curr);

  // Extract retailer name from URL
  let retailer = "Unknown";
  try {
    const hostname = new URL(url).hostname.replace(/^www\./, "");
    retailer = hostname.split(".")[0];
    retailer = retailer.charAt(0).toUpperCase() + retailer.slice(1);
  } catch { /* keep Unknown */ }

  const result = db.prepare(
    `INSERT INTO product_sources (product_id, retailer, url, image_url, current_price, currency, variant_name, last_checked_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))`
  ).run(
    id,
    retailer,
    url,
    extracted.image_url,
    extracted.price,
    extracted.currency || curr,
    extracted.variant
  );

  if (extracted.price) {
    db.prepare("INSERT INTO price_history (source_id, price) VALUES (?, ?)").run(
      result.lastInsertRowid,
      extracted.price
    );
  }

  console.log(`[Manual] Added ${retailer}: ${extracted.currency} ${extracted.price || "no price"}`);

  const source = db.prepare("SELECT * FROM product_sources WHERE id = ?").get(result.lastInsertRowid) as ProductSource;
  return NextResponse.json(source, { status: 201 });
}
