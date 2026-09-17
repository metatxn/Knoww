# Google OAuth verification for Knoww MCP

The September 2026 review flagged missing Google data disclosures, an inaccessible homepage, an unclear app purpose, and a mismatch between "Knoww MCP" and the homepage branding.

## Publish the pages first

Deploy the web app with the dedicated `/mcp` page and the updated `/privacy` policy. The homepage navbar uses the label "MCP" and links to `/mcp`. The dedicated page describes the current read-only service, provides setup instructions, explains Google sign-in, and links to the privacy policy. These pages must work without a session, a wallet connection, or Google sign-in.

The main landing page stays at `https://knoww.app`, with MCP details on `/mcp`. The Google Auth Platform homepage setting below remains unchanged. Moving the explanation to a linked page does not by itself resolve Google's earlier findings about the submitted homepage's app name and purpose.

Privacy sections now render without scroll reveal animations. Browser verification found that the animation could leave a section at zero opacity even after navigating to its anchor.

The policy follows the current implementation in `apps/mcp/src/auth/google.ts`, `provider.ts`, `consent.ts`, `challenge-store.ts`, and `apps/mcp/src/analytics.ts`. Google email addresses and tokens are discarded after verification. Authorization records retain the Google subject; account-to-client identifiers persist without automatic expiry. When analytics is enabled, PostHog receives a hashed MCP identifier. Removing a Google connection does not automatically revoke Knoww tokens or delete those records.

Before publishing, confirm that the support inbox can handle the deletion requests described in the policy. Update these disclosures if the data handling changes.

## Configure Google Auth Platform

In the production project's Branding settings, use:

| Field | Value |
| --- | --- |
| App name | Knoww MCP |
| Application home page | https://knoww.app |
| Application privacy policy | https://knoww.app/privacy |
| Application terms of service | https://knoww.app/terms |
| Authorized domain | knoww.app |

Verify domain ownership using an account with the required access to the Google Cloud project. Keep the OAuth client's existing callback URL, `https://mcp.knoww.app/auth/google/callback`, separate from the application homepage. Confirm that Data Access lists only the Google sign-in scopes the code requests, `openid` and `email`, unless other features in the same project require more.

## Check and resubmit

1. Open the homepage, MCP page, and privacy policy in a fresh browser session. Confirm they load directly, show the expected content, and have no login or access challenge.
2. Confirm the homepage's "MCP" link opens `/mcp`, which visibly says "Knoww MCP", explains Google sign-in, and links to the same privacy URL as the consent screen. Resolve any remaining homepage branding findings before resubmitting.
3. Check the policy's Google section for collection, use, sharing, protection, retention, and deletion details.
4. Submit the updated branding for verification. If Google has an open verification email thread, reply there with the updated URLs and the changes made.

On September 17, 2026, a request without session cookies returned HTTP 200 from `https://knoww.app` with no redirect. A browser check also showed the public landing page and a privacy link. The earlier login finding was not reproduced. If it recurs, check the exact configured URL and any Cloudflare Access, WAF, or bot challenge affecting reviewers.

Google's requirements: [App Homepage](https://support.google.com/cloud/answer/13807376), [App Privacy Policy](https://support.google.com/cloud/answer/13806988), and [Domain Verification](https://support.google.com/cloud/answer/13804266).
