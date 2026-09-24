// @vitest-environment node
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  issueExtensionSessionToken,
  requireExtensionSession,
  revokeExtensionSession,
  verifyExtensionSessionToken,
} from "./extension-session";

const storage = vi.hoisted(() => ({
  kind: "memory" as "memory" | "r2",
  objects: new Map<string, string>(),
  failDeletes: false,
}));

vi.mock("@opennextjs/cloudflare", () => ({
  getCloudflareContext: async () => ({
    env:
      storage.kind === "r2"
        ? {
            NEXT_INC_CACHE_R2_BUCKET: {
              get: async (key: string) => {
                const value = storage.objects.get(key);
                return value ? { json: async () => JSON.parse(value) } : null;
              },
              put: async (key: string, value: string) => {
                storage.objects.set(key, value);
              },
              delete: async (key: string) => {
                if (storage.failDeletes) throw new Error("Storage unavailable");
                storage.objects.delete(key);
              },
            },
          }
        : {},
  }),
}));

const wallet = {
  address: "0x0000000000000000000000000000000000000001",
  chainId: 137,
};

function issueRelayerSession() {
  return issueExtensionSessionToken({ ...wallet, scope: ["relayer:submit"] });
}

async function expectAuthorized(token: string) {
  const result = await requireExtensionSession(
    new NextRequest("https://knoww.app/api/polymarket/relayer/nonce", {
      headers: { authorization: `Bearer ${token}` },
    }),
    "relayer:submit"
  );
  expect(result.response).toBeNull();
  expect(result.session?.sub).toBe(wallet.address);
}

describe.each(["memory", "r2"] as const)(
  "relayer sessions with %s storage",
  (kind) => {
    beforeEach(() => {
      storage.kind = kind;
      storage.objects.clear();
      storage.failDeletes = false;
      vi.stubEnv("EXTENSION_SESSION_SECRET", "test-only-session-secret");
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-09-24T00:00:00Z"));
    });

    afterEach(() => {
      vi.restoreAllMocks();
      vi.useRealTimers();
      vi.unstubAllEnvs();
    });

    it.each([false, true])(
      "keeps both tabs authorized when registration overlaps: %s",
      async (overlap) => {
        const sessions = overlap
          ? await Promise.all([issueRelayerSession(), issueRelayerSession()])
          : [await issueRelayerSession(), await issueRelayerSession()];

        expect(sessions[0].claims.jti).not.toBe(sessions[1].claims.jti);
        for (const session of sessions) await expectAuthorized(session.token);
      }
    );

    it("revokes only the replaced session while preserving other tabs", async () => {
      const firstTab = await issueRelayerSession();
      const otherTab = await issueRelayerSession();
      const replacement = await issueRelayerSession();

      await revokeExtensionSession(firstTab.claims);
      expect(await verifyExtensionSessionToken(firstTab.token)).toBeNull();
      await expectAuthorized(otherTab.token);
      await expectAuthorized(replacement.token);

      await revokeExtensionSession(replacement.claims);
      expect(await verifyExtensionSessionToken(replacement.token)).toBeNull();
      await expectAuthorized(otherTab.token);
    });

    it("expires and cleans up one session without invalidating another tab", async () => {
      const firstTab = await issueRelayerSession();
      vi.setSystemTime(Date.now() + 60_000);
      const otherTab = await issueRelayerSession();
      vi.setSystemTime(firstTab.claims.exp);

      expect(await verifyExtensionSessionToken(firstTab.token)).toBeNull();
      const replacement = await issueRelayerSession();
      await revokeExtensionSession(firstTab.claims);

      await expectAuthorized(otherTab.token);
      await expectAuthorized(replacement.token);
    });

    it("deletes expired session and subject records during verification", async () => {
      const expired = await issueRelayerSession();
      vi.setSystemTime(Date.now() + 60_000);
      const live = await issueRelayerSession();
      vi.setSystemTime(expired.claims.exp);
      const deleteSpy = vi.spyOn(Map.prototype, "delete");
      const sessionKey = `extension-sessions/v1/records/${expired.claims.jti}.json`;
      const subjectKey = `extension-sessions/v1/subjects/${expired.claims.sub}-relayer-${expired.claims.jti}.json`;

      expect(await verifyExtensionSessionToken(expired.token)).toBeNull();

      expect(deleteSpy).toHaveBeenCalledWith(sessionKey);
      expect(deleteSpy).toHaveBeenCalledWith(subjectKey);
      if (kind === "r2") {
        expect(storage.objects.has(sessionKey)).toBe(false);
        expect(storage.objects.has(subjectKey)).toBe(false);
      }
      await expectAuthorized(live.token);

      const setSpy = vi.spyOn(Map.prototype, "set");
      await revokeExtensionSession(expired.claims);
      expect(
        setSpy.mock.calls.some(
          ([key]) => key === sessionKey || key === subjectKey
        )
      ).toBe(false);
      await expectAuthorized(live.token);
    });

    it("does not clean up records for an expired token with an invalid signature", async () => {
      const session = await issueRelayerSession();
      vi.setSystemTime(session.claims.exp);
      const [payload, signature] = session.token.split(".");
      const invalidSignature = `${signature[0] === "a" ? "b" : "a"}${signature.slice(1)}`;
      const deleteSpy = vi.spyOn(Map.prototype, "delete");

      expect(
        await verifyExtensionSessionToken(`${payload}.${invalidSignature}`)
      ).toBeNull();
      expect(deleteSpy).not.toHaveBeenCalledWith(
        `extension-sessions/v1/subjects/${session.claims.sub}-relayer-${session.claims.jti}.json`
      );
    });

    it("preserves a newer extension subject record when checking an expired token", async () => {
      const expired = await issueExtensionSessionToken(wallet);
      vi.setSystemTime(Date.now() + 60_000);
      const replacement = await issueExtensionSessionToken(wallet);
      vi.setSystemTime(expired.claims.exp);
      const deleteSpy = vi.spyOn(Map.prototype, "delete");

      expect(await verifyExtensionSessionToken(expired.token)).toBeNull();
      await revokeExtensionSession(expired.claims);

      expect(deleteSpy).not.toHaveBeenCalledWith(
        `extension-sessions/v1/subjects/${wallet.address}.json`
      );
      await expectAuthorized(replacement.token);
    });

    if (kind === "r2") {
      it("still rejects an expired token when cleanup fails and retries cleanup later", async () => {
        const session = await issueRelayerSession();
        vi.setSystemTime(session.claims.exp);
        storage.failDeletes = true;
        await expect(
          verifyExtensionSessionToken(session.token)
        ).resolves.toBeNull();

        storage.failDeletes = false;
        expect(await verifyExtensionSessionToken(session.token)).toBeNull();
        expect(storage.objects.size).toBe(0);
      });
    }

    it("preserves extension session replacement without revoking relayer tabs", async () => {
      const extension = await issueExtensionSessionToken(wallet);
      const firstTab = await issueRelayerSession();
      const otherTab = await issueRelayerSession();
      const replacement = await issueExtensionSessionToken(wallet);

      expect(await verifyExtensionSessionToken(extension.token)).toBeNull();
      await revokeExtensionSession(extension.claims);
      await expectAuthorized(replacement.token);
      await expectAuthorized(firstTab.token);
      await expectAuthorized(otherTab.token);
    });
  }
);
