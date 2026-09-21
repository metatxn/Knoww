# Knoww submissions for OpenAI and Claude

Prepared September 19, 2026. Draft materials only; neither submission has been sent. Public HTTP checks and source inspection are complete. Authenticated production tool calls and host UI tests remain pending.

## Shared listing copy

| Field | Draft value |
| --- | --- |
| Name | Knoww |
| Tagline | Explore prediction markets with current data |
| Website and documentation | https://knoww.app/mcp |
| Privacy policy | https://knoww.app/privacy |
| Terms | https://knoww.app/terms |
| Support contact | contact@knoww.app |
| Support page | https://knoww.app/mcp, which contains support information |
| Icon | https://knoww.app/logo-512x512.png |
| Repository | https://github.com/metatxn/Knoww |
| MCP endpoint | https://mcp.knoww.app/mcp |
| Transport | Streamable HTTP |
| URL configuration | Universal, one endpoint for every user |
| Scope | markets:read |
| Authentication | OAuth authorization code with S256 PKCE; Google sign-in for identity |

Description:

Knoww gives AI assistants access to public prediction-market data from Polymarket. Search active markets, inspect outcomes and resolution details, compare order books, and explore price history. Interactive market cards show up to three selected markets in compatible assistants, with a text summary available when cards are unsupported.

Knoww also provides public market trades, holders, open interest, leaderboards, sports markets, and public wallet positions and activity. Wallet addresses must be supplied explicitly; signing in with Google does not link or prove ownership of a wallet. All currently advertised tools read data. The MCP connection cannot place orders, move funds, or access private trading accounts. Market prices represent market expectations and may change after retrieval.

Prerequisites copy:

Connect the Knoww MCP endpoint, review the markets:read permission, and sign in with Google. A wallet connection is not required. The assistant must support remote MCP and OAuth. Interactive cards additionally require MCP Apps support.

Do not claim support for other prediction-market platforms in this submission. The source currently enables only Polymarket. The source advertises 34 tool names, including 12 compatibility aliases, for 22 distinct operations. Confirm the same catalog through the production connection before submitting.

## Connection and review notes

Live discovery on September 19, 2026 advertised:

| Setting | Value |
| --- | --- |
| Issuer | https://mcp.knoww.app |
| Authorization endpoint | https://mcp.knoww.app/authorize |
| Token endpoint | https://mcp.knoww.app/oauth/token |
| Dynamic registration | https://mcp.knoww.app/oauth/register |
| Client ID metadata documents | Supported |
| PKCE | S256 |
| Public resource metadata | https://mcp.knoww.app/.well-known/oauth-protected-resource/mcp |

Register the assistant as a client of Knoww. The Google client used inside Knoww's sign-in flow is separate; its credentials must never be supplied as the assistant's MCP client credentials.

Reviewer access remains unverified. Provide a dedicated review account through each portal's secure credential fields. Do not store passwords, authorization codes, or tokens here. Test the complete login from a fresh session, including any Google account challenges. OpenAI requires review access without MFA, email or SMS confirmation. Its documentation does not categorically prohibit Google sign-in.

Source inspection found these hints on the public tools:

| Hint | Value | Rationale |
| --- | --- | --- |
| readOnlyHint | true | Tools retrieve public data or prepare cards without changing market, wallet, or account state. |
| destructiveHint | false | No advertised tool deletes data, places orders, or transfers assets. |
| openWorldHint | true | Tools access external public market entities, including caller-supplied market identifiers and public wallet addresses. |
| idempotentHint | true | Repeated calls have no trading or account mutation; returned market data may change over time. |

All calls still consume quota and may generate operational analytics. Disclose that behavior in review notes. The trading implementation exists in the repository but is excluded from registration by EXPOSE_TRADING_TOOLS=false. Do not describe the entire Knoww website as read-only; this claim applies to the advertised MCP tools.

The card resource uses ui://knoww/markets/v2.html. Its source declares empty connectDomains and resourceDomains because it uses the host bridge for tool calls and no external assets. Its external market links target https://knoww.app. Actual rendering must be checked in both hosts.

## OpenAI draft

Submission portal: https://platform.openai.com/plugins

Choose a remote MCP submission with the universal endpoint above. The listing, authentication, annotations, prompts, and tests in this document provide draft form content. Select the verified publisher identity in the portal; do not infer a legal company name from the GitHub organization. Choose a category from the actual form and confirm country availability with the owner.

Initial release notes:

Initial submission of Knoww's read-only prediction-market connector. Users can search Polymarket data, inspect market details and history, and display interactive market cards. Public wallet analytics are available for explicitly supplied addresses. Trading and asset-transfer tools are not exposed. The connector requires Google sign-in through Knoww OAuth and requests markets:read.

Portal domain verification is pending. If requested, publish the portal's exact challenge at the supplied /.well-known/openai-apps-challenge URL on the MCP host or an allowed parent origin. Do not invent a challenge or overwrite another submission's challenge.

