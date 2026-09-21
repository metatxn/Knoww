import {
  type AgentD1Database,
  type AgentRepository,
  createAgentRepository,
} from "@knoww/agent/repository";
import { createLogger } from "@knoww/logger";
import { getCloudflareContext } from "@opennextjs/cloudflare";

const log = createLogger("agent.repository");

interface AgentDbEnv {
  AGENT_DB?: D1Database;
}

let warnedMemoryFallback = false;

export interface DurableAgentRepositoryUnavailableError extends Error {
  readonly name: "DurableAgentRepositoryUnavailableError";
}

export function durableAgentRepositoryUnavailableError(): DurableAgentRepositoryUnavailableError {
  const error = new Error("Durable agent repository unavailable") as Error & {
    name: "DurableAgentRepositoryUnavailableError";
  };
  error.name = "DurableAgentRepositoryUnavailableError";
  return error;
}

export function isDurableAgentRepositoryUnavailableError(
  value: unknown
): value is DurableAgentRepositoryUnavailableError {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { name?: unknown }).name ===
      "DurableAgentRepositoryUnavailableError"
  );
}

export async function getAgentRepository(options?: {
  requireDurable?: boolean;
}): Promise<AgentRepository> {
  try {
    const { env } = await getCloudflareContext({ async: true });
    const db = (env as AgentDbEnv).AGENT_DB;
    if (db) return createAgentRepository(db as AgentD1Database);
  } catch (error) {
    if (!warnedMemoryFallback) {
      log.error("d1.context.unavailable", { error });
      warnedMemoryFallback = true;
    }
  }
  if (options?.requireDurable) {
    throw durableAgentRepositoryUnavailableError();
  }
  return createAgentRepository();
}
