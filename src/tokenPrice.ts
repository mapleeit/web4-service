const COINGECKO_API_BASE = "https://api.coingecko.com/api/v3";
const SEARCH_CACHE_TTL_MS = 5 * 60 * 1000; // 5 min — coin IDs rarely change
const PRICE_CACHE_TTL_MS = 30 * 1000; // 30 s — prices are volatile

export interface TokenPriceInput {
  token: string;
  currency?: string;
}

export class TokenNotFoundError extends Error {
  constructor(token: string) {
    super(`No token found matching "${token}"`);
    this.name = "TokenNotFoundError";
  }
}

export class TokenPriceApiError extends Error {
  statusCode: number;
  responseBody: string;

  constructor(statusCode: number, responseBody: string) {
    super(`CoinGecko API returned status ${statusCode}`);
    this.name = "TokenPriceApiError";
    this.statusCode = statusCode;
    this.responseBody = responseBody;
  }
}

interface CoinSearchMatch {
  id: string;
  symbol: string;
  name: string;
}

interface CoinSearchResponse {
  coins?: Array<{
    id?: unknown;
    symbol?: unknown;
    name?: unknown;
  }>;
}

type SimplePriceResponse = Record<string, Record<string, unknown>>;

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
}

const searchCache = new TtlCache<CoinSearchMatch | null>();
const priceCache = new TtlCache<Record<string, unknown>>();

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;

const searchCoin = async (query: string): Promise<CoinSearchMatch | undefined> => {
  const cacheKey = query.toLowerCase();
  const cached = searchCache.get(cacheKey);
  if (cached !== undefined) return cached ?? undefined;

  const url = `${COINGECKO_API_BASE}/search?query=${encodeURIComponent(query)}`;
  const response = await fetch(url);

  if (!response.ok) {
    throw new TokenPriceApiError(response.status, await response.text());
  }

  const data = (await response.json()) as CoinSearchResponse;
  const coins = data?.coins;
  if (!Array.isArray(coins) || coins.length === 0) {
    searchCache.set(cacheKey, null, SEARCH_CACHE_TTL_MS);
    return undefined;
  }

  const normalized = query.toLowerCase();
  const exactMatch = coins.find(
    (c) =>
      (isNonEmptyString(c.symbol) && c.symbol.toLowerCase() === normalized) ||
      (isNonEmptyString(c.id) && c.id.toLowerCase() === normalized)
  );

  const best = exactMatch ?? coins[0];
  if (!isNonEmptyString(best.id) || !isNonEmptyString(best.symbol) || !isNonEmptyString(best.name)) {
    searchCache.set(cacheKey, null, SEARCH_CACHE_TTL_MS);
    return undefined;
  }

  const match = { id: best.id, symbol: best.symbol, name: best.name };
  searchCache.set(cacheKey, match, SEARCH_CACHE_TTL_MS);
  return match;
};

const fetchSimplePrice = async (
  coinId: string,
  currency: string
): Promise<Record<string, unknown> | undefined> => {
  const cacheKey = `${coinId}:${currency}`;
  const cached = priceCache.get(cacheKey);
  if (cached !== undefined) return cached;

  const params = new URLSearchParams({
    ids: coinId,
    vs_currencies: currency,
    include_24hr_change: "true",
    include_market_cap: "true",
    include_24hr_vol: "true",
    include_last_updated_at: "true",
  });
  const url = `${COINGECKO_API_BASE}/simple/price?${params}`;
  const response = await fetch(url);

  if (!response.ok) {
    throw new TokenPriceApiError(response.status, await response.text());
  }

  const data = (await response.json()) as SimplePriceResponse;
  const result = data?.[coinId];
  if (result) {
    priceCache.set(cacheKey, result, PRICE_CACHE_TTL_MS);
  }
  return result;
};

export const clearTokenPriceCache = (): void => {
  searchCache["store"].clear();
  priceCache["store"].clear();
};

export const lookupTokenPrice = async (
  input: TokenPriceInput
): Promise<{
  id: string;
  symbol: string;
  name: string;
  price: number;
  currency: string;
  change24h: number | null;
  marketCap: number | null;
  volume24h: number | null;
  lastUpdated: string;
}> => {
  const currency = (input.currency ?? "usd").toLowerCase();

  const coin = await searchCoin(input.token);
  if (!coin) {
    throw new TokenNotFoundError(input.token);
  }

  const priceData = await fetchSimplePrice(coin.id, currency);
  if (!priceData) {
    throw new TokenNotFoundError(input.token);
  }

  const price = priceData[currency];
  if (typeof price !== "number") {
    throw new TokenNotFoundError(input.token);
  }

  const change24h = priceData[`${currency}_24h_change`];
  const marketCap = priceData[`${currency}_market_cap`];
  const volume24h = priceData[`${currency}_24h_vol`];
  const lastUpdatedAt = priceData.last_updated_at;

  return {
    id: coin.id,
    symbol: coin.symbol.toUpperCase(),
    name: coin.name,
    price,
    currency,
    change24h: typeof change24h === "number" ? change24h : null,
    marketCap: typeof marketCap === "number" ? marketCap : null,
    volume24h: typeof volume24h === "number" ? volume24h : null,
    lastUpdated: new Date(
      (typeof lastUpdatedAt === "number" ? lastUpdatedAt : Math.floor(Date.now() / 1000)) * 1000
    ).toISOString(),
  };
};
