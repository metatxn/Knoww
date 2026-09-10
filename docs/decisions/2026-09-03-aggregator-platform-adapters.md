# Restructure Knoww around platform adapters

Status: Accepted
Date: 2026-09-03

## Summary

Knoww becomes an aggregator of prediction-market platforms. Polymarket is the first platform and Kalshi the second. Today apps/web, the extension and MCP call Gamma, the CLOB and the Data API directly, so every page, route and hook knows Polymarket's shapes. This record moves all of that behind one adapter per platform in `@knoww/services`, with a canonical event, market and order model that the apps consume. Adding a platform later means one folder under the platforms directory plus one registry entry, with no component edits in apps/web.

The migration runs in milestones. M1 puts the canonical contract, the registry and the Polymarket market-data adapter in place and moves the web app's shared read paths onto it with no visible change. M3 does the same for trading. No Kalshi code starts until both pass their bars. M2 and M4 then add Kalshi discovery and hand-off. M5 moves the MCP tools and deletes the legacy wrappers.

The owner's stated goal is a code structure modular enough that adding a new platform is easy. Every decision below is measured against that.

This record supersedes parts of `docs/single-api-layer.md`. That document stays, because its canonical model, adapter contracts and search fan-out rules are reused here and the MCP work resumes at M5. The superseded sections are listed at the end.

## Scope

In scope: discovery and trading. Polymarket and Kalshi. The whole codebase, starting with apps/web and `@knoww/services`, then the extension and MCP step by step. Nothing is left out of the restructure.

Out of scope: Limitless, Opinion and every other platform. The agent app and its D1 tables. Delegated credentials, a Knoww login and a unified Knoww account. Shrinking `@knoww/shared-types`. A stream contract. A portfolio abstraction. Kalshi on-chain trading through DFlow.

## Facts that shaped the decisions

| Fact | Consequence |
| --- | --- |
| Only one file in apps/web imports `@knoww/services` (the search route). `server-cache.ts` and about 25 API routes call Gamma, the CLOB and the Data API directly. | M1 is mostly moving direct upstream calls into the adapter, not rewiring an existing abstraction. |
| The extension is the only caller of apps/web API routes outside apps/web. It calls 15 of them with a hardcoded `https://knoww.app` fallback. MCP, agent and video call none. | Route moves need an extension change in the same branch and nothing else. |
| Trading is one 1188-line hook with nine consumers. Every trading test is a `vi.mock` stub. There is no msw setup, no recorded fixture, no test wallet and no public CLOB testnet. | Trading is abstracted while Polymarket is the only implementation, and the M3 harness is built from nothing. |
| Knoww has one worker, no staging environment and no CI for apps/web. Deploys are manual from main. | PRs land on an integration branch and a web CI workflow arrives with the first M1 PR. |
| Kalshi tickers are case-sensitive uppercase. `/events/KXELONMARS-99` returns 200 and the lowercase form returns 404. | Kalshi canonical ids carry the ticker verbatim and slugs are a separate field. |
| The sports live page reads its event list from Gamma and its scores from Polymarket's own sports socket. | The event list goes canonical in M1. The sockets stay Polymarket-specific. |

## Definition of plug and play

Adding a platform means:

1. One new folder under `packages/knoww-services/src/platforms/`.
2. One entry in the registry.
3. One entry in the web app's platform UI map, only if the platform needs an optional slot such as a trading extras panel.

Zero edits to components in apps/web. Platform-specific UI renders from `platformDetails` and is optional. If a new platform needs a component change, the seam is in the wrong place and the seam gets fixed, not the component.

Removing a platform means deleting the registry entry. Its pages return 404 with noindex, its cards leave the feeds and the sitemap drops it, because the registry drives all three.

## Package layout

The contract and the adapters live in `@knoww/services`. The package had a single root export before M1. The subpaths replaced it, and M5 removed the root export on 2026-09-05.

```text
packages/knoww-services/src/
  core/                 contract types, errors, adapter interfaces, capability and flag types
  registry.ts           the only module allowed to import a platform folder
  platforms/
    polymarket/         client, zod schemas, mappers, market-data adapter, trading adapter (M3)
    kalshi/             M2 and M4
  fixtures/             recorded upstream responses for mapper tests
```

| Subpath | Contents | Who imports it |
| --- | --- | --- |
| `@knoww/services` | Removed at M5 (2026-09-05). The package has no root export; every import names a subpath. | Nothing. |
| `@knoww/services/core` | Canonical types, adapter interfaces, errors, id helpers, flag types. | apps/web, MCP, extension later. |
| `@knoww/services/registry` | `getMarketDataAdapter`, `getTradingAdapter`, `getEnabledPlatforms`, `getPlatformAdapter`. | apps/web route handlers and server modules. |
| `@knoww/services/platforms/polymarket` | The concrete adapter type, its extra methods and the Polymarket upstream errors. | Only the escape-hatch folders, see below. |
| `@knoww/services/platforms/kalshi` | Same, from M2. | Same. |

