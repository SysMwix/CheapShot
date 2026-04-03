"use client";

import { useState, useRef, useEffect } from "react";
import { useRegion } from "./RegionContext";

interface ProductSuggestion {
  id: string;
  name: string;
  description: string;
  estimatedPrice: number;
  currency: string;
  sourceUrl: string;
  searchQuery: string;
  category: string;
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  products?: ProductSuggestion[] | null;
}

export default function ShoppingChatWidget() {
  const { region } = useRegion();
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [addedProducts, setAddedProducts] = useState<Set<string>>(new Set());
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  // Focus input when opened
  useEffect(() => {
    if (isOpen && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || isLoading) return;

    const userMessage: ChatMessage = { role: "user", content: text };
    const updatedMessages = [...messages, userMessage];
    setMessages(updatedMessages);
    setInput("");
    setIsLoading(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: updatedMessages.map((m) => ({ role: m.role, content: m.content })),
        }),
      });

      if (!res.ok) throw new Error("Chat failed");

      const data = await res.json();
      const assistantMessage: ChatMessage = {
        role: "assistant",
        content: data.message || "Sorry, I couldn't process that.",
        products: data.products || null,
      };
      setMessages([...updatedMessages, assistantMessage]);
    } catch {
      setMessages([
        ...updatedMessages,
        { role: "assistant", content: "Sorry, something went wrong. Please try again." },
      ]);
    }
    setIsLoading(false);
  }

  async function handleAddProduct(product: ProductSuggestion) {
    try {
      // Create the product via the existing API
      const res = await fetch("/api/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: product.searchQuery || product.name,
          desired_price: null,
          currency: product.currency || region.currency,
          check_frequency: "manual",
          check_day: null,
          min_trust_score: 0,
          category: product.category || "misc",
          subcategory: "other",
        }),
      });

      if (!res.ok) throw new Error("Failed to add");

      const created = await res.json();

      // Trigger search in background
      fetch(`/api/products/${created.id}/search`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          country: region.name,
          currency: region.currency,
        }),
      }).catch(() => {});

      setAddedProducts((prev) => new Set(prev).add(product.id));

      // Notify the product grid to refresh
      window.dispatchEvent(new Event("cheapshot-product-added"));
    } catch {
      // Show error inline
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: `Failed to add "${product.name}" — please try again.` },
      ]);
    }
  }

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="fixed bottom-6 right-6 z-50 w-14 h-14 bg-emerald-600 hover:bg-emerald-700 text-white rounded-full shadow-lg flex items-center justify-center transition-transform hover:scale-105"
        title="Shopping Assistant"
      >
        {isOpen ? (
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        ) : (
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
        )}
      </button>

      {/* Chat panel */}
      {isOpen && (
        <div className="fixed bottom-24 right-6 z-50 w-[400px] h-[600px] max-w-[calc(100vw-3rem)] max-h-[80vh] bg-white border rounded-2xl shadow-2xl flex flex-col" style={{ minHeight: "400px" }}>
          {/* Header */}
          <div className="px-4 py-3 bg-emerald-600 text-white flex items-center justify-between flex-shrink-0">
            <div>
              <h3 className="font-semibold text-sm">Shopping Assistant</h3>
              <p className="text-xs text-emerald-100">Search &amp; track products</p>
            </div>
            <div className="flex items-center gap-1">
              {(messages.length > 0 || isLoading) && (
                <button
                  onClick={() => { setMessages([]); setAddedProducts(new Set()); setIsLoading(false); setInput(""); }}
                  className="text-emerald-200 hover:text-white transition text-xs px-2 py-1 rounded hover:bg-emerald-700"
                  title="New conversation"
                >
                  New Chat
                </button>
              )}
              <button
                onClick={() => setIsOpen(false)}
                className="text-emerald-200 hover:text-white transition"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </button>
            </div>
          </div>

          {/* Context warning */}
          {messages.length >= 8 && (
            <div className="px-4 py-2 bg-amber-50 border-b border-amber-200 flex items-center justify-between flex-shrink-0">
              <p className="text-xs text-amber-700">
                Long conversation — responses may get less accurate.
              </p>
              <button
                onClick={async () => {
                  // Summarise and start fresh
                  const summary = messages
                    .filter((m) => m.role === "user")
                    .map((m) => m.content)
                    .join(". ");
                  setMessages([
                    { role: "user", content: `Summary of what I'm looking for: ${summary}` },
                  ]);
                  setAddedProducts(new Set());
                }}
                className="text-xs text-amber-700 font-medium hover:text-amber-900 whitespace-nowrap ml-2"
              >
                Summarise &amp; Reset
              </button>
            </div>
          )}

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
            {messages.length === 0 && (
              <div className="text-center text-gray-400 text-sm py-8">
                <p className="mb-1">Hi! Tell me what you&apos;re looking for</p>
                <p className="text-xs">and I&apos;ll search for the best options to track.</p>
              </div>
            )}

            {messages.map((msg, i) => (
              <div key={i}>
                {/* Message bubble */}
                <div className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                  <div
                    className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm overflow-hidden break-words ${
                      msg.role === "user"
                        ? "bg-emerald-600 text-white rounded-br-md"
                        : "bg-gray-100 text-gray-800 rounded-bl-md"
                    }`}
                  >
                    <MessageContent content={msg.content} />
                  </div>
                </div>

                {/* Product cards */}
                {msg.products && msg.products.length > 0 && (
                  <div className="mt-2 space-y-2">
                    {msg.products.map((product) => (
                      <ProductCard
                        key={product.id}
                        product={product}
                        added={addedProducts.has(product.id)}
                        onAdd={() => handleAddProduct(product)}
                      />
                    ))}
                  </div>
                )}
              </div>
            ))}

            {/* Loading indicator */}
            {isLoading && (
              <div className="flex justify-start">
                <div className="bg-gray-100 rounded-2xl rounded-bl-md px-4 py-3 text-sm text-gray-500">
                  <div className="flex items-center gap-2">
                    <span className="inline-block w-3 h-3 border-2 border-gray-300 border-t-emerald-500 rounded-full animate-spin" />
                    Searching and thinking...
                  </div>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <form onSubmit={handleSend} className="px-3 py-2 border-t flex gap-2 flex-shrink-0">
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="What are you looking for?"
              className="flex-1 border rounded-full px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              disabled={isLoading}
            />
            <button
              type="submit"
              disabled={isLoading || !input.trim()}
              className="w-10 h-10 bg-emerald-600 hover:bg-emerald-700 text-white rounded-full flex items-center justify-center transition disabled:opacity-50"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14M12 5l7 7-7 7" />
              </svg>
            </button>
          </form>
        </div>
      )}
    </>
  );
}

/** Render message text with basic markdown bold and links */
function MessageContent({ content }: { content: string }) {
  // Split by markdown links [text](url), bold **text**, and plain text
  const parts = content.split(/(\*\*.*?\*\*|\[.*?\]\(.*?\))/g);
  return (
    <span className="whitespace-pre-wrap break-words">
      {parts.map((part, i) => {
        if (part.startsWith("**") && part.endsWith("**")) {
          return <strong key={i}>{part.slice(2, -2)}</strong>;
        }
        const linkMatch = part.match(/\[(.+?)\]\((.+?)\)/);
        if (linkMatch) {
          return (
            <a key={i} href={linkMatch[2]} target="_blank" rel="noopener noreferrer"
               className="text-blue-500 hover:underline break-all">
              {linkMatch[1]}
            </a>
          );
        }
        return <span key={i}>{part}</span>;
      })}
    </span>
  );
}

/** Product suggestion card */
function ProductCard({
  product,
  added,
  onAdd,
}: {
  product: ProductSuggestion;
  added: boolean;
  onAdd: () => void;
}) {
  return (
    <div className="border rounded-lg p-3 bg-white shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <h4 className="text-sm font-medium text-gray-900 truncate">{product.name}</h4>
          <p className="text-xs text-gray-500 mt-0.5">{product.description}</p>
          {product.estimatedPrice > 0 && (
            <p className="text-sm font-semibold text-emerald-600 mt-1">
              {product.currency} {product.estimatedPrice.toFixed(2)}
            </p>
          )}
          {product.sourceUrl && (
            <a
              href={product.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-blue-500 hover:underline mt-0.5 block truncate"
            >
              {new URL(product.sourceUrl).hostname.replace(/^www\./, "")}
            </a>
          )}
        </div>
        <button
          onClick={onAdd}
          disabled={added}
          className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium transition ${
            added
              ? "bg-emerald-100 text-emerald-700 cursor-default"
              : "bg-emerald-600 hover:bg-emerald-700 text-white"
          }`}
        >
          {added ? "Added!" : "+ Track"}
        </button>
      </div>
    </div>
  );
}
