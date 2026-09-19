"use client";

import {
  adaptUnifiedSecureClientForLegacyClob,
  createUnifiedPolymarketCredentialsOnlySigner,
  createUnifiedPolymarketSecureClient,
  type LegacyClobCompatibleClient,
  type UnifiedSdkTradingClient,
} from "@knoww/shared-types/polymarket-unified";
import type { DropNotificationParams } from "@/types/notifications";

type SecureClientOptions = Parameters<
  typeof createUnifiedPolymarketSecureClient
>[0];

export type ReadOnlyClientCredentials = NonNullable<
  SecureClientOptions["credentials"]
>;

export interface ReadOnlyClientInput {
  /** The connected EOA that derived the credentials. */
  signerAddress: string;
  /** The wallet the CLOB reads for: the EOA itself or its contract wallet. */
  walletAddress: string;
  credentials: ReadOnlyClientCredentials;
}

/**
 * The notification endpoints of the secure client. The legacy adapter does
 * not carry them, so the notifications read uses the SDK client directly.
 */
export interface PolymarketNotificationsClient {
  fetchNotifications(): Promise<unknown>;
  dropNotifications(params: DropNotificationParams): Promise<unknown>;
}

const clients = new Map<string, Promise<LegacyClobCompatibleClient>>();
const notificationClients = new Map<
  string,
  Promise<PolymarketNotificationsClient>
>();

function cacheKey(input: ReadOnlyClientInput): string {
  return `${input.signerAddress.toLowerCase()}:${input.walletAddress.toLowerCase()}:${input.credentials.apiKey}`;
}

/**
 * The SDK client behind every passive read. It signs nothing: the
 * credentials-only signer plus `allowFreshAuthentication: false` make the SDK
 * fail with the shim's fresh-authentication error instead of opening a wallet
 * prompt when the CLOB rejects the stored credentials.
 */
function createPassiveSecureClient(input: ReadOnlyClientInput) {
  return createUnifiedPolymarketSecureClient({
    signer: createUnifiedPolymarketCredentialsOnlySigner(input.signerAddress),
    wallet: input.walletAddress,
    credentials: input.credentials,
    allowFreshAuthentication: false,
  });
}

/**
 * One client per signer, wallet and API key; a client that failed to build is
 * dropped so the next read retries.
 */
function remember<T>(
  store: Map<string, Promise<T>>,
  key: string,
  build: () => Promise<T>
): Promise<T> {
  const cached = store.get(key);
  if (cached) return cached;
  const pending = build();
  store.set(key, pending);
  pending.catch(() => {
    if (store.get(key) === pending) store.delete(key);
  });
  return pending;
}

/**
 * A CLOB client for passive reads (order scoring, fee quotes), behind the
 * legacy interface those reads use.
 */
export function getPolymarketReadOnlyClient(
  input: ReadOnlyClientInput
): Promise<LegacyClobCompatibleClient> {
  return remember(clients, cacheKey(input), () =>
    createPassiveSecureClient(input).then(({ client }) =>
      adaptUnifiedSecureClientForLegacyClob(
        client as unknown as UnifiedSdkTradingClient,
        { builderCode: process.env.NEXT_PUBLIC_POLY_BUILDER_CODE }
      )
    )
  );
}

/** The same passive client, unwrapped, for the notification endpoints. */
export function getPolymarketNotificationsClient(
  input: ReadOnlyClientInput
): Promise<PolymarketNotificationsClient> {
  return remember(notificationClients, cacheKey(input), () =>
    createPassiveSecureClient(input).then(
      ({ client }) => client as unknown as PolymarketNotificationsClient
    )
  );
}

/** Drops the cached clients, for credentials the CLOB no longer accepts. */
export function forgetPolymarketReadOnlyClient(
  input: ReadOnlyClientInput
): void {
  const key = cacheKey(input);
  clients.delete(key);
  notificationClients.delete(key);
}
