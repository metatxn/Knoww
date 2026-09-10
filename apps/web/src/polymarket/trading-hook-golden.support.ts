/**
 * Shared plumbing for the hook-level M3 golden tests: an EIP-1193 wallet
 * that signs with the throwaway key, a Polygon RPC answered from a
 * "personality", the account-level CLOB reads and the app's relayer proxy.
 * The order and approval harnesses share one chain and one wallet so their
 * fixtures describe the same trader.
 */

import {
  derivePolymarketDepositWallet,
  derivePolymarketSafe,
} from "@knoww/shared-types/relayer";
import {
  type Address,
  decodeFunctionData,
  encodeAbiParameters,
  encodeFunctionResult,
  erc20Abi,
  type Hex,
  maxUint256,
  multicall3Abi,
  parseAbi,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  CTF_ADDRESS,
  PUSD_ADDRESS,
  USDC_E_ADDRESS,
} from "@/constants/contracts";
import { polygon } from "@/lib/chains";
import {
  type CapturedRequest,
  type RouteHandler,
  THROWAWAY_EOA,
  THROWAWAY_PRIVATE_KEY,
} from "./trading-golden.support";

export type WalletMode = "eoa" | "safe" | "deposit";

export interface WalletRequest {
  method: string;
  params: unknown;
}

/**
 * Harness faults (an unrouted call, a wallet method the fake refuses) are
 * collected here instead of thrown: a thrown fetch makes viem retry with
 * back-off for seven seconds, and a hook would then pin the failure into
 * the fixture as an ordinary error. Every case asserts this is empty.
 */
export const harnessErrors: string[] = [];

const account = privateKeyToAccount(THROWAWAY_PRIVATE_KEY);

export const WALLETS: Record<WalletMode, Address> = {
  eoa: THROWAWAY_EOA,
  safe: derivePolymarketSafe(THROWAWAY_EOA),
  deposit: derivePolymarketDepositWallet(THROWAWAY_EOA),
};

/** What the fake chain and CLOB report for the trading wallet. */
export interface Personality {
  approved: boolean;
  /** When set, only these spenders and operators count as approved. */
  approvedSpenders?: readonly Address[];
  pusdRaw: bigint;
  usdcERaw: bigint;
  conditionalRaw: bigint;
  /** Whether the trading wallet has code on chain. Defaults to deployed. */
  deployed?: boolean;
}

export const PERSONALITIES = {
  /** Fully approved, plenty of pUSD: the steady-state trader. */
  approved: {
    approved: true,
    pusdRaw: BigInt(50_000_000),
    usdcERaw: BigInt(0),
    conditionalRaw: BigInt(100_000_000),
  },
  /** Nothing approved: the hook must repair approvals before posting. */
  unapproved: {
    approved: false,
    pusdRaw: BigInt(50_000_000),
    usdcERaw: BigInt(0),
    conditionalRaw: BigInt(100_000_000),
  },
  /** Short on pUSD with USDC.e to spare: the hook wraps through the relayer. */
  wrap: {
    approved: true,
    pusdRaw: BigInt(1_000_000),
    usdcERaw: BigInt(100_000_000),
    conditionalRaw: BigInt(100_000_000),
  },
} satisfies Record<string, Personality>;

function isApproved(personality: Personality, spender: Address): boolean {
  if (!personality.approvedSpenders) return personality.approved;
  return personality.approvedSpenders.some(
    (candidate) => candidate.toLowerCase() === spender.toLowerCase()
  );
}

export type ProviderHandler = (params: unknown) => unknown;

/**
 * An EIP-1193 wallet that signs locally and refuses everything else. Every
 * request is recorded so the fixture shows exactly what a real wallet would
 * be asked. `extra` handlers answer methods a particular flow needs (an
 * approval flow sends transactions; an order flow must not).
 */
export function createFakeProvider(
  log: WalletRequest[],
  extra: Record<string, ProviderHandler> = {}
) {
  return {
    request: async ({
      method,
      params,
    }: {
      method: string;
      params?: unknown;
    }) => {
      const handler = extra[method];
      if (handler) return handler(params);
      switch (method) {
        case "eth_chainId":
          return "0x89";
        case "eth_accounts":
        case "eth_requestAccounts":
          return [THROWAWAY_EOA];
        case "wallet_switchEthereumChain":
          return null;
        case "eth_signTypedData_v4": {
          const [, json] = params as [string, string];
          const typedData = JSON.parse(json);
          log.push({ method, params: [THROWAWAY_EOA, typedData] });
          return account.signTypedData(typedData);
        }
        case "personal_sign": {
          const [message] = params as [Hex, string];
          log.push({ method, params });
          return account.signMessage({ message: { raw: message } });
        }
        default: {
          const message = `golden harness: wallet method ${method} is not allowed`;
          harnessErrors.push(message);
          throw new Error(message);
        }
      }
    },
  };
}

const READ_ABI = [
  ...erc20Abi,
  ...parseAbi([
    "function isApprovedForAll(address owner, address operator) view returns (bool)",
    "function balanceOfBatch(address[] owners, uint256[] ids) view returns (uint256[])",
  ]),
];

