import { z } from "zod";

const optionalNumber = z
  .string()
  .regex(/^\d+(\.\d+)?$/)
  .max(32)
  .optional();
const optionalDate = z
  .union([z.iso.date(), z.iso.datetime({ offset: true })])
  .optional();
export const cardFeedQuerySchema = z
  .object({
    feed: z
      .enum(["categories", "trending", "new", "breaking"])
      .default("categories"),
    limit: z.coerce.number().int().min(1).max(20).default(20),
    closed: z.enum(["true", "false"]).default("false"),
    ascending: z.enum(["true", "false"]).default("false"),
    order: z
      .enum([
        "volume",
        "volume24hr",
        "volume1wk",
        "volume1mo",
        "volume1yr",
        "liquidity",
        "startDate",
        "endDate",
      ])
      .default("volume24hr"),
    tag_slug: z
      .string()
      .regex(/^[a-z0-9][a-z0-9-]{0,119}$/)
      .optional(),
    after_cursor: z.string().max(4096).optional(),
    volume24hr_min: optionalNumber,
    volume1wk_min: optionalNumber,
    liquidity_min: optionalNumber,
    live: z.enum(["true", "false"]).optional(),
    start_date_min: optionalDate,
    start_date_max: optionalDate,
    end_date_min: optionalDate,
    end_date_max: optionalDate,
  })
  .strict();

export type CardFeedQuery = z.infer<typeof cardFeedQuerySchema>;

const cursorSchema = z
  .object({
    cursor: z.string().min(1).max(2048),
    lastId: z.string().min(1).max(256),
  })
  .strict();

export function decodeCardCursor(value?: string) {
  if (!value) return undefined;
  if (!value.startsWith("cards-v1.")) throw new Error("Invalid card cursor");
  return cursorSchema.parse(JSON.parse(atob(value.slice(9))));
}

export function encodeCardCursor(cursor: string, lastId: string) {
  return `cards-v1.${btoa(JSON.stringify({ cursor, lastId }))}`;
}

/** Only a small fixed set of first pages may schedule periodic refreshes. */
export function canRefreshCardFeed(query: CardFeedQuery): boolean {
  return (
    query.limit === 20 &&
    query.closed === "false" &&
    query.ascending === "false" &&
    ["volume24hr", "volume1wk", "volume1mo", "volume1yr"].includes(
      query.order
    ) &&
    !query.after_cursor &&
    !query.tag_slug &&
    !query.volume24hr_min &&
    !query.volume1wk_min &&
    !query.liquidity_min &&
    !query.live &&
    !query.start_date_min &&
    !query.start_date_max &&
    !query.end_date_min &&
    !query.end_date_max
  );
}
