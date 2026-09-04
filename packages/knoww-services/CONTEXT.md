# Services context

`@knoww/services` owns the platform adapters, the canonical event, market and order contract, canonical ids, search fan-out and pagination. Every prediction-market platform Knoww reads from or trades on is reached through this package. Apps consume canonical types and never name a platform outside the escape-hatch folders.

Decision record: `docs/decisions/2026-09-03-aggregator-platform-adapters.md`. Prior design for the MCP-facing contract: `docs/single-api-layer.md`.

## Owns

- The canonical contract in `src/core/`: `CanonicalEvent`, `CanonicalMarket`, `CanonicalOutcome`, the order model from M3, `MarketStatus`, capability and flag types, `PlatformError`.
- The adapter interfaces `MarketDataAdapter` and `TradingAdapter`.
- The registry in `src/registry.ts`, which is the only module that imports a platform folder.
- One folder per platform under `src/platforms/`, each holding its client, schemas, mappers and adapters.
- Recorded upstream fixtures under `src/fixtures/` for mapper tests.
- The legacy Gamma-shaped modules under `src/markets/` and `src/profiles/`, kept as thin wrappers until M5.

## Does not own

- Rendering, routing, caching policy and feature-flag delivery to the browser. Those belong to apps/web. This package accepts a fetch implementation and cache hints and never imports Next or React.
- Wallet connection, signing UI and session state. The trading adapter receives a signer and an identity.
- Contract ABIs, chain constants and Polymarket runtime helpers that live in `@knoww/shared-types`.
- Card matching and ranking in the extension.

## Glossary

Use these terms in code, tests, issues and docs. The "not" column lists synonyms to avoid.

| Term | Meaning | Not |
| --- | --- | --- |
| Platform | A prediction-market venue Knoww integrates: Polymarket, Kalshi. Identified by a lowercase `PlatformId`. | provider, exchange, venue, source, integration |
| Adapter | The implementation of a contract interface for one platform. There are two kinds, a market-data adapter and a trading adapter. Lives in `src/platforms/<platform>/`. | connector, client (that is the raw HTTP layer inside the adapter), driver, plugin |
| Market-data adapter | The read side: search, list events, get event, get event by slug, get market, orderbook, price history, public trades, tags. Returns canonical types. | fetcher, service |
| Trading adapter | The write side plus account reads: connection status, positions, activity, orders, preview, place, cancel. Only Polymarket implements it. | broker, executor |
| Registry | The single lookup from `PlatformId` to adapters. Owns provider base URLs and the enablement flags. `getMarketDataAdapter`, `getTradingAdapter`, `getEnabledPlatforms`, `getPlatformAdapter`, `parseCanonicalId`. | factory, container, resolver |
| Canonical id | `platform:sourceId`. Polymarket events use the numeric Gamma event id and markets use the condition id. Kalshi uses the uppercase ticker verbatim. Never merged, never guessed. | unified id, global id, uuid |
| Source id | The platform's own identifier, kept on every canonical object as `sourceEventId` or `sourceMarketId`. | native id, raw id, upstream id |
| Slug | The URL segment for an event. Separate from the id. Kalshi slugs are the lowercased ticker. | id, handle, path |
| Canonical model | The platform-neutral event, market, outcome and order shapes in `src/core/`. Widened only by the widening rule. | unified model, common model, DTO |
| Platform details | The `platformDetails` discriminated union on canonical objects. The only place platform-specific fields live. Optional UI renders from it. For Polymarket it also carries `gamma`, the Gamma record as received, so apps/web rebuilds its legacy payloads from it without loss. | metadata, extras, raw |
| Capability | A boolean on a platform's `MarketCapabilities` saying what it supports: market data, orderbook, price history, public trades, account positions, account orders, create order, cancel order, redeem, withdrawals. The apps branch on capabilities, never on the platform id. | feature, permission, support flag |
| Enablement flag | The server-side switch for a platform and for a capability within it. Read once at startup from `KNOWW_ENABLED_PLATFORMS` and `KNOWW_PLATFORM_CAPABILITY_OVERRIDES`. A disabled platform returns 404 with noindex and leaves feeds and the sitemap. | feature flag (that is the web app's delivery helper), toggle, kill switch |
| Hand-off | Sending the user to the platform's own site to trade, with a Knoww-side outbound click event. Kalshi's trading mode. | redirect, referral, affiliate link, deep link |
| Escape hatch | `getPlatformAdapter("polymarket")` returning the concrete adapter with its extra methods. Allowed only in `apps/web/src/polymarket/` and `apps/web/src/app/api/polymarket/`. | backdoor, raw access, bypass |
| Widening rule | A new field on a canonical type carries a one-line note on what Kalshi supplies for it, or that it is null. | schema extension |
| Identity | The discriminated union describing how a user is connected to a platform: wallet-backed with a Polymarket account type (Deposit Wallet by default, Safe as legacy), or broker-backed, unimplemented. | account, session, login, principal (that is the MCP term) |
| Legacy wrapper | A module under `src/markets/` or `src/profiles/` that keeps its old export signature and forwards to the Polymarket adapter. Deleted at M5. | shim, facade, compat layer |
| Cache hint | The `cache` field on `ServiceFetchOptions` with revalidate seconds and tags. The adapter passes it to the injected fetch and never caches on its own. | cache policy, TTL config |
| Fan-out | Calling every enabled platform's adapter in parallel for search and list, then sorting without merging. Partial failures return the platforms that answered plus an error list. | aggregation, federation |

## Invariants

- Only `src/registry.ts` imports from `src/platforms/`.
- Nothing in this package imports `next` or `react`.
- Nothing outside `src/platforms/polymarket/` imports `@polymarket/*` or Gamma, CLOB and Data API types.
- Base URLs come from the registry, never from request input.
- Prices are decimal strings between 0 and 1. Amounts carry a unit.
- Markets are never merged across platforms.
- Kalshi tickers are stored uppercase and verbatim.

## Adding a platform

1. Create `src/platforms/<platform>/` with a client, zod schemas for the upstream responses, mappers to the canonical model, a market-data adapter and, if the platform supports trading through Knoww, a trading adapter.
2. Add the platform id to `PLATFORM_IDS` in `src/core/ids.ts` and register the adapters in `src/registry.ts`.
3. Record upstream fixtures under `src/fixtures/<platform>/` and write mapper tests against them.
4. Add a subpath export in `package.json`.
5. Fill the Kalshi note, or the new platform's note, on every widened canonical field.

No file in apps/web should need to change beyond a route folder for the platform's URLs and an optional entry in the platform UI map.
