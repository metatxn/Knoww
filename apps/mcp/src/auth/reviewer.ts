import { timingSafeEqual } from "node:crypto";
import type { McpAuthProps } from "./scopes";

export interface ReviewerEnv {
  MCP_REVIEWER_CODE_SHA256?: string;
}

/** Only a SHA-256 digest of a randomly generated 256-bit access code is stored. */
export function reviewerCodeHash(env: ReviewerEnv): string | null {
  const hash = env.MCP_REVIEWER_CODE_SHA256;
  return typeof hash === "string" && /^[a-f0-9]{64}$/.test(hash) ? hash : null;
}

export async function verifyReviewerCode(
  code: string,
  env: ReviewerEnv
): Promise<string | null> {
  const expected = reviewerCodeHash(env);
  if (!expected || !/^[a-f0-9]{64}$/.test(code)) return null;
  const bytes = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(code)
  );
  const actual = Array.from(new Uint8Array(bytes), (byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("");
  return timingSafeEqual(
    new TextEncoder().encode(actual),
    new TextEncoder().encode(expected)
  )
    ? expected
    : null;
}

/** Removing or rotating the configured code also disables existing reviewer tokens. */
export function isReviewerGrantEnabled(
  props: McpAuthProps,
  env: ReviewerEnv
): boolean {
  return (
    props.authMethod !== "reviewer-code" ||
    props.reviewerCodeHash === reviewerCodeHash(env)
  );
}
