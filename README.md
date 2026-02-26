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
  - `model` (optional, defaults to `PERPLEXITY_MODEL` or `sonar-pro`)
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

- `PERPLEXITY_API_KEY` - API key for Perplexity
- `X402_PAY_TO` - wallet address that receives payment

## Optional environment

- `PERPLEXITY_MODEL` - default model (`sonar-pro`, `sonar`, etc.)
- `X402_ENABLED` - set `false` to bypass paywall (useful for local tests)
- `X402_NETWORK` - payment network identifier (default: `eip155:84532`)
- `X402_PRICE` - paid route price string (default: `$0.02`)
- `X402_FACILITATOR_URL` - facilitator URL (default: `https://facilitator.x402.org`)
