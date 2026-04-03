import { NextRequest, NextResponse } from "next/server";
import { searchProducts } from "@/services/ai-search";

// POST /api/search — search for product offers using AI
export async function POST(request: NextRequest) {
  const body = await request.json();
  const { query } = body;

  if (!query || typeof query !== "string") {
    return NextResponse.json(
      { error: "query is required" },
      { status: 400 }
    );
  }

  try {
    const offers = await searchProducts(query);
    return NextResponse.json(offers);
  } catch (err) {
    console.error("Search failed:", err);
    return NextResponse.json(
      { error: "Search failed. Check your API key." },
      { status: 500 }
    );
  }
}