Everything Polymarket-specific moves behind the platform folder. The generic contract carries only what the shared read paths need.

`@knoww/shared-types` keeps its 17 subpath exports and its Polymarket runtime code through M4. apps/web may keep importing it anywhere. Shrinking it is a follow-up.

## Canonical model

The base is the accepted contract in `docs/single-api-layer.md`, sections "Canonical identifiers", "Canonical market model", "Price unit", "Status" and "Capabilities". `CanonicalMarket`, `CanonicalOutcome`, `MarketStatus`, `MarketCapabilities`, decimal-string prices from 0 to 1, and the `platformDetails` discriminated union all carry over unchanged. The changes and additions are below.

### Identifiers

Canonical ids are `platform:sourceId`.

| Entity | Polymarket | Kalshi |
| --- | --- | --- |
| Event | `polymarket:{gammaEventId}` (numeric Gamma id) | `kalshi:{EVENT_TICKER}` |
| Market | `polymarket:{conditionId}` | `kalshi:{MARKET_TICKER}` |

Kalshi tickers are stored uppercase and verbatim, because the API is case-sensitive. A single-market Kalshi event reuses the event ticker as the market ticker. That is harmless, since events and markets never share a lookup.

Slugs are separate from ids. Each canonical event carries a `slug` used only for URLs. The market-data adapter exposes `getEventBySlug`. Kalshi slugs are the lowercased ticker and the adapter uppercases before calling the API.

### Events

The web app is event-centric, so the contract adds `CanonicalEvent`: id, platform, sourceEventId, slug, title, description, status, markets, tags, image, volume, 24-hour volume in USD, liquidity, start and end times, capabilities, platformDetails and fetchedAt. Feeds rank by the 24-hour USD volume.

### Tags

Hybrid. The Knoww taxonomy is the cross-platform layer and each adapter maps its native categories onto it. An unknown slug passes through to each adapter's native lookup, so long-tail Polymarket tag pages keep working. Unmapped Kalshi categories land in "other".

### Widening rule

The canonical model widens as the pages demand it. Each field added for a Polymarket page carries a one-line note in the core types saying what Kalshi supplies for it, or that it is null. When M2 arrives every such field must have a Kalshi value or a documented null.

### No merging

Markets are never merged across platforms, only sorted. The "No cross-platform merging" section of the prior design applies as written.

### Streams stay out

The contract is request and response only in M1. Every WebSocket use, including the CLOB market socket and the sports score socket, stays Polymarket-specific behind the escape hatch. A stream capability is designed at M2 once Kalshi's socket rules are checked.

## Adapters and the registry

### Market-data adapter

The `MarketDataAdapter` interface from the prior design, extended with `getEventBySlug` and `listTags`. Methods: `searchMarkets`, `listEvents` (tag, sort, cursor and live filters), `getEvent`, `getEventBySlug`, `getMarket`, `getOrderbook`, `getPriceHistory`, `getMarketTrades`, `listTags`. Each method returns canonical types and throws a typed `PlatformError` with the platform id, the operation and the upstream status.

### Trading adapter (M3)

The `TradingAdapter` interface from the prior design: `connectionStatus`, `getAccountPositions`, `getAccountActivity`, `getAccountOrders`, `previewOrder`, `placeOrder`, `cancelOrder`. `previewOrder` returns a quote that includes a fee estimate. Platform specifics such as neg-risk and approvals travel in `platformDetails` on the quote and render through an optional slot component looked up in the web app's platform UI map.

The CLOB hooks move behind the trading adapter. `TradingForm` takes a canonical market, a canonical outcome and an adapter-provided quote at both of its mounts. M4 then only adds a hand-off panel that renders when the platform capability says hand-off only.

Positions and portfolio stay outside the abstraction until a second trading platform exists.

### Registry

The registry owns provider base URLs. Request input never carries them. It exposes:

| Function | Purpose |
| --- | --- |
| `getEnabledPlatforms()` | Platforms enabled by the environment, in display order. |
| `getMarketDataAdapter(platform)` | The generic adapter, or a disabled-platform error. |
| `getTradingAdapter(platform)` | Same for trading. Null when the platform is discovery-only. |
| `getPlatformAdapter("polymarket")` | The typed escape hatch. Returns the concrete adapter with its extra methods. |
| `parseCanonicalId(id)` | Splits `platform:sourceId` and validates the platform. |

