import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface ProductSuggestion {
  id: string;
  name: string;
  description: string;
  estimatedPrice: number;
  currency: string;
  sourceUrl: string;
  searchQuery: string;
  category: string;
}

interface ChatResponse {
  message: string;
  products: ProductSuggestion[] | null;
}

const client = new Anthropic();

const SYSTEM_PROMPT = `You are a shopping assistant for CheapShot, a price tracking tool. Help users find real products to track.

When you have concrete product suggestions, include a structured block at the end in this exact format:

<products>
[{"id":"1","name":"Product Name","description":"Why it fits","estimatedPrice":299.99,"currency":"GBP","sourceUrl":"https://real-shop-url","searchQuery":"product name for tracking","category":"motorbike"}]
</products>

Rules:
- Only suggest REAL products that actually exist (real brands, real model names)
- Include real retailer URLs where possible (sportsbikeshop.co.uk, amazon.co.uk, etc.)
- If the user mentions a product they already own, suggest ALTERNATIVES not the same thing
- Ask clarifying questions if the request is vague
- Suggest 2-4 options at different price points
- Be concise — brief explanation then list the products
- Valid categories: motorbike, clothing, tech, home, sports, beauty, gaming, auto, misc`;

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { messages } = body as { messages: ChatMessage[] };

  if (!messages || messages.length === 0) {
    return NextResponse.json({ error: "messages required" }, { status: 400 });
  }

  try {
    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 3 }],
      messages: messages.map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      })),
    });

    const allText = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === "text")
      .map((block) => block.text)
      .join("\n");

    // Strip cite tags from web search
    const cleaned = allText.replace(/<cite[^>]*>.*?<\/cite>/g, "").trim();

    // Parse products block
    const parsed = parseResponse(cleaned);
    return NextResponse.json(parsed);
  } catch (err) {
    console.error("[Chat] Claude error:", err);
    return NextResponse.json({
      message: "Sorry, having trouble right now. Please try again.",
      products: null,
    } as ChatResponse);
  }
}

function parseResponse(response: string): ChatResponse {
  const productsMatch = response.match(/<products>\s*([\s\S]*?)\s*<\/products>/);

  let message = response;
  let products: ProductSuggestion[] | null = null;

  if (productsMatch) {
    message = response.replace(/<products>[\s\S]*?<\/products>/, "").trim();

    try {
      const parsed = JSON.parse(productsMatch[1]);
      if (Array.isArray(parsed) && parsed.length > 0) {
        products = parsed.map((p: Record<string, unknown>, i: number) => ({
          id: String(p.id || `suggestion-${i}`),
          name: String(p.name || ""),
          description: String(p.description || ""),
          estimatedPrice: Number(p.estimatedPrice) || 0,
          currency: String(p.currency || "GBP"),
          sourceUrl: String(p.sourceUrl || ""),
          searchQuery: String(p.searchQuery || p.name || ""),
          category: String(p.category || "misc"),
        }));
      }
    } catch (err) {
      console.log("[Chat] Failed to parse products:", (err as Error).message);
    }
  }

  return { message, products };
}
