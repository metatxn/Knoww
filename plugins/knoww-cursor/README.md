# Knoww for Cursor

Search Polymarket prediction markets, inspect market details, order books, and price history, and display interactive market cards through Knoww's hosted MCP server.

This package contains the MCP connection and a Cursor rule for relevant market research. Cursor decides when to load the rule from its description. It does not run a local script or require Node.js.

## Connect

After installing the plugin in Cursor, enable its `knoww` MCP server in Customize and complete the OAuth sign-in with Google. Knoww requests the `markets:read` scope. A wallet connection and API key are not required.

The endpoint is `https://mcp.knoww.app/mcp`. Advertised tools read public market data; they cannot place orders or move funds. Interactive cards require MCP Apps support in the host. When cards are unavailable, the assistant can still return a sourced text summary.

Try these prompts:

- "Which prediction-market platforms can Knoww query?"
- "Find active Polymarket markets about the Fed and show up to three relevant markets."
- "Explain the resolution rules for that market."

## Test locally

Copy this package, including its hidden `.cursor-plugin` directory, into `~/.cursor/plugins/local/knoww`. If that folder already exists, review it before replacing it. Use a copy, since Cursor skips symlinks that point outside its local plugins folder.

Run **Developer: Reload Window** in Cursor, then open Customize. Confirm that the Knoww MCP server and `knoww-markets` rule appear. Local plugin imports must be allowed by your organization if its policy restricts them.

Complete OAuth, run the first prompt above, and verify that the server returns its enabled platform. Then search for markets and check that the selected cards agree with the returned data. Confirm that "skip prediction markets" suppresses further discovery. Local validation of the manifests does not replace this host test.

## Marketplace publishing

The repository's `.cursor-plugin/marketplace.json` points to this package. Submit the public repository at [Cursor's publisher portal](https://cursor.com/marketplace/publish) after the package is available on the submitted branch and the local test passes. Cursor reviews plugins before listing them.

The Cursor package starts at `0.1.0` and uses its own semantic version. Bump its version for package changes. The hosted MCP server and the Codex plugin have separate versions.

## Support and license

- [Knoww](https://knoww.app)
- [Privacy policy](https://knoww.app/privacy)
- [Terms of service](https://knoww.app/terms)
- [Source and issues](https://github.com/metatxn/Knoww)
- Contact: contact@knoww.app

Licensed under AGPL-3.0-only. See [LICENSE](./LICENSE).
