import { NextRequest, NextResponse } from "next/server";
import { getDb, ProductSource } from "@/lib/db";
import { getTrustScore } from "@/services/trust-score";

type RouteContext = { params: Promise<{ id: string; sourceId: string }> };

// POST /api/products/[id]/sources/[sourceId]/trust — calculate trust score
export async function POST(_request: NextRequest, context: RouteContext) {
  const { id, sourceId } = await context.params;
  const db = getDb();

  const source = db
    .prepare("SELECT * FROM product_sources WHERE id = ? AND product_id = ?")
    .get(sourceId, id) as ProductSource | undefined;

  if (!source) {
    return NextResponse.json({ error: "Source not found" }, { status: 404 });
  }

  const result = await getTrustScore(source.retailer, source.url);

  db.prepare(
    "UPDATE product_sources SET trust_score = ?, trust_summary = ? WHERE id = ?"
  ).run(result.score, result.summary, sourceId);

  return NextResponse.json(result);
}