### Caching by injection

Each adapter takes a fetch implementation at construction and per-call cache hints. `ServiceFetchOptions` grows a `cache` field with revalidate seconds and tags. The web app injects a fetch that maps those hints onto Next's revalidate and tags. MCP injects a plain fetch. `@knoww/services` never imports Next or React.

### Enablement flags

Two server-side inputs, read once at startup:

| Variable | Meaning | Default when unset |
| --- | --- | --- |
| `KNOWW_ENABLED_PLATFORMS` | Comma list of enabled platform ids. | `polymarket` |
| `KNOWW_PLATFORM_CAPABILITY_OVERRIDES` | Comma list of `platform.capability=off` entries so discovery can ship while trading stays off. | none |

The MCP Worker reads neither variable. `apps/mcp/src/platforms.ts` declares `ENABLED_PLATFORMS` as a constant (owner decision, 2026-09-05): one deploy ships one platform set, and the registry treats an explicit list as authoritative over process.env. The web app keeps the variables.

Trading also carries a per-region capability, evaluated server-side from the request's country. Flags are evaluated on the server and reach the client through a provider. This is the web app's first feature-flag helper.

## Boundary rules

Biome's restricted-imports rule enforces these, scoped with per-folder overrides, with a file-scan test as the backstop in the style of `apps/web/src/lib/chain-import-boundaries.test.mjs`.

| Rule | Where it applies | From |
| --- | --- | --- |
| Only `src/registry.ts` imports `./platforms/*`. | `packages/knoww-services` | M1 |
| No `@knoww/services/platforms/*` import outside the escape-hatch folders. | apps/web | M1 |
| No `@polymarket/*`, Gamma, CLOB or Data API type import outside the platform folder and the escape-hatch folders. | `packages/knoww-services` in M1, apps/web from M3 when the trading hooks move. | M1, M3 |
| No `next` or `react` import. | `packages/knoww-services` | M1 |
| Legacy `src/markets/*` and `src/profiles/*` reach Polymarket only through the registry. Moot since M5 deleted them. | `packages/knoww-services` | M1 |

### Escape hatch

`getPlatformAdapter("polymarket")` is allowed in exactly two places in apps/web: the `src/polymarket/` folder and API routes under `src/app/api/polymarket/`. This is how the leaderboard, whales, trader profiles, insider resolutions, comments, the sitemap keyset walk, CLOB price history and every WebSocket reach Polymarket code. Nothing else may name a platform. In the MCP Worker the only escape hatch is `apps/mcp/src/platforms.ts`, whose `requirePolymarketClient` hands the Polymarket-only tools their client and answers `PLATFORM_DISABLED` for anything else.

## Web app

### Read paths

Search, list by tag, event detail and detail-page prices go canonical in M1. Both of today's Polymarket read paths, `src/lib/server-cache.ts` and the search route, move behind the adapter. Tag pages are keyed by the taxonomy and answered by the registry, with pass-through for unknown slugs. The sports live event list goes through the adapter.

### URLs

Polymarket URLs are unchanged, byte for byte, with no redirects and no prefix. Those pages are indexed and the closed-market noindex policy depends on them.

Kalshi pages live at `/kalshi/events/{event-ticker}` and `/kalshi/markets/{ticker}`, lowercase. A thin route per platform renders the same generic detail component. A Kalshi market URL redirects to its event page, mirroring Polymarket. A `kalshi-markets` sitemap segment enumerates active events through the v2 cursor. Closed markets stay noindex and out of the sitemap on every platform.

### API routes

Polymarket-only handlers move under `/api/polymarket/`. Of the 15 routes the extension calls, seven move: markets by token, user positions, user trades, user details, the relayer proxy, token prices and the trader X profile. Search, events by identifier and markets by slug stay where they are and go canonical. The AI, extension session and analytics routes are not platform routes. The M1 route inventory confirms the list.

The move is a pure cutover. Old paths are deleted when the handlers move, and the extension's call sites and its hardcoded fallback change in the same branch. There is no deprecation window, because nothing ships to production until the whole restructure passes its bars. Read routes move in M1 and trading routes such as the relayer proxy move in M3.

### Feed and badges (M2)

One interleaved feed with a text-only platform badge on each card and an All, Polymarket, Kalshi chip filter, ranked by canonical 24-hour USD volume. None of this is visible until a second platform is enabled.

### Identity

Per-platform connections, no Knoww account. The identity type is a discriminated union from day one: wallet-backed and broker-backed, with only the wallet kind implemented. The wallet identity carries the Polymarket account type, because the CLOB signature type depends on it. The Deposit Wallet is the current default on Polymarket and the Safe path is legacy.

