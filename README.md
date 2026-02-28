# x402 Agent Services

Pay-per-call AI agent services with multi-chain EVM payment support. No API keys needed — just standard HTTP with built-in micropayments.

Built with Node.js, Express, and TypeScript.

## Getting Started

```bash
npm install
npm run dev
```

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start dev server with hot reload (tsx watch) |
| `npm run build` | Compile TypeScript to `dist/` |
| `npm start` | Run compiled production build |
| `npm run lint` | Run ESLint |
| `npm test` | Run Jest tests |

## API

- `GET /` — Hello message
- `GET /health` — Health check with uptime
- `GET /agent/services` — Agent service catalog (includes payment metadata)
- `GET /.well-known/agent-services` — Discovery manifest for agent clients
- `POST /agent/services/:serviceId/invoke` — Invoke a service (`x402` protects paid routes)

## Paid service: Token price lookup

`token-price` is a paid agent endpoint powered by CoinGecko:

- Route: `POST /agent/services/token-price/invoke`
- Input:
  - `token` (required) — token name, symbol (e.g. `BTC`), or CoinGecko ID (e.g. `bitcoin`)
  - `currency` (optional, default `usd`)
- Output:
  - `id`, `symbol`, `name` — token identifiers
  - `price` — current price in requested currency
  - `change24h` — 24-hour price change percentage (nullable)
  - `marketCap`, `volume24h` — market data (nullable)
  - `lastUpdated` — ISO 8601 timestamp

## Paid service: Perplexity search

`perplexity-search` is now a paid agent endpoint:

- Route: `POST /agent/services/perplexity-search/invoke`
- Input:
  - `query` (required)
  - `model` (optional, defaults to `PERPLEXITY_MODEL` or provider default model)
- Output:
  - `answer`
  - `citations`
  - `model`

## Real x402 settlement flow

This service uses official x402 middleware (`@x402/express`) and facilitator verification.

1. Call paid route without payment header.
2. Service responds with `HTTP 402` + x402 payment requirements.
3. Client wallet pays through configured facilitator.
4. Client retries with x402 payment header and receives the search result.

Preview unpaid request:

```bash
curl -i -X POST http://localhost:3000/agent/services/perplexity-search/invoke \
  -H "Content-Type: application/json" \
  -d '{"query":"latest x402 updates"}'
```

## Required environment

- One provider API key:
  - `PERPLEXITY_API_KEY` - API key for direct Perplexity API calls
  - `OPENROUTER_API_KEY` - API key when using OpenRouter as Perplexity proxy
- `X402_PAYMENT_OPTIONS` - JSON array of payment options (each must include `network` and `payTo`)

Example `X402_PAYMENT_OPTIONS`:

```json
[{ "network": "eip155:8453", "payTo": "0x..." }]
```

Multi-chain example (different payTo per chain):

```json
[
  { "network": "eip155:8453", "payTo": "0xABC..." },
  { "network": "eip155:1", "payTo": "0xDEF..." }
]
```

Each option supports: `network` (required), `payTo` (required), `facilitator` (optional).
When multiple options are configured, `payment-required` includes multiple `accepts`
entries so clients can pay on a chain where they have funds.
All networks must be EVM CAIP-2 identifiers supported by your configured facilitator.

### Per-service pricing

Price is resolved per service in this order:

1. **Service-specific env var** `X402_PRICE_{SERVICE_ID}` (e.g. `X402_PRICE_TOKEN_PRICE`)
2. **Code-level default** (e.g. token-price defaults to `$0.001`)
3. **Global env var** `X402_PRICE`
4. **Hardcoded fallback** `$0.02`

Service ID to env var conversion: uppercase, hyphens → underscores.

| Service | Env var | Code default |
|---|---|---|
| `perplexity-search` | `X402_PRICE_PERPLEXITY_SEARCH` | — (uses global) |
| `token-price` | `X402_PRICE_TOKEN_PRICE` | `$0.001` |

## Optional environment

- `PERPLEXITY_API_PROVIDER` - `perplexity` (default) or `openrouter`
- `PERPLEXITY_MODEL` - default model override
- `PERPLEXITY_CHAT_COMPLETIONS_URL` - override Perplexity chat completions URL
- `OPENROUTER_CHAT_COMPLETIONS_URL` - override OpenRouter chat completions URL (default: `https://openrouter.ai/api/v1/chat/completions`)
- `OPENROUTER_HTTP_REFERER` - optional OpenRouter attribution header
- `OPENROUTER_APP_NAME` - optional OpenRouter app name header (`X-Title`)
- `X402_ENABLED` - set `false` to bypass paywall (useful for local tests)
- `X402_PRICE` - global default price for all services (default: `$0.02`)
- `X402_PRICE_PERPLEXITY_SEARCH` - override price for perplexity-search
- `X402_PRICE_TOKEN_PRICE` - override price for token-price (code default: `$0.001`)
- `X402_FACILITATOR_URL` - facilitator URL (default: `https://facilitator.openx402.ai`)

When `PERPLEXITY_API_PROVIDER=openrouter`, use OpenRouter model IDs such as
`perplexity/sonar-pro` or `perplexity/sonar`.
