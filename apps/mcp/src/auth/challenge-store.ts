import { DurableObject } from "cloudflare:workers";
import type { AuthRequest } from "@cloudflare/workers-oauth-provider";

const OAUTH_USER_ID_KEY = "oauth-user-id";
export const OPAQUE_OAUTH_USER_ID = /^mcp_[0-9a-f]{64}$/;

const RECORD_KEY = "authorization-transaction";
const INTERNAL_ORIGIN = "https://authorization-transaction.internal";

export interface AuthorizationTransaction {
  approved?: boolean;
  browserSessionHash?: string;
  codeChallenge: string;
  codeVerifier: string;
  id: string;
  clientName: string;
  expirationTime: string;
  nonce: string;
  resource: string;
  scopes: string[];
  oauthRequest: AuthRequest;
}

export async function approveAuthorizationTransaction(
  namespace: DurableObjectNamespace,
  transactionId: string,
  browserSessionHash: string
): Promise<boolean> {
  const response = await transactionStub(namespace, transactionId).fetch(
    new Request(`${INTERNAL_ORIGIN}/transaction/approve`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ browserSessionHash }),
    })
  );
  if (
    response.status === 403 ||
    response.status === 404 ||
    response.status === 410
  ) {
    return false;
  }
  if (!response.ok)
    throw new Error("Could not approve authorization transaction.");
  return true;
}

function transactionStub(
  namespace: DurableObjectNamespace,
  transactionId: string
): DurableObjectStub {
  return namespace.get(namespace.idFromName(transactionId));
}

/** Separate objects retain a random ID for each Google subject/client pair. */
export async function getOAuthUserId(
  namespace: DurableObjectNamespace,
  subject: string,
  clientId: string
): Promise<string> {
  const name = `oauth-user:${JSON.stringify([subject, clientId])}`;
  const response = await transactionStub(namespace, name).fetch(
    new Request(`${INTERNAL_ORIGIN}/oauth-user`, { method: "POST" })
  );
  if (!response.ok) throw new Error("Could not resolve OAuth identity.");
  const userId = await response.text();
  if (!OPAQUE_OAUTH_USER_ID.test(userId)) {
    throw new Error("Invalid OAuth identity.");
  }
  return userId;
}

export async function createAuthorizationTransaction(
  namespace: DurableObjectNamespace,
  transaction: AuthorizationTransaction
): Promise<void> {
  const response = await transactionStub(namespace, transaction.id).fetch(
    new Request(`${INTERNAL_ORIGIN}/transaction`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(transaction),
    })
  );
  if (!response.ok) {
    throw new Error("Could not create authorization transaction.");
  }
}

export async function consumeAuthorizationTransaction(
  namespace: DurableObjectNamespace,
  transactionId: string
): Promise<AuthorizationTransaction | null> {
  const response = await transactionStub(namespace, transactionId).fetch(
    new Request(`${INTERNAL_ORIGIN}/transaction`, { method: "DELETE" })
  );
  if (response.status === 404 || response.status === 410) return null;
  if (!response.ok) {
    throw new Error("Could not consume authorization transaction.");
  }
  return response.json<AuthorizationTransaction>();
}

export async function readAuthorizationTransaction(
  namespace: DurableObjectNamespace,
  transactionId: string
): Promise<AuthorizationTransaction | null> {
  const response = await transactionStub(namespace, transactionId).fetch(
    new Request(`${INTERNAL_ORIGIN}/transaction`)
  );
  if (response.status === 404 || response.status === 410) return null;
  if (!response.ok) {
    throw new Error("Could not read authorization transaction.");
  }
  return response.json<AuthorizationTransaction>();
}

/**
 * The class name is retained because Durable Object migrations identify the
 * deployed class by name. Separate objects hold expiring OIDC transactions
 * or persistent opaque OAuth identities.
 */
export class WalletChallengeStore extends DurableObject<Env> {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/oauth-user" && request.method === "POST") {
      const userId = await this.ctx.storage.transaction(async (storage) => {
        const existing = await storage.get<string>(OAUTH_USER_ID_KEY);
        if (existing !== undefined) return existing;
        const bytes = crypto.getRandomValues(new Uint8Array(32));
        const created = `mcp_${Array.from(bytes, (byte) =>
          byte.toString(16).padStart(2, "0")
        ).join("")}`;
        await storage.put(OAUTH_USER_ID_KEY, created);
        return created;
      });
      return new Response(userId, { headers: { "cache-control": "no-store" } });
    }
    if (url.pathname === "/health" && request.method === "GET") {
      return new Response(null, { status: 204 });
    }
    if (url.pathname === "/transaction/approve" && request.method === "POST") {
      const { browserSessionHash } = await request.json<{
        browserSessionHash?: string;
      }>();
      const transaction =
        await this.ctx.storage.get<AuthorizationTransaction>(RECORD_KEY);
      if (!transaction) return new Response(null, { status: 404 });
      if (Date.parse(transaction.expirationTime) <= Date.now()) {
        await this.ctx.storage.delete(RECORD_KEY);
        await this.ctx.storage.deleteAlarm();
        return new Response(null, { status: 410 });
      }
      if (
        !browserSessionHash ||
        transaction.browserSessionHash !== browserSessionHash
      ) {
        return new Response(null, { status: 403 });
      }
      await this.ctx.storage.put(RECORD_KEY, {
        ...transaction,
        approved: true,
      });
      return new Response(null, { status: 204 });
    }
    if (url.pathname !== "/transaction") {
      return new Response("Not found", { status: 404 });
    }

    if (request.method === "PUT") {
      const existing = await this.ctx.storage.get(RECORD_KEY);
      if (existing !== undefined) {
        return new Response("Transaction already exists", { status: 409 });
      }
      const transaction = await request.json<AuthorizationTransaction>();
      const expirationMs = Date.parse(transaction.expirationTime);
      if (!Number.isFinite(expirationMs)) {
        return new Response("Invalid transaction", { status: 400 });
      }
      await this.ctx.storage.put(RECORD_KEY, transaction);
      await this.ctx.storage.setAlarm(Math.max(Date.now() + 1, expirationMs));
      return new Response(null, { status: 201 });
    }

    if (request.method === "DELETE") {
      const transaction =
        await this.ctx.storage.get<AuthorizationTransaction>(RECORD_KEY);
      if (!transaction) return new Response(null, { status: 404 });

      await this.ctx.storage.delete(RECORD_KEY);
      await this.ctx.storage.deleteAlarm();
      if (Date.parse(transaction.expirationTime) <= Date.now()) {
        return new Response(null, { status: 410 });
      }
      return Response.json(transaction);
    }

    if (request.method === "GET") {
      const transaction =
        await this.ctx.storage.get<AuthorizationTransaction>(RECORD_KEY);
      if (!transaction) return new Response(null, { status: 404 });
      if (Date.parse(transaction.expirationTime) <= Date.now()) {
        await this.ctx.storage.delete(RECORD_KEY);
        await this.ctx.storage.deleteAlarm();
        return new Response(null, { status: 410 });
      }
      return Response.json(transaction);
    }

    return new Response("Method not allowed", {
      status: 405,
      headers: { allow: "GET, PUT, DELETE" },
    });
  }

  async alarm(): Promise<void> {
    await this.ctx.storage.deleteAll();
  }
}
