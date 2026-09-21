import {
  type BoundedJsonError,
  readBoundedJson,
  readBoundedText,
} from "@knoww/shared-types/bounded-json";
import { describe, expect, it, vi } from "vitest";

describe("readBoundedJson", () => {
  it("parses a response whose bytes exactly match the limit", async () => {
    const body = JSON.stringify({ ok: true });
    const response = new Response(body, {
      headers: {
        "content-length": String(new TextEncoder().encode(body).length),
      },
    });

    await expect(
      readBoundedJson(response, new TextEncoder().encode(body).length)
    ).resolves.toEqual({ ok: true });
  });

  it("cancels a body whose declared length exceeds the limit", async () => {
    const cancel = vi.fn();
    const response = new Response(
      new ReadableStream({
        pull(controller) {
          controller.enqueue(new TextEncoder().encode("{}"));
        },
        cancel,
      }),
      { headers: { "content-length": "101" } }
    );

    await expect(readBoundedJson(response, 100)).rejects.toMatchObject({
      name: "BoundedJsonError",
      reason: "too_large",
    } satisfies Partial<BoundedJsonError>);
    expect(cancel).toHaveBeenCalledOnce();
  });

  it("counts streamed UTF-8 bytes and cancels chunked overflow", async () => {
    const cancel = vi.fn();
    const encoded = new TextEncoder().encode(JSON.stringify({ value: "€€" }));
    const response = new Response(
      new ReadableStream({
        start(controller) {
          controller.enqueue(encoded);
        },
        cancel,
      })
    );

    await expect(
      readBoundedJson(response, encoded.byteLength - 1)
    ).rejects.toMatchObject({ reason: "too_large" });
    expect(cancel).toHaveBeenCalledOnce();
  });

  it("distinguishes malformed JSON from oversized input", async () => {
    await expect(
      readBoundedJson(new Response("not-json"), 100)
    ).rejects.toMatchObject({
      name: "BoundedJsonError",
      reason: "invalid_json",
    } satisfies Partial<BoundedJsonError>);
  });

  it("bounds error text before returning it", async () => {
    const response = new Response("private diagnostics", {
      headers: { "content-length": "19" },
    });

    await expect(readBoundedText(response, 18)).rejects.toMatchObject({
      name: "BoundedJsonError",
      reason: "too_large",
    } satisfies Partial<BoundedJsonError>);
  });

  it("preserves abort identity while reading the body", async () => {
    const response = new Response(
      new ReadableStream({
        start(controller) {
          controller.error(new DOMException("Aborted", "AbortError"));
        },
      })
    );

    await expect(readBoundedJson(response, 100)).rejects.toMatchObject({
      name: "AbortError",
    });
  });
});
