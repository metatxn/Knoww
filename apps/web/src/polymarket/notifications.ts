import type { DropNotificationParams } from "@/types/notifications";
import { isFreshAuthenticationRequired } from "./errors";
import {
  forgetPolymarketReadOnlyClient,
  getPolymarketNotificationsClient,
  type ReadOnlyClientInput,
} from "./read-only-client";

/** One CLOB notification as the venue sends it; the SDK's own type is incomplete. */
export interface RawPolymarketNotification {
  id?: number;
  type: number;
  owner: string;
  payload: unknown;
  timestamp?: number;
}

/**
 * The wallet's CLOB notifications. A passive read: rejected credentials
 * surface as the fresh-authentication error and drop the cached client, so
 * the caller can clear the stored credentials instead of retrying against
 * them.
 */
export async function readPolymarketNotifications(
  input: ReadOnlyClientInput
): Promise<RawPolymarketNotification[]> {
  try {
    const client = await getPolymarketNotificationsClient(input);
    const raw = await client.fetchNotifications();
    // The venue has answered with null and with an error envelope instead of a list.
    return Array.isArray(raw) ? (raw as RawPolymarketNotification[]) : [];
  } catch (error) {
    if (isFreshAuthenticationRequired(error)) {
      forgetPolymarketReadOnlyClient(input);
    }
    throw error;
  }
}

/** Marks the given notifications read on the CLOB, which wants string ids. */
export async function dropPolymarketNotifications(
  input: ReadOnlyClientInput,
  ids: number[]
): Promise<void> {
  const client = await getPolymarketNotificationsClient(input);
  const params: DropNotificationParams = { ids: ids.map((id) => String(id)) };
  await client.dropNotifications(params);
}
