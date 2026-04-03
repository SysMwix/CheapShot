import { NextRequest, NextResponse } from "next/server";
import { getDb, Product, ProductSource } from "@/lib/db";
import { extractPriceFromUrl } from "@/services/price-extractor";
import { getTrustScore } from "@/services/trust-score";

type RouteContext = { params: Promise<{ id: string }> };

// POST /api/products/[id]/refresh — re-check live prices by fetching each source URL
export async function POST(request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  const body = await request.json().catch(() => ({}));
  const { currency } = body;

  const db = getDb();
  const product = db.prepare("SELECT * FROM products WHERE id = ?").get(id) as Product | undefined;

  if (!product) {
    return NextResponse.json({ error: "Product not found" }, { status: 404 });
  }

  const sources = db
    .prepare("SELECT * FROM product_sources WHERE product_id = ?")
    .all(id) as ProductSource[];

  if (sources.length === 0) {
    return NextResponse.json({ error: "No sources to refresh" }, { status: 400 });
  }

  db.prepare("UPDATE products SET search_status = 'searching', updated_at = datetime('now') WHERE id = ?").run(id);

  try {
    const curr = currency || product.currency;

    console.log(`[Refresh] Checking ${sources.length} URLs for "${product.name}"...`);
    const results = await Promise.all(
      sources.map(async (source) => {
        const extracted = await extractPriceFromUrl(source.url, product.name, curr);
        return { sourceId: source.id, extracted };
      })
    );

    const updateSource = db.prepare(
      `UPDATE product_sources SET previous_price = current_price, current_price = ?, image_url = COALESCE(?, image_url),
       variant_name = COALESCE(?, variant_name), available_variants_json = COALESCE(?, available_variants_json),
       last_checked_at = datetime('now') WHERE id = ?`
    );
    const insertHistory = db.prepare(
      "INSERT INTO price_history (source_id, price) VALUES (?, ?)"
    );

    let updated = 0;
    for (const { sourceId, extracted } of results) {
      if (extracted.price != null && extracted.price > 0) {
        const exists = db.prepare("SELECT id FROM product_sources WHERE id = ?").get(sourceId);
        if (!exists) continue;

        const variantsJson = extracted.available_variants ? JSON.stringify(extracted.available_variants) : null;
        updateSource.run(extracted.price, extracted.image_url, extracted.variant, variantsJson, sourceId);
        insertHistory.run(sourceId, extracted.price);
        updated++;
      }
    }

    console.log(`[Refresh] Updated ${updated}/${sources.length} prices`);

    // Re-score expired trust scores in background
    reScoreExpiredTrust(sources);

    db.prepare("UPDATE products SET search_status = 'done', updated_at = datetime('now') WHERE id = ?").run(id);

    const updatedSources = db
      .prepare("SELECT * FROM product_sources WHERE product_id = ? ORDER BY current_price ASC")
      .all(id) as ProductSource[];

    return NextResponse.json({
      product: { ...product, search_status: "done" },
      sources: updatedSources,
      updated,
      total: sources.length,
    });
  } catch (err) {
    console.error("Refresh failed:", err);
    db.prepare("UPDATE products SET search_status = 'done', updated_at = datetime('now') WHERE id = ?").run(id);
    return NextResponse.json({ error: "Refresh failed" }, { status: 500 });
  }
}

function extractDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

async function reScoreExpiredTrust(sources: ProductSource[]) {
  const db = getDb();

  db.prepare(
    "DELETE FROM trust_scoring_locks WHERE datetime(locked_at, '+5 minutes') < datetime('now')"
  ).run();

  const domainMap = new Map<string, ProductSource[]>();
  for (const source of sources) {
    const domain = extractDomain(source.url);
    if (!domainMap.has(domain)) domainMap.set(domain, []);
    domainMap.get(domain)!.push(source);
  }

  await Promise.all(
    Array.from(domainMap.entries()).map(async ([domain, domainSources]) => {
      try {
        const cached = db.prepare(
          "SELECT score, summary FROM trust_cache WHERE domain = ? AND datetime(checked_at, '+7 days') > datetime('now')"
        ).get(domain) as { score: number; summary: string } | undefined;

        if (cached) return;

        console.log(`[TrustRefresh] ${domain} trust score expired, re-scoring...`);

        const lock = db.prepare(
          "INSERT OR IGNORE INTO trust_scoring_locks (domain, status, locked_at) VALUES (?, 'locked', datetime('now'))"
        ).run(domain);

        if (lock.changes === 0) return;

        try {
          const source = domainSources[0];
          const result = await getTrustScore(source.retailer, source.url);

          db.prepare(
            "INSERT OR REPLACE INTO trust_cache (domain, retailer, score, summary, details_json, checked_at) VALUES (?, ?, ?, ?, ?, datetime('now'))"
          ).run(domain, source.retailer, result.score, result.summary, JSON.stringify({ categories: result.categories, factors: result.factors }));

          for (const s of domainSources) {
            db.prepare(
              "UPDATE product_sources SET trust_score = ?, trust_summary = ? WHERE id = ?"
            ).run(result.score, result.summary, s.id);
          }

          console.log(`[TrustRefresh] ${domain}: ${result.score}/100`);
        } finally {
          db.prepare("DELETE FROM trust_scoring_locks WHERE domain = ?").run(domain);
        }
      } catch (err) {
        console.error(`[TrustRefresh] Failed for ${domain}:`, err);
        db.prepare("DELETE FROM trust_scoring_locks WHERE domain = ?").run(domain);
      }
    })
  );
}
