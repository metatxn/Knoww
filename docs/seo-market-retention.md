# Historical market indexing

The September 12, 2026 SEO audit found useful results pages serving `noindex`
because their trading volume was below $10,000. The MrBeast subscriber market
had about $8,160 in volume and appeared in Search Console's noindex exclusions.
The Microsoft weekly-price market had about $6,840 in volume and served
`noindex` even though Google's older August 7 copy was still indexed.

Historical page eligibility now depends on content, not trading volume.
Closed or ended events need a title, slug, market record, and useful context.
The existing context rule accepts a description of at least 80 cleaned
characters, or a fully resolved event with a renderable outcome price. Archived
events and historical pages without that context remain excluded. Settlement
rules still distinguish pending or disputed trading from a verified result.
Page metadata and sitemap filtering use the same eligibility function.

The historical sitemap combines up to 500 events ordered by total volume with
up to 500 ordered by closure time, then filters and deduplicates them. This gives
smaller recent results a discovery path without fetching the entire historical
catalog. These limits count source events, so the final sitemap can contain
fewer than 1,000 URLs. Membership in this bounded sitemap is separate from page
eligibility; a useful page can remain indexable after leaving the recent set.
Both affected sitemap data-cache keys change with this policy.

The closure-time query uses the documented `order` and `after_cursor` parameters
of the [Polymarket events keyset API](https://docs.polymarket.com/api-reference/events/list-events-keyset-pagination).
A read-only request with `closed=true&order=closedTime&ascending=false` returned
HTTP 200 and recent closed events during implementation.

## Verification after deployment

1. Check the HTML robots metadata on these public pages. Expect `index, follow`
   while their current title, archive status, market data, and context remain
   eligible:
   - `/events/detail/will-mrbeast-hit-million-subscribers-by-august-31-20260730200401395`
   - `/events/detail/msft-week-august-7-2026`
2. Check `/sitemaps/markets.xml` and `/sitemaps/evergreen-markets.xml` for successful
   XML responses. Sample recent historical entries and verify their canonical
   URLs and indexable metadata. The bounded recent set does not guarantee that
   either older example above appears in the sitemap.
3. Use Search Console's live URL test on the corrected examples before
   requesting indexing for those URLs. An old indexed copy is not evidence
   that the new deployment has been crawled.
4. Reinspect the reported soft 404 examples, including
   `/events/detail/highest-temperature-in-taipei-on-august-15-2026`. That page
   already returned HTTP 200, indexable metadata, a result, and resolution rules
   during the audit. Compare Google's crawled copy with the live rendered page
   before changing its renderer.
5. Compare affected pages' indexing, impressions, and clicks after recrawling.
   Keep intentional exclusions separate; zero noindex exclusions is not the
   target.

The audit also found discovered-but-not-indexed pages and low click-through.
This change addresses the volume-based exclusions and recent-result discovery.
It does not establish a single cause for the August traffic drop or resolve
Google's historical soft 404 classifications. Topic-specific editorial content
and query-level title improvements need separate measurement.

Regression tests reproduced both the volume exclusion and missing recent
sitemap entries before the fixes. Verification passed 94 related Vitest tests,
four static SEO checks, the web TypeScript check, and lint on the changed code.
