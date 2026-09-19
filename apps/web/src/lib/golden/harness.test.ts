// @vitest-environment node
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { installGoldenHarness } from "./harness";

let dir: string;
let restore: (() => void) | undefined;
const upstream = vi.fn<typeof fetch>(
  async () => new Response("{}", { status: 200 })
);

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "knoww-golden-harness-"));
});

afterEach(async () => {
  restore?.();
  restore = undefined;
  await rm(dir, { recursive: true, force: true });
});

describe("installGoldenHarness", () => {
  it("records the wall clock and pins the process to it", async () => {
    const before = Date.now();
    const harness = await installGoldenHarness({
      mode: "record",
      goldenDir: dir,
      fetchImpl: upstream,
    });
    restore = harness.restore;

    const stored = JSON.parse(
      await readFile(path.join(dir, "clock.json"), "utf8")
    );
    expect(new Date(stored.now).getTime()).toBeGreaterThanOrEqual(before);
    expect(Date.now()).toBe(harness.now.getTime());
    expect(harness.fixturesDir).toBe(path.join(dir, "fixtures"));
  });

  it("replays with the recorded clock", async () => {
    await writeFile(
      path.join(dir, "clock.json"),
      JSON.stringify({ now: "2026-09-03T12:00:00.000Z" })
    );
    const harness = await installGoldenHarness({
      mode: "replay",
      goldenDir: dir,
      fetchImpl: upstream,
    });
    restore = harness.restore;

    expect(new Date().toISOString()).toBe("2026-09-03T12:00:00.000Z");
  });

  it("refuses to replay without a recorded clock", async () => {
    await expect(
      installGoldenHarness({
        mode: "replay",
        goldenDir: dir,
        fetchImpl: upstream,
      })
    ).rejects.toThrow(/clock\.json/);
  });

  it("restores fetch and the clock together", async () => {
    const realFetch = globalThis.fetch;
    const realDate = Date;
    const harness = await installGoldenHarness({
      mode: "record",
      goldenDir: dir,
      fetchImpl: upstream,
    });
    expect(globalThis.fetch).not.toBe(realFetch);
    expect(Date).not.toBe(realDate);
    harness.restore();
    expect(globalThis.fetch).toBe(realFetch);
    expect(Date).toBe(realDate);
  });
});
