import {
  type CardFeedQuery,
  cardFeedQuerySchema,
} from "../src/polymarket/card-feed-query";
import { readCardFeed } from "../src/polymarket/event-feed";
import { MarketFeedCache } from "../src/polymarket/market-feed-cache";

function fixtureFetch(origin: string): typeof fetch {
  return (input, init) => {
    const url = new URL(String(input));
    const target = new URL(origin);
    url.protocol = target.protocol;
    url.host = target.host;
    return fetch(url, init);
  };
}

// Test entrypoint only. Production exports MarketFeedCache directly.
export class TestMarketFeedCache extends MarketFeedCache {
  private testTime?: number;
  protected now() {
    return this.testTime ?? Date.now();
  }
  protected loadPage(query: CardFeedQuery) {
    return readCardFeed(query, {
      fetchImpl: fixtureFetch(
        (this.env as unknown as { FIXTURE_ORIGIN: string }).FIXTURE_ORIGIN
      ),
    });
  }
  setTime(time: number) {
    this.testTime = time;
  }
  async runAlarm() {
    await this.ctx.storage.deleteAlarm();
    await this.alarm();
  }
  async inspect() {
    const exists =
      this.ctx.storage.sql
        .exec("SELECT name FROM sqlite_master WHERE name = 'feed_state'")
        .toArray().length > 0;
    return {
      rows: exists
        ? this.ctx.storage.sql.exec("SELECT * FROM feed_state").toArray().length
        : 0,
      alarm: await this.ctx.storage.getAlarm(),
      sqlChanges: this.ctx.storage.sql
        .exec<{ changes: number }>("SELECT total_changes() AS changes")
        .toArray()[0]?.changes,
    };
  }
}

export default {
  async fetch(
    request: Request,
    env: {
      MARKET_FEED_CACHE: DurableObjectNamespace<TestMarketFeedCache>;
      FIXTURE_PAGE_SIZE: number;
      FIXTURE_ORIGIN: string;
    }
  ) {
    const url = new URL(request.url);
    if (url.pathname === "/next") {
      const page = await readCardFeed(
        cardFeedQuerySchema.parse({
          limit: env.FIXTURE_PAGE_SIZE,
          after_cursor: url.searchParams.get("after_cursor") ?? undefined,
        }),
        { fetchImpl: fixtureFetch(env.FIXTURE_ORIGIN) }
      );
      return Response.json({
        data: page.events,
        pagination: { nextCursor: page.nextCursor },
      });
    }
    const stub = env.MARKET_FEED_CACHE.getByName(
      url.searchParams.get("key") ?? "shared"
    );
    if (url.pathname === "/clock") {
      await stub.setTime(Number(url.searchParams.get("time")));
      return new Response("ok");
    }
    if (url.pathname === "/alarm") {
      await stub.runAlarm();
      return new Response("ok");
    }
    if (url.pathname === "/inspect") return Response.json(await stub.inspect());
    return stub.getPage(
      cardFeedQuerySchema.parse({ limit: env.FIXTURE_PAGE_SIZE })
    );
  },
};
