export type BoundedJsonErrorReason = "too_large" | "invalid_json";
export const DEFAULT_UPSTREAM_ERROR_MAX_BYTES = 64 * 1024;
export const DEFAULT_UPSTREAM_JSON_MAX_BYTES = 4 * 1024 * 1024;

interface BoundedJsonReader {
  read(): Promise<{ done: boolean; value?: Uint8Array }>;
  cancel(): Promise<void>;
}

interface BoundedJsonBody {
  getReader(): BoundedJsonReader;
  cancel(): Promise<void>;
}

export interface BoundedJsonResponse {
  readonly headers: { get(name: string): string | null };
  readonly body: BoundedJsonBody | null;
}

export class BoundedJsonError extends Error {
  readonly reason: BoundedJsonErrorReason;

  constructor(reason: BoundedJsonErrorReason) {
    super(
      reason === "too_large"
        ? "Response body exceeded its byte limit"
        : "Response body contained malformed JSON"
    );
    this.name = "BoundedJsonError";
    this.reason = reason;
  }
}

async function readBoundedBytes(
  response: BoundedJsonResponse,
  maxBytes: number
): Promise<Uint8Array> {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) {
    throw new RangeError("maxBytes must be a positive safe integer");
  }

  const contentLength = response.headers.get("content-length");
  if (
    contentLength !== null &&
    /^\d+$/u.test(contentLength) &&
    BigInt(contentLength) > BigInt(maxBytes)
  ) {
    await response.body?.cancel();
    throw new BoundedJsonError("too_large");
  }
  if (!response.body) return new Uint8Array();

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    totalBytes += value.byteLength;
    if (totalBytes > maxBytes) {
      await reader.cancel();
      throw new BoundedJsonError("too_large");
    }
    chunks.push(value);
  }

  const body = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return body;
}

function decodeBody(body: Uint8Array): string {
  const Decoder = (
    globalThis as unknown as {
      TextDecoder: new () => { decode(input: Uint8Array): string };
    }
  ).TextDecoder;
  return new Decoder().decode(body);
}

/** Read text without letting an upstream response allocate unbounded memory. */
export async function readBoundedText(
  response: BoundedJsonResponse,
  maxBytes: number
): Promise<string> {
  return decodeBody(await readBoundedBytes(response, maxBytes));
}

/** Read and parse JSON without letting an upstream response allocate unbounded memory. */
export async function readBoundedJson(
  response: BoundedJsonResponse,
  maxBytes: number
): Promise<unknown> {
  const body = await readBoundedText(response, maxBytes);
  try {
    return JSON.parse(body);
  } catch {
    throw new BoundedJsonError("invalid_json");
  }
}
