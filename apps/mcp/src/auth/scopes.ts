export const MARKETS_READ_SCOPE = "markets:read" as const;
export const FREE_MCP_PLAN = "free" as const;
export type McpPlan = typeof FREE_MCP_PLAN;

/**
 * Reserved for a later, separately reviewed x402 tool slice. This scope will
 * allow a client to attempt paid tools; it will never authorize Knoww to sign
 * a wallet payment or bypass verification of an x402 payment proof.
 */
export const FUTURE_X402_SCOPE = "x402:pay" as const;

export const ACTIVE_MCP_SCOPES = [MARKETS_READ_SCOPE] as const;

export type ActiveMcpScope = (typeof ACTIVE_MCP_SCOPES)[number];

/**
 * Reserved for the trading tools (ADR 2026-08-31, "MCP scopes"). Nothing
 * grants them yet: the OAuth flow rejects them as unsupported and the
 * development bypass never carries them, so every trading tool fails closed
 * with FORBIDDEN even when EXPOSE_TRADING_TOOLS is on. Granting one is a
 * separate, reviewed change that depends on caller identity (grilling Q1).
 */
export const ACCOUNT_READ_SCOPE = "account:read" as const;
export const ORDERS_READ_SCOPE = "orders:read" as const;
export const ORDERS_CREATE_SCOPE = "orders:create" as const;
export const ORDERS_CANCEL_SCOPE = "orders:cancel" as const;

export const RESERVED_TRADING_SCOPES = [
  ACCOUNT_READ_SCOPE,
  ORDERS_READ_SCOPE,
  ORDERS_CREATE_SCOPE,
  ORDERS_CANCEL_SCOPE,
] as const;

export type ReservedTradingScope = (typeof RESERVED_TRADING_SCOPES)[number];

/** Every scope a tool may demand: the granted ones plus the reserved ones. */
export type McpScope =
  | ActiveMcpScope
  | ReservedTradingScope
  | typeof FUTURE_X402_SCOPE;

const activeScopeSet = new Set<string>(ACTIVE_MCP_SCOPES);

export interface McpAuthProps {
  authMethod: "google-oidc";
  googleSubject: string;
  principalId: string;
  plan: McpPlan;
  scopes: ActiveMcpScope[];
}

export function resolveRequestedScopes(
  requested: readonly string[]
): ActiveMcpScope[] {
  const effective = requested.length === 0 ? ACTIVE_MCP_SCOPES : requested;
  const unique: ActiveMcpScope[] = [];
  for (const scope of effective) {
    if (!activeScopeSet.has(scope)) {
      throw new Error(`Unsupported OAuth scope: ${scope}`);
    }
    if (!unique.includes(scope as ActiveMcpScope)) {
      unique.push(scope as ActiveMcpScope);
    }
  }
  return unique;
}

export function hasScope(
  scopes: readonly string[],
  requiredScope: ActiveMcpScope
): boolean {
  return scopes.includes(requiredScope);
}

export function validateMcpAuthProps(value: unknown): McpAuthProps | null {
  if (typeof value !== "object" || value === null) return null;
  const candidate = value as Record<string, unknown>;
  if (candidate.authMethod !== "google-oidc") return null;
  if (candidate.plan !== FREE_MCP_PLAN) return null;
  if (
    typeof candidate.googleSubject !== "string" ||
    !/^[A-Za-z0-9_-]{1,255}$/.test(candidate.googleSubject)
  ) {
    return null;
  }
  if (!Array.isArray(candidate.scopes)) return null;
  const scopes: ActiveMcpScope[] = [];
  for (const scope of candidate.scopes) {
    if (typeof scope !== "string" || !activeScopeSet.has(scope)) return null;
    if (!scopes.includes(scope as ActiveMcpScope)) {
      scopes.push(scope as ActiveMcpScope);
    }
  }
  const principalId = `google-${candidate.googleSubject}`;
  if (candidate.principalId !== principalId) return null;

  return {
    authMethod: "google-oidc",
    googleSubject: candidate.googleSubject,
    principalId,
    plan: FREE_MCP_PLAN,
    scopes,
  };
}
