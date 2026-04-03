import { NextRequest, NextResponse } from "next/server";
import { getDb, Product } from "@/lib/db";

type RouteContext = { params: Promise<{ id: string }> };

// GET /api/products/[id]
export async function GET(_request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  const db = getDb();
  const product = db.prepare("SELECT * FROM products WHERE id = ?").get(id) as Product | undefined;

  if (!product) {
    return NextResponse.json({ error: "Product not found" }, { status: 404 });
  }
  return NextResponse.json(product);
}

// PUT /api/products/[id]
export async function PUT(request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  const body = await request.json();
  const { name, url, image_url, desired_price, currency } = body;

  const db = getDb();
  const existing = db.prepare("SELECT * FROM products WHERE id = ?").get(id) as Product | undefined;
  if (!existing) {
    return NextResponse.json({ error: "Product not found" }, { status: 404 });
  }

  db.prepare(
    `UPDATE products SET
       name = ?, url = ?, image_url = ?, desired_price = ?, currency = ?,
       updated_at = datetime('now')
     WHERE id = ?`
  ).run(
    name ?? existing.name,
    url ?? existing.url,
    image_url ?? existing.image_url,
    desired_price ?? existing.desired_price,
    currency ?? existing.currency,
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
