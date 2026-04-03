import { NextRequest, NextResponse } from "next/server";
import { getDb, Product } from "@/lib/db";

// GET /api/products — list all products
export async function GET() {
  const db = getDb();
  const products = db.prepare("SELECT * FROM products ORDER BY created_at DESC").all() as Product[];
  return NextResponse.json(products);
}

// POST /api/products — create a new product
export async function POST(request: NextRequest) {
  const body = await request.json();
  const { name, url, image_url, desired_price, currency } = body;

  if (!name || !url || desired_price == null) {
    return NextResponse.json(
      { error: "name, url, and desired_price are required" },
      { status: 400 }
    );
  }

  const db = getDb();
  const result = db
    .prepare(
      `INSERT INTO products (name, url, image_url, desired_price, currency)
       VALUES (?, ?, ?, ?, ?)`
    )
    .run(name, url, image_url || null, desired_price, currency || "USD");

  const product = db
    .prepare("SELECT * FROM products WHERE id = ?")
    .get(result.lastInsertRowid) as Product;

  return NextResponse.json(product, { status: 201 });
}

// DELETE /api/products — not supported at collection level
export async function DELETE() {
  return NextResponse.json({ error: "Use /api/products/[id] to delete" }, { status: 405 });
}
