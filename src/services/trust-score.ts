import { queryOllama } from "@/lib/ai-provider";

export interface TrustCategory {
  name: string;
  score: number;
  weight: number;
  detail: string;
}

export interface TrustFactor {
  factor: string;
  impact: "positive" | "negative" | "neutral";
  severity: number;
  detail: string;
}

export interface TrustResult {
  score: number;
  summary: string;
  categories: TrustCategory[];
  factors: TrustFactor[];
}

/**
 * Evaluate retailer trustworthiness using Ollama (local AI).
 * Fetches the retailer page and analyzes it for trust signals.
 * No Claude API calls.
 */
export async function getTrustScore(retailer: string, url: string): Promise<TrustResult> {
  try {
    // Fetch the retailer page to analyze
    let pageInfo = "";
    try {
      const res = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          "Accept": "text/html",
        },
        redirect: "follow",
        signal: AbortSignal.timeout(10000),
      });
      if (res.ok) {
        const html = await res.text();
        // Extract trust-relevant signals from the page
        pageInfo = extractTrustSignals(html, url);
      }
    } catch {
      pageInfo = `Could not fetch page. URL: ${url}`;
    }

    const result = await queryOllama(
      "You evaluate online retailer trustworthiness based on page analysis. Respond ONLY with a JSON object.",
      `Evaluate the trustworthiness of "${retailer}" based on this information:

URL: ${url}
Domain: ${new URL(url).hostname}
${pageInfo}

Based on the page signals above, return ONLY this JSON:
{
  "score": 75,
  "summary": "1-2 sentence summary of trustworthiness",
  "categories": [
    {"name": "Website Quality", "score": 80, "weight": 25, "detail": "Brief finding"},
    {"name": "Security Indicators", "score": 90, "weight": 25, "detail": "Brief finding"},
    {"name": "Business Legitimacy", "score": 70, "weight": 25, "detail": "Brief finding"},
    {"name": "Shopping Experience", "score": 60, "weight": 25, "detail": "Brief finding"}
  ],
  "factors": [
    {"factor": "Finding", "impact": "positive", "severity": 8, "detail": "Why"},
    {"factor": "Concern", "impact": "negative", "severity": 6, "detail": "Why"}
  ]
}

Rules: scores 0-100, weights sum to 100, 3-6 factors, be honest. Well-known retailers (Amazon, eBay, Currys, etc.) should score 80+. Unknown sites should score lower.`
    );

    if (!result) return fallback(retailer);

    const cleaned = result.replace(/```json?\s*/g, "").replace(/```/g, "").trim();
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return fallback(retailer);

    const parsed = JSON.parse(jsonMatch[0]);
    return {
      score: Math.max(0, Math.min(100, parsed.score || 50)),
      summary: parsed.summary || "No details available",
      categories: (parsed.categories || []).map((c: TrustCategory) => ({
        name: c.name,
        score: Math.max(0, Math.min(100, c.score || 50)),
        weight: c.weight || 25,
        detail: c.detail || "",
      })),
      factors: (parsed.factors || []).map((f: TrustFactor) => ({
        factor: f.factor,
        impact: f.impact || "neutral",
        severity: Math.max(1, Math.min(10, f.severity || 5)),
        detail: f.detail || "",
      })),
    };
  } catch (err) {
    console.error("[Trust Score] Failed:", err);
    return fallback(retailer);
  }
}

/**
 * Extract trust-relevant signals from a page's HTML.
 */
function extractTrustSignals(html: string, url: string): string {
  const signals: string[] = [];
  const lower = html.toLowerCase();

  // HTTPS
  signals.push(`HTTPS: ${url.startsWith("https") ? "Yes" : "No"}`);

  // Check for common trust indicators
  if (lower.includes("trustpilot")) signals.push("Has Trustpilot integration");
  if (lower.includes("feefo")) signals.push("Has Feefo reviews");
  if (lower.includes("reviews.io")) signals.push("Has Reviews.io integration");
  if (lower.includes("verified by visa") || lower.includes("mastercard securecode")) signals.push("Has payment verification badges");
  if (lower.includes("ssl") || lower.includes("secure checkout")) signals.push("Mentions secure checkout");
  if (lower.includes("returns policy") || lower.includes("return policy")) signals.push("Has returns policy");
  if (lower.includes("privacy policy")) signals.push("Has privacy policy");
  if (lower.includes("terms and conditions") || lower.includes("terms & conditions")) signals.push("Has T&Cs");
  if (lower.includes("contact us") || lower.includes("customer service")) signals.push("Has contact/customer service page");
  if (lower.includes("companies house") || lower.includes("registered in")) signals.push("Shows company registration");
  if (lower.includes("vat") && lower.match(/vat\s*(?:no|number|reg)/i)) signals.push("Shows VAT registration");
  if (lower.includes("paypal")) signals.push("Accepts PayPal");
  if (lower.includes("klarna") || lower.includes("clearpay") || lower.includes("afterpay")) signals.push("Offers buy-now-pay-later");
  if (lower.includes("free delivery") || lower.includes("free shipping")) signals.push("Offers free delivery");
  if (lower.includes("live chat")) signals.push("Has live chat");

  // Check for red flags
  if (!lower.includes("contact") && !lower.includes("phone") && !lower.includes("email")) signals.push("WARNING: No visible contact information");
  if (lower.includes("bitcoin only") || lower.includes("crypto only")) signals.push("WARNING: Crypto-only payments");

  // Known retailers get a boost
  const domain = new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  const knownRetailers = ["amazon.co.uk", "ebay.co.uk", "currys.co.uk", "argos.co.uk", "halfords.com",
    "sportsbikeshop.co.uk", "jsaccessories.co.uk", "motorcycle-accessories.co.uk", "thevisorshop.com",
    "nike.com", "adidas.co.uk", "asos.com", "johnlewis.com", "screwfix.com"];
  if (knownRetailers.some((r) => domain.includes(r))) signals.push("KNOWN: Well-established retailer");

  return `Page signals:\n- ${signals.join("\n- ")}`;
}

function fallback(retailer: string): TrustResult {
  return { score: 50, summary: `Could not evaluate ${retailer}`, categories: [], factors: [] };
}
