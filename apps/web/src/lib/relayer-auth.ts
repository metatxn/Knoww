import type { Address, WalletClient } from "viem";

type RelayerWallet = { address: Address; client: WalletClient };

const connectedWallets = new Map<symbol, RelayerWallet>();
let session: { address: Address; token: string; expiresAt: number } | null =
  null;
let signIn: { address: string; promise: Promise<string> } | null = null;

export function registerRelayerWallet(
  client: WalletClient,
  address: Address
): () => void {
  const registration = Symbol("relayer-wallet");
  connectedWallets.set(registration, { client, address });
  return () => {
    connectedWallets.delete(registration);
    if (connectedWallets.size === 0) {
      session = null;
      signIn = null;
    }
  };
}

function activeWallet(): RelayerWallet {
  const wallet = [...connectedWallets.values()].at(-1);
  if (!wallet) throw new Error("Connect your wallet to use the relayer.");
  return wallet;
}

async function requestSession(wallet: RelayerWallet): Promise<string> {
  const chainId = 137;
  const challengeResponse = await fetch("/api/extension/session/challenge", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ walletAddress: wallet.address, chainId }),
  });
  if (!challengeResponse.ok) {
    throw new Error("Could not start wallet sign-in for relayer access.");
  }
  const challenge = (await challengeResponse.json()) as {
    challengeToken?: string;
    message?: string;
  };
  if (!challenge.message || !challenge.challengeToken) {
    throw new Error("Wallet sign-in challenge is incomplete.");
  }

  const signature = await wallet.client.signMessage({
    account: wallet.address,
    message: challenge.message,
  });
  const verifyResponse = await fetch("/api/extension/session/verify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      walletAddress: wallet.address,
      chainId,
      message: challenge.message,
      challengeToken: challenge.challengeToken,
      signature,
      scope: "relayer:submit",
    }),
  });
  if (!verifyResponse.ok) {
    throw new Error("Wallet sign-in for relayer access failed.");
  }
  const verified = (await verifyResponse.json()) as {
    token?: string;
    expiresAt?: string;
  };
  const expiresAt = Date.parse(verified.expiresAt ?? "");
  if (
    !verified.token ||
    !Number.isFinite(expiresAt) ||
    expiresAt <= Date.now()
  ) {
    throw new Error("Wallet sign-in response is incomplete.");
  }
  session = { address: wallet.address, token: verified.token, expiresAt };
  return verified.token;
}

async function getToken(): Promise<string> {
  const wallet = activeWallet();
  if (
    session?.address.toLowerCase() === wallet.address.toLowerCase() &&
    session.expiresAt > Date.now() + 30_000
  ) {
    return session.token;
  }
  if (signIn?.address.toLowerCase() !== wallet.address.toLowerCase()) {
    const promise = requestSession(wallet).finally(() => {
      if (signIn?.promise === promise) signIn = null;
    });
    signIn = { address: wallet.address, promise };
  }
  return signIn.promise;
}

export async function authenticatedRelayerFetch(
  url: string,
  init: RequestInit
): Promise<Response> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const address = activeWallet().address;
    const token = await getToken();
    if (activeWallet().address.toLowerCase() !== address.toLowerCase()) {
      throw new Error("Wallet changed during relayer sign-in. Try again.");
    }
    const response = await fetch(url, {
      ...init,
      headers: { ...init.headers, Authorization: `Bearer ${token}` },
    });
    if (response.status !== 401) return response;
    session = null;
  }
  throw new Error("Wallet sign-in for relayer access expired.");
}
