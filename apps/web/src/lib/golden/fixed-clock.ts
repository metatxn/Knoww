const RealDate = Date;

/**
 * Pins the process clock so server-rendered output that depends on "now"
 * (relative times, countdowns, cache stamps) is identical between a record
 * run and a replay run days later. `new Date()` and `Date.now()` return the
 * pinned instant; every other Date constructor form still works.
 */
export function installFixedClock(fixed: Date): () => void {
  const fixedMs = fixed.getTime();

  class FixedDate extends RealDate {
    constructor(...args: unknown[]) {
      super(...((args.length === 0 ? [fixedMs] : args) as unknown as [number]));
    }

    static override now(): number {
      return fixedMs;
    }
  }

  globalThis.Date = FixedDate as DateConstructor;
  return () => {
    globalThis.Date = RealDate;
  };
}
