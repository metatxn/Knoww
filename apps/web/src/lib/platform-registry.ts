import {
  createPlatformRegistry,
  type PlatformRegistry,
  readCacheHint,
  type ServiceRequestInit,
} from "@knoww/services/registry";

interface NextCacheOptions {
  revalidate?: number | false;
  tags?: string[];
}

/**
 * Fetch handed to every platform adapter in the web app. Adapters attach the
 * caller's cache hint to the request init (`knowwCache`); this fetch strips
 * it and maps it onto Next's `next.revalidate` / `next.tags` so server
 * components and route handlers keep ISR and tag semantics. Platform clients
 * set `init.cache` themselves (the Gamma client sends `no-store`), so a hint,
 * which only a caller can set, replaces that mode; without a hint the init is
 * passed through untouched. The global fetch is read on every call so test
 * stubs and Next's own patching both apply.
 */
export const nextAwareFetch: typeof fetch = (input, init) => {
  const hint = readCacheHint(init);
  if (!hint || (hint.revalidateSeconds === undefined && !hint.tags)) {
    return fetch(input, init);
  }

  const {
    knowwCache: _hint,
    cache: _mode,
    ...rest
  } = (init ?? {}) as ServiceRequestInit;
  if (hint.revalidateSeconds === 0) {
    return fetch(input, { ...rest, cache: "no-store" });
  }

  const next: NextCacheOptions = { ...rest.next };
  if (hint.revalidateSeconds !== undefined) {
    next.revalidate = hint.revalidateSeconds;
  }
  if (hint.tags) {
    next.tags = hint.tags;
  }
  return fetch(input, { ...rest, next });
};

let instance: PlatformRegistry | undefined;

/** The web app's registry: one instance, built with the Next-aware fetch. */
export function getPlatformRegistry(): PlatformRegistry {
  instance ??= createPlatformRegistry({ fetchImpl: nextAwareFetch });
  return instance;
}
