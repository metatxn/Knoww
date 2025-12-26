# Knoww

A **Next.js** prediction markets platform to **Know your Odds**, powered by **Polymarket**.

## 🎯 Features

- ✅ **Wallet Connection** - Reown AppKit with multi-wallet support (MetaMask, WalletConnect, etc.)
- ✅ **Real-time Market Data** - Live prediction markets from Polymarket Gamma API
- ✅ **Dynamic Home Page** - Trending, Breaking, and New events with instant switching
- ✅ **Category Browse** - Explore by Politics, Sports, Finance, Crypto, and more
- ✅ **Event Details** - View grouped markets with volume and liquidity stats
- ✅ **Market Trading** - Individual market pages with price charts
- ✅ **Responsive Design** - Beautiful UI with Shadcn components and Framer Motion
- ✅ **Type Safe** - Full TypeScript support with Zod validation
- ✅ **Optimized Performance** - TanStack Query caching and parallel data fetching
- ✅ **Cloudflare Workers** - Edge deployment for global performance

## 🚀 Quick Start

### Prerequisites

- Node.js 18+
- pnpm (recommended) or npm/yarn
- [Reown Cloud Project](https://cloud.reown.com/) for AppKit

### 1. Install Dependencies

```bash
pnpm install
```

### 2. Configure Environment Variables

Create a `.env.local` file:

```env
# Reown AppKit
NEXT_PUBLIC_REOWN_PROJECT_ID=your_project_id_here

# Optional: Polymarket Builder API (for order attribution - future feature)
# POLY_BUILDER_API_KEY=your_builder_api_key
# POLY_BUILDER_SECRET=your_builder_secret
# POLY_BUILDER_PASSPHRASE=your_builder_passphrase
```

**Get your Reown Project ID:**

1. Go to [https://cloud.reown.com/](https://cloud.reown.com/)
2. Create a new project
3. Copy your Project ID

### 3. Run Development Server

```bash
pnpm dev
```

Open [http://localhost:8000](http://localhost:8000) in your browser.

### 4. Build for Production

```bash
pnpm build
```

## 📱 User Flow

### Home Page (Default: Trending)

1. User lands on home page
2. Sees **Trending** events by default (highest volume markets)
3. Can switch to **Breaking** (last 7 days) or **New** (today's events)
4. Can browse **All Categories** (Politics, Sports, Finance, etc.)

### Browse by Category

1. Click a category from navbar or home page
2. View all markets in that category (e.g., Sports)
3. Markets fetched using tag-based filtering

### View Event Detail

1. Click any event card
2. See event details, stats, and all related markets
3. Click a market to view trading interface

### Market Detail

1. View market question and description
2. See price chart with historical data
3. View outcome prices and volume
4. Trading interface (coming soon)

## 🏗️ Architecture

### Frontend Stack

- **Next.js 15** - App Router with React Server Components
- **Reown AppKit** - Wallet connection and authentication
- **Wagmi** - React hooks for Ethereum
- **Viem** - Low-level Ethereum interface
- **TanStack Query** - Data fetching, caching, and state management
- **Shadcn UI** - Beautiful, accessible components
- **Framer Motion** - Smooth animations and transitions
- **Tailwind CSS v4** - Utility-first styling
- **BiomeJS** - Fast linter and formatter

### Data Flow

```
User → Reown AppKit → Wagmi → Knoww API Routes → Polymarket Gamma API
```

### Key APIs

1. **Trending Events** - `/api/events/trending`

   - Fetches high-volume events
   - Sorted by volume descending

2. **New Events** - `/api/events/new`

   - Fetches events created today
   - Dynamic date calculation

3. **Breaking Events** - `/api/events/breaking`

   - Fetches recent high-volume events (last 7 days)
   - Ideal for breaking news markets

4. **Category Markets** - `/api/markets/by-tag`

   - 2-step process: Slug → Tag ID → Markets
   - Efficient filtering by category

5. **Event Detail** - `/api/events/[id]`

   - Full event data with all markets

6. **Market Detail** - `/api/markets/[id]`
   - Individual market trading data

## 📂 Project Structure

```
knoww/
├── src/
│   ├── app/
│   │   ├── api/              # Next.js API routes
│   │   │   ├── events/       # Event endpoints
│   │   │   ├── markets/      # Market endpoints
│   │   │   ├── tags/         # Category endpoints
│   │   │   ├── orders/       # Order management (future)
│   │   │   └── wallet/       # Wallet queries (future)
│   │   │
│   │   ├── events/
│   │   │   ├── [tag]/        # Category page
│   │   │   └── detail/[id]/  # Event detail
│   │   │
│   │   ├── markets/[slug]/   # Market detail
│   │   ├── page.tsx          # Home page
│   │   └── layout.tsx        # Root layout
│   │
│   ├── hooks/                # TanStack Query hooks
│   │   ├── use-trending-events.ts
│   │   ├── use-new-events.ts
│   │   ├── use-breaking-events.ts
│   │   ├── use-tags.ts
│   │   ├── use-tag-details.ts
│   │   ├── use-markets-by-tag.ts
│   │   ├── use-event-detail.ts
│   │   ├── use-market-by-id.ts
│   │   └── use-market-detail.ts
│   │
│   ├── components/
│   │   ├── navbar.tsx        # Main navigation
│   │   ├── market-price-chart.tsx
│   │   └── ui/               # Shadcn components
│   │
│   ├── lib/
│   │   ├── constants.ts      # API endpoints
│   │   └── polymarket.ts     # Utilities
│   │
│   ├── config/
│   │   └── index.tsx         # Reown AppKit config
│   │
│   └── context/
│       └── index.tsx         # Providers (AppKit, TanStack Query)
│
├── public/
├── FLOW_DIAGRAM.md           # Visual architecture guide
├── README.md                 # This file
├── package.json
├── next.config.ts            # Next.js config (Turbopack dev, Webpack prod)
├── tsconfig.json
└── biome.json                # Linter config
```

## 🎨 UI/UX Features

### Home Page

- **Dynamic Views**: Trending (default), Breaking, New, All Categories
- **Instant Switching**: Pre-fetched data for zero-delay transitions
- **Event Cards**: Images, volume, market count, hover animations
- **Responsive Grid**: 1-3 columns based on screen size

### Navigation

- **Navbar**: Category links, wallet connection, account dropdown
- **Smart Back Buttons**: Use browser history (`router.back()`)
- **Breadcrumbs**: Clear navigation hierarchy

### Loading States

- **Skeleton Loaders**: Match actual content layout
- **Staggered Animations**: Cards fade in with 50ms delays
- **Progress Indicators**: Loading spinners for async operations

### Animations

- **Framer Motion**: Smooth page transitions
- **Hover Effects**: Cards lift and scale on hover
- **Fade Ins**: Content appears with opacity transitions

## 🔐 Security & Privacy

### Non-Custodial

- **No Private Keys** - Users control their own wallets
- **Client-Side Signing** - All transactions signed in browser
- **Reown AppKit** - Secure wallet connection protocol

### Environment Variables

- `NEXT_PUBLIC_*` - Exposed to browser (safe for client-side)
- Server-only vars - Never exposed to client

## 🚀 Deployment

### Cloudflare Workers

1. **Install Wrangler CLI**

```bash
pnpm install -g wrangler
```

2. **Login to Cloudflare**

```bash
wrangler login
```

3. **Configure `wrangler.toml`**

```toml
name = "knoww"
compatibility_date = "2024-01-01"
pages_build_output_dir = ".vercel/output/static"

[env.production]
vars = { ENVIRONMENT = "production" }
```

4. **Deploy**

```bash
pnpm run deploy
```

### Environment Variables in Production

Set in Cloudflare Workers dashboard:

- `NEXT_PUBLIC_REOWN_PROJECT_ID`
- `POLY_BUILDER_API_KEY` (optional, for future trading)
- `POLY_BUILDER_SECRET` (optional)
- `POLY_BUILDER_PASSPHRASE` (optional)

## 📊 Performance Optimizations

1. **Parallel Data Fetching** - All event types load simultaneously
2. **TanStack Query Caching** - 1-minute stale time, prevents redundant calls
3. **Direct ID Fetching** - Market pages use IDs for 1 API call vs 2
4. **Server-Side Caching** - 60-second cache on API routes
5. **Code Splitting** - Automatic by Next.js App Router
6. **Edge Deployment** - Cloudflare Workers for global performance

## 🛠️ Development

### Available Scripts

```bash
pnpm dev          # Start dev server (Turbopack)
pnpm build        # Build for production
pnpm start        # Start production server
pnpm lint         # Run BiomeJS linter
pnpm format       # Format code with BiomeJS
pnpm type-check   # Check TypeScript types
```

### Code Style

- **BiomeJS** - Fast linter and formatter
- **TypeScript** - Strict mode enabled
- **Tailwind CSS** - Utility-first styling
- **Component Structure** - Server components by default, client only when needed

### Adding New Components

```bash
# Add Shadcn component
pnpm dlx shadcn@latest add button
```

## 📚 Documentation

- **[FLOW_DIAGRAM.md](./FLOW_DIAGRAM.md)** - Visual architecture and user flow
- **[Polymarket Docs](https://docs.polymarket.com/)** - Official Polymarket API docs
- **[Reown Docs](https://docs.reown.com/)** - Reown AppKit documentation
- **[Next.js Docs](https://nextjs.org/docs)** - Next.js documentation
- **[TanStack Query Docs](https://tanstack.com/query)** - Data fetching documentation

## 🔄 Data Hierarchy

```
Tags (Categories)
    ↓
Events (Grouped Questions)
    ↓
Markets (Individual Tradeable Questions)
```

Example:

```
Tag: "Sports" (slug: sports, id: 1)
    ↓
Event: "Super Bowl Champion 2026" (id: 23656)
    ↓
Market: "Will the Buffalo Bills win Super Bowl 2026?" (id: 540208)
```

## 🎯 Roadmap

### Current Features

- ✅ Wallet connection via Reown AppKit
- ✅ Browse markets by category
- ✅ View event details
- ✅ View market details with charts
- ✅ Trending, Breaking, New event feeds

### Coming Soon

- 🔄 **Trading Interface** - Buy/Sell orders with wallet integration
- 🔄 **Order Management** - View and cancel open orders
- 🔄 **Portfolio View** - Track positions and P&L
- 🔄 **Real-time Updates** - WebSocket integration
- 🔄 **Search & Filters** - Find specific markets
- 🔄 **Notifications** - Market alerts and updates

## 🤝 Contributing

Contributions are welcome! Please follow these guidelines:

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run `pnpm lint` and fix any errors
5. Submit a pull request

## 📄 License

MIT

## 🙏 Acknowledgments

- **[Polymarket](https://polymarket.com/)** - Prediction market platform
- **[Reown](https://reown.com/)** - Wallet connection infrastructure
- **[Shadcn](https://ui.shadcn.com/)** - Component library
- **[TanStack](https://tanstack.com/)** - Query and state management
- **[Cloudflare](https://www.cloudflare.com/)** - Edge deployment platform

---

Built with ❤️ by the Soclly team
