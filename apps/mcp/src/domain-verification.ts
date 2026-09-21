export interface DomainVerificationEnv {
  /** Public proof of domain control, configured separately for each deployment. */
  OPENAI_APPS_VERIFICATION_TOKEN?: string;
}

/**
 * @openapi
 * /.well-known/openai-apps-challenge:
 *   get:
 *     summary: Read the OpenAI plugin domain verification challenge.
 *     tags: [Operations]
 *     security: []
 *     responses:
 *       200:
 *         description: The exact configured token as text/plain.
 *       404:
 *         description: No valid verification token is configured.
 *       405:
 *         description: Only GET is supported.
 *       429:
 *         description: Public request quota exceeded.
 */
export function handleDomainVerificationRequest(
  request: Request,
  env: DomainVerificationEnv
): Response | null {
  if (new URL(request.url).pathname !== "/.well-known/openai-apps-challenge") {
    return null;
  }

  const headers = {
    "content-type": "text/plain; charset=utf-8",
    "cache-control": "no-store",
  };
  if (request.method !== "GET") {
    return new Response(null, {
      status: 405,
      headers: { ...headers, allow: "GET" },
    });
  }

  const token = env.OPENAI_APPS_VERIFICATION_TOKEN;
  // Reject blank, multiline, or oversized configuration without changing the token.
  if (typeof token !== "string" || !/^[\x21-\x7e]{1,4096}$/.test(token)) {
    return new Response("Not found.", { status: 404, headers });
  }
  return new Response(token, { headers });
}
