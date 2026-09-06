import { z } from "zod";
import {
  type ServiceFetchOptions,
  withUpstreamTimeout,
} from "../../fetch-options";
import {
  gammaTimestampSchema,
  nonNegativeDecimalSchema,
} from "../../validation";
import type { PolymarketClientContext } from "./context";
import { upstreamEventError } from "./errors";
import {
  type GammaMarketDetail,
  gammaMarketDetailSchema,
} from "./gamma-detail";
// Type only: the shape of a Gamma event record the mappers accept.
import type { GammaEventLike } from "./mappers";

/**
 * Gamma event lookups. Behaviour is the legacy `src/markets/events.ts`
 * verbatim; only the base URL and fetch binding come from the context.
 */

const EVENT_UPSTREAM_TIMEOUT_MS = 8500;
const CHILD_EVENTS_LIMIT = 50;

export interface ChildEventsResult {
  events: GammaEventDetail[];
  /** The same events as Gamma sent them, index-aligned with `events`. */
  rawEvents: GammaEventLike[];
  truncated: boolean;
}

export type EventIdentifier =
  | { kind: "id"; value: string }
  | { kind: "slug"; value: string };

export interface GammaEventDetail {
  id: string;
  title?: string;
  slug?: string;
  description?: string;
  active?: boolean;
  closed?: boolean;
  archived?: boolean;
  negRisk?: boolean;
  startDate?: string;
  endDate?: string;
  creationDate?: string;
  volume?: string | number;
  volume24hr?: string | number;
  liquidity?: string | number;
  tags?: { id?: string; label?: string; slug?: string }[];
  markets?: GammaMarketDetail[];
}

export const gammaEventDetailSchema: z.ZodType<GammaEventDetail> = z
  .object({
    id: z.string().min(1),
    title: z.string().optional(),
    slug: z.string().optional(),
    description: z.string().optional(),
    active: z.boolean().optional(),
    closed: z.boolean().optional(),
    archived: z.boolean().optional(),
    negRisk: z.boolean().optional(),
    startDate: gammaTimestampSchema.optional(),
    endDate: gammaTimestampSchema.optional(),
    creationDate: gammaTimestampSchema.optional(),
    volume: nonNegativeDecimalSchema.optional(),
    volume24hr: nonNegativeDecimalSchema.optional(),
    liquidity: nonNegativeDecimalSchema.optional(),
    tags: z
      .array(
        z
          .object({
            id: z.string().optional(),
            label: z.string().optional(),
            slug: z.string().optional(),
          })
          .passthrough()
      )
      .optional(),
    markets: z.array(gammaMarketDetailSchema).optional(),
  })
  .passthrough();

function requestInit(signal: AbortSignal): RequestInit {
  return {
    headers: { Accept: "application/json" },
    cache: "no-store",
    signal,
  };
}