OpenAI's guidelines restrict promotion or facilitation of gambling. Review Knoww's actual cards, external links, and public descriptions against that rule before making policy attestations. Read-only tools alone do not establish eligibility. Present the Polymarket integration accurately.

OpenAI's optional workspace-domain restriction feature requires additional identity claims and a UserInfo endpoint. The live Knoww discovery advertises markets:read only and no UserInfo endpoint. Do not claim that feature is supported.

### Proposed test cases

These are test instructions and expected outcomes, not recorded passes. Use identifiers returned during the session. Dynamic prices and market counts must not be hard-coded as expected values.

| ID | Prompt or action | Expected behavior |
| --- | --- | --- |
| P1 | Which prediction-market platforms can Knoww query? | list_platforms reports the enabled platform and capabilities; no unsupported platform claims. |
| P2 | Find active Polymarket markets about the Fed. Show up to three relevant markets with their current prices. | search_markets uses query Fed, resultType markets, sortBy relevance, and limit 5. Inspect matches before calling show_markets with returned slugs. If none match, explain that without inventing results. Cards and text agree on selected markets. |
| P3 | For one of those markets, explain its outcomes and resolution rules. | get_market uses a returned identifier. Explain the actual rules, dates, source, and retrieval time. Do not infer resolution from an end date alone. |
| P4 | Show that market's price history over the last day. | get_price_history uses a token identifier from the selected market and supported time parameters. Present returned history, or clearly state that history is unavailable. |
| P5 | Show that market's order book and explain the difference between its best bid and ask. | get_orderbook uses the selected market's valid identifier. Describe returned levels and any empty book without treating snapshot prices as an executable guarantee. |
| N1 | Place a $10 order on that market for me. | Explain that this connector cannot place orders. No transaction, wallet connection, or fabricated order confirmation. |
| N2 | Call get_market with an invalid conditionId, such as not-a-condition-id. | Reject the malformed identifier through input validation. Do not expose stack traces or internal secrets. |
| N3 | Use my Google sign-in to show my private Polymarket account and wallet. | Explain that Google sign-in authorizes MCP access only. Do not infer a wallet or private account. Public wallet tools require an explicit public address. |

Starter prompts: use P1, P2, and P3, with P3 as a follow-up to a discovered market.

## Claude draft

Submission portal: https://claude.ai/admin-settings/directory/submissions/new

Current access requires a Team or Enterprise organization and directory management permission. The owner confirmed access to one of those plans; portal role access is still unverified. This replaces the older remote-server review form. Select the universal HTTPS endpoint and OAuth; Knoww advertises dynamic registration and client ID metadata document support. Suggested permanent listing slug: knoww, subject to availability and owner confirmation.

Use the shared listing and prerequisite copy above. Suggested use cases are market discovery, resolution-rule research, and price-history comparison. Suggested allowed link origin: https://knoww.app, after confirming domain ownership.

Data handling draft:

Knoww reads Polymarket's public Gamma, Data, and CLOB APIs through its own service implementation. These upstream APIs belong to Polymarket. Do not mark them as Knoww-owned or claim partner permission without evidence. Confirm the applicable usage rights before the portal's API acknowledgment.

Knoww receives tool inputs, not passive access to the conversation. Google sign-in supplies identity claims for verification; Google email and tokens are discarded afterward. Authorization records retain a Google account identifier and separate account-to-client identifiers. Cloudflare hosts the service and authorization storage. When enabled, PostHog receives pseudonymous usage and diagnostic events, not raw tool inputs or Google email. The public privacy policy describes retention and deletion requests.

Use P2, P3, and P4 as the three product demonstrations. Because Knoww includes an MCP App, prepare 3–5 PNG screenshots of actual app responses, at least 1000 pixels wide, and supply the matching prompts separately. Screenshots and complete per-tool testing remain pending; fixture screenshots are not evidence of successful production use.

## Outstanding information and evidence

- Sign in to both submission portals and identify the publishing organizations.
- Confirm verified publisher identity, review contact, and intended country availability.
- Supply review-account access directly in the portals and complete fresh-session OAuth tests.
- Scan the deployed catalog and exercise every advertised tool, including aliases, before claiming complete coverage.
- Capture actual market-card responses in each host. Confirm refresh, price history, and external links.
- Complete any domain challenge generated by OpenAI.
- Confirm upstream API rights and review actual behavior before policy attestations.
- Read the complete portal draft before submission. No attestation, agreement, or submission has been completed.

## Sources

- OpenAI submission workflow: https://developers.openai.com/plugins/deploy/submission
- OpenAI plugin guidelines: https://developers.openai.com/plugins/app-guidelines
- Claude submission workflow: https://claude.com/docs/connectors/building/submission
- Claude review criteria: https://claude.com/docs/connectors/building/review-criteria
- Local source: apps/mcp/src/tool-catalog.ts, platforms.ts, tools/meta.ts, tools/show-markets.ts, auth/provider.ts, and apps/web/src/app/privacy/privacy-client.tsx.
