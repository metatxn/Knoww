// @vitest-environment node
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { registerGoldenHarness } from "./register";

describe("registerGoldenHarness", () => {
  const realFetch = globalThis.fetch;
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), "golden-register-"));
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await rm(dir, { recursive: true, force: true });
  });

  it("does nothing when KNOWW_GOLDEN_MODE is unset", async () => {
    await expect(registerGoldenHarness({})).resolves.toBeUndefined();
    expect(globalThis.fetch).toBe(realFetch);
  });

  it("rejects an unknown mode", async () => {
    await expect(
      registerGoldenHarness({ KNOWW_GOLDEN_MODE: "live" })
    ).rejects.toThrow('KNOWW_GOLDEN_MODE must be "record" or "replay"');
    expect(globalThis.fetch).toBe(realFetch);
  });

  it("installs the harness in the directory KNOWW_GOLDEN_DIR names", async () => {
    const harness = await registerGoldenHarness({
      KNOWW_GOLDEN_MODE: "record",
      KNOWW_GOLDEN_DIR: dir,
    });
    try {
      expect(harness?.fixturesDir).toBe(path.join(dir, "fixtures"));
      expect(globalThis.fetch).not.toBe(realFetch);
      const clock = JSON.parse(
        await readFile(path.join(dir, "clock.json"), "utf8")
      );
      expect(clock.now).toBe(harness?.now.toISOString());
    } finally {
      harness?.restore();
    }
    expect(globalThis.fetch).toBe(realFetch);
  });
});
