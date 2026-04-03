"use client";

import { use } from "react";
import { useRegion, SIZE_OPTIONS, SizePreferences } from "@/components/RegionContext";
import { getCategoryBySlug } from "@/lib/categories";
import ProductGrid from "@/components/ProductGrid";
import { notFound } from "next/navigation";

export default function CategoryPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const { sizes, setSizes } = useRegion();

  const category = getCategoryBySlug(slug);
  if (!category) {
    notFound();
  }

  // Collect the unique size keys relevant to this category's subcategories
  const relevantSizeKeys = Array.from(
    new Set(
      category.subcategories
        .filter((s) => s.sizeKey)
        .map((s) => s.sizeKey!)
    )
  );

  return (
    <div className="space-y-6">
      {/* Category header with relevant size preferences */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">
            {category.icon} {category.label}
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {category.subcategories.length} subcategories
          </p>
        </div>
      </div>

      {/* Size preferences relevant to this category */}
      {relevantSizeKeys.length > 0 && (
        <div className="bg-white border rounded-lg p-4">
          <h2 className="text-sm font-semibold text-gray-700 mb-2">
            Your {category.label} Sizes
          </h2>
          <div className="flex flex-wrap gap-3">
            {relevantSizeKeys.map((key) => {
              const opt = SIZE_OPTIONS[key as keyof typeof SIZE_OPTIONS];
              if (!opt) return null;
              return (
                <div key={key} className="flex items-center gap-2">
                  <label className="text-sm text-gray-600 w-28 flex-shrink-0">{opt.label}</label>
                  <select
                    value={sizes[key as keyof SizePreferences] || ""}
                    onChange={(e) => setSizes({ ...sizes, [key]: e.target.value })}
                    className="border rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  >
                    {opt.options.map((o) => (
                      <option key={o} value={o}>{o || "Not set"}</option>
                    ))}
                  </select>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Product grid filtered to this category */}
      <ProductGrid categoryFilter={slug} defaultAddCategory={slug} />
    </div>
  );
}
