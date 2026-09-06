# Golden responses

A regression net for the platform-adapter migration. It captures what the
pre-migration app serves for a fixed list of pages and API routes, then checks
that the migrated app serves the same bytes with every upstream call replayed
from disk.

## How it works

`KNOWW_GOLDEN_MODE` makes `src/instrumentation.ts` install the harness in the
Next server process. Nothing else reads that variable, and the deploy pipeline
never sets it.

- `record`: the process clock is pinned to the current time (stored in
  `clock.json`), and every upstream `fetch` is forwarded as-is and written to
  `fixtures/<sha256>.json`.
- `replay`: the clock is pinned to `clock.json`, and every `fetch` is served
  from `fixtures/`. A request with no fixture is passed through to the network
  and appended to `replay-misses.log`.

`scripts/golden.mts` then fetches each entry in `manifest.json`, normalizes the
body (sorted JSON keys, flight streaming split points, hashed asset paths,
webpack chunk ids, the build id, CSP nonces, millisecond ISO timestamps, the
visitor subdivision in the feature-flags payload) and writes or compares
`responses/<name>.<ext>`. Every mask covers something a rebuild or a different
build environment changes without any source change.

The runner sends `cf-ipcountry: JP` with every request. The app reads that
header ahead of the Cloudflare request context, and Japan has no entry in any
platform's region policy, so the region-policy result in the feature-flags
payload is the same on every machine. The subdivision has no header, so it
is masked instead: under `next start` the Cloudflare context carries the
recording machine's real region, and in CI there is none.

The runner also sends a user agent on Next's HTML-limited bot list
(`knoww-golden/1 (compatible; Chrome-Lighthouse)`). For those user agents Next
renders the whole page in one pass, so every Suspense boundary lands inline and
the page metadata stays in the head. For a browser user agent the same page
streams, and which boundaries make the first chunk depends on timing, so two
fetches of one page could differ in shape. The app has no user-agent branches
of its own.

## Recording

Always record and replay against a production build. Development HTML differs
from production HTML, so a golden recorded from `next dev` never matches.

```bash
pnpm --filter @knoww/web build
rm -rf apps/web/.next/cache/fetch-cache
KNOWW_GOLDEN_MODE=record pnpm --filter @knoww/web start -- -p 8000
```

The manifest's base URL is `http://localhost:8000`, and `next start` defaults
to port 3000, so pass the port. Clear the Next data cache first: it survives
restarts and answers revalidated fetches without calling `fetch`, so the
harness never sees those requests. A fresh CI build starts with no cache, and
clearing it keeps local runs equivalent.

In a second terminal:

```bash
pnpm --filter @knoww/web golden:record
```

Commit `clock.json`, `fixtures/` and `responses/`. When re-recording, delete
`fixtures/` first: the shim only adds fixtures, so a request key that no
longer occurs leaves an orphan behind.

## Replaying

`.github/workflows/web-ci.yml` runs this on every pull request: build, start
the server in replay mode, run the runner, and fail on any diff or replay
miss. Locally:

```bash
pnpm --filter @knoww/web build
rm -rf apps/web/.next/cache/fetch-cache
KNOWW_GOLDEN_MODE=replay pnpm --filter @knoww/web start -- -p 8000
```

```bash
pnpm --filter @knoww/web golden:replay
```

Exit code 1 means at least one entry differs or has no golden; the runner
prints the first differing line and writes expected/actual pairs to `diff/`.
Replay misses are printed as a warning: they mean the migrated code asked
upstream for something the recorded code never did.

`KNOWW_GOLDEN_BASE_URL` overrides the manifest's base URL. `KNOWW_GOLDEN_DIR`
points the server at another golden directory.
