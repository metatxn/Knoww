// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  detectBodyKind,
  fixtureKey,
  normalizeBody,
  normalizeHtml,
  normalizeJson,
  pickStableHeaders,
} from "./normalize";

describe("fixtureKey", () => {
  it("is a sha256 hex digest that is stable for the same request", () => {
    const key = fixtureKey("get", "https://gamma.test/events/1");
    expect(key).toMatch(/^[0-9a-f]{64}$/);
    expect(fixtureKey("GET", "https://gamma.test/events/1")).toBe(key);
  });

  it("changes with the method, the url or the body", () => {
    const base = fixtureKey("GET", "https://gamma.test/events/1");
    expect(fixtureKey("POST", "https://gamma.test/events/1")).not.toBe(base);
    expect(fixtureKey("GET", "https://gamma.test/events/2")).not.toBe(base);
    expect(fixtureKey("GET", "https://gamma.test/events/1", "q=1")).not.toBe(
      base
    );
  });

  it("gives the same query parameters the same key in any order", () => {
    const legacyOrder =
      "https://gamma.test/events/keyset?limit=20&closed=false&order=volume24hr&ascending=false&tag_slug=politics";
    const servicesOrder =
      "https://gamma.test/events/keyset?limit=20&closed=false&tag_slug=politics&order=volume24hr&ascending=false";
    expect(fixtureKey("GET", legacyOrder)).toBe(
      fixtureKey("GET", servicesOrder)
    );
    expect(fixtureKey("GET", legacyOrder)).not.toBe(
      fixtureKey("GET", legacyOrder.replace("politics", "nfl"))
    );
  });
});

describe("pickStableHeaders", () => {
  it("drops volatile headers and returns the rest lowercased and sorted", () => {
    const headers = new Headers({
      "X-Custom": "1",
      "Content-Type": "application/json",
      Date: "Thu, 03 Sep 2026 12:00:00 GMT",
      "CF-Ray": "8c0-SJC",
      "Content-Length": "12",
      "Set-Cookie": "a=b",
    });

    expect(pickStableHeaders(headers)).toEqual({
      "content-type": "application/json",
      "x-custom": "1",
    });
    expect(Object.keys(pickStableHeaders(headers))).toEqual([
      "content-type",
      "x-custom",
    ]);
  });
});

describe("normalizeJson", () => {
  it("sorts keys at every depth and pretty-prints", () => {
    expect(normalizeJson('{"b":1,"a":{"d":[{"z":1,"y":2}],"c":null}}')).toBe(
      JSON.stringify({ a: { c: null, d: [{ y: 2, z: 1 }] }, b: 1 }, null, 2)
    );
  });

  it("masks millisecond ISO timestamps and keeps market dates", () => {
    const out = normalizeJson(
      JSON.stringify({
        fetchedAt: "2026-09-03T12:00:00.123Z",
        endDate: "2026-09-16T00:00:00Z",
        startDate: "2026-05-13T21:23:09.737806Z",
      })
    );

    expect(out).toContain('"fetchedAt": "<timestamp>"');
    expect(out).toContain('"endDate": "2026-09-16T00:00:00Z"');
    expect(out).toContain('"startDate": "2026-05-13T21:23:09.737806Z"');
  });

  it("returns text that is not JSON unchanged", () => {
    expect(normalizeJson("<!doctype html>")).toBe("<!doctype html>");
  });
});

describe("normalizeHtml", () => {
  it("masks hashed static assets, CSP nonces and millisecond timestamps", () => {
    const html = [
      '<script nonce="n0nce123" src="/_next/static/chunks/main-app-9f8e7d.js"></script>',
      '<link rel="stylesheet" href="/_next/static/css/app-1a2b3c.css">',
      'self.__next_f.push([1,"\\"static/chunks/app/page-4d5e6f.js\\""])',
      "<time>2026-09-03T12:00:00.000Z</time>",
      '<a href="/events/detail/fed-decision-in-september-762">Fed</a>',
    ].join("\n");

    const out = normalizeHtml(html);

    expect(out).toContain('nonce="<nonce>"');
    expect(out).not.toContain("n0nce123");
    expect(out).not.toContain("main-app-9f8e7d.js");
    expect(out).not.toContain("app-1a2b3c.css");
    expect(out).not.toContain("page-4d5e6f.js");
    expect(out).toContain("<time><timestamp></time>");
    expect(out).toContain("/events/detail/fed-decision-in-september-762");
  });

  it("joins flight pushes so the streaming split point cannot change the output", () => {
    const head =
      '<script>self.__next_f.push([1,"a:[\\"$\\",\\"span\\",null,{\\"children\\":';
    const tail = '\\"41¢\\"}]\\n"])</script>';
    const unsplit = `${head}${tail}`;
    const splitEarly = `${head}"])</script><script>self.__next_f.push([1,"${tail}`;
    const splitLate = `${head}\\"41¢\\""])</script><script>self.__next_f.push([1,"}]\\n"])</script>`;

    expect(normalizeHtml(splitEarly)).toBe(normalizeHtml(unsplit));
    expect(normalizeHtml(splitLate)).toBe(normalizeHtml(unsplit));
    expect(normalizeHtml(splitEarly)).not.toContain("</script><script>");
  });

  it("masks webpack chunk ids in flight module references and keeps module ids", () => {
    const html =
      'self.__next_f.push([1,"5:I[3620,[\\"238\\",\\"static/chunks/238-9f8e7d.js\\",\\"1753\\",\\"static/chunks/app/page-4d5e6f.js\\"],\\"LandingShell\\"]\\n"])';

    const out = normalizeHtml(html);

    expect(out).toContain(
      '5:I[3620,[\\"<chunk>\\",\\"static/<asset>\\",\\"<chunk>\\",\\"static/<asset>\\"],\\"LandingShell\\"]'
    );
    expect(out).not.toContain("1753");
  });

  it("masks the Next build id in the doctype comment and the flight payload", () => {
    const html = [
      '<!DOCTYPE html><!--1_dSG4NimAXynRHkVY4E9--><html lang="en">',
      'self.__next_f.push([1,"0:{\\"P\\":null,\\"b\\":\\"1_dSG4NimAXynRHkVY4E9\\",\\"p\\":\\"\\"}"])',
      "<!--$--><span>hydration markers stay</span><!--/$-->",
    ].join("\n");

    const out = normalizeHtml(html);

    expect(out).toContain("<!DOCTYPE html><!--<build-id>--><html");
    expect(out).toContain('\\"b\\":\\"<build-id>\\",\\"p\\"');
    expect(out).not.toContain("1_dSG4NimAXynRHkVY4E9");
    expect(out).toContain(
      "<!--$--><span>hydration markers stay</span><!--/$-->"
    );
  });
});

describe("normalizeBody and detectBodyKind", () => {
  it("dispatches on the body kind", () => {
    expect(normalizeBody("json", '{"b":1,"a":2}')).toBe(
      JSON.stringify({ a: 2, b: 1 }, null, 2)
    );
    expect(normalizeBody("html", '<p nonce="x"></p>')).toBe(
      '<p nonce="<nonce>"></p>'
    );
    expect(normalizeBody("text", "at 2026-09-03T12:00:00.000Z")).toBe(
      "at <timestamp>"
    );
  });

  it("detects the kind from the content type", () => {
    expect(detectBodyKind("application/json; charset=utf-8")).toBe("json");
    expect(detectBodyKind("text/html; charset=utf-8")).toBe("html");
    expect(detectBodyKind("text/plain")).toBe("text");
    expect(detectBodyKind(null)).toBe("text");
  });
});
