import type { Metadata } from "next";
import "./globals.css";
import { RegionProvider } from "@/components/RegionContext";
import Header from "@/components/Header";

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
          <main className="max-w-6xl mx-auto px-4 py-8">{children}</main>
        </RegionProvider>
      </body>
    </html>
  );
}
