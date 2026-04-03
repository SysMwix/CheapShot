import { NextRequest, NextResponse } from "next/server";
import { getDb, PriceHistory } from "@/lib/db";

type RouteContext = { params: Promise<{ id: string }> };

// GET /api/products/[id]/history — get price history
export async function GET(_request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  const db = getDb();

  const product = db.prepare("SELECT id FROM products WHERE id = ?").get(id);
  if (!product) {
    return NextResponse.json({ error: "Product not found" }, { status: 404 });
  }

  const history = db
    .prepare("SELECT * FROM price_history WHERE product_id = ? ORDER BY checked_at ASC")
    .all(id) as PriceHistory[];

  return NextResponse.json(history);
}
