import { NextRequest, NextResponse } from "next/server";
import { getDb, Product } from "@/lib/db";
import { getReviewSummary } from "@/services/review-summary";

type RouteContext = { params: Promise<{ id: string }> };

// GET /api/products/[id]/reviews — get or generate a review summary
export async function GET(_request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  const db = getDb();

  const product = db.prepare("SELECT * FROM products WHERE id = ?").get(id) as Product | undefined;
  if (!product) {
    return NextResponse.json({ error: "Product not found" }, { status: 404 });
  }

  // Check dedicated review cache (30-day TTL)
  const cached = db.prepare(
    "SELECT review_json FROM review_cache WHERE product_name = ? AND datetime(cached_at, '+30 days') > datetime('now')"
  ).get(product.name) as { review_json: string } | undefined;

  if (cached) {
    try {
      return NextResponse.json(JSON.parse(cached.review_json));
    } catch { /* regenerate */ }
  }

  // Generate fresh review summary
  const review = await getReviewSummary(product.name);

  // Cache it
  db.prepare(
    "INSERT OR REPLACE INTO review_cache (product_name, review_json, cached_at) VALUES (?, ?, datetime('now'))"
  ).run(product.name, JSON.stringify(review));

  return NextResponse.json(review);
}