> Contradicts the "Identity and authorization" section of docs/single-api-layer.md (shared Privy application, Session Keys, trading grants). Not worth reopening now: that design served an MCP-first consumer order, and the owner moved the work to the web app with per-platform connections. The M5 tool layer landed on 2026-09-06 with identity still in the tool input (`apps/mcp/src/trading-identity.ts` is the seam); how a caller is bound to a wallet or broker account stays open, deferred by the owner.

## Kalshi

These are settled. Status mapping, taxonomy mapping, stream relay, fee display and the rest get their own grilling round after the Polymarket migration lands.

| Topic | Decision |
| --- | --- |
| Discovery source | The undocumented v1 search behind the adapter, with browse by category through v2 series and events as an automatic fallback. Fixture tests for the normalizer and one live contract test that flags the day v1 changes. |
| Read path | Every Kalshi call goes through the adapter on the Cloudflare Worker. The browser talks only to Knoww's own routes. |
| Read strategy | Unauthenticated reads only. At most four requests in flight, exponential backoff on 429, cache floors honored: 15 seconds on v2, 900 seconds on v1 search. No read-only API key. |
| Caching and indexing | Same as Polymarket: R2 incremental cache, ISR, indexed from day one. |
| Trading | Hand-off only. Cards and detail pages link to `https://kalshi.com/markets_by_ticker/{MARKET_TICKER}`. An event-level hand-off uses the event's lead market, highest 24-hour volume with API order as the tiebreak. Discovery-only platforms show a fee note on the hand-off card. |
| Hand-off tracking | A Knoww-side outbound click event with platform, canonical id and page. No UTM parameters. |
| Brand | Text-only "Kalshi" in the badge and chip filter, no logo. |
| Authorization | No email to Kalshi. Built behind the platform flag, go-live is the owner's call. The Developer Agreement and Data Terms concerns from the hand-off report are recorded, not acted on. |
| Extension reuse | The extension's Kalshi normalizers, keyword map and URL builder are copied into the services adapter at M2. The extension keeps its copy until its own migration. |

## Milestones and bars

| Order | Milestone | Contents | Done when |
| --- | --- | --- | --- |
| 1 | M1 | Canonical contract, registry, Polymarket market-data adapter, migration of the web app's shared read paths, read-route move under `/api/polymarket/` with the extension call sites updated, legacy modules as thin wrappers, boundary lint, web CI workflow, golden-response harness. Zero visible change. | Existing vitest and Playwright suites green. Fixture tests for the mappers. SSR curl checks on event and category pages. The golden-response harness shows no diff on a fixed set of routes and pages. |
| 2 | M3 | Trading abstraction with Polymarket behind it. Canonical order model, trading adapter, canonical `TradingForm` props at every mount (three today: event detail, sports live, sportsbook), identity union, region flag, trading-route move. | Unit tests as today plus a golden harness that covers every trading operation: EIP-712 signed order payloads, L2 auth headers with a fixed timestamp and a test secret, on-chain calldata for approvals, deposits and redeems, and relayer submit payloads. It runs with a throwaway key and fixed salt, nonce and timestamp, and the output must be byte-identical before and after the migration. Fixtures cover the signature type of each Polymarket account type, and recorded CLOB responses exercise the response-handling paths. No trade is placed with real funds at any point. The first live trade after the merge is the first end-to-end proof, which the owner accepts. |
| Gate | | No Kalshi code starts until M1 and M3 are complete and pass their bars. | |
| 3 | M2 | Kalshi market-data adapter and discovery surfaces: feed, badges, chip filter, tag mapping, Kalshi pages, sitemap segment. | Decided in the Kalshi grilling round. |
| 4 | M4 | Kalshi hand-off and fee display. Trading on Kalshi waits for a signed route. | Same round. |
| 5 | M5 | MCP tools move to the canonical API and the legacy wrappers are deleted. Can move earlier if MCP work resumes. Landed for Polymarket on 2026-09-05: canonical ids on every market and event, an optional `platform` input on the eight cross-platform tools, `list_platforms`, `polymarket_*` canonical names with the old names as permanent aliases, the root export and the wrappers deleted. The seven account and order tools landed on 2026-09-06 in `apps/mcp/src/tools/trading.ts`, registered only behind `EXPOSE_TRADING_TOOLS = false` and reserved scopes nothing grants. What remains is the wallet at the MCP level, deferred by the owner: caller identity, signer and credential binding, a durable draft store, the scope grant and the exposure flip. | The MCP suites under recorded fetch stubs, with the contract tests in `apps/mcp/src/tests/platforms.test.ts` covering the alias table, `list_platforms`, canonical ids and `PLATFORM_DISABLED`, and `apps/mcp/src/tests/trading-tools.test.ts` covering both gates and the seven trading tools on an in-process exposed server. |

