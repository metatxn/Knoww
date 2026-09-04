// @vitest-environment node
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { installGoldenFetch } from "./fetch-shim";

let dir: string;
let fixturesDir: string;
let restore: (() => void) | undefined;
const upstream = vi.fn<typeof fetch>();

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "knoww-golden-"));
  fixturesDir = path.join(dir, "fixtures");
  upstream.mockReset();
});

afterEach(async () => {
  restore?.();
  restore = undefined;
  await rm(dir, { recursive: true, force: true });
});

describe("installGoldenFetch in record mode", () => {
  it("forwards the original request, writes a fixture and returns the upstream response", async () => {
    upstream.mockImplementation(
      async () =>
        new Response('{"ok":true}', {
          status: 200,
          headers: {
            "content-type": "application/json",
            date: "Thu, 03 Sep 2026 12:00:00 GMT",
          },
        })
    );
    restore = installGoldenFetch({
      mode: "record",
      fixturesDir,
      fetchImpl: upstream,
    });

    const init = { next: { revalidate: 30 } } as RequestInit;
    const response = await fetch("https://gamma.test/events/1", init);

    expect(await response.json()).toEqual({ ok: true });
    expect(upstream).toHaveBeenCalledWith("https://gamma.test/events/1", init);
    const files = await readdir(fixturesDir);
    expect(files).toHaveLength(1);
    const fixture = JSON.parse(
      await readFile(path.join(fixturesDir, files[0] ?? ""), "utf8")
    );
    expect(fixture).toEqual({
      request: { method: "GET", url: "https://gamma.test/events/1" },
      response: {
        status: 200,
        statusText: "",
        headers: { "content-type": "application/json" },
        body: '{"ok":true}',
      },
    });
  });

  it("restores the previous global fetch", () => {
    const before = globalThis.fetch;
    const stop = installGoldenFetch({
      mode: "record",
      fixturesDir,
      fetchImpl: upstream,
    });
    expect(globalThis.fetch).not.toBe(before);
    stop();
    expect(globalThis.fetch).toBe(before);
  });
});

describe("installGoldenFetch in replay mode", () => {
  it("serves a recorded fixture without touching upstream", async () => {
    upstream.mockImplementation(
      async () =>
        new Response("hello", {
          status: 200,
          headers: { "content-type": "text/plain" },
        })
    );
    const stopRecord = installGoldenFetch({
      mode: "record",
      fixturesDir,
      fetchImpl: upstream,
    });
    await (await fetch("https://gamma.test/hello")).text();
    stopRecord();

    upstream.mockReset();
    upstream.mockRejectedValue(new Error("network must not be used"));
    restore = installGoldenFetch({
      mode: "replay",
      fixturesDir,
      fetchImpl: upstream,
    });

    const response = await fetch("https://gamma.test/hello");

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/plain");
    expect(await response.text()).toBe("hello");
    expect(upstream).not.toHaveBeenCalled();
  });

  it("passes a miss through to upstream and records it", async () => {
    upstream.mockImplementation(
      async () => new Response("live", { status: 200 })
    );
    const log = vi.fn();
    const missLogPath = path.join(dir, "replay-misses.log");
    restore = installGoldenFetch({
      mode: "replay",
      fixturesDir,
      fetchImpl: upstream,
      missLogPath,
      log,
    });

    const response = await fetch("https://gamma.test/missing");

    expect(await response.text()).toBe("live");
    expect(upstream).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenCalledWith(
      "golden.replay_miss",
      expect.objectContaining({
        method: "GET",
        url: "https://gamma.test/missing",
      })
    );
    expect(await readFile(missLogPath, "utf8")).toBe(
      "GET https://gamma.test/missing\n"
    );
  });
});
