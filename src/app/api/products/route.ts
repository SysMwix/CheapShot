import { NextRequest, NextResponse } from "next/server";
import { getDb, Product, ProductSource } from "@/lib/db";

export interface ProductWithSources extends Product {
  sources: ProductSource[];
  best_price: number | null;
}

// GET /api/products — list all products with their sources
// Optional query param: ?category=motorbike
export async function GET(request: NextRequest) {
  const category = request.nextUrl.searchParams.get("category");
  const db = getDb();
  const products = category
    ? db.prepare("SELECT * FROM products WHERE category = ? ORDER BY created_at DESC").all(category) as Product[]
    : db.prepare("SELECT * FROM products ORDER BY created_at DESC").all() as Product[];

  const result: ProductWithSources[] = products.map((p) => {
    const sources = db
      .prepare("SELECT * FROM product_sources WHERE product_id = ? ORDER BY current_price ASC")
      .all(p.id) as ProductSource[];

    const prices = sources.filter((s) => s.current_price != null).map((s) => s.current_price!);
    const best_price = prices.length > 0 ? Math.min(...prices) : null;

    return { ...p, sources, best_price };
  });

  result.sort((a, b) => {
    if (a.best_price == null && b.best_price == null) return 0;
    if (a.best_price == null) return 1;
    if (b.best_price == null) return -1;
    return b.best_price - a.best_price;
  });

  return NextResponse.json(result);
}

// POST /api/products — create a new product
export async function POST(request: NextRequest) {
  const body = await request.json();
  const { name, desired_price, currency, check_frequency, check_day, min_trust_score, category, subcategory } = body;

  if (!name) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  const db = getDb();
  const result = db
    .prepare(
      `INSERT INTO products (name, desired_price, currency, search_status, check_frequency, check_day, min_trust_score, category, subcategory)
       VALUES (?, ?, ?, 'pending', ?, ?, ?, ?, ?)`
    )
    .run(
      name,
      desired_price ?? null,
      currency || "GBP",
      check_frequency || "manual",
      check_day ?? null,
      min_trust_score ?? 0,
      category || "misc",
      subcategory || "other"
    );

  const product = db.prepare("SELECT * FROM products WHERE id = ?").get(result.lastInsertRowid) as Product;

  return NextResponse.json(product, { status: 201 });
}
