# web4-service

A web service built with Node.js, Express, and TypeScript.

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
Price is set globally via `X402_PRICE` and applies uniformly across all networks.
When multiple options are configured, `payment-required` includes multiple `accepts`
entries so clients can pay on a chain where they have funds.
All networks must be EVM CAIP-2 identifiers supported by your configured facilitator.

## Optional environment

- `PERPLEXITY_API_PROVIDER` - `perplexity` (default) or `openrouter`
- `PERPLEXITY_MODEL` - default model override
- `PERPLEXITY_CHAT_COMPLETIONS_URL` - override Perplexity chat completions URL
- `OPENROUTER_CHAT_COMPLETIONS_URL` - override OpenRouter chat completions URL (default: `https://openrouter.ai/api/v1/chat/completions`)
- `OPENROUTER_HTTP_REFERER` - optional OpenRouter attribution header
- `OPENROUTER_APP_NAME` - optional OpenRouter app name header (`X-Title`)
- `X402_ENABLED` - set `false` to bypass paywall (useful for local tests)
- `X402_PRICE` - service price, applies to all payment networks (default: `$0.02`)
- `X402_FACILITATOR_URL` - facilitator URL (default: `https://facilitator.openx402.ai`)

When `PERPLEXITY_API_PROVIDER=openrouter`, use OpenRouter model IDs such as
`perplexity/sonar-pro` or `perplexity/sonar`.
