import { afterEach, beforeEach, expect, it, vi } from "vitest";

const values: Record<string, unknown> = {};
beforeEach(() => {
  vi.stubGlobal("__DEV_MODE__", false);
  vi.stubGlobal("chrome", {
    storage: {
      session: {
        get: (key: string, callback: (data: unknown) => void) =>
          queueMicrotask(() => callback({ [key]: values[key] })),
        set: (data: Record<string, unknown>, callback: () => void) => {
          Object.assign(values, data);
          queueMicrotask(callback);
        },
        remove: (key: string, callback: () => void) => {
          delete values[key];
          queueMicrotask(callback);
        },
      },
    },
  });
});
afterEach(() => {
  for (const key of Object.keys(values)) delete values[key];
  vi.unstubAllGlobals();
  vi.resetModules();
});

it("keeps a newly signed-in session when an old request returns 401", async () => {
  const session = await import("../../src/background/extension-session");
  await session.setExtensionAccessToken("old-test-session");
  const oldHeader = await session.getExtensionAuthorizationHeader();
  await session.setExtensionAccessToken("new-test-session");
  await session.clearExtensionAccessToken(oldHeader);
  expect(await session.getExtensionAccessToken()).toBe("new-test-session");
});

it("does not clear the session for a request sent without its bearer", async () => {
  const session = await import("../../src/background/extension-session");
  await session.setExtensionAccessToken("new-test-session");
  await session.clearExtensionAccessToken(null);
  expect(await session.getExtensionAccessToken()).toBe("new-test-session");
});

it("clears a rejected current session and still allows explicit logout", async () => {
  const session = await import("../../src/background/extension-session");
  await session.setExtensionAccessToken("old-test-session");
  await session.clearExtensionAccessToken("Bearer old-test-session");
  expect(await session.getExtensionAccessToken()).toBe(null);
  await session.setExtensionAccessToken("new-test-session");
  await session.clearExtensionAccessToken();
  expect(await session.getExtensionAccessToken()).toBe(null);
});

it("reports an expired session before a trading signature is requested", async () => {
  const session = await import("../../src/background/extension-session");
  const address = `0x${"1".repeat(40)}`;
  const token = (exp: number) =>
    `${btoa(JSON.stringify({ sub: address, exp }))}.test-signature`;
  await session.setExtensionAccessToken(token(Date.now() - 1));
  expect(await session.getExtensionSessionInfo()).toEqual({
    loggedIn: false,
    address,
  });
  await session.setExtensionAccessToken(token(Date.now() + 60000));
  expect(await session.getExtensionSessionInfo()).toEqual({
    loggedIn: true,
    address,
  });
});
