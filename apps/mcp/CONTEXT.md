# MCP context

`@knoww/mcp` is the Cloudflare Worker that exposes Knoww's prediction-market data to MCP hosts over stateless Streamable HTTP. It reaches every platform through the registry in `@knoww/services` and never imports a platform folder itself.

Decision records: `docs/decisions/2026-08-31-mcp-google-oidc.md` (Google OpenID Connect for grants), `docs/decisions/2026-08-31-mcp-trading-authorization.md` (proposed trading authorization, partly superseded, see its 2026-09-06 note), `docs/decisions/2026-09-03-aggregator-platform-adapters.md` (the aggregator restructuring, milestone M5 is this context). Prior design for the tool contract: `docs/single-api-layer.md`. Operational detail lives in `README.md` next to this file.

## Owns

- The tool catalog in `src/tool-catalog.ts`: the advertised names, the `polymarket_*` alias table, the trading tool names and the exposure gate.
- Tool registration in `src/server.ts` and the tool modules under `src/tools/`, including the input and output schemas each tool publishes. Output schemas are MCP-local zod mirrors of the canonical types, never the services schemas themselves, because the workspace carries more than one zod major.
- The OAuth provider, Google OpenID Connect consent flow, scopes, principals, plans and quotas under `src/auth/`, `src/context.ts` and `src/quota.ts`.
- The tool error model in `src/errors/tool-error.ts` and the mapping from a services `PlatformError` to a tool error code.
- Which platforms this server enables: the `ENABLED_PLATFORMS` constant in `src/platforms.ts`.
- The trading identity input in `src/trading-identity.ts`.

## Does not own

- Platform adapters, canonical types, canonical ids and the order model. Those are `@knoww/services`; read `packages/knoww-services/CONTEXT.md` for that vocabulary and reuse it here.
- Wallet connection, signing and API credentials. The registry builds the trading adapter for this server without a signer or credentials; binding a caller to a wallet is open, deferred by the owner.
- The knoww.app pages and routes in `apps/web`, which the MCP does not call.

## Glossary

Use these terms in code, tests, issues and docs. The "not" column lists synonyms to avoid.

| Term | Meaning | Not |
| --- | --- | --- |
| Tool | One MCP tool registered on the server, named in `src/tool-catalog.ts`. Every tool returns a short text result plus typed `structuredContent` with a `meta` block. | endpoint, command, function |
| Public tool | One of the 33 advertised names in `PUBLIC_MCP_TOOL_NAMES`: the eight cross-platform tools, `list_platforms`, the twelve `polymarket_*` tools and their twelve aliases. All are read-only and need `markets:read`. | read tool, market tool |
| Cross-platform tool | A public tool that takes an optional `platform` input defaulting to `polymarket`: `search_markets`, `get_market`, `get_event`, `get_orderbook`, `get_price_history`, `list_events`, `get_market_trades`, `list_tags`. | generic tool, shared tool |
| Canonical name and alias | A Polymarket-only tool has a `polymarket_*` canonical name and keeps its original name as a permanent alias; both are advertised and registered together by `registerWithLegacyAlias`. | legacy name, deprecated name (aliases are not deprecated) |
| Trading tool | One of the seven names in `TRADING_TOOL_NAMES`, one per `TradingAdapter` method: `get_trading_connection`, `get_account_positions`, `get_account_activity`, `get_account_orders`, `preview_order`, `place_order`, `cancel_order`. `platform` is required, no default. | account tool, order tool (use "trading tool" for the set) |
| Exposure gate | The `EXPOSE_TRADING_TOOLS` constant, `false` today. `createKnowwMcpServer({ exposeTradingTools: true })` registers the trading tools for tests. A constant, not an environment variable, by owner decision. | feature flag, env flag |
| Platform | A venue from `@knoww/services`, identified by a `PlatformId`. This server enables the ids in `ENABLED_PLATFORMS`; any other id answers `PLATFORM_DISABLED`. | provider, exchange, source |
| Principal | The verified caller of a request, `RequestPrincipal` in `src/context.ts`: an auth method (`google-oidc` or `dev-bypass`), a stable id, a plan and the scopes the grant carries. | user, account, subject (the Google subject is one input to the id, not the principal) |
| Dev bypass | The local-development principal used when the Worker runs without OAuth. It carries only active scopes, so it can never reach a trading tool. | test mode, admin mode |
| Grant | The OAuth authorization a Google-authenticated person gives one MCP client for a scope set, issued by the provider in `src/auth/`. A grant never proves control of a wallet. | login, session, token (the token is what a grant issues) |
| Scope | An OAuth scope string on a grant. Active: `markets:read`. Reserved: `x402:pay` and the four trading scopes `account:read`, `orders:read`, `orders:create`, `orders:cancel`. `resolveRequestedScopes` rejects a reserved scope as `invalid_scope`, and `requireToolScope` fails closed with `FORBIDDEN` at execution time. | permission, role, capability (capability is a services term for what a platform supports) |
| Plan | The quota tier attached to a principal, `McpPlan` in `src/auth/scopes.ts`. Only the free plan exists. | tier, subscription |
| Quota | The edge, plan, principal and per-tool rate limits in `src/quota.ts`, enforced before dispatch and again inside each tool through `requireToolQuota`. A refusal is `RATE_LIMITED`. | throttle, budget |
| Tool error | A plain `Error` tagged with a `KnowwToolErrorCode` (`VALIDATION_ERROR`, `UNAUTHENTICATED`, `FORBIDDEN`, `NOT_FOUND`, `RATE_LIMITED`, `CONFLICT`, `UPSTREAM_TIMEOUT`, `UPSTREAM_UNAVAILABLE`, `INTERNAL_ERROR`, `PLATFORM_DISABLED`), built by `knowwToolError` and recognised by `isKnowwToolError`. Messages are fixed per code so no upstream text leaks. | exception, error class (there are no classes here) |
| Cursor | The opaque pagination token every collection-returning tool issues. A cursor from a cross-platform tool carries the platform it was issued for and cannot be replayed against another. | offset, page token |
| Identity input | The `identity` argument on six trading tools, `{ kind: "wallet", address, accountType, tradingAddress? }` or `{ kind: "broker", accountId }`, resolved to a services identity by `resolveTradingIdentity`. `src/trading-identity.ts` is the one module that changes when identity moves from the input to the principal. | wallet (the wallet is one kind of identity), login |
| Draft | The short-lived result of `preview_order` that `place_order` executes by `draftId`. Held in the adapter's in-memory map on the isolate that served the preview, 30-second TTL, so a placement on another isolate reports `NOT_FOUND`. A durable draft store is part of the deferred wallet work. | quote, order (a draft is not yet an order) |
| Idempotency key | The caller-supplied key, 8 to 128 characters, on `place_order` and `cancel_order`. Repeating a call with the same key must not act twice. | request id (that is the server's correlation id in `meta`) |
| Session Key | A Polymarket-delegated signing key proposed in the 2026-08-31 trading-authorization record. Not implemented; use the term only when discussing that proposal. | API key (the CLOB API credential is a different thing) |
