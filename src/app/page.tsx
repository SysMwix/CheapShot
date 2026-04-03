"use client";

import { useEffect, useState, useCallback } from "react";
import SearchBar from "@/components/SearchBar";
import ProductCard, { ProductCardData } from "@/components/ProductCard";
import AddProductModal from "@/components/AddProductModal";

interface ApiProduct {
  id: number;
  name: string;
  url: string;
  image_url: string | null;
  current_price: number | null;
  desired_price: number;
  currency: string;
}

interface PriceHistoryEntry {
  price: number;
}

export default function Dashboard() {
  const [products, setProducts] = useState<ProductCardData[]>([]);
  const [filtered, setFiltered] = useState<ProductCardData[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [loading, setLoading] = useState(true);

  const fetchProducts = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/products");
      const items: ApiProduct[] = await res.json();

      const withHistory = await Promise.all(
        items.map(async (p) => {
          const hRes = await fetch(`/api/products/${p.id}/history`);
          const history: PriceHistoryEntry[] = await hRes.json();
          return {
            ...p,
            priceHistory: history.map((h) => h.price),
          };
        })
      );

      setProducts(withHistory);
      setFiltered(withHistory);
    } catch (err) {
      console.error("Failed to fetch products:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  function handleSearch(query: string) {
    const q = query.toLowerCase();
    setFiltered(
      products.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.url.toLowerCase().includes(q)
      )
    );
  }

  async function handleCheckPrice(id: number) {
    await fetch(`/api/products/${id}/check-price`, { method: "POST" });
    fetchProducts();
  }

  async function handleDelete(id: number) {
    await fetch(`/api/products/${id}`, { method: "DELETE" });
    fetchProducts();
  }

  return (
    <div className="space-y-6">
      <SearchBar onSearch={handleSearch} onAdd={() => setShowModal(true)} />

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
              onCheckPrice={handleCheckPrice}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}

      <AddProductModal
        open={showModal}
        onClose={() => setShowModal(false)}
        onAdded={fetchProducts}
      />
    </div>
  );
}
