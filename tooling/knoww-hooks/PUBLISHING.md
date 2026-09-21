# Publish the Knoww plugin

The release source is `plugins/knoww`. Keep this package versioned in the
repository. A personal marketplace is only a local testing source; it does not
publish the plugin to the OpenAI public directory.

## Build

From the repository root:

```sh
pnpm test:hooks
pnpm package:knoww-plugin
```

The build writes `dist/knoww-plugin/knoww-0.1.2.zip` and its SHA-256 checksum.
The version comes from `.codex-plugin/plugin.json`. Update it for a new
release. The ZIP uses the Codex compatibility layout and includes only five
explicitly named public files. It does not copy the repository or environment
files. Node.js 22+ is required to run the hook; Python 3 builds the ZIP.

### Hook discovery regression, 2026-09-20

The user's Codex CLI 0.155.1 showed zero installed hooks for version 0.1.0 even
though the plugin was enabled and its cached hook file existed. The app-server
`hooks/list` and `plugin/read` APIs reproduced this. Three portable manifest
variants returned no hooks, while both default and explicit legacy hook paths
returned `UserPromptSubmit`. Version 0.1.1 therefore omits the portable root
manifests and keeps the supported `.codex-plugin/plugin.json` layout. Tests that
only execute the handler cannot catch this host-discovery failure.

Extract the current release into a fresh directory or remove the old extraction's root
`plugin.json` and `mcp.json` before reinstalling. An unzip over the existing
directory leaves those obsolete files behind. Reinstall through Codex, then
start a fresh session and review `/hooks`. Do not edit the installed cache.

After reinstalling the corrected local package, a fresh app-server returned one
enabled `UserPromptSubmit` hook from `knoww@knoww-local`, with no warnings or
errors and trust status `untrusted`. This verifies discovery; the user must
still review the installed definition before it runs.

### Meeting retrieval fix, 0.1.2

The saved September 20 follow-up searched two pages of `Fed` and received five
October contracts followed by five annual cut-count contracts. Neither page
contained a December meeting contract. The revised hook uses `titleTerms` when
advertised, with at most three search calls including a query refinement and at
most one cursor continuation. Older servers use event summaries to avoid spending
the entire search budget on the first event's individual markets.

Ship the MCP `search_markets` update before testing the new filter against
production, then refresh the client's tool schema and reinstall the plugin.
The regression fixture places December contracts after ten unrelated records
and checks that filtering brings them onto the first page. It also checks
missing meetings, term validation and cursors. This is deterministic retrieval
evidence, not proof that the model will always follow the hook or render a card.

## Public submission

Use the [OpenAI plugin submission process](https://developers.openai.com/plugins/deploy/submission).
Choose **With MCP**, enter `https://mcp.knoww.app/mcp` as the universal endpoint,
and supply review materials directly. An existing ChatGPT integration ID is not
a substitute for the endpoint.

Before submitting, prepare the verified publisher identity, production logo,
support URL, privacy and terms URLs, country availability, authentication test
instructions, and five positive plus three negative test cases. Confirm that
the live privacy and terms pages cover this integration. Keep review credentials
in the portal, never in this package.

The packaging documentation supports bundled lifecycle hooks. The public
submission guide describes MCP and skills submissions but does not establish a
command-hook upload/review procedure. Confirm that route in the portal or with
OpenAI before claiming the public directory will distribute this hook. The ZIP
is a tested package artifact, not proof of submission acceptance. Do not upload
it as a skills bundle: this package contains no skills.

Installing a plugin on the web does not deploy its command scripts. The hook
needs a compatible execution host, Node.js, and the user's explicit trust.
Keep the MCP search and card experience useful when hooks are unavailable.
See [plugin packaging and hook support](https://developers.openai.com/plugins/build/plugins).

## Suggested review cases

Use active contracts at review time; do not promise a particular probability.

| Type | Prompt or sequence | Expected behavior |
| --- | --- | --- |
| Positive | Ask about a future Fed rate decision. | Search and verify the matching meeting and outcomes. |
| Positive | Follow with "What about the following meeting?" | Advance the event date and select matching contracts. |
| Positive | Switch to the ECB's next meeting. | Select ECB contracts, without reusing Fed results. |
| Positive | Explicitly request up to three related active markets. | Display only verified matches; fewer are valid. |
| Positive | Refresh a displayed market and inspect its chart. | Refresh the selected contract and retrieve history for its outcome. |
| Negative | "Explain how interest rates affect mortgages." | No unsolicited market lookup. |
| Negative | "Answer without prediction markets: could the Fed cut rates next time?" | Respect the opt-out. |
| Negative | "What about next month?" in a fresh conversation. | Clarify the event instead of inventing a match. |

## Current evidence

On 2026-09-19, the user supplied CLI screenshots showing relevant Fed retrieval,
the following-meeting transition, an ECB context switch, an educational answer
without Knoww calls, and an explicit opt-out without Knoww calls. The user also
reported that the flow worked in both CLI and client. These observations cover
the original project installation, not a public-directory installation or a
controlled comparison of matching accuracy.

The package tests separately check execution outside Git, paths containing
spaces, unchanged guidance through the old project entry point, and the bundled
MCP endpoint. Repeat authorization, hook trust, card rendering, disable and
uninstall checks in the final installed distribution. Do not disable the user's
existing working setup merely to test the archive.
