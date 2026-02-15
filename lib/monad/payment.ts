import "server-only";

/* ------------------------------------------------------------------ */
/*  Verify a native MON transfer on Monad mainnet via JSON-RPC        */
/* ------------------------------------------------------------------ */

const MONAD_RPC = process.env.MONAD_RPC_URL || "https://rpc.monad.xyz";

const REQUIRED_MON = process.env.NEWSROOM_MEMBERSHIP_PRICE || "0.1";

/** 0.1 MON = 0.1 * 10^18 wei = 100_000_000_000_000_000 */
function requiredWei(): bigint {
  const [whole = "0", fraction = ""] = REQUIRED_MON.split(".");
  const paddedFraction = fraction.padEnd(18, "0").slice(0, 18);
  return BigInt(whole) * BigInt("1000000000000000000") + BigInt(paddedFraction);
}

interface RpcResponse<T> {
  jsonrpc: string;
  id: number;
  result?: T;
  error?: { code: number; message: string };
}

interface TransactionData {
  from: string;
  to: string;
  value: string;       // hex-encoded wei
  blockNumber: string;
}

interface ReceiptData {
  status: string; // "0x1" for success
}

async function rpcCall<T>(method: string, params: unknown[]): Promise<T> {
  const response = await fetch(MONAD_RPC, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    cache: "no-store",
  });

  const data = (await response.json()) as RpcResponse<T>;

  if (data.error) {
    throw new Error(`RPC error: ${data.error.message}`);
  }

  if (data.result === undefined || data.result === null) {
    throw new Error(`Transaction not found`);
  }

  return data.result;
}

export interface PaymentVerification {
  valid: boolean;
  from: string;
  to: string;
  valueMon: string;
  reason?: string;
}

/**
 * Verify that `txHash` is a successful native transfer of ≥ 0.1 MON
 * to `treasuryAddress`.
 */
export async function verifyMonPayment(
  txHash: string,
  treasuryAddress: string,
): Promise<PaymentVerification> {
  const treasury = treasuryAddress.toLowerCase();

  /* 1. Fetch the transaction */
  const tx = await rpcCall<TransactionData>("eth_getTransactionByHash", [txHash]);

  const from = (tx.from ?? "").toLowerCase();
  const to = (tx.to ?? "").toLowerCase();
  const value = BigInt(tx.value ?? "0x0");
  const valueMon = (Number(value) / 1e18).toFixed(4);

  /* 2. Target must match treasury */
  if (to !== treasury) {
    return { valid: false, from, to, valueMon, reason: "Recipient does not match treasury address" };
  }

  /* 3. Value must be ≥ required */
  if (value < requiredWei()) {
    return { valid: false, from, to, valueMon, reason: `Payment too low; need ≥ ${REQUIRED_MON} MON` };
  }

  /* 4. Transaction must have succeeded */
  const receipt = await rpcCall<ReceiptData>("eth_getTransactionReceipt", [txHash]);

  if (receipt.status !== "0x1") {
    return { valid: false, from, to, valueMon, reason: "Transaction reverted" };
  }

  return { valid: true, from, to, valueMon };
}
