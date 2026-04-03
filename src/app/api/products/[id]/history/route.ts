import { NextRequest, NextResponse } from "next/server";
import { getDb, PriceHistory } from "@/lib/db";

type RouteContext = { params: Promise<{ id: string }> };

// GET /api/products/[id]/history — get combined price history across all sources
export async function GET(_request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  const db = getDb();

  const product = db.prepare("SELECT id FROM products WHERE id = ?").get(id);
  if (!product) {
    return NextResponse.json({ error: "Product not found" }, { status: 404 });
  }

  // Get best (lowest) price at each check time across all sources
  const history = db
    .prepare(`
      SELECT ph.id, ph.source_id, ph.price, ph.checked_at, ps.retailer
      FROM price_history ph
      JOIN product_sources ps ON ps.id = ph.source_id
      WHERE ps.product_id = ?
      ORDER BY ph.checked_at ASC
    `)
    .all(id) as (PriceHistory & { retailer: string })[];

  return NextResponse.json(history);
}
