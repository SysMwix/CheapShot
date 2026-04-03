import type { Metadata } from "next";
import "./globals.css";

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
        <header className="bg-white border-b border-gray-200 px-6 py-4">
          <h1 className="text-2xl font-bold tracking-tight">
            Cheap<span className="text-emerald-600">Shot</span>
          </h1>
        </header>
        <main className="max-w-6xl mx-auto px-4 py-8">{children}</main>
      </body>
    </html>
  );
}
