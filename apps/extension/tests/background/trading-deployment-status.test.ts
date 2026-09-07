import { logWarn } from "@knoww/logger";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getExtensionSessionInfoViaMessage } from "../../src/background/extension-auth";
import { isRelayerWalletDeployed } from "../../src/background/relayer-client";
import { EXTENSION_AUTH_REQUIRED_ERROR } from "../../src/types/chrome-messages";

const rpc = vi.hoisted(() => ({ getBytecode: vi.fn() }));
vi.mock("viem", async (original) => ({
  ...(await original<object>()),
  createPublicClient: () => rpc,
}));
vi.mock("@knoww/logger", () => ({ logInfo: vi.fn(), logWarn: vi.fn() }));
vi.mock("../../src/background/extension-auth", () => ({
  getExtensionSessionInfoViaMessage: vi.fn(),
}));
vi.mock("../../src/background/relayer-client", () => ({
  isRelayerWalletDeployed: vi.fn(),
}));

const owner = "0x0000000000000000000000000000000000000001";

beforeEach(() => {
  vi.resetAllMocks();
  rpc.getBytecode.mockResolvedValue("0x");
  vi.mocked(getExtensionSessionInfoViaMessage).mockResolvedValue({
    loggedIn: false,
    address: null,
  });
  vi.mocked(isRelayerWalletDeployed).mockRejectedValue(
    new Error(EXTENSION_AUTH_REQUIRED_ERROR)
  );
});

async function checkDeployment(skipRelayerDeploymentFallback = false) {
  const { handleTradingMessage } = await import(
    "../../src/background/trading-handler"
  );
  return handleTradingMessage(
    {
      type: "trading:derive-proxy-address",
      eoaAddress: owner,
      walletMode: "safe",
      skipRelayerDeploymentFallback,
    },
    {}
  );
}

describe("deployment status before Knoww sign-in", () => {
  it("uses the public bytecode result without an authenticated fallback when signed out", async () => {
    expect(await checkDeployment()).toMatchObject({
      ok: true,
      data: { isDeployed: false },
    });
    expect(isRelayerWalletDeployed).not.toHaveBeenCalled();
    expect(logWarn).not.toHaveBeenCalled();
  });

  it("recognizes deployed contracts without requiring authentication", async () => {
    rpc.getBytecode.mockResolvedValue("0x6000");
    expect(await checkDeployment()).toMatchObject({
      ok: true,
      data: { isDeployed: true },
    });
    expect(getExtensionSessionInfoViaMessage).not.toHaveBeenCalled();
    expect(isRelayerWalletDeployed).not.toHaveBeenCalled();
  });

  it("uses the relayer on the next check once sign-in completes", async () => {
    await checkDeployment();
    vi.mocked(getExtensionSessionInfoViaMessage).mockResolvedValue({
      loggedIn: true,
      address: owner,
    });
    vi.mocked(isRelayerWalletDeployed).mockResolvedValue(true);
    expect(await checkDeployment()).toMatchObject({
      ok: true,
      data: { isDeployed: true },
    });
    expect(isRelayerWalletDeployed).toHaveBeenCalledTimes(1);
    expect(isRelayerWalletDeployed).toHaveBeenLastCalledWith(
      expect.any(String),
      "SAFE"
    );
  });

  it("keeps explicit bytecode-only checks independent of authentication", async () => {
    expect(await checkDeployment(true)).toMatchObject({
      ok: true,
      data: { isDeployed: false },
    });
    expect(getExtensionSessionInfoViaMessage).not.toHaveBeenCalled();
    expect(isRelayerWalletDeployed).not.toHaveBeenCalled();
  });

  it("handles a session expiring during the optional fallback without a failure warning", async () => {
    vi.mocked(getExtensionSessionInfoViaMessage).mockResolvedValue({
      loggedIn: true,
      address: owner,
    });
    expect(await checkDeployment()).toMatchObject({
      ok: true,
      data: { isDeployed: false },
    });
    expect(logWarn).not.toHaveBeenCalled();
  });

  it("still reports unexpected relayer failures", async () => {
    vi.mocked(getExtensionSessionInfoViaMessage).mockResolvedValue({
      loggedIn: true,
      address: owner,
    });
    vi.mocked(isRelayerWalletDeployed).mockRejectedValue(
      new Error("Relayer unavailable")
    );
    expect(await checkDeployment()).toMatchObject({
      ok: true,
      data: { isDeployed: false },
    });
    expect(logWarn).toHaveBeenCalledWith(
      "relayer.deployment-status-fallback.failed",
      expect.objectContaining({ error: "Relayer unavailable" })
    );
  });

  it("does not turn a failed RPC read into an undeployed result", async () => {
    rpc.getBytecode.mockRejectedValue(new Error("RPC unavailable"));
    expect(await checkDeployment()).toMatchObject({
      ok: false,
      error: "RPC unavailable",
    });
    expect(isRelayerWalletDeployed).not.toHaveBeenCalled();
  });
});
