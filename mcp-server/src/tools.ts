import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { listServices, invokeService } from "./client.js";

function formatServiceList(
  services: Awaited<ReturnType<typeof listServices>>
): string {
  return services
    .map((s) => {
      const price = s.payment ? s.payment.price : "Free";
      const fields = Object.keys(
        (s.inputSchema as Record<string, unknown>).properties ?? {}
      ).join(", ");
      return `- **${s.name}** (${s.id}) — ${s.description}\n  Price: ${price} | Input: ${fields || "none"}`;
    })
    .join("\n\n");
}

export function registerTools(server: McpServer): void {
  server.registerTool(
    "web4_list_services",
    {
      title: "List web4 Services",
      description:
        "Discover all available web4-service endpoints with their pricing, " +
        "input schemas, and payment requirements. Use this to find which services " +
        "are available before invoking them.",
      inputSchema: {},
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async () => {
      try {
        const services = await listServices();
        const text = formatServiceList(services);
        return {
          content: [{ type: "text", text }],
          structuredContent: { services },
        };
      } catch (error) {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: `Error: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
        };
      }
    }
  );

  server.registerTool(
    "web4_echo",
    {
      title: "Echo (Free)",
      description:
        "Free connectivity test. Echoes back your message with a timestamp. " +
        "No payment required. Use this to verify the web4-service connection is working.",
      inputSchema: {
        message: z
          .string()
          .optional()
          .describe('Message to echo back (default: "hello agent")'),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ message }) => {
      try {
        const result = await invokeService("echo", {
          ...(message ? { message } : {}),
        });
        return {
          content: [
            { type: "text", text: JSON.stringify(result.output, null, 2) },
          ],
          structuredContent: result.output,
        };
      } catch (error) {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: `Error: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
        };
      }
    }
  );

  server.registerTool(
    "web4_search",
    {
      title: "Perplexity Web Search (Paid)",
      description:
        "Search the web using Perplexity AI. Returns an answer with source citations. " +
        "Requires WEB4_WALLET_PRIVATE_KEY for x402 payment (USDC).",
      inputSchema: {
        query: z
          .string()
          .min(1, "Query must not be empty")
          .describe("The search query"),
        model: z
          .string()
          .optional()
          .describe("Optional model override (e.g. 'sonar-pro')"),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async ({ query, model }) => {
      try {
        const result = await invokeService("perplexity-search", {
          query,
          ...(model ? { model } : {}),
        });
        const output = result.output as {
          answer?: string;
          citations?: string[];
          model?: string;
        };
        const lines = [output.answer ?? ""];
        if (output.citations?.length) {
          lines.push("", "**Sources:**");
          output.citations.forEach((c, i) => lines.push(`${i + 1}. ${c}`));
        }
        return {
          content: [{ type: "text", text: lines.join("\n") }],
          structuredContent: result.output,
        };
      } catch (error) {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: `Error: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
        };
      }
    }
  );

  server.registerTool(
    "web4_token_price",
    {
      title: "Token Price Lookup (Paid)",
      description:
        "Look up real-time cryptocurrency prices via CoinGecko. " +
        "Accepts token names, symbols (e.g. 'BTC'), or CoinGecko IDs (e.g. 'bitcoin'). " +
        "Returns price, 24h change, market cap, and volume. " +
        "Requires WEB4_WALLET_PRIVATE_KEY for x402 payment (USDC).",
      inputSchema: {
        token: z
          .string()
          .min(1, "Token must not be empty")
          .describe(
            "Token name, symbol, or CoinGecko ID (e.g. 'bitcoin', 'ETH', 'solana')"
          ),
        currency: z
          .string()
          .default("usd")
          .describe("Quote currency (default: 'usd')"),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async ({ token, currency }) => {
      try {
        const result = await invokeService("token-price", { token, currency });
        const output = result.output as {
          name?: string;
          symbol?: string;
          price?: number;
          currency?: string;
          change24h?: number | null;
          marketCap?: number | null;
        };
        const lines = [
          `**${output.name}** (${output.symbol?.toUpperCase()})`,
          `Price: ${output.price} ${output.currency?.toUpperCase()}`,
        ];
        if (output.change24h != null) {
          lines.push(`24h Change: ${output.change24h > 0 ? "+" : ""}${output.change24h}%`);
        }
        if (output.marketCap != null) {
          lines.push(`Market Cap: $${output.marketCap.toLocaleString()}`);
        }
        return {
          content: [{ type: "text", text: lines.join("\n") }],
          structuredContent: result.output,
        };
      } catch (error) {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: `Error: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
        };
      }
    }
  );

  server.registerTool(
    "web4_ens_resolve",
    {
      title: "ENS Resolution (Paid)",
      description:
        "Resolve ENS names to Ethereum addresses (forward) or addresses to ENS names (reverse). " +
        "Also returns avatar URL and text records (twitter, github, description, etc.). " +
        "Provide either 'name' or 'address' (name takes priority if both given). " +
        "Requires WEB4_WALLET_PRIVATE_KEY for x402 payment (USDC).",
      inputSchema: {
        name: z
          .string()
          .optional()
          .describe("ENS name to resolve (e.g. 'vitalik.eth')"),
        address: z
          .string()
          .optional()
          .describe(
            "Ethereum address for reverse resolution (e.g. '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045')"
          ),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ name, address }) => {
      try {
        if (!name && !address) {
          return {
            isError: true,
            content: [
              {
                type: "text",
                text: "Error: At least one of 'name' or 'address' must be provided.",
              },
            ],
          };
        }
        const result = await invokeService("ens-resolve", {
          ...(name ? { name } : {}),
          ...(address ? { address } : {}),
        });
        const output = result.output as {
          name?: string | null;
          address?: string | null;
          avatar?: string | null;
          records?: Record<string, string | null>;
        };
        const lines = [];
        if (output.name) lines.push(`**Name:** ${output.name}`);
        if (output.address) lines.push(`**Address:** ${output.address}`);
        if (output.avatar) lines.push(`**Avatar:** ${output.avatar}`);
        if (output.records) {
          const entries = Object.entries(output.records).filter(
            ([, v]) => v != null
          );
          if (entries.length > 0) {
            lines.push("**Records:**");
            entries.forEach(([k, v]) => lines.push(`  - ${k}: ${v}`));
          }
        }
        return {
          content: [
            { type: "text", text: lines.join("\n") || "No data found." },
          ],
          structuredContent: result.output,
        };
      } catch (error) {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: `Error: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
        };
      }
    }
  );
}
