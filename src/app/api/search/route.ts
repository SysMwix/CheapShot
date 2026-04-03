import { NextRequest } from "next/server";
import { searchProducts } from "@/services/ai-search";

// POST /api/search — search with SSE streaming
export async function POST(request: NextRequest) {
  const body = await request.json();
  const { query, country, currency, excludeRetailers } = body;

  if (!query || typeof query !== "string") {
    return new Response(JSON.stringify({ error: "query is required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      function send(event: string, data: unknown) {
        controller.enqueue(
          encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
        );
      }

      send("status", { message: "Searching the web..." });

      try {
        const offers = await searchProducts(query, country, currency, excludeRetailers);

        // Stream each offer individually
        for (const offer of offers) {
          send("offer", offer);
        }

        send("done", { total: offers.length });
      } catch (err) {
        console.error("Search failed:", err);
        send("error", { message: "Search failed. Check your API key." });
      }

      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
