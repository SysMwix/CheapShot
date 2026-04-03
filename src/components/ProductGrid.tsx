"use client";

import { useEffect, useState, useCallback } from "react";
import { useRegion } from "@/components/RegionContext";
import { findSubcategory } from "@/lib/categories";
import SearchBar from "@/components/SearchBar";
import ProductCard, { ProductCardData } from "@/components/ProductCard";
import AddProductModal, { AddProductResult } from "@/components/AddProductModal";
import type { CheckFrequency } from "@/lib/db";
import type { SizePreferences } from "@/components/RegionContext";

interface ProductGridProps {
  /** Filter to a specific category slug, or undefined for all */
  categoryFilter?: string;
  /** Default category when adding a new product from this page */
  defaultAddCategory?: string;
}

export default function ProductGrid({ categoryFilter, defaultAddCategory }: ProductGridProps) {
  const { region, sizes, minTrust } = useRegion();
  const [products, setProducts] = useState<ProductCardData[]>([]);
  const [filtered, setFiltered] = useState<ProductCardData[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshingAll, setRefreshingAll] = useState(false);
  const [filterQuery, setFilterQuery] = useState("");

  function applyTrustFilter(items: ProductCardData[]): ProductCardData[] {
    return items.map((p) => {
      const threshold = Math.max(minTrust, (p as ProductCardData & { min_trust_score?: number }).min_trust_score ?? 0);
      if (threshold === 0) return p;

      const trustedSources = p.sources.filter(
        (s) => s.trust_score == null || s.trust_score >= threshold
      );
      const prices = trustedSources.filter((s) => s.current_price != null).map((s) => s.current_price!);
      const best_price = prices.length > 0 ? Math.min(...prices) : null;

      return { ...p, sources: trustedSources, best_price };
    });
  }

  const fetchProducts = useCallback(async () => {
    try {
      const url = categoryFilter
        ? `/api/products?category=${encodeURIComponent(categoryFilter)}`
        : "/api/products";
      const res = await fetch(url);
      const items = await res.json();

      const withHistory: ProductCardData[] = await Promise.all(
        items.map(async (p: ProductCardData) => {
          const hRes = await fetch(`/api/products/${p.id}/history`);
          const history = await hRes.json();
          const prices = history.map((h: { price: number }) => h.price);
          return { ...p, priceHistory: prices };
        })
      );

      setProducts(withHistory);
    } catch (err) {
      console.error("Failed to fetch products:", err);
    } finally {
      setLoading(false);
    }
  }, [categoryFilter]);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  // Listen for products added from the chat widget
  useEffect(() => {
    function handleChatAdd() {
      fetchProducts();
    }
    window.addEventListener("cheapshot-product-added", handleChatAdd);
    return () => window.removeEventListener("cheapshot-product-added", handleChatAdd);
  }, [fetchProducts]);

  // Re-apply search + trust filters
  useEffect(() => {
    let result = products;
    if (filterQuery) {
      const q = filterQuery.toLowerCase();
      result = result.filter((p) => p.name.toLowerCase().includes(q));
    }
    setFiltered(applyTrustFilter(result));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [products, filterQuery, minTrust]);

  function handleSearch(query: string) {
    setFilterQuery(query);
  }

  function buildSizePrefs(sizeKey?: string): Record<string, string> | undefined {
    if (!sizeKey) return undefined;
    const val = sizes[sizeKey as keyof SizePreferences];
    if (!val) return undefined;
    return { [sizeKey]: val };
  }

  async function handleProductAdded(result: AddProductResult) {
    await fetchProducts();
    triggerSearch(result.productId, result.sizeKey, result.searchHint);
  }

  async function triggerSearch(productId: number, sizeKey?: string, searchHint?: string) {
    setProducts((prev) =>
      prev.map((p) =>
        p.id === productId ? { ...p, search_status: "searching" } : p
      )
    );
    setFiltered((prev) =>
      prev.map((p) =>
        p.id === productId ? { ...p, search_status: "searching" } : p
      )
    );

    try {
      await fetch(`/api/products/${productId}/search`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          country: region.name,
          currency: region.currency,
          sizePrefs: buildSizePrefs(sizeKey),
          searchHint,
        }),
      });
    } catch (err) {
      console.error("Search failed:", err);
    }

    await fetchProducts();
  }

  async function handleRefresh(productId: number) {
    setProducts((prev) =>
      prev.map((p) =>
        p.id === productId ? { ...p, search_status: "searching" } : p
      )
    );
    setFiltered((prev) =>
      prev.map((p) =>
        p.id === productId ? { ...p, search_status: "searching" } : p
      )
    );

    try {
      await fetch(`/api/products/${productId}/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          country: region.name,
          currency: region.currency,
        }),
      });
    } catch (err) {
      console.error("Refresh failed:", err);
    }

    await fetchProducts();
  }

  async function handleRemoveSource(productId: number, sourceId: number) {
    await fetch(`/api/products/${productId}/sources/${sourceId}`, { method: "DELETE" });
    await fetchProducts();
  }

  async function handleFindMore(productId: number) {
    // Look up the product's subcategory to get the search hint
    const product = products.find((p) => p.id === productId) as ProductCardData & { category?: string; subcategory?: string } | undefined;
    const sub = product?.category && product?.subcategory
      ? findSubcategory(product.category, product.subcategory)
      : undefined;
    triggerSearch(productId, sub?.sizeKey, sub?.searchHint);
  }

  async function handleRefreshAll() {
    const eligible = products.filter((p) => p.search_status !== "searching" && p.search_status !== "pending");
    if (eligible.length === 0) return;

    setRefreshingAll(true);

    const ids = new Set(eligible.map((p) => p.id));
    setProducts((prev) => prev.map((p) => ids.has(p.id) ? { ...p, search_status: "searching" } : p));
    setFiltered((prev) => prev.map((p) => ids.has(p.id) ? { ...p, search_status: "searching" } : p));

    await Promise.all(
      eligible.map((p) => {
        const endpoint = p.sources.length > 0
          ? `/api/products/${p.id}/refresh`
          : `/api/products/${p.id}/search`;
        return fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ country: region.name, currency: region.currency }),
        }).catch((err) => console.error(`Refresh failed for ${p.name}:`, err));
      })
    );

    await fetchProducts();
    setRefreshingAll(false);
  }

  async function handleClearAll() {
    setRefreshingAll(true);
    const eligible = products;

    // Delete all sources and clear excluded retailers for each product
    for (const p of eligible) {
      for (const s of p.sources) {
        await fetch(`/api/products/${p.id}/sources/${s.id}`, { method: "DELETE" });
      }
      // Reset excluded retailers
      await fetch(`/api/products/${p.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ excluded_retailers: "[]" }),
      });
    }

    // Mark all as searching
    setProducts((prev) => prev.map((p) => ({ ...p, sources: [], best_price: null, search_status: "searching" })));
    setFiltered((prev) => prev.map((p) => ({ ...p, sources: [], best_price: null, search_status: "searching" })));

    // Kick off fresh searches for all
    await Promise.all(
      eligible.map((p) =>
        fetch(`/api/products/${p.id}/search`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ country: region.name, currency: region.currency }),
        }).catch((err) => console.error(`Re-search failed for ${p.name}:`, err))
      )
    );

    await fetchProducts();
    setRefreshingAll(false);
  }

  async function handleUpdateTarget(productId: number, desiredPrice: number | null) {
    await fetch(`/api/products/${productId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ desired_price: desiredPrice }),
    });
    await fetchProducts();
  }

  async function handleUpdateFrequency(productId: number, frequency: CheckFrequency, checkDay: number | null) {
    await fetch(`/api/products/${productId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ check_frequency: frequency, check_day: checkDay }),
    });
    await fetchProducts();
  }

  async function handleDelete(id: number) {
    await fetch(`/api/products/${id}`, { method: "DELETE" });
    await fetchProducts();
  }

  return (
    <div className="space-y-6">
      <SearchBar onSearch={handleSearch} onAdd={() => setShowModal(true)} onRefreshAll={handleRefreshAll} onClearAll={handleClearAll} refreshing={refreshingAll} />

      {loading ? (
        <div className="text-center text-gray-400 py-12">Loading...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-gray-400 mb-2">No products tracked yet.</p>
          <button
            onClick={() => setShowModal(true)}
            className="text-emerald-600 hover:underline font-medium text-sm"
          >
            Add your first item
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((product) => (
            <ProductCard
              key={product.id}
              product={product}
              onDelete={handleDelete}
              onRemoveSource={handleRemoveSource}
              onFindMore={handleFindMore}
              onRefresh={handleRefresh}
              onUpdateFrequency={handleUpdateFrequency}
              onUpdateTarget={handleUpdateTarget}
            />
          ))}
        </div>
      )}

      <AddProductModal
        open={showModal}
        onClose={() => setShowModal(false)}
        onAdded={handleProductAdded}
        defaultCategory={defaultAddCategory}
      />
    </div>
  );
}
