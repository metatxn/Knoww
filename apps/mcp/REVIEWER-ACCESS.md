# Reviewer demo access

Knoww's MCP consent page supports an optional access code for a dedicated reviewer identity. It grants only `markets:read`, uses the free-plan quotas, and exposes public market data. It cannot access a real user's Google account, private account data, signing keys, or trading permissions. Google sign-in remains available to ordinary users.

This is a separate authentication method, not a bypass. OAuth client validation, consent, S256 PKCE, authorization-code exchange, and request rate limits still apply. No email inbox, MFA, or Google account is needed for reviewer sign-in. The code must be randomly generated, not a human-chosen password.

## Configure production

1. Deploy the Worker code containing reviewer access through the normal release process.
2. From the repository root, generate a code in your own interactive terminal:

   ```sh
   node apps/mcp/scripts/generate-reviewer-code.mjs
   ```

3. Store the generated **access code** in a password manager. Do not put it in Git, CI logs, a URL, or chat. The script prints credentials only to an interactive terminal and writes no files.
4. In Cloudflare, open **Workers & Pages > knoww-mcp > Settings > Variables and Secrets**. Add an encrypted secret named `MCP_REVIEWER_CODE_SHA256` with the generated **digest**, then deploy the configuration update. Keep the existing Google and OAuth configuration.
5. Start a fresh Knoww OAuth connection in the plugin portal or a test MCP host. On the Knoww consent page, expand **Reviewer demo access**, enter the access code, and choose **Authorize reviewer demo**.
6. Confirm that the host completes the connection, lists tools, and runs the five supplied functional test cases. Check market cards in a host that supports MCP Apps.

The option stays hidden and reviewer authentication fails when the digest is missing or malformed. Only the digest belongs on the Worker. SHA-256 is used here to verify a random 256-bit credential, not to store a human-chosen password.

## OpenAI test credentials field

After testing the deployed setup, enter this text in the submission portal and replace the placeholder with the access code directly there:

```text
MCP endpoint: https://mcp.knoww.app/mcp
Login: Start the Knoww OAuth connection from the MCP host or Scan Tools in the submission portal. The host supplies the authorization parameters to https://mcp.knoww.app/authorize.
Demo identity: reviewer-demo
Sign-in method: On the Knoww consent page, expand "Reviewer demo access", paste the supplied access code, and select "Authorize reviewer demo".
Access code: [enter the generated access code here]
No username, Google login, email verification, SMS, MFA, or private network is required.
Access: markets:read only, with normal free-plan quotas. Market and public wallet data are retrieved from the public provider APIs; no private user account data is attached to this demo identity.
```

Do not submit a placeholder or claim the setup works before checking the deployed connection. Keep access available for ongoing review.

## Rotate or disable

Generate a new code and replace the Worker digest to rotate access. Update the reviewer credentials in the submission portal after testing the new code. Remove `MCP_REVIEWER_CODE_SHA256` to disable reviewer access.

Every MCP API request checks the current digest. Removing or changing it makes old reviewer access tokens unusable, including tokens minted through an older refresh grant. Restoring an old digest re-enables matching unexpired grants, so always generate a new code when rotating.
