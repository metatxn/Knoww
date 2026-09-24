import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { middleware } from "./middleware";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("middleware security headers", () => {
  it("applies the same signing policy when credentials HTML is served as a static asset", () => {
    const headers = readFileSync(
      resolve(process.cwd(), "public/_headers"),
      "utf8"
    );
    const block =
      headers
        .match(
          /^\/extension-credentials\.html\r?\n((?:[ \t]+[^\n]*\r?\n?)*)/m
        )?.[1]
        ?.split("\n") ?? [];
    const staticPolicy = block
      .find((line) => line.trim().startsWith("Content-Security-Policy:"))
      ?.trim()
      .slice("Content-Security-Policy:".length)
      .trim();
    const response = middleware(
      new NextRequest("https://knoww.app/extension-credentials.html")
    );
    expect(staticPolicy).toBe(response.headers.get("Content-Security-Policy"));
  });
  it("keeps the extension signing page free of site scripts and network access", () => {
    const response = middleware(
      new NextRequest("https://knoww.app/extension-credentials.html")
    );
    const policy = response.headers.get("Content-Security-Policy");
    expect(policy).toContain("default-src 'none'");
    expect(policy).toContain("script-src chrome-extension:");
    expect(policy).toContain("script-src-attr 'none'");
    expect(policy).toContain("frame-ancestors 'none'");
    expect(policy).not.toContain("script-src 'self'");
    expect(policy).not.toContain("connect-src");
  });

  it("allows packaged extension frames only on the extension setup page", () => {
    const setup = middleware(
      new NextRequest("https://knoww.app/extension/connect")
    );
    const home = middleware(new NextRequest("https://knoww.app/"));
    expect(setup.headers.get("Content-Security-Policy")).toContain(
      "frame-src 'self' chrome-extension:"
    );
    expect(home.headers.get("Content-Security-Policy")).not.toContain(
      "chrome-extension:"
    );
  });
  it("allows managed PostHog proxy scripts and event requests", () => {
    const response = middleware(new NextRequest("https://knoww.app/"));
    const directives = (response.headers.get("Content-Security-Policy") ?? "")
      .split(";")
      .map((directive) => directive.trim().split(/\s+/));

    expect(directives.find(([name]) => name === "script-src")).toContain(
      "https://a.knoww.app"
    );
    expect(directives.find(([name]) => name === "connect-src")).toContain(
      "https://*.knoww.app"
    );
  });

  it("does not emit obsolete Permissions-Policy features", () => {
    const request = new NextRequest("https://knoww.app/");
    const response = middleware(request);

    const permissionsPolicy = response.headers.get("Permissions-Policy");
    expect(permissionsPolicy).toContain("camera=()");
    expect(permissionsPolicy).toContain("microphone=()");
    expect(permissionsPolicy).toContain("geolocation=()");
    expect(permissionsPolicy).not.toContain("interest-cohort");
  });

  it("marks API responses as noindex without blocking crawler rendering", () => {
    const request = new NextRequest("https://knoww.app/api/events/test-slug");
    const response = middleware(request);

    expect(response.headers.get("X-Robots-Tag")).toBe("noindex, nofollow");
  });

  it("allows the documented local MCP origins on the test console in development", () => {
    vi.stubEnv("NODE_ENV", "development");
    const request = new NextRequest("http://localhost:8010/mcp-test");
    const response = middleware(request);

    const policy = response.headers.get("Content-Security-Policy");
    expect(policy).toContain("http://127.0.0.1:8787");
    expect(policy).toContain("http://localhost:8787");
  });

  it("does not allow local MCP origins on other routes", () => {
    vi.stubEnv("NODE_ENV", "development");
    const request = new NextRequest("http://localhost:8010/markets");
    const response = middleware(request);

    const policy = response.headers.get("Content-Security-Policy");
    expect(policy).not.toContain("http://127.0.0.1:8787");
    expect(policy).not.toContain("http://localhost:8787");
  });
});
