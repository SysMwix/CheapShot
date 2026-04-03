"use client";

import { useEffect, useState, useCallback } from "react";
import { useRegion } from "@/components/RegionContext";
import SearchBar from "@/components/SearchBar";
import ProductCard, { ProductCardData } from "@/components/ProductCard";
import AddProductModal from "@/components/AddProductModal";
import type { CheckFrequency } from "@/lib/db";

export default function Dashboard() {
  const { region } = useRegion();
  const [products, setProducts] = useState<ProductCardData[]>([]);
  const [filtered, setFiltered] = useState<ProductCardData[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshingAll, setRefreshingAll] = useState(false);
  const [filterQuery, setFilterQuery] = useState("");

  const fetchProducts = useCallback(async () => {
    try {
      const res = await fetch("/api/products");
      const items = await res.json();

      const withHistory: ProductCardData[] = await Promise.all(
        items.map(async (p: ProductCardData) => {
          const hRes = await fetch(`/api/products/${p.id}/history`);
          const history = await hRes.json();
          // Get the lowest price at each check point for sparkline
          const prices = history.map((h: { price: number }) => h.price);
          return { ...p, priceHistory: prices };
        })
      );

      setProducts(withHistory);
      // Re-apply filter
      if (filterQuery) {
        const q = filterQuery.toLowerCase();
        setFiltered(withHistory.filter((p) => p.name.toLowerCase().includes(q)));
      } else {
        setFiltered(withHistory);
      }
    } catch (err) {
      console.error("Failed to fetch products:", err);
    } finally {
      setLoading(false);
    }
  }, [filterQuery]);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  function handleSearch(query: string) {
    setFilterQuery(query);
    const q = query.toLowerCase();
    if (!q) {
      setFiltered(products);
    } else {
      setFiltered(products.filter((p) => p.name.toLowerCase().includes(q)));
    }
  }

  async function handleProductAdded(productId: number) {
    // Refresh list immediately to show the new card in loading state
    await fetchProducts();

    // Kick off AI search in background
    triggerSearch(productId);
  }

  async function triggerSearch(productId: number) {
    // Mark as searching locally for instant feedback
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
        }),
      });
    } catch (err) {
      console.error("Search failed:", err);
    }

    // Refresh to get the results
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
    await fetch(`/api/products/${productId}/sources/${sourceId}`, {
      method: "DELETE",
    });
    await fetchProducts();
  }

  async function handleFindMore(productId: number) {
    triggerSearch(productId);
  }

  async function handleRefreshAll() {
    const eligible = products.filter((p) => p.search_status !== "searching" && p.search_status !== "pending");
    if (eligible.length === 0) return;

    setRefreshingAll(true);

    // Mark all as searching
    const ids = new Set(eligible.map((p) => p.id));
    setProducts((prev) => prev.map((p) => ids.has(p.id) ? { ...p, search_status: "searching" } : p));
    setFiltered((prev) => prev.map((p) => ids.has(p.id) ? { ...p, search_status: "searching" } : p));

    // Products with sources get refreshed, those without get a new search
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
      <SearchBar onSearch={handleSearch} onAdd={() => setShowModal(true)} onRefreshAll={handleRefreshAll} refreshing={refreshingAll} />

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
      />
    </div>
  );
}
