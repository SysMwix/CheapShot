# CheapShot

A personal price tracker app. Track product prices across the web and get alerted when they hit your target.

## Tech Stack

- **Next.js 16** with TypeScript and App Router
- **Tailwind CSS** for styling
- **SQLite** via better-sqlite3 for local storage
- **Cheerio** for web scraping

## Getting Started

```bash
# Install dependencies
npm install

# Run the dev server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

The SQLite database (`cheapshot.db`) is created automatically on first request.

## Project Structure

```
src/
├── app/
│   ├── api/products/          # CRUD routes
│   │   └── [id]/
│   │       ├── check-price/   # POST — trigger price fetch
│   │       └── history/       # GET — price history
│   ├── layout.tsx             # Root layout
│   ├── page.tsx               # Dashboard
│   └── globals.css
├── components/
│   ├── AddProductModal.tsx    # Add item form
│   ├── ProductCard.tsx        # Product card with alert/trend
│   ├── SearchBar.tsx          # Search + add button
│   └── Sparkline.tsx          # SVG sparkline chart
├── lib/
│   └── db.ts                 # SQLite connection + schema
└── services/
    ├── scraper.ts             # Web scraping (generic + interface)
    └── search.ts              # Search provider (stub)
```

## API Routes

| Method | Route                            | Description         |
|--------|----------------------------------|---------------------|
| GET    | `/api/products`                  | List all products   |
| POST   | `/api/products`                  | Create a product    |
| GET    | `/api/products/[id]`             | Get a product       |
| PUT    | `/api/products/[id]`             | Update a product    |
| DELETE | `/api/products/[id]`             | Delete a product    |
| POST   | `/api/products/[id]/check-price` | Fetch latest price  |
| GET    | `/api/products/[id]/history`     | Get price history   |

## Adding Scrapers

Implement the `PriceScraper` interface in `src/services/scraper.ts` and add it to the `scrapers` array. The first scraper whose `canHandle(url)` returns `true` will be used.

## License

ISC
