import { NextRequest, NextResponse } from "next/server";
import { getDb, Product, ProductSource } from "@/lib/db";

type RouteContext = { params: Promise<{ id: string; sourceId: string }> };

// DELETE /api/products/[id]/sources/[sourceId] — remove a source and blacklist the retailer
export async function DELETE(_request: NextRequest, context: RouteContext) {
  const { id, sourceId } = await context.params;
  const db = getDb();

  const source = db
    .prepare("SELECT * FROM product_sources WHERE id = ? AND product_id = ?")
    .get(sourceId, id) as ProductSource | undefined;

  if (!source) {
    return NextResponse.json({ error: "Source not found" }, { status: 404 });
  }

  // Add retailer to excluded list
  const product = db.prepare("SELECT * FROM products WHERE id = ?").get(id) as Product;
  const excluded: string[] = JSON.parse(product.excluded_retailers || "[]");
  if (!excluded.includes(source.retailer)) {
    excluded.push(source.retailer);
    db.prepare("UPDATE products SET excluded_retailers = ? WHERE id = ?").run(JSON.stringify(excluded), id);
  }

  db.prepare("DELETE FROM product_sources WHERE id = ?").run(sourceId);
  return NextResponse.json({ success: true });
}
