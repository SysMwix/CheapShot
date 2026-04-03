import { NextRequest, NextResponse } from "next/server";
import { getDb, Product, ProductSource } from "@/lib/db";

type RouteContext = { params: Promise<{ id: string }> };

// GET /api/products/[id]
export async function GET(_request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  const db = getDb();
  const product = db.prepare("SELECT * FROM products WHERE id = ?").get(id) as Product | undefined;

  if (!product) {
    return NextResponse.json({ error: "Product not found" }, { status: 404 });
  }

  const sources = db
    .prepare("SELECT * FROM product_sources WHERE product_id = ? ORDER BY current_price ASC")
    .all(id) as ProductSource[];

  const prices = sources.filter((s) => s.current_price != null).map((s) => s.current_price!);
  const best_price = prices.length > 0 ? Math.min(...prices) : null;

  return NextResponse.json({ ...product, sources, best_price });
}

// PUT /api/products/[id]
export async function PUT(request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  const body = await request.json();
  const { name, desired_price, currency, check_frequency, check_day, min_trust_score } = body;

  const db = getDb();
  const existing = db.prepare("SELECT * FROM products WHERE id = ?").get(id) as Product | undefined;
  if (!existing) {
    return NextResponse.json({ error: "Product not found" }, { status: 404 });
  }

  db.prepare(
    `UPDATE products SET
       name = ?, desired_price = ?, currency = ?,
       check_frequency = ?, check_day = ?, min_trust_score = ?,
       updated_at = datetime('now')
     WHERE id = ?`
  ).run(
    name ?? existing.name,
    desired_price !== undefined ? desired_price : existing.desired_price,
    currency ?? existing.currency,
    check_frequency ?? existing.check_frequency,
    check_day !== undefined ? check_day : existing.check_day,
    min_trust_score !== undefined ? min_trust_score : existing.min_trust_score,
    id
  );

  const updated = db.prepare("SELECT * FROM products WHERE id = ?").get(id) as Product;
  return NextResponse.json(updated);
}

// DELETE /api/products/[id]
export async function DELETE(_request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  const db = getDb();
  const result = db.prepare("DELETE FROM products WHERE id = ?").run(id);

  if (result.changes === 0) {
    return NextResponse.json({ error: "Product not found" }, { status: 404 });
  }
  return NextResponse.json({ success: true });
}
