import {
  isQueueWaitError,
  type QueueWaitError,
  queueWaitError,
} from "../queue-wait-error";
export const MAX_PENDING_RERANK_WORK = 8;
export const MAX_RERANK_QUEUE_WAIT_MS = 5_000;

export type RerankQueueSkipReason = "capacity" | "deadline" | "superseded";

export type RerankQueueCapacityError =
  QueueWaitError<"RerankQueueCapacityError">;

export function rerankQueueCapacityError(
  queueWaitMs = 0
): RerankQueueCapacityError {
  return queueWaitError(
    "RerankQueueCapacityError",
    "Pending rerank work was dropped to keep the queue bounded",
    queueWaitMs
  );
}

export function isRerankQueueCapacityError(
  value: unknown
): value is RerankQueueCapacityError {
  return isQueueWaitError(value, "RerankQueueCapacityError");
}

export type RerankSupersededError = QueueWaitError<"RerankSupersededError">;

export function rerankSupersededError(queueWaitMs = 0): RerankSupersededError {
  return queueWaitError(
    "RerankSupersededError",
    "Pending rerank work was superseded by a newer request",
    queueWaitMs
  );
}

export function isRerankSupersededError(
  value: unknown
): value is RerankSupersededError {
  return isQueueWaitError(value, "RerankSupersededError");
}

export type RerankQueueDeadlineError =
  QueueWaitError<"RerankQueueDeadlineError">;

export function rerankQueueDeadlineError(
  queueWaitMs = 0
): RerankQueueDeadlineError {
  return queueWaitError(
    "RerankQueueDeadlineError",
    "Pending rerank work expired before inference could start",
    queueWaitMs
  );
}

export function isRerankQueueDeadlineError(
  value: unknown
): value is RerankQueueDeadlineError {
  return isQueueWaitError(value, "RerankQueueDeadlineError");
}

export function getRerankQueueSkipDetails(error: unknown): {
  reason: RerankQueueSkipReason;
  queueWaitMs: number;
} | null {
  if (isRerankQueueCapacityError(error)) {
    return { reason: "capacity", queueWaitMs: error.queueWaitMs };
  }
  if (isRerankSupersededError(error)) {
    return { reason: "superseded", queueWaitMs: error.queueWaitMs };
  }
  if (isRerankQueueDeadlineError(error)) {
    return { reason: "deadline", queueWaitMs: error.queueWaitMs };
  }
  return null;
}

interface PendingRerankWork {
  requestKey: string | undefined;
  queuedAt: number;
  run: () => Promise<unknown>;
  resolve: (value: unknown) => void;
  reject: (reason: unknown) => void;
}

export function createRerankWorkQueue(
  options: { maximumPending?: number; maximumQueueWaitMs?: number } = {}
) {
  const maximumPending = options.maximumPending ?? MAX_PENDING_RERANK_WORK;
  const maximumQueueWaitMs =
    options.maximumQueueWaitMs ?? MAX_RERANK_QUEUE_WAIT_MS;
  if (!Number.isInteger(maximumPending) || maximumPending < 1) {
    throw new RangeError("maximumPending must be a positive integer");
  }
  if (!Number.isFinite(maximumQueueWaitMs) || maximumQueueWaitMs < 0) {
    throw new RangeError("maximumQueueWaitMs must be a non-negative number");
  }

  let running = false;
  let pending: PendingRerankWork[] = [];

  const rejectSupersededWork = (requestKey: string | undefined): void => {
    if (!requestKey) return;

    const retained: PendingRerankWork[] = [];
    for (const work of pending) {
      if (work.requestKey === requestKey) {
        work.reject(rerankSupersededError(Date.now() - work.queuedAt));
      } else {
        retained.push(work);
      }
    }
    pending = retained;
  };

  const startNext = (): void => {
    if (running) return;

    let next = pending.shift();
    while (next) {
      const queueWaitMs = Date.now() - next.queuedAt;
      if (queueWaitMs <= maximumQueueWaitMs) break;
      next.reject(rerankQueueDeadlineError(queueWaitMs));
      next = pending.shift();
    }
    if (!next) return;

    running = true;
    void (async () => {
      try {
        next.resolve(await next.run());
      } catch (error) {
        next.reject(error);
      } finally {
        running = false;
        startNext();
      }
    })();
  };

  return {
    enqueue<T>(
      requestKey: string | undefined,
      run: () => Promise<T>
    ): Promise<T> {
      return new Promise<T>((resolve, reject) => {
        rejectSupersededWork(requestKey);

        if (pending.length >= maximumPending) {
          const oldest = pending.shift();
          if (oldest) {
            oldest.reject(
              rerankQueueCapacityError(Date.now() - oldest.queuedAt)
            );
          }
        }

        pending.push({
          requestKey,
          queuedAt: Date.now(),
          run,
          resolve: (value) => resolve(value as T),
          reject,
        });
        startNext();
      });
    },

    snapshot(): { pending: number; running: boolean } {
      return { pending: pending.length, running };
    },
  };
}
