/**
 * Trading Session Persistence
 *
 * Handles storing and retrieving trading session data from localStorage.
 * This ensures users don't have to re-onboard on every page refresh.
 *
 * Reference: https://github.com/Polymarket/wagmi-safe-builder-example
 */

/**
 * Trading session data structure
 */
export interface StoredTradingSession {
  eoaAddress: string;
  safeAddress: string;
  hasApprovals: boolean;
  lastUpdated: number; // Unix timestamp
}

/**
 * Session storage key prefix
 */
const SESSION_STORAGE_KEY = "polymarket_trading_session";

/**
 * Session expiration time (7 days in milliseconds)
 */
const SESSION_EXPIRATION = 7 * 24 * 60 * 60 * 1000;

/**
 * Get the storage key for a specific address
 */
function getStorageKey(address: string): string {
  return `${SESSION_STORAGE_KEY}_${address.toLowerCase()}`;
}

/**
 * Get stored trading session for an address
 */
export function getStoredSession(address: string): StoredTradingSession | null {
  if (typeof window === "undefined") return null;

  try {
    const key = getStorageKey(address);
    const stored = localStorage.getItem(key);

    if (!stored) return null;

    const session = JSON.parse(stored) as StoredTradingSession;

    // Check if session has expired
    const now = Date.now();
    if (now - session.lastUpdated > SESSION_EXPIRATION) {
      // Session expired, remove it
      localStorage.removeItem(key);
      return null;
    }

    // Verify the session is for the correct address
    if (session.eoaAddress.toLowerCase() !== address.toLowerCase()) {
      return null;
    }

    return session;
  } catch {
    // Ignore parse errors
    return null;
  }
}

/**
 * Store trading session for an address
 */
export function storeSession(
  session: Omit<StoredTradingSession, "lastUpdated">,
): void {
  if (typeof window === "undefined") return;

  try {
    const key = getStorageKey(session.eoaAddress);
    const sessionWithTimestamp: StoredTradingSession = {
      ...session,
      lastUpdated: Date.now(),
    };
    localStorage.setItem(key, JSON.stringify(sessionWithTimestamp));
  } catch (err) {
    console.error("[Session] Failed to store session:", err);
  }
}

/**
 * Update specific fields in the stored session
 */
export function updateSession(
  address: string,
  updates: Partial<Omit<StoredTradingSession, "eoaAddress" | "lastUpdated">>,
): void {
  if (typeof window === "undefined") return;

  const existing = getStoredSession(address);
  if (!existing) return;

  storeSession({
    ...existing,
    ...updates,
  });
}

/**
 * Clear stored session for an address
 */
export function clearSession(address: string): void {
  if (typeof window === "undefined") return;

  try {
    const key = getStorageKey(address);
    localStorage.removeItem(key);
  } catch (err) {
    console.error("[Session] Failed to clear session:", err);
  }
}

/**
 * Clear all trading sessions (for debugging/logout)
 */
export function clearAllSessions(): void {
  if (typeof window === "undefined") return;

  try {
    const keysToRemove: string[] = [];

    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith(SESSION_STORAGE_KEY)) {
        keysToRemove.push(key);
      }
    }

    for (const key of keysToRemove) {
      localStorage.removeItem(key);
    }
  } catch (err) {
    console.error("[Session] Failed to clear all sessions:", err);
  }
}
