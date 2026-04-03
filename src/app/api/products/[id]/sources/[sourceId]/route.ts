import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";

type RouteContext = { params: Promise<{ id: string; sourceId: string }> };

// DELETE /api/products/[id]/sources/[sourceId] — remove a source
export async function DELETE(_request: NextRequest, context: RouteContext) {
  const { id, sourceId } = await context.params;
  const db = getDb();

  const source = db
    .prepare("SELECT * FROM product_sources WHERE id = ? AND product_id = ?")
    .get(sourceId, id);

  if (!source) {
    return NextResponse.json({ error: "Source not found" }, { status: 404 });
  }

  db.prepare("DELETE FROM product_sources WHERE id = ?").run(sourceId);
  return NextResponse.json({ success: true });
}
