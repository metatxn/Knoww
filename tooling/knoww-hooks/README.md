# Knoww conversation hook prototype

## Scope

Add a local Codex `UserPromptSubmit` command hook that asks the existing assistant to resolve market intent from the current prompt and its conversation context. Reuse the connected Knoww MCP tools for search, verification and display. This prototype does not add hooks to ordinary ChatGPT plugin conversations.

The first version returns a fixed, bounded matching policy for every valid, nonempty prompt. The assistant performs the semantic relevance check. The script does not classify prompts, fetch markets, call another model, read transcripts, retain conversation state or echo user text into developer context. This preserves follow-ups such as “What about next month?” without a keyword gate discarding them.

This is an experiment in consistent tool routing. It does not establish improved matching accuracy or guarantee tool invocation or MCP App rendering.

## Implementation and acceptance criteria

- `user-prompt-submit.mjs`: Node.js 22+ command, no dependencies or build step. Consume one bounded JSON event on stdin and return the documented `hookSpecificOutput.additionalContext` shape.
- `hooks.example.json`: optional project configuration. Resolve the script from the Git root so subdirectory sessions work.
- `user-prompt-submit.test.mjs`: Node test runner checks the command contract, input limits, silent failure, prompt isolation and configured command from a subdirectory.
- No production MCP, extension or global Codex configuration changes. Keep OAuth, quotas, candidate ranking and card rendering in the existing MCP path.
- Wrong events, malformed data, empty prompts, oversized input and incomplete streams exit successfully without guidance. No prompt content or paths appear in logs.
- Use named constants, ES modules and JSON output. No console logging or monetary calculations.

Implementation order: define this contract, test the command boundary, implement the local handler, then validate the optional configuration. Live semantic evaluation follows separately after the user enables and trusts the hook in Codex.

## Local verification

From the repository root:

```sh
pnpm test:hooks
printf '%s' '{"hook_event_name":"UserPromptSubmit","prompt":"How likely is the Fed to cut rates at its next meeting?"}' | node tooling/knoww-hooks/user-prompt-submit.mjs
```

The second command previews the context instruction. It does not search for markets. The test command can also run directly with `node --test tooling/knoww-hooks/user-prompt-submit.test.mjs`.

## Enable for a Codex project

1. Connect Knoww MCP in the target Codex host and complete its existing OAuth flow. Installing it in ChatGPT does not establish a Codex connection.
2. Merge the `UserPromptSubmit` entry from `hooks.example.json` into this repository's `.codex/hooks.json`. Preserve any existing entries. Install it once; multiple hook sources all run.
3. Start a fresh Codex session in this repository. In the CLI, use `/hooks` to inspect and trust the exact hook definition. Changed definitions need another review. Do not bypass trust.
4. Submit a prompt and confirm the hook completed, then inspect whether the assistant used the connected Knoww tools appropriately.

To disable, disable this handler in `/hooks` or remove only its configuration entry. No deployment is required. The example is not automatically active, and this prototype does not edit your Codex configuration.

## Evaluate with and without the hook

Use separate fresh sessions with the same model, tools and prompts. Keep each follow-up in its own preceding conversation. Record expected and actual lookup decisions, entity/date matches, duplicate calls, latency, tool errors and whether a card actually rendered. Use current market data; an empty result is valid when no matching active market exists.

| Conversation | Expected behavior |
| --- | --- |
| “How likely is the Fed to cut rates at its next meeting?” | Resolve the next meeting, search and verify matching active contracts. |
| Discuss a specific Fed meeting, then “What about the following meeting?” | Advance the meeting date; do not reuse the earlier contract. |
| Discuss the ECB, then “Will they cut next month?” | Keep the ECB entity; do not switch to the Fed. |
| “What about next month?” with no earlier context | Clarify the event rather than inventing one. |
| “Explain how interest rates affect mortgages.” | Answer the educational question without an unsolicited market search. |
| “Write a unit test containing 'Will Bitcoin rise?'” | Treat the quote as coding data; no market lookup. |
| “Who won the 2020 US election?” | Answer the settled historical question; no active-market lookup. |
| “Do not show markets. Explain the Fed announcement.” | Respect the opt-out. |
| Ask for an explanation of a card already shown | Reuse the result unless a fresh lookup is necessary. |
| A likely future event with no closely matching contract | No unrelated card. |

Passing the automated tests proves the hook transport contract, not these semantic outcomes. Do not claim a matching improvement until the comparison above has been run. Card rendering also depends on the host; use a sourced text result if the host does not support MCP Apps.

### Retrieval check, 2026-09-19

The first live Codex test called Knoww but returned no matches for `Fed October 2026 rate decision` and `Fed October`. Direct tool calls reproduced both empty results. Searching `Fed` returned five markets on the first page, including the October 2026 cut contracts. The current `contains` filter requires a contiguous phrase; it does not independently match query words. The hook now recommends short entity queries, verification of dates in the results, one shorter-query fallback after an empty result, and at most one additional page. These tool calls verify retrieval behavior, not the assistant's adherence to the revised guidance. Repeat the conversational test after this change.

## Sources

The [official Codex hooks documentation](https://learn.chatgpt.com/docs/hooks) defines stdin events, `UserPromptSubmit` context output, trust and Git-root command resolution. The transcript format is not a stable hook interface, so this prototype leaves conversation interpretation to the assistant. Existing tool contracts are in `apps/mcp/src/tools/search-markets.ts` and `apps/mcp/src/tools/show-markets.ts`.
