import type { Metadata } from "next";
import "./globals.css";
import { RegionProvider } from "@/components/RegionContext";
import Header from "@/components/Header";
import CategoryNav from "@/components/CategoryNav";

export const metadata: Metadata = {
  title: "CheapShot - Price Tracker",
  description: "Track prices and never miss a deal",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-gray-50 text-gray-900 min-h-screen">
        <RegionProvider>
          <Header />
          <div className="max-w-6xl mx-auto px-4 pt-4">
            <CategoryNav />
          </div>
          <main className="max-w-6xl mx-auto px-4 py-6">{children}</main>
        </RegionProvider>
      </body>
    </html>
  );
}
