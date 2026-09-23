# Cline submission draft

Prepared September 23, 2026. Not submitted. Installation in Cline remains untested. Publish the setup guide and logo from this change before using the links below in the submission.

Submission destination: [cline/mcp-marketplace](https://github.com/cline/mcp-marketplace/issues/new?template=mcp-server-submission.yml).

Title: `[Server Submission]: Knoww`

## GitHub Repository URL

https://github.com/metatxn/Knoww/tree/main/apps/mcp

## Logo Image

![Knoww](https://raw.githubusercontent.com/metatxn/Knoww/main/apps/web/public/logo-400x400.png)

This 400×400 PNG uses Knoww's existing artwork.

## Installation Testing

- [ ] I have tested that Cline can successfully set up this server using only the README.md and/or llms-install.md file
- [ ] The server is stable and ready for public use

Leave these confirmations unchecked until the installation test and public-readiness review are complete.

## Additional Information

Knoww lets Cline research Polymarket prediction markets through a hosted, read-only MCP server. Users can search markets, inspect outcomes and resolution details, retrieve order books and price history, and request market cards where the client supports MCP Apps.

- Endpoint: https://mcp.knoww.app/mcp
- Transport: Streamable HTTP, configured as `streamableHttp` in Cline.
- Authentication: OAuth with Google sign-in and the `markets:read` scope.
- Installation guide: https://github.com/metatxn/Knoww/blob/main/apps/mcp/llms-install.md
- Website: https://knoww.app
- Privacy policy: https://knoww.app/privacy
- Terms: https://knoww.app/terms
- Support: contact@knoww.app

No API key, wallet connection, or local server installation is required. Advertised tools cannot place orders, transfer assets, or access private trading accounts. Google sign-in authorizes the MCP connection only. Market prices reflect changing market expectations.

## Test record to complete before submission

| Check | Result |
| --- | --- |
| Cline version | Pending |
| Cline followed README or llms-install.md | Pending |
| Google OAuth completed | Pending |
| Tools appeared and list_platforms succeeded | Pending |
| search_markets returned a valid response | Pending |

The public endpoint returned HTTP 401 with an OAuth discovery challenge on September 23, 2026. That confirms the unauthenticated endpoint is reachable, but does not establish a successful Cline installation.