const MULTICALL3 = polygon.contracts?.multicall3?.address;
if (!MULTICALL3)
  throw new Error("golden harness: polygon chain has no multicall3");

export interface DecodedCall {
  to: Address;
  functionName: string;
  args: unknown;
}

export function decodeCall(to: Address, data: Hex): DecodedCall[] {
  if (to.toLowerCase() === MULTICALL3.toLowerCase()) {
    const { functionName, args } = decodeFunctionData({
      abi: multicall3Abi,
      data,
    });
    if (functionName !== "aggregate3") {
      throw new Error(`golden harness: unexpected multicall ${functionName}`);
    }
    return (args[0] as readonly { target: Address; callData: Hex }[]).flatMap(
      (call) => decodeCall(call.target, call.callData)
    );
  }
  const { functionName, args } = decodeFunctionData({ abi: READ_ABI, data });
  return [{ to, functionName, args }];
}

/** Answers an `eth_call` from the personality, unwrapping multicall batches. */
export function answerCall(
  to: Address,
  data: Hex,
  personality: Personality
): Hex {
  if (to.toLowerCase() === MULTICALL3.toLowerCase()) {
    const { args } = decodeFunctionData({ abi: multicall3Abi, data });
    const calls = args[0] as readonly { target: Address; callData: Hex }[];
    return encodeFunctionResult({
      abi: multicall3Abi,
      functionName: "aggregate3",
      result: calls.map((call) => ({
        success: true,
        returnData: answerCall(call.target, call.callData, personality),
      })),
    });
  }

  const { functionName, args } = decodeFunctionData({ abi: READ_ABI, data });
  switch (functionName) {
    case "allowance": {
      const [, spender] = args as readonly [Address, Address];
      return encodeAbiParameters(
        [{ type: "uint256" }],
        [isApproved(personality, spender) ? maxUint256 : BigInt(0)]
      );
    }
    case "isApprovedForAll": {
      const [, operator] = args as readonly [Address, Address];
      return encodeAbiParameters(
        [{ type: "bool" }],
        [isApproved(personality, operator)]
      );
    }
    case "balanceOf": {
      const token = to.toLowerCase();
      const balance =
        token === PUSD_ADDRESS.toLowerCase()
          ? personality.pusdRaw
          : token === USDC_E_ADDRESS.toLowerCase()
            ? personality.usdcERaw
            : BigInt(0);
      return encodeAbiParameters([{ type: "uint256" }], [balance]);
    }
    case "balanceOfBatch": {
      if (to.toLowerCase() !== CTF_ADDRESS.toLowerCase()) {
        throw new Error(`golden harness: balanceOfBatch on ${to}`);
      }
      const owners = args[0] as readonly Address[];
      return encodeAbiParameters(
        [{ type: "uint256[]" }],
        [owners.map(() => personality.conditionalRaw)]
      );
    }
    default:
      throw new Error(`golden harness: unrouted eth_call ${functionName}`);
  }
}

export interface RpcBody {
  jsonrpc: string;
  id: number;
  method: string;
  params?: unknown[];
}

export const RPC_PATH = "/api/rpc/polygon";

/** Marker bytecode for a deployed trading wallet; only its non-emptiness matters. */
const DEPLOYED_CODE: Hex = "0x6080604052";

export type RpcHandler = (params: unknown[] | undefined) => unknown;

/**
 * The app's Polygon RPC proxy. Reads are answered from the personality;
 * `extra` handlers answer the methods a particular flow needs.
 */
export function rpcRoutes(
  personality: Personality,
  extra: Record<string, RpcHandler> = {}
): RouteHandler {
  return (request, url) => {
    if (url.pathname !== RPC_PATH) return undefined;
    const body = request.body as RpcBody;
    const reply = (result: unknown) => ({
      jsonrpc: "2.0",
      id: body.id,
      result,
    });
    // -32601 is a code viem does not retry, so a fault surfaces at once.
    const fault = (message: string) => {
      harnessErrors.push(message);
      return { jsonrpc: "2.0", id: body.id, error: { code: -32601, message } };
    };
    const handler = extra[body.method];
    if (handler) {
      try {
        return reply(handler(body.params));
      } catch (error) {
        return fault(error instanceof Error ? error.message : String(error));
      }
    }
    switch (body.method) {
      case "eth_chainId":
        return reply("0x89");
      case "eth_getCode":
        return reply(personality.deployed === false ? "0x" : DEPLOYED_CODE);
      case "eth_call": {
        const [{ to, data }] = body.params as [{ to: Address; data: Hex }];
        try {
          return reply(answerCall(to, data, personality));
        } catch (error) {
          return fault(error instanceof Error ? error.message : String(error));
        }
      }
      default:
        return fault(`golden harness: unrouted rpc ${body.method}`);
    }
  };
}

/** Account-level CLOB reads the hooks make around an order. */
export function clobAccountRoutes(personality: Personality): RouteHandler {
  return (_request, url) => {
    if (url.origin !== "https://clob.polymarket.com") return undefined;
    switch (url.pathname) {
      case "/balance-allowance":
        return {
          balance: personality.conditionalRaw.toString(),
          allowances: {},
        };
      case "/balance-allowance/update":
        return {};
      case "/data/orders":
        return { count: 0, data: [], limit: 100, next_cursor: "LTE=" };
      default:
        return undefined;
    }
  };
}

