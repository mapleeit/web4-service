import {
  createWalletClient,
  custom,
  type WalletClient,
  type Chain,
} from "viem";
import { base, mainnet } from "viem/chains";

declare global {
  interface Window {
    ethereum?: {
      request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
      on: (event: string, handler: (...args: unknown[]) => void) => void;
      removeListener: (event: string, handler: (...args: unknown[]) => void) => void;
    };
  }
}

const CHAIN_MAP: Record<number, Chain> = {
  1: mainnet,
  8453: base,
};

export function hasWalletProvider(): boolean {
  return typeof window !== "undefined" && !!window.ethereum;
}

export function networkToChainId(network: string): number {
  const parts = network.split(":");
  return Number(parts[1]);
}

export function chainIdToChain(chainId: number): Chain {
  const known = CHAIN_MAP[chainId];
  if (known) return known;

  return {
    id: chainId,
    name: `Chain ${chainId}`,
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    rpcUrls: {
      default: { http: ["https://ethereum-rpc.publicnode.com"] },
    },
  } as Chain;
}

export async function connectWallet(): Promise<`0x${string}`> {
  if (!window.ethereum) {
    throw new Error("No wallet detected. Please install MetaMask.");
  }

  const accounts = (await window.ethereum.request({
    method: "eth_requestAccounts",
  })) as string[];

  if (!accounts[0]) {
    throw new Error("No account returned from wallet.");
  }

  return accounts[0] as `0x${string}`;
}

export async function switchChain(chainId: number): Promise<void> {
  if (!window.ethereum) return;

  const hexChainId = `0x${chainId.toString(16)}`;
  try {
    await window.ethereum.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: hexChainId }],
    });
  } catch (err) {
    const error = err as { code?: number };
    if (error.code === 4902) {
      throw new Error(
        `Chain ${chainId} not available in your wallet. Please add it manually.`
      );
    }
    throw err;
  }
}

export function getWalletClient(chain: Chain): WalletClient {
  if (!window.ethereum) {
    throw new Error("No wallet detected.");
  }

  return createWalletClient({
    chain,
    transport: custom(window.ethereum),
  });
}

export function truncateAddress(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}
