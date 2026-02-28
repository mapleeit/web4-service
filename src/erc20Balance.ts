import { createPublicClient, http, type PublicClient, isAddress, formatUnits, erc20Abi } from "viem";
import { mainnet, base } from "viem/chains";

const SUPPORTED_CHAINS: Record<string, { chain: typeof mainnet; defaultRpc: string; envKey: string }> = {
  ethereum: { chain: mainnet, defaultRpc: "https://ethereum-rpc.publicnode.com", envKey: "ETHEREUM_RPC_URL" },
  base: { chain: base, defaultRpc: "https://base-rpc.publicnode.com", envKey: "BASE_RPC_URL" },
};

const METADATA_CACHE_TTL_MS = 10 * 60 * 1000;

export interface Erc20BalanceInput {
  address: string;
  token?: string;
  chain?: string;
}

export type Erc20BalanceOutput = {
  address: string;
  chain: string;
  token: string;
  symbol: string;
  name: string;
  decimals: number;
  balance: string;
  formatted: string;
};

export class BalanceInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BalanceInputError";
  }
}

export class BalanceRpcError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BalanceRpcError";
  }
}

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

class TtlCache<T> {
  private store = new Map<string, CacheEntry<T>>();

  get(key: string): T | undefined {
    const entry = this.store.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return undefined;
    }
    return entry.value;
  }

  set(key: string, value: T, ttlMs: number): void {
    this.store.set(key, { value, expiresAt: Date.now() + ttlMs });
  }

  clear(): void {
    this.store.clear();
  }
}

interface TokenMetadata {
  symbol: string;
  name: string;
  decimals: number;
}

const metadataCache = new TtlCache<TokenMetadata>();

export const clearBalanceCache = (): void => {
  metadataCache.clear();
  Object.keys(clients).forEach((k) => delete clients[k]);
};

const clients: Record<string, PublicClient> = {};

const getClient = (chainName: string): PublicClient => {
  if (clients[chainName]) return clients[chainName]!;

  const cfg = SUPPORTED_CHAINS[chainName];
  if (!cfg) throw new BalanceInputError(`Unsupported chain: "${chainName}". Supported: ${Object.keys(SUPPORTED_CHAINS).join(", ")}`);

  const rpcUrl = process.env[cfg.envKey]?.trim() || cfg.defaultRpc;
  const client = createPublicClient({ chain: cfg.chain, transport: http(rpcUrl) });
  clients[chainName] = client;
  return client;
};

const fetchTokenMetadata = async (
  client: PublicClient,
  tokenAddress: `0x${string}`,
  chainName: string,
): Promise<TokenMetadata> => {
  const cacheKey = `${chainName}:${tokenAddress.toLowerCase()}`;
  const cached = metadataCache.get(cacheKey);
  if (cached) return cached;

  try {
    const [symbol, name, decimals] = await Promise.all([
      client.readContract({ address: tokenAddress, abi: erc20Abi, functionName: "symbol" }),
      client.readContract({ address: tokenAddress, abi: erc20Abi, functionName: "name" }),
      client.readContract({ address: tokenAddress, abi: erc20Abi, functionName: "decimals" }),
    ]);

    const meta: TokenMetadata = { symbol, name, decimals };
    metadataCache.set(cacheKey, meta, METADATA_CACHE_TTL_MS);
    return meta;
  } catch (err) {
    throw new BalanceRpcError(
      `Failed to read token metadata for ${tokenAddress} on ${chainName}: ${err instanceof Error ? err.message : String(err)}`
    );
  }
};

export const queryBalance = async (
  input: Erc20BalanceInput,
): Promise<Erc20BalanceOutput> => {
  const address = input.address?.trim();
  if (!address || !isAddress(address)) {
    throw new BalanceInputError("A valid EVM address is required");
  }

  const chainName = (input.chain ?? "ethereum").toLowerCase();
  if (!SUPPORTED_CHAINS[chainName]) {
    throw new BalanceInputError(`Unsupported chain: "${chainName}". Supported: ${Object.keys(SUPPORTED_CHAINS).join(", ")}`);
  }

  const client = getClient(chainName);
  const tokenAddress = input.token?.trim();

  if (!tokenAddress) {
    try {
      const balance = await client.getBalance({ address: address as `0x${string}` });
      return {
        address,
        chain: chainName,
        token: "native",
        symbol: chainName === "base" ? "ETH" : "ETH",
        name: "Ether",
        decimals: 18,
        balance: balance.toString(),
        formatted: formatUnits(balance, 18),
      };
    } catch (err) {
      throw new BalanceRpcError(
        `RPC error fetching native balance: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  if (!isAddress(tokenAddress)) {
    throw new BalanceInputError("token must be a valid EVM contract address");
  }

  const meta = await fetchTokenMetadata(client, tokenAddress as `0x${string}`, chainName);

  let balance: bigint;
  try {
    balance = await client.readContract({
      address: tokenAddress as `0x${string}`,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [address as `0x${string}`],
    });
  } catch (err) {
    throw new BalanceRpcError(
      `RPC error fetching ERC-20 balance: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  return {
    address,
    chain: chainName,
    token: tokenAddress,
    symbol: meta.symbol,
    name: meta.name,
    decimals: meta.decimals,
    balance: balance.toString(),
    formatted: formatUnits(balance, meta.decimals),
  };
};
