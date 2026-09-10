import { describe, expect, it } from "vitest";
import { toPolymarketWalletIdentity } from "./identity";

const EOA = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
const SAFE = "0x8ac5D4Bd2752AFc9F5CA531f19D617647216B893";
const DEPOSIT = "0x4Fe2CC4925607a473264FA89e7138075695A5F8e";

describe("toPolymarketWalletIdentity", () => {
  it("maps an EOA trader to a wallet identity that signs and holds itself", () => {
    expect(
      toPolymarketWalletIdentity({ address: EOA, walletMode: "eoa" })
    ).toEqual({
      kind: "wallet",
      platform: "polymarket",
      address: EOA,
      accountType: "eoa",
    });
  });

  it("maps the default Deposit Wallet mode with the proxy as trading address", () => {
    expect(
      toPolymarketWalletIdentity({
        address: EOA,
        walletMode: "deposit",
        proxyAddress: DEPOSIT,
      })
    ).toEqual({
      kind: "wallet",
      platform: "polymarket",
      address: EOA,
      accountType: "deposit_wallet",
      tradingAddress: DEPOSIT,
    });
  });

  it("maps the legacy Safe mode", () => {
    expect(
      toPolymarketWalletIdentity({
        address: EOA,
        walletMode: "safe",
        proxyAddress: SAFE,
      })
    ).toEqual({
      kind: "wallet",
      platform: "polymarket",
      address: EOA,
      accountType: "safe",
      tradingAddress: SAFE,
    });
  });

  it("is not ready while a proxy-backed mode has no proxy address yet", () => {
    expect(
      toPolymarketWalletIdentity({ address: EOA, walletMode: "deposit" })
    ).toBeNull();
    expect(
      toPolymarketWalletIdentity({
        address: EOA,
        walletMode: "safe",
        proxyAddress: null,
      })
    ).toBeNull();
  });

  it("is not ready without a connected address", () => {
    expect(
      toPolymarketWalletIdentity({ address: undefined, walletMode: "eoa" })
    ).toBeNull();
  });
});
