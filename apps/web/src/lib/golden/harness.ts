import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  type GoldenLog,
  type GoldenMode,
  installGoldenFetch,
} from "./fetch-shim";
import { installFixedClock } from "./fixed-clock";

/**
 * Wires the golden harness into a server process: a pinned clock plus the
 * record/replay fetch shim. Record mode stores the wall time in
 * `<goldenDir>/clock.json`; replay mode pins the clock to that instant so the
 * rendered output only depends on the replayed fixtures. See golden/README.md.
 */
export interface GoldenHarnessOptions {
  mode: GoldenMode;
  goldenDir: string;
  /** Overrides the stored clock; mostly for tests. */
  now?: Date;
  fetchImpl?: typeof fetch;
  log?: GoldenLog;
}

export interface GoldenHarness {
  now: Date;
  fixturesDir: string;
  restore: () => void;
}

interface ClockFile {
  now: string;
}

async function resolveClock(
  mode: GoldenMode,
  clockFile: string,
  override: Date | undefined
): Promise<Date> {
  if (override) return override;
  if (mode === "record") {
    const now = new Date();
    await mkdir(path.dirname(clockFile), { recursive: true });
    const clock: ClockFile = { now: now.toISOString() };
    await writeFile(clockFile, `${JSON.stringify(clock, null, 2)}\n`);
    return now;
  }
  let stored: ClockFile;
  try {
    stored = JSON.parse(await readFile(clockFile, "utf8")) as ClockFile;
  } catch (error) {
    throw new Error(
      `golden replay needs ${clockFile} from a record run (${String(error)})`
    );
  }
  const now = new Date(stored.now);
  if (Number.isNaN(now.getTime())) {
    throw new Error(`golden clock file ${clockFile} has no valid "now"`);
  }
  return now;
}

export async function installGoldenHarness(
  options: GoldenHarnessOptions
): Promise<GoldenHarness> {
  const fixturesDir = path.join(options.goldenDir, "fixtures");
  const now = await resolveClock(
    options.mode,
    path.join(options.goldenDir, "clock.json"),
    options.now
  );
  const restoreClock = installFixedClock(now);
  const restoreFetch = installGoldenFetch({
    mode: options.mode,
    fixturesDir,
    fetchImpl: options.fetchImpl,
    missLogPath: path.join(options.goldenDir, "replay-misses.log"),
    log: options.log,
  });
  return {
    now,
    fixturesDir,
    restore: () => {
      restoreFetch();
      restoreClock();
    },
  };
}
