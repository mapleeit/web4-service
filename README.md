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
- `POST /agent/services/:serviceId/invoke` — Invoke a service (returns `402` for unpaid paid services)

## x402-style paid flow (demo)

The repository includes an x402-inspired flow for paid agent services:

1. Call a paid service without `PAYMENT-SIGNATURE`
2. Receive `HTTP 402` + `PAYMENT-REQUIRED` response header
3. Retry with a valid demo signature (`x402_demo_*`)
4. Receive service output + `PAYMENT-RESPONSE` header

Example:

```bash
# 1) Request without payment proof -> 402
curl -i -X POST http://localhost:3000/agent/services/research-brief/invoke \
  -H "Content-Type: application/json" \
  -d '{"topic":"x402"}'

# 2) Retry with demo signature -> 200
curl -i -X POST http://localhost:3000/agent/services/research-brief/invoke \
  -H "Content-Type: application/json" \
  -H "PAYMENT-SIGNATURE: x402_demo_signature_abc123" \
  -d '{"topic":"x402","audience":"agent builders"}'
```

## Optional env vars

- `X402_PAY_TO` - recipient wallet address for paid services
- `X402_NETWORK` - payment network identifier (default: `eip155:8453`)
