export const SESSION_SIGN_IN_HASH = "#knoww-sign-in=";

export interface SessionSignInRequest {
  address: string;
  wallet: { rdns: string; name: string };
}

export function parseSessionSignInRequest(
  value: unknown
): SessionSignInRequest | null {
  if (!value || typeof value !== "object") return null;
  const input = value as Partial<SessionSignInRequest>;
  if (
    typeof input.address !== "string" ||
    !/^0x[\da-f]{40}$/i.test(input.address) ||
    !input.wallet ||
    typeof input.wallet.rdns !== "string" ||
    input.wallet.rdns.length > 255 ||
    typeof input.wallet.name !== "string" ||
    !input.wallet.name ||
    input.wallet.name.length > 255
  )
    return null;
  return {
    address: input.address,
    wallet: { rdns: input.wallet.rdns, name: input.wallet.name },
  };
}
