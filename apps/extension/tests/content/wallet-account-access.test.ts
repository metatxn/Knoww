import { expect, it, vi } from "vitest";
import { ensureWalletAccountAccess } from "../../src/content/trading/wallet-account-access";

const wanted = `0x${"1".repeat(40)}`;
const active = `0x${"2".repeat(40)}`;
const permissions = (accounts: string[]) => [
  {
    parentCapability: "eth_accounts",
    caveats: [{ type: "restrictReturnedAccounts", value: accounts }],
  },
];

it("uses an already permitted account even when MetaMask only exposes the active account", async () => {
  const rpc = vi
    .fn()
    .mockResolvedValueOnce([active])
    .mockResolvedValueOnce(permissions([wanted, active]));
  expect(await ensureWalletAccountAccess(rpc, wanted, () => true)).toBe(true);
  expect(rpc.mock.calls.map(([method]) => method)).toEqual([
    "eth_accounts",
    "wallet_getPermissions",
  ]);
});

it("uses the permission grant without a second account request", async () => {
  const rpc = vi
    .fn()
    .mockResolvedValueOnce([active])
    .mockResolvedValueOnce(permissions([active]))
    .mockResolvedValueOnce(permissions([wanted]));
  expect(await ensureWalletAccountAccess(rpc, wanted, () => true)).toBe(true);
  expect(rpc.mock.calls.map(([method]) => method)).toEqual([
    "eth_accounts",
    "wallet_getPermissions",
    "wallet_requestPermissions",
  ]);
});

it("connects wallets without the permissions API once", async () => {
  const rpc = vi
    .fn()
    .mockResolvedValueOnce([])
    .mockRejectedValueOnce({ code: 4200 })
    .mockResolvedValueOnce([wanted]);
  expect(await ensureWalletAccountAccess(rpc, wanted, () => true)).toBe(true);
  expect(rpc.mock.calls.map(([method]) => method)).toEqual([
    "eth_accounts",
    "wallet_getPermissions",
    "eth_requestAccounts",
  ]);
});

it("does not fall back to another prompt after rejection", async () => {
  const rpc = vi
    .fn()
    .mockResolvedValueOnce([])
    .mockResolvedValueOnce([])
    .mockRejectedValueOnce({ code: 4001 });
  await expect(
    ensureWalletAccountAccess(rpc, wanted, () => true)
  ).rejects.toEqual({ code: 4001 });
  expect(rpc).toHaveBeenCalledTimes(3);
});

it("does not authorize an account missing from the grant", async () => {
  const rpc = vi
    .fn()
    .mockResolvedValueOnce([active])
    .mockResolvedValueOnce(permissions([active]))
    .mockResolvedValueOnce(permissions([active]));
  expect(await ensureWalletAccountAccess(rpc, wanted, () => true)).toBe(false);
});

it("stops before a permission prompt when cancelled during the passive check", async () => {
  let current = true;
  const rpc = vi
    .fn()
    .mockResolvedValueOnce([])
    .mockImplementationOnce(async () => {
      current = false;
      return [];
    });
  await expect(
    ensureWalletAccountAccess(rpc, wanted, () => current)
  ).rejects.toThrow("cancelled");
  expect(rpc).toHaveBeenCalledTimes(2);
});
