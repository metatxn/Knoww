import assert from "node:assert/strict";
import test from "node:test";
import { priceHistoryRequests, readSdkPriceHistory } from "./price-history.ts";

test("history splits explicit ranges at 15 days and converts minutes to seconds", () => {
  const start = 1700000000;
  const end = start + 16 * 86400;
  assert.deepEqual(
    priceHistoryRequests("123", { startTs: start, endTs: end, fidelity: 60 }),
    [
      { assetId: "123", start, end: start + 15 * 86400, bucketSeconds: 3600 },
      { assetId: "123", start: start + 15 * 86400, end, bucketSeconds: 3600 },
    ]
  );
});
test("SDK history drains pages and converts milliseconds without losing the terminal point", async () => {
  const result = await readSdkPriceHistory(
    {
      listPriceHistory: () =>
        (async function* () {
          yield { items: [{ timestamp: 1700000000000, price: "0.25" }] };
          yield {
            items: [
              { timestamp: 1700000060000, price: "1", resolutionSeconds: 0 },
            ],
          };
        })(),
    },
    "123",
    { startTs: 1700000000, endTs: 1700000060 }
  );
  assert.deepEqual(result, [
    { t: 1700000000, p: "0.25" },
    { t: 1700000060, p: "1" },
  ]);
});
test("history rejects invalid windows and prices", async () => {
  assert.throws(() => priceHistoryRequests("123", { endTs: 100 }));
  await assert.rejects(
    readSdkPriceHistory(
      {
        listPriceHistory: () =>
          (async function* () {
            yield { items: [{ timestamp: 1700000000000, price: "2" }] };
          })(),
      },
      "123",
      {}
    ),
    /price/
  );
});
test("whole history preserves the caller's historical end bound", async () => {
  const result = await readSdkPriceHistory(
    {
      listPriceHistory: () =>
        (async function* () {
          yield {
            items: [
              { timestamp: 100000, price: "0.2" },
              { timestamp: 200000, price: "0.3" },
            ],
          };
        })(),
    },
    "123",
    { startTs: 0, endTs: 150 }
  );
  assert.deepEqual(result, [{ t: 100, p: "0.2" }]);
});
