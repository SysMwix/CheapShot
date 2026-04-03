"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { CATEGORIES } from "@/lib/categories";

export default function CategoryNav() {
  const pathname = usePathname();
  const isAll = pathname === "/";
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  // Close menu on navigation
  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  const activeLabel = isAll
    ? "All Items"
    : CATEGORIES.find((c) => pathname === `/category/${c.slug}`)
      ? `${CATEGORIES.find((c) => pathname === `/category/${c.slug}`)!.icon} ${CATEGORIES.find((c) => pathname === `/category/${c.slug}`)!.label}`
      : "All Items";

  return (
    <nav className="bg-white border rounded-lg px-2 py-2">
      {/* Desktop: wrapping tab bar */}
      <div className="hidden md:flex flex-wrap gap-1">
        <Link
          href="/"
          className={`px-3 py-1.5 rounded text-sm font-medium transition ${
            isAll ? "bg-emerald-600 text-white" : "text-gray-600 hover:bg-gray-100"
          }`}
        >
          All Items
        </Link>
        {CATEGORIES.map((cat) => {
          const isActive = pathname === `/category/${cat.slug}`;
          return (
            <Link
              key={cat.slug}
              href={`/category/${cat.slug}`}
              className={`px-3 py-1.5 rounded text-sm font-medium transition ${
                isActive ? "bg-emerald-600 text-white" : "text-gray-600 hover:bg-gray-100"
              }`}
            >
              {cat.icon} {cat.label}
            </Link>
          );
        })}
      </div>

      {/* Mobile: hamburger menu */}
      <div className="md:hidden relative" ref={menuRef}>
        <button
          onClick={() => setMenuOpen(!menuOpen)}
          className="flex items-center justify-between w-full px-3 py-1.5 rounded text-sm font-medium text-gray-700"
        >
          <span>{activeLabel}</span>
          <svg
            className={`w-4 h-4 text-gray-400 transition-transform ${menuOpen ? "rotate-180" : ""}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {menuOpen && (
          <div className="absolute left-0 right-0 mt-1 bg-white border rounded-lg shadow-lg z-50 py-1">
            <Link
              href="/"
              className={`block px-4 py-2 text-sm transition ${
                isAll ? "bg-emerald-50 text-emerald-700 font-medium" : "text-gray-600 hover:bg-gray-50"
              }`}
            >
              All Items
            </Link>
            {CATEGORIES.map((cat) => {
              const isActive = pathname === `/category/${cat.slug}`;
              return (
                <Link
                  key={cat.slug}
                  href={`/category/${cat.slug}`}
                  className={`block px-4 py-2 text-sm transition ${
                    isActive ? "bg-emerald-50 text-emerald-700 font-medium" : "text-gray-600 hover:bg-gray-50"
                  }`}
                >
                  {cat.icon} {cat.label}
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </nav>
  );
}
