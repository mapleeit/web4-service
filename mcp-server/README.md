# web4-mcp-server

MCP (Model Context Protocol) server for [web4-service](https://web4svc.com) — gives AI agents native access to pay-per-call Web3 services via x402 micropayments.

## Tools

| Tool | Description | Payment |
|---|---|---|
| `web4_list_services` | Discover available services with pricing and schemas | Free |
| `web4_echo` | Connectivity test — echoes your message back | Free |
| `web4_search` | Web search via Perplexity AI with source citations | Paid (USDC) |
| `web4_token_price` | Real-time crypto prices via CoinGecko | Paid (USDC) |
| `web4_ens_resolve` | ENS name/address resolution with text records | Paid (USDC) |

## Setup

### Build

```bash
cd mcp-server
npm install
npm run build
```

### Cursor

Add to `~/.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "web4": {
      "command": "node",
      "args": ["/absolute/path/to/mcp-server/dist/index.js"],
      "env": {
        "WEB4_WALLET_PRIVATE_KEY": "0x..."
      }
    }
  }
}
```

### Claude Desktop

Add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "web4": {
      "command": "node",
      "args": ["/absolute/path/to/mcp-server/dist/index.js"],
      "env": {
        "WEB4_WALLET_PRIVATE_KEY": "0x..."
      }
    }
  }
}
```

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `WEB4_SERVICE_URL` | `https://web4svc.com` | Base URL of the web4-service API |
| `WEB4_WALLET_PRIVATE_KEY` | — | EVM wallet private key for x402 payments (required for paid tools) |
| `WEB4_PREFERRED_NETWORK` | `eip155:8453` | Preferred payment network (Base by default) |
| `WEB4_RPC_URL` | auto | RPC endpoint for payment signing |

Free tools (`web4_echo`, `web4_list_services`) work without a wallet. Paid tools return a setup error if no wallet is configured.

## How It Works

1. AI agent calls an MCP tool (e.g. `web4_token_price`)
2. MCP server sends HTTP request to web4-service
3. For paid services: server receives HTTP 402, signs an x402 payment with your wallet, and retries
4. Result is returned to the agent as structured data + human-readable text

Payment uses USDC on EVM chains via the x402 protocol — the same mechanism used by the web4-service API directly.