export const RELAYER_TX_HASH = `0x${"ef".repeat(32)}`;

/** The app's relayer proxy, as `src/lib/relayer-client.ts` calls it. */
export function relayerProxyRoutes(
  options: { deployed?: boolean } = {}
): RouteHandler {
  const deployed = options.deployed ?? true;
  return (_request, url) => {
    switch (url.pathname) {
      case "/api/relayer/nonce":
        return { nonce: "0" };
      case "/api/relayer/deployed":
        return { deployed };
      case "/api/relayer/submit":
        return { transactionID: "golden-tx-1", state: "STATE_NEW" };
      case "/api/relayer/transaction":
        return [
          {
            transactionID: url.searchParams.get("id"),
            transactionHash: RELAYER_TX_HASH,
            state: "STATE_CONFIRMED",
          },
        ];
      default:
        return undefined;
    }
  };
}

/** Records `/api/polymarket/x` as `/api/x`: the M3 route move is expected. */
export function normalizeAppPath(url: URL): URL {
  const normalized = new URL(url.toString());
  normalized.pathname = url.pathname.replace(/^\/api\/polymarket\//, "/api/");
  return normalized;
}

/** First handler with an answer wins; app-local paths are normalised first. */
export function composeRoutes(handlers: readonly RouteHandler[]): RouteHandler {
  return (request, rawUrl) => {
    const url = normalizeAppPath(rawUrl);
    for (const handler of handlers) {
      const answer = handler(request, url);
      if (answer !== undefined) return answer;
    }
    return undefined;
  };
}

/** A captured request in fixture form: app-local URLs as paths, RPC ids zeroed and calls decoded. */
export function toFixtureRequest(request: CapturedRequest) {
  const url = normalizeAppPath(new URL(request.url));
  const isAppLocal = url.hostname === "localhost";
  const record: Record<string, unknown> = {
    method: request.method,
    url: isAppLocal ? `${url.pathname}${url.search}` : url.toString(),
    headers: request.headers,
    body: request.body,
  };
  if (url.pathname === RPC_PATH) {
    const body = request.body as RpcBody;
    record.body = { ...body, id: 0 };
    if (body.method === "eth_call") {
      const [{ to, data }] = body.params as [{ to: Address; data: Hex }];
      record.decoded = decodeCall(to, data);
    }
  }
  return record;
}

/**
 * The chain an EOA's transactions land on: every sent transaction is
 * mined in the same block at once, so a receipt wait returns on its first
 * look. Shared by the approval and deposit harnesses.
 */
const BLOCK_NUMBER = "0x10";
const BLOCK_HASH = `0x${"ab".repeat(32)}`;
const GAS_USED = "0xc350";

interface SentTransaction {
  to: Address;
  data: Hex;
}

export function createChain(walletLog: WalletRequest[]) {
  const sent = new Map<Hex, SentTransaction>();

  const sendTransaction = (params: unknown) => {
    const [tx] = params as [SentTransaction];
    const hash: Hex = `0x${(sent.size + 1).toString(16).padStart(64, "0")}`;
    sent.set(hash, { to: tx.to, data: tx.data });
    walletLog.push({ method: "eth_sendTransaction", params });
    return hash;
  };

  const lookUp = (params: unknown[] | undefined) => {
    const [hash] = params as [Hex];
    const tx = sent.get(hash);
    if (!tx) throw new Error(`golden harness: unknown transaction ${hash}`);
    return { hash, ...tx };
  };

  const rpc: Record<string, RpcHandler> = {
    eth_blockNumber: () => BLOCK_NUMBER,
    eth_getTransactionByHash: (params) => {
      const { hash, to, data } = lookUp(params);
      return {
        hash,
        blockHash: BLOCK_HASH,
        blockNumber: BLOCK_NUMBER,
        transactionIndex: "0x0",
        from: THROWAWAY_EOA,
        to,
        input: data,
        value: "0x0",
        nonce: "0x0",
        gas: GAS_USED,
        maxFeePerGas: "0x1",
        maxPriorityFeePerGas: "0x1",
        chainId: "0x89",
        type: "0x2",
        accessList: [],
        v: "0x0",
        r: "0x0",
        s: "0x0",
      };
    },
    eth_getTransactionReceipt: (params) => {
      const { hash, to } = lookUp(params);
      return {
        transactionHash: hash,
        transactionIndex: "0x0",
        blockHash: BLOCK_HASH,
        blockNumber: BLOCK_NUMBER,
        from: THROWAWAY_EOA,
        to,
        contractAddress: null,
        cumulativeGasUsed: GAS_USED,
        gasUsed: GAS_USED,
        effectiveGasPrice: "0x1",
        logs: [],
        logsBloom: `0x${"00".repeat(256)}`,
        status: "0x1",
        type: "0x2",
      };
    },
  };

  return { sendTransaction, rpc };
}
