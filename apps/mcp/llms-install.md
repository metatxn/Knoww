# Connect Knoww to Cline

Knoww is a hosted MCP server for read-only Polymarket research. Use the remote endpoint below. The build and deployment instructions elsewhere in this repository are for server maintainers.

## Add the remote server

In Cline, open MCP Servers, then Remote Servers. Enter:

| Field | Value |
| --- | --- |
| Server name | `knoww` |
| Server URL | `https://mcp.knoww.app/mcp` |
| Transport | Streamable HTTP |

Click Add Server. If editing the MCP configuration instead, merge this entry into the existing `mcpServers` object and preserve all other servers:

```json
{
  "mcpServers": {
    "knoww": {
      "type": "streamableHttp",
      "url": "https://mcp.knoww.app/mcp",
      "disabled": false,
      "autoApprove": []
    }
  }
}
```

Use Cline's Configure MCP Servers action to locate the extension's configuration. The Cline CLI uses `~/.cline/mcp.json`. Set `type` explicitly because Cline defaults to legacy SSE when it is omitted.

No local process, package installation, API key, wallet, or Cloudflare credentials are needed. Keep tool approvals enabled. Do not replace an existing server configuration without reviewing it.

## Authorize

Follow Cline's OAuth sign-in flow, review the `markets:read` permission, and sign in with Google on Knoww's authorization page. The user completes any passkey or account verification. Cline manages the resulting OAuth credentials; do not paste tokens into the MCP configuration or publish them in an issue.

An unauthenticated request receives HTTP 401 with an OAuth discovery challenge. If your Cline version cannot complete OAuth, report that as a compatibility failure. Do not disable server authentication or claim that installation succeeded.

## Verify the installation

Ask Cline:

> Use Knoww to list its supported prediction-market platforms.

Approve the `list_platforms` call and confirm it returns the enabled platform. Then ask:

> Search active Polymarket markets for Fed and summarize up to three relevant results with their sources.

Approve `search_markets`. Check that the response contains returned market identifiers, source information, and timestamps. An empty search result can be valid; a missing tool, authentication error, or connection failure is not a successful tool call.

Interactive cards require MCP Apps support in the host. Text results remain usable without cards. The advertised tools cannot place orders, move funds, or access a private trading account.

For a marketplace submission, record the Cline version, installation method, and successful test results. Do not check the installation-test confirmation until Cline has completed these steps using this guide or the README.

## Links

- [Knoww](https://knoww.app)
- [Privacy policy](https://knoww.app/privacy)
- [Terms](https://knoww.app/terms)
- [Cline MCP configuration reference](https://docs.cline.bot/mcp/mcp-overview)
- Support: contact@knoww.app
