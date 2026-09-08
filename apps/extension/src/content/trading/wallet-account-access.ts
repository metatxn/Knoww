import { sameAddress } from "@knoww/shared-types/bridge";
import { isEip1193UnsupportedMethodError } from "@knoww/shared-types/trading-errors";

type WalletRequest = (method: string, params?: unknown[]) => Promise<unknown>;

function includesAccount(value: unknown, address: string): boolean {
  return (
    Array.isArray(value) &&
    value.some(
      (account) => typeof account === "string" && sameAddress(account, address)
    )
  );
}

function permitsAccount(value: unknown, address: string): boolean {
  if (!Array.isArray(value)) return false;
  return value.some((permission) => {
    if (
      permission?.parentCapability !== "eth_accounts" ||
      !Array.isArray(permission.caveats)
    )
      return false;
    const restrictions = permission.caveats.filter(
      (caveat: { type?: unknown } | null) =>
        caveat?.type === "restrictReturnedAccounts"
    );
    return (
      restrictions.length > 0 &&
      restrictions.every((caveat: { value?: unknown }) =>
        includesAccount(caveat.value, address)
      )
    );
  });
}

export async function hasWalletAccountPermission(
  rpc: WalletRequest,
  address: string
): Promise<boolean> {
  try {
    return permitsAccount(await rpc("wallet_getPermissions"), address);
  } catch (error) {
    if (isEip1193UnsupportedMethodError(error)) return false;
    throw error;
  }
}

/** Preserve the requested signer instead of replacing it with the active account. */
export async function ensureWalletAccountAccess(
  rpc: WalletRequest,
  address: string,
  isCurrent: () => boolean
): Promise<boolean> {
  const checkCurrent = () => {
    if (!isCurrent()) throw new Error("Knoww sign-in was cancelled.");
  };
  checkCurrent();
  if (includesAccount(await rpc("eth_accounts"), address)) return true;
  checkCurrent();
  try {
    if (permitsAccount(await rpc("wallet_getPermissions"), address))
      return true;
    checkCurrent();
    // Consume the grant itself. MetaMask can keep returning a different active
    // account from eth_requestAccounts even after granting this one access.
    const granted = await rpc("wallet_requestPermissions", [
      { eth_accounts: {} },
    ]);
    checkCurrent();
    if (permitsAccount(granted, address)) return true;
    return includesAccount(await rpc("eth_accounts"), address);
  } catch (error) {
    if (!isEip1193UnsupportedMethodError(error)) throw error;
    checkCurrent();
    // Wallets without EIP-2255 get one ordinary connection request.
    return includesAccount(await rpc("eth_requestAccounts"), address);
  }
}
