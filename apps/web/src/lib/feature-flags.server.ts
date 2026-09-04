import { getCloudflareContext } from "@opennextjs/cloudflare";
import { headers } from "next/headers";
import {
  evaluateFeatureFlags,
  type FeatureFlags,
  type FeatureFlagsEnvironment,
  type RequestLocationCf,
  readRequestLocation,
} from "@/lib/feature-flags";
import { getPlatformRegistry } from "@/lib/platform-registry";

async function readCf(): Promise<RequestLocationCf | undefined> {
  try {
    const { cf } = await getCloudflareContext({ async: true });
    return cf;
  } catch {
    // Outside the Workers runtime (next dev, tests) there is no cf object.
    return undefined;
  }
}

/** Evaluates the request's feature flags. Server components only. */
export async function readFeatureFlags(): Promise<FeatureFlags> {
  const requestHeaders = await headers();
  return evaluateFeatureFlags({
    registry: getPlatformRegistry(),
    location: readRequestLocation(requestHeaders, await readCf()),
    environment: (process.env.NODE_ENV ??
      "development") as FeatureFlagsEnvironment,
  });
}
