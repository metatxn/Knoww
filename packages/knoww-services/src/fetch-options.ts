/**
 * Cache hint carried on the request init. Services never import Next; an
 * injected fetch (see the web app) reads the hint with `readCacheHint` and
 * maps it onto its own cache options. Plain fetch ignores the extra key.
 */
export interface ServiceCacheHint {
  revalidateSeconds?: number;
  tags?: string[];
}

export interface ServiceRequestInit extends RequestInit {
  knowwCache?: ServiceCacheHint;
}

export interface ServiceFetchOptions {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  signal?: AbortSignal;
  cache?: ServiceCacheHint;
}

export function readCacheHint(
  init: RequestInit | undefined
): ServiceCacheHint | undefined {
  return (init as ServiceRequestInit | undefined)?.knowwCache;
}

function withCacheHint(
  fetchImpl: typeof fetch,
  cache: ServiceCacheHint | undefined
): typeof fetch {
  if (!cache) return fetchImpl;
  return (input, init) => {
    const hinted: ServiceRequestInit = { ...init, knowwCache: cache };
    return fetchImpl(input, hinted);
  };
}

function abortReason(signal: AbortSignal): unknown {
  return (
    signal.reason ?? new DOMException("The request was aborted", "AbortError")
  );
}

/**
 * Combines the caller's cancellation signal with a bounded upstream timeout.
 * The timer remains active until both the response and its body have been read.
 */
export async function withUpstreamTimeout<T>(
  options: ServiceFetchOptions | undefined,
  defaultTimeoutMs: number,
  run: (fetchImpl: typeof fetch, signal: AbortSignal) => Promise<T>
): Promise<T> {
  const fetchImpl = withCacheHint(options?.fetchImpl ?? fetch, options?.cache);
  const controller = new AbortController();
  const callerSignal = options?.signal;

  if (callerSignal?.aborted) {
    throw abortReason(callerSignal);
  }

  const abortFromCaller = () => {
    if (callerSignal) {
      controller.abort(abortReason(callerSignal));
    }
  };

  callerSignal?.addEventListener("abort", abortFromCaller, { once: true });
  const timeoutId = setTimeout(
    () => controller.abort(),
    options?.timeoutMs ?? defaultTimeoutMs
  );

  try {
    return await run(fetchImpl, controller.signal);
  } finally {
    clearTimeout(timeoutId);
    callerSignal?.removeEventListener("abort", abortFromCaller);
  }
}
