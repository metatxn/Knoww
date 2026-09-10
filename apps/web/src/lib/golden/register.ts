import path from "node:path";
import { type GoldenHarness, installGoldenHarness } from "./harness";

/**
 * Wires the golden harness from the environment. The server instrumentation
 * hook calls this in the Node runtime only. With KNOWW_GOLDEN_MODE unset
 * (every production start) it does nothing.
 */
export async function registerGoldenHarness(
  env: Record<string, string | undefined>
): Promise<GoldenHarness | undefined> {
  const mode = env.KNOWW_GOLDEN_MODE;
  if (!mode) return undefined;
  if (mode !== "record" && mode !== "replay") {
    throw new Error(
      `KNOWW_GOLDEN_MODE must be "record" or "replay", got "${mode}"`
    );
  }
  const goldenDir = env.KNOWW_GOLDEN_DIR ?? path.join(process.cwd(), "golden");
  const harness = await installGoldenHarness({ mode, goldenDir });
  console.warn(
    `[golden] ${mode} mode: clock pinned to ${harness.now.toISOString()}, fixtures in ${harness.fixturesDir}`
  );
  return harness;
}