The order M1, M3, M2, M4 is the owner's. Trading is abstracted while Polymarket is still the only implementation so the harness can catch drift before a second implementation exists.

### Golden-response harness

A record and replay shim around global fetch, installed by the server instrumentation hook only when `KNOWW_GOLDEN_MODE` is set and never in production builds. Record mode runs on the pre-migration code: it stores every upstream response as a fixture and every response from a fixed list of routes and pages as a golden file, with volatile fields such as timestamps and cache headers normalized. Replay mode runs on the migrated code, serves the fixtures instead of the network, and diffs the same routes and pages against the golden files. The M3 harness is a vitest suite over the trading code paths with the same fixed inputs and snapshot outputs, recorded on the pre-migration code.

## Process

| Topic | Decision |
| --- | --- |
| Docs first | This record and `packages/knoww-services/CONTEXT.md` land before M1 code. |
| PR shape | Small PRs per surface: services core first, then pages, routes and hooks. |
| Branches | PRs target `agg-restructuring`. One merge PR to main follows the M1 and M3 bars. Main is what the manual deploy ships, so it stays untouched until then. |
| CI | A web workflow added in the first M1 PR runs typecheck, lint, vitest and the golden harness on PRs to the integration branch. |
| Commits | The owner commits. Changes are left uncommitted for review. |
| Extension release | One extension version carries the route move. At the eventual production deploy the extension release goes out together with the web deploy, since the old paths will be gone. |

## Supersedes

The following sections of `docs/single-api-layer.md` no longer apply to the web restructure. The rest of that document stands.

| Section | Status |
| --- | --- |
| "System architecture" and the MCP-first consumer order in "Decision summary" | Superseded. The web app is the first consumer. MCP moved at M5. |
| "Repository structure" | Superseded by the package layout above. |
| "Identity and authorization" (all subsections: Privy, web login, MCP trading grants, Session Keys, account read visibility, MCP scopes) | Superseded for the web restructure. Identity is per-platform connections with no Knoww account. Revisited in the M5 trading phase. |
| "Monetization" | Deferred, not part of the restructure. |
| "Data and credential storage" | Superseded. No delegated credentials are stored. |
| "Testing strategy" | Replaced by the milestone bars above. |
| "Delivery plan" (Phases 0 to 4) | Replaced by M1 to M5. |
| "Decisions settled on 2026-09-02" | Items on identity, delegated trading and monetization are superseded. Items on platform scope, the canonical model and no merging remain. |
| "Open items" | Items on delegation and Privy are deferred with the identity work. |

Reused as written: "Goals", "Non-goals", "Platform support and constraints", "Public MCP contract" (resumes at M5), "Canonical identifiers" with the id change above, "Canonical market model", "Price unit", "Status", "Capabilities", "No cross-platform merging", "Adapter contracts" as extended above, "Aggregation, search, and pagination", "Order execution contract" as the base for the M3 order model, "Security requirements", "Chain and platform filtering", "Reliability and observability".

## Deferred

- Limitless, Opinion and every other platform. Kalshi is the proof that the contract works for a second platform.
- The agent app and its D1 tables. It gets its own migration when it gets Kalshi.
- Delegated credentials, a Knoww login and the unified Knoww account.
- The MCP account and order tools, the open half of M5.
- The extension's own move onto `@knoww/services`.
- Shrinking `@knoww/shared-types`.
- A stream contract, the portfolio abstraction and the Kalshi on-chain route.

## Sources

- Design record from the grilling session of 2026-09-03: https://claude.ai/code/artifact/b917999c-2722-4aad-a5da-05294074e1ca
- Kalshi hand-off route report: https://claude.ai/code/artifact/9425f06c-cad5-423e-ac41-2625388261ea
- Unified Knoww account report: https://claude.ai/code/artifact/ae233cc1-9e1c-4b66-b1a0-869b4fb32e3a
- `docs/single-api-layer.md`, the prior accepted design.
- `docs/decisions/2026-08-31-mcp-trading-authorization.md`, the MCP trading authorization decision, untouched by the M5 read-tool move and reopened with the trading phase.
- `CONTEXT-MAP.md` and `docs/agents/domain.md` for the context and ADR conventions.
- Kalshi API: `GET /trade-api/v2/events/{event_ticker}` is case-sensitive, verified 2026-09-02.
