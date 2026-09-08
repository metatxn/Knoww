const STATEMENT = "Sign in to Knoww";
const LOCAL_ONBOARDING_ORIGIN = "http://localhost:8000";

function getBaseUrl(requestUrl?: string): string {
  // Local onboarding signs on port 8000, even when the API configuration
  // points to production. Never adopt arbitrary request hosts for sign-in.
  if (process.env.NODE_ENV === "development" && requestUrl) {
    try {
      if (new URL(requestUrl).origin === LOCAL_ONBOARDING_ORIGIN) {
        return LOCAL_ONBOARDING_ORIGIN;
      }
    } catch {
      // Use the configured origin when the request URL is unavailable.
    }
  }
  return (
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.ALLOWED_ORIGIN ||
    LOCAL_ONBOARDING_ORIGIN
  );
}

function createNonce(): string {
  return crypto.randomUUID().replace(/-/g, "");
}

export function buildSiwxMessage(input: {
  address: string;
  chainId: number;
  nonce: string;
  issuedAt: string;
  expirationTime: string;
  requestUrl?: string;
}): string {
  const baseUrl = getBaseUrl(input.requestUrl);
  // Phantom's documented SIW format uses the authority here, with the scheme
  // only in the URI field below.
  const domain = new URL(baseUrl).host;

  return `${domain} wants you to sign in with your Ethereum account:
${input.address}

${STATEMENT}

URI: ${baseUrl}
Version: 1
Chain ID: ${input.chainId}
Nonce: ${input.nonce}
Issued At: ${input.issuedAt}
Expiration Time: ${input.expirationTime}`;
}

export function createSiwxChallenge(input: {
  address: string;
  chainId: number;
  requestUrl?: string;
}): {
  expirationTime: string;
  issuedAt: string;
  message: string;
  nonce: string;
} {
  const nonce = createNonce();
  const issuedAt = new Date().toISOString();
  const expirationTime = new Date(Date.now() + 5 * 60 * 1000).toISOString();

  return {
    message: buildSiwxMessage({
      address: input.address,
      chainId: input.chainId,
      nonce,
      issuedAt,
      expirationTime,
      requestUrl: input.requestUrl,
    }),
    nonce,
    issuedAt,
    expirationTime,
  };
}
