// @vitest-environment node
import { afterEach, describe, expect, it } from "vitest";
import { installFixedClock } from "./fixed-clock";

const PIN = new Date("2026-09-03T12:00:00.000Z");
let restore: (() => void) | undefined;

afterEach(() => {
  restore?.();
  restore = undefined;
});

describe("installFixedClock", () => {
  it("pins Date.now and the no-argument constructor", () => {
    restore = installFixedClock(PIN);

    expect(Date.now()).toBe(PIN.getTime());
    expect(new Date().toISOString()).toBe("2026-09-03T12:00:00.000Z");
  });

  it("keeps every other Date form working", () => {
    restore = installFixedClock(PIN);

    expect(new Date("2020-01-02T03:04:05Z").getTime()).toBe(1577934245000);
    expect(new Date(0).toISOString()).toBe("1970-01-01T00:00:00.000Z");
    expect(new Date(2020, 0, 1).getFullYear()).toBe(2020);
    expect(Date.UTC(2020, 0, 1)).toBe(1577836800000);
    expect(Date.parse("2020-01-01T00:00:00Z")).toBe(1577836800000);
    expect(new Date()).toBeInstanceOf(Date);
  });

  it("restores the real clock", () => {
    const before = Date;
    const stop = installFixedClock(PIN);
    expect(Date).not.toBe(before);
    stop();
    expect(Date).toBe(before);
    expect(Math.abs(Date.now() - PIN.getTime())).toBeGreaterThan(60_000);
  });
});