export function createGammaEvents(ctx: PolymarketClientContext) {
  /**
   * Looks up a single event. /events/{id} and /events/slug/{slug} return one
   * object, not an array. Gamma answers 422 for malformed slugs, so on a slug
   * lookup that status means not found; on an id lookup it stays an upstream
   * error because ids we send are already digit-only.
   */
  async function lookupEvent(
    identifier: EventIdentifier,
    options?: ServiceFetchOptions
  ): Promise<{ event: GammaEventDetail; record: GammaEventLike } | null> {
    const path =
      identifier.kind === "id"
        ? `/events/${encodeURIComponent(identifier.value)}`
        : `/events/slug/${encodeURIComponent(identifier.value)}`;

    return withUpstreamTimeout(
      ctx.fetchOptions(options),
      EVENT_UPSTREAM_TIMEOUT_MS,
      async (fetchImpl, signal) => {
        const response = await fetchImpl(
          `${ctx.baseUrls.gamma}${path}`,
          requestInit(signal)
        );
        if (response.status === 404) {
          return null;
        }
        if (response.status === 422 && identifier.kind === "slug") {
          return null;
        }
        if (!response.ok) {
          throw upstreamEventError(
            `Gamma event lookup failed with status ${response.status}`,
            response.status
          );
        }
        const payload: unknown = await response.json();
        if (payload === null || payload === undefined) {
          return null;
        }
        const parsed = gammaEventDetailSchema.safeParse(payload);
        if (!parsed.success) {
          throw upstreamEventError("Gamma event payload was malformed");
        }
        // Validated above; the transforms only normalise, so the untouched
        // payload already satisfies GammaEventLike.
        return { event: parsed.data, record: payload as GammaEventLike };
      }
    );
  }

  async function fetchEventByIdentifier(
    identifier: EventIdentifier,
    options?: ServiceFetchOptions
  ): Promise<GammaEventDetail | null> {
    return (await lookupEvent(identifier, options))?.event ?? null;
  }

  /** The same lookup, returning the event exactly as Gamma sent it. */
  async function fetchEventRecordByIdentifier(
    identifier: EventIdentifier,
    options?: ServiceFetchOptions
  ): Promise<GammaEventLike | null> {
    return (await lookupEvent(identifier, options))?.record ?? null;
  }

  /**
   * Fetches the open child events of a negRisk parent. Best-effort at the call
   * site: callers tolerate a throw and degrade instead of failing the lookup.
   */
  async function fetchChildEvents(
    parentEventId: string,
    options?: ServiceFetchOptions
  ): Promise<ChildEventsResult> {
    const url = new URL(`${ctx.baseUrls.gamma}/events`);
    url.searchParams.set("parent_event_id", parentEventId);
    url.searchParams.set("closed", "false");
    url.searchParams.set("limit", String(CHILD_EVENTS_LIMIT + 1));

    return withUpstreamTimeout(
      ctx.fetchOptions(options),
      EVENT_UPSTREAM_TIMEOUT_MS,
      async (fetchImpl, signal) => {
        const response = await fetchImpl(url.toString(), requestInit(signal));
        if (!response.ok) {
          throw upstreamEventError(
            `Gamma child event lookup failed with status ${response.status}`,
            response.status
          );
        }
        const payload: unknown = await response.json();
        if (!Array.isArray(payload)) {
          throw upstreamEventError(
            "Gamma child event payload was not an array"
          );
        }
        const parsed = z.array(gammaEventDetailSchema).safeParse(payload);
        if (!parsed.success) {
          throw upstreamEventError(
            "Gamma child event payload contained malformed data"
          );
        }
        // The schema validated the shape; the transforms only stringify
        // amounts, so the payload is safe to hand on as the raw records.
        const rawEvents = (payload as GammaEventLike[]).slice(
          0,
          CHILD_EVENTS_LIMIT
        );
        return {
          events: parsed.data.slice(0, CHILD_EVENTS_LIMIT),
          rawEvents,
          truncated: parsed.data.length > CHILD_EVENTS_LIMIT,
        };
      }
    );
  }

  /**
   * Fallback for event payloads that arrive without an embedded markets array:
   * pulls the event's open markets directly from /markets.
   */
  async function fetchOpenMarketsByEventSlug(
    slug: string,
    options?: ServiceFetchOptions
  ): Promise<GammaMarketDetail[]> {
    const url = new URL(`${ctx.baseUrls.gamma}/markets`);
    url.searchParams.set("events_slug", slug);
    url.searchParams.set("closed", "false");

    return withUpstreamTimeout(
      ctx.fetchOptions(options),
      EVENT_UPSTREAM_TIMEOUT_MS,
      async (fetchImpl, signal) => {
        const response = await fetchImpl(url.toString(), requestInit(signal));
        if (!response.ok) {
          throw upstreamEventError(
            `Gamma event market lookup failed with status ${response.status}`,
            response.status
          );
        }
        const payload: unknown = await response.json();
        if (!Array.isArray(payload)) {
          throw upstreamEventError(
            "Gamma event market payload was not an array"
          );
        }
        const parsed = z.array(gammaMarketDetailSchema).safeParse(payload);
        if (!parsed.success) {
          throw upstreamEventError(
            "Gamma event market payload contained malformed data"
          );
        }
        return parsed.data;
      }
    );
  }

  return {
    fetchEventByIdentifier,
    fetchEventRecordByIdentifier,
    fetchChildEvents,
    fetchOpenMarketsByEventSlug,
  };
}

export type PolymarketGammaEvents = ReturnType<typeof createGammaEvents>;
