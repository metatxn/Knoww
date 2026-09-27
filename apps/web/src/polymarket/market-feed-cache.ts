import { DurableObject } from "cloudflare:workers";
import { createLogger } from "@knoww/logger";
import {
  type CardFeedQuery,
  canRefreshCardFeed,
  cardFeedQuerySchema,
} from "./card-feed-query";
import { CARD_PAGE_MAX_BYTES, readCardFeed } from "./event-feed";

const log = createLogger("market-feed-cache");
export const FEED_FRESH_MS = 60_000;
export const FEED_MAX_AGE_MS = 360_000;
const ACTIVE_WINDOW_MS = 120_000;
const FAILURE_BACKOFF_MS = 15_000;
const ACTIVITY_SAVE_MS = 30_000;

interface StoredFeed {
  version: 1;
  query: CardFeedQuery;
  lastReadAt: number;
  reads: number;
  lastAttemptAt: number;
  snapshot?: { body: string; generatedAt: number };
}

/** One coordinator per normalized feed query. Only projected pages are stored. */
export class MarketFeedCache extends DurableObject<CloudflareEnv> {
  private state?: StoredFeed;
  private refreshing?: Promise<void>;
  private lastSavedAt = 0;

  constructor(ctx: DurableObjectState, env: CloudflareEnv) {
    super(ctx, env);
    ctx.storage.sql.exec(
      "CREATE TABLE IF NOT EXISTS feed_state (id INTEGER PRIMARY KEY, value TEXT NOT NULL)"
    );
    const row = ctx.storage.sql
      .exec<{ value: string }>("SELECT value FROM feed_state WHERE id = 1")
      .toArray()[0];
    if (row) {
      const saved = JSON.parse(row.value) as StoredFeed;
      if (saved.version === 1) {
        this.state = saved;
        this.lastSavedAt = saved.lastReadAt;
      }
    }
  }

  protected now() {
    return Date.now();
  }
  protected loadPage(query: CardFeedQuery) {
    return readCardFeed(query);
  }

  private save(state: StoredFeed) {
    // deleteAll() also removes SQL tables; an idle object may be reused without a new constructor.
    this.ctx.storage.sql.exec(
      "CREATE TABLE IF NOT EXISTS feed_state (id INTEGER PRIMARY KEY, value TEXT NOT NULL)"
    );
    this.ctx.storage.sql.exec(
      "INSERT OR REPLACE INTO feed_state (id, value) VALUES (1, ?)",
      JSON.stringify(state)
    );
    this.state = state;
    this.lastSavedAt = this.now();
  }

  private refresh(): Promise<void> {
    if (this.refreshing) return this.refreshing;
    const state = this.state;
    if (!state) return Promise.reject(new Error("Feed query is unavailable"));
    if (
      state.lastAttemptAt &&
      this.now() - state.lastAttemptAt < FAILURE_BACKOFF_MS
    ) {
      return Promise.reject(new Error("Feed refresh is backing off"));
    }
    this.save({ ...state, lastAttemptAt: this.now() });
    this.refreshing = (async () => {
      const page = await this.loadPage(state.query);
      const body = JSON.stringify({
        success: true,
        data: page.events,
        pagination: {
          hasMore: Boolean(page.nextCursor),
          nextCursor: page.nextCursor,
          totalResults: page.totalResults,
        },
      });
      if (new TextEncoder().encode(body).byteLength > CARD_PAGE_MAX_BYTES) {
        throw new Error("Card feed exceeds the cache budget");
      }
      // A failed read never replaces the previous complete snapshot.
      const current = this.state;
      if (!current) throw new Error("Feed state was removed during refresh");
      this.save({
        ...current,
        snapshot: { body, generatedAt: this.now() },
      });
    })().finally(() => {
      this.refreshing = undefined;
    });
    return this.refreshing;
  }

  private async schedule() {
    const state = this.state;
    if (!state) return;
    const now = this.now();
    const active = now - state.lastReadAt < ACTIVE_WINDOW_MS;
    const popular =
      active && state.reads >= 2 && canRefreshCardFeed(state.query);
    const age = state.snapshot ? now - state.snapshot.generatedAt : Infinity;
    let next = state.snapshot
      ? state.snapshot.generatedAt + FEED_MAX_AGE_MS
      : state.lastReadAt + ACTIVE_WINDOW_MS;
    if (popular || (active && age >= FEED_FRESH_MS && state.snapshot)) {
      next = Math.max(now + 1, state.lastAttemptAt + FEED_FRESH_MS);
    }
    const current = await this.ctx.storage.getAlarm();
    if (current === null || next < current)
      await this.ctx.storage.setAlarm(Math.max(now + 1, next));
  }

  async getPage(input: CardFeedQuery): Promise<Response> {
    const query = cardFeedQuerySchema.parse(input);
    if (!canRefreshCardFeed(query))
      throw new Error("Only fixed first-page queries use durable feed storage");
    const now = this.now();
    const previous = this.state;
    if (previous && JSON.stringify(previous.query) !== JSON.stringify(query)) {
      throw new Error("Feed cache query mismatch");
    }
    this.state = {
      ...previous,
      version: 1,
      query,
      lastReadAt: now,
      reads:
        previous && now - previous.lastReadAt < ACTIVE_WINDOW_MS
          ? Math.min(2, previous.reads + 1)
          : 1,
      lastAttemptAt: previous?.lastAttemptAt ?? 0,
    };
    // Activity survives eviction with at most 30 seconds of slack. Popular reads
    // update memory; they do not rewrite the snapshot for every visitor.
    if (now - this.lastSavedAt >= ACTIVITY_SAVE_MS) this.save(this.state);
    try {
      if (
        !this.state?.snapshot ||
        now - this.state.snapshot.generatedAt >= FEED_MAX_AGE_MS
      ) {
        await this.refresh();
      }
      const snapshot = this.state?.snapshot;
      if (!snapshot || this.now() - snapshot.generatedAt >= FEED_MAX_AGE_MS)
        throw new Error("No usable feed snapshot");
      const ageMs = Math.max(0, this.now() - snapshot.generatedAt);
      const stale = ageMs >= FEED_FRESH_MS;
      const freshness = JSON.stringify({
        generatedAt: snapshot.generatedAt,
        stale,
      });
      const body = `${snapshot.body.slice(0, -1)},"freshness":${freshness}}`;
      return new Response(body, {
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": stale
            ? "no-store"
            : `public, max-age=0, s-maxage=${Math.min(30, Math.max(0, Math.floor((FEED_FRESH_MS - ageMs) / 1000)))}`,
        },
      });
    } catch (error) {
      log.warn("read.failed", {
        error: error instanceof Error ? error.message : String(error),
      });
      return Response.json(
        {
          success: false,
          error: "Markets are temporarily unavailable. Please try again.",
        },
        {
          status: 503,
          headers: { "Retry-After": "15", "Cache-Control": "no-store" },
        }
      );
    } finally {
      await this.schedule();
    }
  }

  async alarm() {
    const state = this.state;
    if (!state) return;
    const now = this.now();
    if (now - state.lastReadAt >= ACTIVE_WINDOW_MS) {
      if (
        !state.snapshot ||
        now - state.snapshot.generatedAt >= FEED_MAX_AGE_MS
      ) {
        await this.ctx.storage.deleteAll();
        this.state = undefined;
        return;
      }
      await this.ctx.storage.setAlarm(
        state.snapshot.generatedAt + FEED_MAX_AGE_MS
      );
      return;
    }
    try {
      await this.refresh();
    } catch (error) {
      log.warn("refresh.failed", {
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      await this.schedule();
    }
  }
}
