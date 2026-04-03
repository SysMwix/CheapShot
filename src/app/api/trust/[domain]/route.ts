import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";

type RouteContext = { params: Promise<{ domain: string }> };

// GET /api/trust/[domain] — get cached trust details for a domain
export async function GET(_request: NextRequest, context: RouteContext) {
  const { domain } = await context.params;
  const db = getDb();

  const cached = db.prepare("SELECT * FROM trust_cache WHERE domain = ?").get(domain) as {
    domain: string;
    retailer: string;
    score: number;
    summary: string;
    details_json: string | null;
    checked_at: string;
  } | undefined;

  if (!cached) {
    return NextResponse.json({ error: "No trust data found" }, { status: 404 });
  }

  const details = cached.details_json ? JSON.parse(cached.details_json) : { categories: [], factors: [] };

  return NextResponse.json({
    domain: cached.domain,
    retailer: cached.retailer,
    score: cached.score,
    summary: cached.summary,
    categories: details.categories || [],
    factors: details.factors || [],
    checked_at: cached.checked_at,
  });
}
