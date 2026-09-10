import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fixtureKey, pickStableHeaders } from "./normalize";

/**
 * Record/replay shim around the global fetch, installed by the server
 * instrumentation hook only when KNOWW_GOLDEN_MODE is set (see
 * src/instrumentation.ts). Record mode forwards the original request and
 * writes the upstream response as a fixture; replay mode serves fixtures and
 * passes misses through so a refactor that changes upstream calls shows up as
 * a logged miss rather than a silent network dependency.
 */
export type GoldenMode = "record" | "replay";

export type GoldenLog = (
  event: string,
  fields: Record<string, unknown>
) => void;

export interface GoldenFetchOptions {
  mode: GoldenMode;
  fixturesDir: string;
  /** Upstream fetch. Defaults to the global fetch at install time. */
  fetchImpl?: typeof fetch;
  /** Where replay misses are appended. Defaults to `<fixturesDir>/../replay-misses.log`. */
  missLogPath?: string;
  log?: GoldenLog;
}

interface RecordedRequest {
  method: string;
  url: string;
  body?: string;
}

interface RecordedFixture {
  request: RecordedRequest;
  response: {
    status: number;
    statusText: string;
    headers: Record<string, string>;
    body: string | null;
  };
}

const NULL_BODY_STATUSES = new Set([101, 204, 205, 304]);

const defaultLog: GoldenLog = (event, fields) => {
  console.warn(`[golden] ${event}`, fields);
};

function describeRequest(
  input: Parameters<typeof fetch>[0],
  init: RequestInit | undefined
): RecordedRequest {
  if (typeof Request !== "undefined" && input instanceof Request) {
    return {
      method: (init?.method ?? input.method).toUpperCase(),
      url: input.url,
    };
  }
  const rawBody = init?.body;
  const body =
    typeof rawBody === "string"
      ? rawBody
      : rawBody instanceof URLSearchParams
        ? rawBody.toString()
        : undefined;
  return {
    method: (init?.method ?? "GET").toUpperCase(),
    url: String(input),
    body,
  };
}

function fixturePath(fixturesDir: string, request: RecordedRequest): string {
  const key = fixtureKey(request.method, request.url, request.body);
  return path.join(fixturesDir, `${key}.json`);
}

async function readFixture(file: string): Promise<RecordedFixture | undefined> {
  try {
    return JSON.parse(await readFile(file, "utf8")) as RecordedFixture;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}

function toResponse(fixture: RecordedFixture): Response {
  const { status, statusText, headers, body } = fixture.response;
  return new Response(NULL_BODY_STATUSES.has(status) ? null : body, {
    status,
    statusText,
    headers,
  });
}

export function installGoldenFetch(options: GoldenFetchOptions): () => void {
  const previous = globalThis.fetch;
  const upstream = options.fetchImpl ?? previous;
  const log = options.log ?? defaultLog;
  const missLogPath =
    options.missLogPath ??
    path.join(options.fixturesDir, "..", "replay-misses.log");

  const record: typeof fetch = async (input, init) => {
    const request = describeRequest(input, init);
    const response = await upstream(input, init);
    const body = await response.clone().text();
    const fixture: RecordedFixture = {
      request,
      response: {
        status: response.status,
        statusText: response.statusText,
        headers: pickStableHeaders(response.headers),
        body,
      },
    };
    await mkdir(options.fixturesDir, { recursive: true });
    await writeFile(
      fixturePath(options.fixturesDir, request),
      `${JSON.stringify(fixture, null, 2)}\n`
    );
    return response;
  };

  const replay: typeof fetch = async (input, init) => {
    const request = describeRequest(input, init);
    const fixture = await readFixture(
      fixturePath(options.fixturesDir, request)
    );
    if (fixture) {
      return toResponse(fixture);
    }
    log("golden.replay_miss", { method: request.method, url: request.url });
    await appendFile(missLogPath, `${request.method} ${request.url}\n`);
    return upstream(input, init);
  };

  globalThis.fetch = options.mode === "record" ? record : replay;
  return () => {
    globalThis.fetch = previous;
  };
}
