import { createPublicClient, http, type PublicClient, isAddress } from "viem";
import { mainnet } from "viem/chains";
import { normalize } from "viem/ens";

const DEFAULT_RPC_URL = "https://ethereum-rpc.publicnode.com";
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 min — ENS records change rarely

export interface EnsResolveInput {
  name?: string;
  address?: string;
}

export interface EnsResolveOutput {
  name: string | null;
  address: string | null;
  avatar: string | null;
  records: Record<string, string | null>;
}

export class EnsNotFoundError extends Error {
  constructor(input: string) {
    super(`No ENS data found for "${input}"`);
    this.name = "EnsNotFoundError";
  }
}

export class EnsResolveApiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EnsResolveApiError";
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

const ensCache = new TtlCache<EnsResolveOutput>();

export const clearEnsCache = (): void => {
  ensCache.clear();
};

const TEXT_RECORD_KEYS = [
  "description",
  "url",
  "com.twitter",
  "com.github",
  "org.telegram",
  "email",
] as const;

let clientInstance: PublicClient | undefined;

const getClient = (): PublicClient => {
  if (clientInstance) return clientInstance;

  const rpcUrl = process.env.ETHEREUM_RPC_URL?.trim() || DEFAULT_RPC_URL;
  clientInstance = createPublicClient({
    chain: mainnet,
    transport: http(rpcUrl),
  });
  return clientInstance;
};

export const resetEnsClient = (): void => {
  clientInstance = undefined;
};

const fetchTextRecords = async (
  client: PublicClient,
  ensName: string
): Promise<Record<string, string | null>> => {
  const results = await Promise.allSettled(
    TEXT_RECORD_KEYS.map(async (key) => {
      const value = await client.getEnsText({
        name: normalize(ensName),
        key,
      });
      return [key, value ?? null] as const;
    })
  );

  const records: Record<string, string | null> = {};
  for (const result of results) {
    if (result.status === "fulfilled") {
      const [key, value] = result.value;
      records[key] = value;
    }
  }
  return records;
};

const resolveForward = async (
  client: PublicClient,
  name: string
): Promise<EnsResolveOutput> => {
  let address: string | null;
  try {
    address = await client.getEnsAddress({ name: normalize(name) });
  } catch (err) {
    throw new EnsResolveApiError(
      `RPC error during forward resolution: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  if (!address) {
    throw new EnsNotFoundError(name);
  }

  let avatar: string | null = null;
  try {
    avatar = await client.getEnsAvatar({ name: normalize(name) });
  } catch {
    // avatar is optional, ignore failures
  }

  let records: Record<string, string | null> = {};
  try {
    records = await fetchTextRecords(client, name);
  } catch {
    // text records are optional
  }

  return { name, address, avatar, records };
};

const resolveReverse = async (
  client: PublicClient,
  address: `0x${string}`
): Promise<EnsResolveOutput> => {
  let name: string | null;
  try {
    name = await client.getEnsName({ address });
  } catch (err) {
    throw new EnsResolveApiError(
      `RPC error during reverse resolution: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  if (!name) {
    throw new EnsNotFoundError(address);
  }

  let avatar: string | null = null;
  try {
    avatar = await client.getEnsAvatar({ name: normalize(name) });
  } catch {
    // optional
  }

  let records: Record<string, string | null> = {};
  try {
    records = await fetchTextRecords(client, name);
  } catch {
    // optional
  }

  return { name, address, avatar, records };
};

export const resolveEns = async (
  input: EnsResolveInput
): Promise<EnsResolveOutput> => {
  const nameInput = input.name?.trim();
  const addressInput = input.address?.trim();

  if (nameInput) {
    const cacheKey = `name:${nameInput.toLowerCase()}`;
    const cached = ensCache.get(cacheKey);
    if (cached) return cached;

    const client = getClient();
    const result = await resolveForward(client, nameInput);
    ensCache.set(cacheKey, result, CACHE_TTL_MS);
    return result;
  }

  if (addressInput) {
    if (!isAddress(addressInput)) {
      throw new EnsNotFoundError(addressInput);
    }

    const cacheKey = `addr:${addressInput.toLowerCase()}`;
    const cached = ensCache.get(cacheKey);
    if (cached) return cached;

    const client = getClient();
    const result = await resolveReverse(client, addressInput as `0x${string}`);
    ensCache.set(cacheKey, result, CACHE_TTL_MS);
    return result;
  }

  throw new EnsNotFoundError("(empty input)");
};
