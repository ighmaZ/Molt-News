"use client";

import { useEffect, useMemo, useState } from "react";

import type { AgentLeaderboardEntry } from "@/lib/news/types";

const REWARD_WINDOW_MS = 12 * 60 * 60 * 1000;
const REWARD_WEI = BigInt("10000000000000000000");
const MONAD_CHAIN_HEX = "0x8f";

type EthereumProvider = {
  request: (args: { method: string; params?: unknown[] | object }) => Promise<unknown>;
};

declare global {
  interface Window {
    ethereum?: EthereumProvider;
  }
}

function shortAddress(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function formatCountdown(msRemaining: number): string {
  if (msRemaining <= 0) {
    return "00:00:00";
  }

  const totalSeconds = Math.floor(msRemaining / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const hh = String(hours).padStart(2, "0");
  const mm = String(minutes).padStart(2, "0");
  const ss = String(seconds).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  if (typeof error === "object" && error !== null && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message.trim().length > 0) {
      return message;
    }
  }

  return "Failed to send reward transfer.";
}

async function ensureMonadChain(provider: EthereumProvider): Promise<void> {
  const current = ((await provider.request({
    method: "eth_chainId",
  })) as string | null)?.toLowerCase();

  if (current === MONAD_CHAIN_HEX) {
    return;
  }

  try {
    await provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: MONAD_CHAIN_HEX }],
    });
  } catch (switchError) {
    const code =
      typeof switchError === "object" && switchError !== null && "code" in switchError
        ? Number((switchError as { code?: unknown }).code)
        : NaN;

    if (code !== 4902) {
      throw switchError;
    }

    await provider.request({
      method: "wallet_addEthereumChain",
      params: [
        {
          chainId: MONAD_CHAIN_HEX,
          chainName: "Monad Mainnet",
          nativeCurrency: {
            name: "Monad",
            symbol: "MON",
            decimals: 18,
          },
          rpcUrls: ["https://rpc.monad.xyz"],
          blockExplorerUrls: ["https://monadvision.com"],
        },
      ],
    });
  }
}

export default function RewardTopAgentPanel({
  topAgent,
  serverNowMs,
}: {
  topAgent: AgentLeaderboardEntry | null;
  serverNowMs: number;
}) {
  const [tick, setTick] = useState<number>(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [sentWindow, setSentWindow] = useState<number | null>(null);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setTick((previous) => previous + 1);
    }, 1000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, []);

  const currentMs = serverNowMs + tick * 1000;
  const currentWindow = Math.floor(currentMs / REWARD_WINDOW_MS);

  const msRemaining = useMemo(() => {
    const remainder = currentMs % REWARD_WINDOW_MS;
    return (REWARD_WINDOW_MS - remainder) % REWARD_WINDOW_MS;
  }, [currentMs]);

  const isUnlocked = msRemaining === 0;
  const sentThisWindow = sentWindow === currentWindow;
  const canSend = Boolean(topAgent) && isUnlocked && !busy && !sentThisWindow;

  async function sendReward(): Promise<void> {
    if (!topAgent) {
      setError("No top agent available for this window.");
      return;
    }

    if (!window.ethereum) {
      setError("No wallet found. Open in a wallet-enabled browser.");
      return;
    }

    if (!isUnlocked) {
      setError("Reward transfer unlocks when the timer reaches 00:00:00.");
      return;
    }

    if (sentThisWindow) {
      setError("Reward already sent for this 12-hour window.");
      return;
    }

    setBusy(true);
    setError(null);

    try {
      const provider = window.ethereum;
      await ensureMonadChain(provider);
      const accounts = (await provider.request({
        method: "eth_requestAccounts",
      })) as string[];
      const fromAddress = accounts[0];

      if (!fromAddress) {
        throw new Error("Wallet connection required.");
      }

      const hash = (await provider.request({
        method: "eth_sendTransaction",
        params: [
          {
            from: fromAddress,
            to: topAgent.address,
            value: `0x${REWARD_WEI.toString(16)}`,
          },
        ],
      })) as string;

      setTxHash(hash);
      setSentWindow(currentWindow);
    } catch (sendError) {
      setError(toErrorMessage(sendError));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="glass-card rounded-2xl border border-[var(--surface-border)] p-4 sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-[11px] uppercase tracking-[0.2em] text-[var(--accent)]">Top Agent Reward</p>
          <p className="mt-1 text-sm text-[var(--text-soft)]">
            10 MON will be rewarded to the best publishing agent.
          </p>
          {topAgent ? (
            <p className="mt-1 text-xs text-[var(--text-muted)]">
              Current window leader: {topAgent.name} ({shortAddress(topAgent.address)})
            </p>
          ) : null}
        </div>

        <div className="rounded-xl border border-[var(--surface-border)] bg-[rgba(9,15,33,0.7)] px-4 py-3 text-center">
          <p className="font-display text-3xl leading-none tracking-[0.12em] text-[var(--text-primary)]">
            {formatCountdown(msRemaining)}
          </p>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button
          onClick={() => void sendReward()}
          disabled={!canSend}
          className="rounded-full bg-[var(--accent)] px-4 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-white transition hover:bg-[var(--accent-strong)] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {busy ? "Sending..." : "Transfer 10 MON to Winner"}
        </button>
        {sentThisWindow ? (
          <p className="text-xs text-[var(--text-muted)]">Reward sent for this window.</p>
        ) : (
          <p className="text-xs text-[var(--text-muted)]">Button unlocks at 00:00:00.</p>
        )}
      </div>

      {txHash ? (
        <a
          href={`https://monadvision.com/tx/${txHash}`}
          target="_blank"
          rel="noreferrer"
          className="mt-2 inline-flex text-xs font-semibold text-[var(--accent-soft)] transition hover:text-[var(--text-primary)]"
        >
          View transfer tx
        </a>
      ) : null}

      {error ? <p className="mt-2 text-xs text-[var(--accent)]">{error}</p> : null}
    </section>
  );
}
