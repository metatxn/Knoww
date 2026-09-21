# Knoww plugin

Search prediction markets and display Knoww market cards. The optional Codex
`UserPromptSubmit` hook helps the assistant select relevant markets from the
conversation, including follow-up questions. Market prices express expectations,
not guaranteed outcomes.

## Requirements

- A Codex host that supports plugin hooks, with Node.js 22 or newer on its PATH.
- An authorized connection to `https://mcp.knoww.app/mcp`.
- User review and trust of the bundled hook before it can run.

The MCP tools can work without the hook. Interactive cards require a host with
MCP Apps support; other hosts receive text and links. Installing a plugin in a
web client does not deploy its command scripts to a local execution environment.
This package has not yet been published to the OpenAI public directory.

## Install and enable

1. Install the Knoww package from the distribution source supplied by its
   publisher. A ZIP is a release artifact, not a `codex plugin add` argument.
   Local testers need a Codex marketplace entry pointing at the extracted folder.
2. Enable Knoww in your host and complete its MCP authorization flow.
3. In Codex CLI, open `/hooks`, inspect the Knoww `UserPromptSubmit` entry and
   trust its definition. Installation and OAuth do not grant hook trust.
4. If you used the earlier Polycaster project hook, disable that entry in
   `/hooks` before enabling this copy. Keep only one Knoww hook active. Also
   disable duplicate standalone Knoww MCP connections when using the bundled one.
5. Start a fresh conversation and ask, "How likely is the Fed to cut rates at
   its next meeting?" Inspect the search and selected event, then try an
   educational question and a request to avoid prediction markets.

## Data handling

The local handler receives the hook event, validates it, and emits a fixed policy.
It does not send network requests, read transcripts, store prompts or include
user text in its returned instructions. The assistant uses its existing context
to decide whether to call Knoww. Those calls send tool arguments to Knoww under
the connection's authorization. The hook policy asks for concise public search
queries and excludes private details.

## Updates and removal

Install the publisher's new version and start a new conversation. Review changed
hook definitions when Codex requests it. To stop context guidance, disable the
Knoww hook in `/hooks`; the MCP tools remain available. To remove the package,
uninstall it through the host's plugin management. Removing this plugin does not
remove a separately configured project hook or standalone MCP connection.

## Package layout

The package uses `.codex-plugin/plugin.json` and `.mcp.json`. Hooks live in
`hooks/hooks.json` and use `PLUGIN_ROOT`, so the handler works without a
Polycaster checkout. Codex CLI 0.155.1 detects hooks in this compatibility layout
but returns no hooks when a portable root `plugin.json` is present. Do not merge
this package into a 0.1.0 extraction: remove that extraction's root `plugin.json`
and `mcp.json`, or extract the current release into a fresh directory before reinstalling.

## Changes in 0.1.2

Meeting follow-ups use the search tool's `titleTerms` filter when advertised.
For example, a December Fed question searches `Fed` with terms `December` and
the resolved year, so unrelated contracts do not fill the first page. The hook
allows a bounded query refinement and uses event summaries on older servers
without this filter. It also tells the assistant not to infer meeting-specific
odds from annual contracts or post-meeting rate ranges.

Deploy the updated MCP search tool and refresh the client's tool schema for the
new filter. Reinstall this plugin release and start a fresh session to load the
updated guidance. Automated tests cover retrieval and hook execution; repeat the
conversation test to verify selection and card rendering in your host.
The package contains no credentials or trading automation.

See [OpenAI packaging documentation](https://developers.openai.com/plugins/build/plugins)
and [hook trust documentation](https://learn.chatgpt.com/docs/hooks).
