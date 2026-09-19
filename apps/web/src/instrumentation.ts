/**
 * Next server instrumentation hook, run once per server start in each
 * runtime. Everything Node-only stays inside the runtime check: webpack
 * prunes that block from the edge bundle, so the golden harness's node:
 * imports never reach it.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { registerGoldenHarness } = await import("./lib/golden/register");
    await registerGoldenHarness(process.env);
  }
}
