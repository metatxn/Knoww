/**
 * Queue errors carry how long the work waited before it was dropped, so the
 * caller can report the wait. They are plain `Error` objects tagged by
 * `name`; narrow with the `is*` guards, never `instanceof`.
 */
export interface QueueWaitError<Name extends string> extends Error {
  readonly name: Name;
  readonly queueWaitMs: number;
}

export function queueWaitError<Name extends string>(
  name: Name,
  message: string,
  queueWaitMs: number
): QueueWaitError<Name> {
  const error = new Error(message) as Error & {
    name: Name;
    queueWaitMs: number;
  };
  error.name = name;
  error.queueWaitMs = queueWaitMs;
  return error;
}

export function isQueueWaitError<Name extends string>(
  value: unknown,
  name: Name
): value is QueueWaitError<Name> {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as { name?: unknown; queueWaitMs?: unknown };
  return candidate.name === name && typeof candidate.queueWaitMs === "number";
}
