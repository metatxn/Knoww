// @vitest-environment jsdom
// @vitest-environment-options {"url":"https://knoww.app/extension-credentials.html"}
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { URL as NodeURL } from "node:url";
import { afterEach, test, vi } from "vitest";

vi.mock("../../src/background/extension-session", () => ({
  getKnowwAppUrl: () => "https://knoww.app",
}));

import { signClobAuthInPage } from "../../src/background/trusted-clob-signing";

const html = readFileSync(
  new NodeURL(
    "../../../web/public/extension-credentials.html",
    import.meta.url
  ),
  "utf8"
);
const address = "0x000000000000000000000000000000000000cafe";
const otherAddress = "0x000000000000000000000000000000000000dead";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  Reflect.deleteProperty(window, "ethereum");
  document.documentElement.innerHTML = "";
});

test.each([true, false])(
  "shows the required account before the connection prompt (correct account granted: %s)",
  async (correctAccount) => {
    vi.useFakeTimers();
    document.documentElement.innerHTML = html;
    let authorized = false;
    let displayedAtPrompt: string | undefined;
    const request = vi.fn(async ({ method }: { method: string }) => {
      if (method === "eth_accounts") return [otherAddress];
      if (method === "wallet_getPermissions")
        return authorized
          ? [
              {
                parentCapability: "eth_accounts",
                caveats: [
                  { type: "restrictReturnedAccounts", value: [address] },
                ],
              },
            ]
          : [];
      if (method === "wallet_requestPermissions") {
        displayedAtPrompt =
          document.getElementById("signing-account-address")?.textContent ??
          undefined;
        // The displayed address must never become the authority for signing.
        const account = document.getElementById("signing-account-address");
        if (account) account.textContent = otherAddress;
        authorized = correctAccount;
        return [
          {
            parentCapability: "eth_accounts",
            caveats: [
              {
                type: "restrictReturnedAccounts",
                value: [correctAccount ? address : otherAddress],
              },
            ],
          },
        ];
      }
      if (method === "eth_chainId") return "0x89";
      if (method === "eth_signTypedData_v4") return `0x${"a".repeat(130)}`;
      throw new Error(`Unexpected wallet request: ${method}`);
    });
    Object.assign(window, { ethereum: { isMetaMask: true, request } });
    const signing = signClobAuthInPage({
      address,
      expectedOrigin: "https://knoww.app",
      expectedPath: "/extension-credentials.html",
      typedData: "typed-data",
      wallet: { name: "MetaMask", rdns: "io.metamask" },
    });
    await vi.advanceTimersByTimeAsync(1_500);
    const result = await signing;
    assert.equal(displayedAtPrompt, address);
    assert.equal(document.getElementById("signing-account")?.hidden, false);
    assert.match(
      document.getElementById("signing-account-hint")?.textContent ?? "",
      /same account.*trading panel/
    );
    const signatures = request.mock.calls.filter(
      ([call]) => call.method === "eth_signTypedData_v4"
    );
    if (correctAccount) {
      assert.equal(result, `0x${"a".repeat(130)}`);
      assert.deepEqual(signatures, [
        [{ method: "eth_signTypedData_v4", params: [address, "typed-data"] }],
      ]);
    } else {
      assert.equal(typeof result, "object");
      assert.match(
        (result as { error: string }).error,
        /connection prompt.*https:\/\/knoww.app/
      );
      assert.equal(signatures.length, 0);
    }
  }
);
