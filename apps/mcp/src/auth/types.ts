import type { OAuthHelpers } from "@cloudflare/workers-oauth-provider";
import type { ReviewerEnv } from "./reviewer";

/** The provider injects OAUTH_PROVIDER before invoking application handlers. */
export type McpOAuthEnv = Env &
  ReviewerEnv & {
    GOOGLE_CLIENT_ID: string;
    GOOGLE_CLIENT_SECRET: string;
    OAUTH_PROVIDER: OAuthHelpers;
  };
