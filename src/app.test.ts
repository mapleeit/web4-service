import request from "supertest";
import { createApp } from "./app";
import { clearTokenPriceCache } from "./tokenPrice";

const originalFetch = globalThis.fetch;

const setFetchMock = (mockImplementation: typeof fetch) => {
  Object.defineProperty(globalThis, "fetch", {
    value: mockImplementation,
    writable: true,
    configurable: true,
  });
};

const DEFAULT_PAYMENT_OPTIONS = JSON.stringify([
  {
    network: "eip155:8453",
    payTo: "0x000000000000000000000000000000000000dEaD",
  },
]);

beforeEach(() => {
  process.env.X402_PAYMENT_OPTIONS = DEFAULT_PAYMENT_OPTIONS;
});

afterEach(() => {
  setFetchMock(originalFetch);
  clearTokenPriceCache();
  delete process.env.PERPLEXITY_API_KEY;
  delete process.env.PERPLEXITY_MODEL;
  delete process.env.PERPLEXITY_API_PROVIDER;
  delete process.env.PERPLEXITY_CHAT_COMPLETIONS_URL;
  delete process.env.OPENROUTER_API_KEY;
  delete process.env.OPENROUTER_CHAT_COMPLETIONS_URL;
  delete process.env.OPENROUTER_HTTP_REFERER;
  delete process.env.OPENROUTER_APP_NAME;
  delete process.env.X402_FACILITATOR_URL;
  delete process.env.X402_PRICE;
  delete process.env.X402_PRICE_PERPLEXITY_SEARCH;
  delete process.env.X402_PRICE_TOKEN_PRICE;
  delete process.env.X402_PAYMENT_OPTIONS;
});

describe("GET /health", () => {
  it("returns ok status", async () => {
    const app = createApp({ enableX402: false });
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
    expect(typeof res.body.uptime).toBe("number");
  });
});

describe("GET /agent/services", () => {
  it("returns the agent service catalog", async () => {
    const app = createApp({ enableX402: false });
    const res = await request(app).get("/agent/services");
    expect(res.status).toBe(200);
    expect(res.body.protocol).toBe("x402-ready");
    expect(res.body.x402Enabled).toBe(false);
    expect(Array.isArray(res.body.services)).toBe(true);
    expect(res.body.services).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "echo" }),
        expect.objectContaining({
          id: "perplexity-search",
          payment: expect.objectContaining({ price: "$0.03" }),
        }),
        expect.objectContaining({
          id: "token-price",
          payment: expect.objectContaining({ price: "$0.0005" }),
        }),
      ])
    );
  });

  it("includes multi-network payment options when configured", async () => {
    process.env.X402_PAYMENT_OPTIONS = JSON.stringify([
      {
        network: "eip155:8453",
        payTo: "0x437896Fb526c8333819aE253C6f3cEFbA56D85A1",
      },
      {
        network: "eip155:1",
        payTo: "0x437896Fb526c8333819aE253C6f3cEFbA56D85A1",
      },
    ]);
    process.env.X402_PRICE = "$0.03";

    const app = createApp({ enableX402: false });
    const res = await request(app).get("/agent/services");
    expect(res.status).toBe(200);

    const paidService = res.body.services.find(
      (service: { id: string }) => service.id === "perplexity-search"
    );

    expect(paidService).toBeDefined();
    expect(paidService.payment.network).toBe("eip155:8453");
    expect(paidService.payment.price).toBe("$0.03");
    expect(paidService.paymentOptions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          network: "eip155:8453",
          price: "$0.03",
        }),
        expect.objectContaining({
          network: "eip155:1",
          price: "$0.03",
        }),
      ])
    );
  });

  it("throws when X402_PAYMENT_OPTIONS is missing", () => {
    delete process.env.X402_PAYMENT_OPTIONS;
    expect(() => createApp({ enableX402: false })).toThrow(
      "X402_PAYMENT_OPTIONS is required"
    );
  });

  it("requires payTo in each payment option", () => {
    process.env.X402_PAYMENT_OPTIONS = JSON.stringify([
      { network: "eip155:8453" },
    ]);
    expect(() => createApp({ enableX402: false })).toThrow(
      "X402_PAYMENT_OPTIONS[0].payTo is required"
    );
  });

  it("code-level default takes priority over global X402_PRICE", async () => {
    process.env.X402_PAYMENT_OPTIONS = JSON.stringify([
      {
        network: "eip155:8453",
        payTo: "0x1111111111111111111111111111111111111111",
      },
      {
        network: "eip155:1",
        payTo: "0x2222222222222222222222222222222222222222",
      },
    ]);
    process.env.X402_PRICE = "$0.99";

    const app = createApp({ enableX402: false });
    const res = await request(app).get("/agent/services");
    expect(res.status).toBe(200);

    const search = res.body.services.find(
      (s: { id: string }) => s.id === "perplexity-search"
    );
    const tokenPrice = res.body.services.find(
      (s: { id: string }) => s.id === "token-price"
    );

    // Both services have code-level defaults, so global $0.99 is ignored
    expect(search.payment.price).toBe("$0.03");
    expect(tokenPrice.payment.price).toBe("$0.0005");

    // Multi-network options also use per-service prices
    expect(search.paymentOptions).toEqual([
      expect.objectContaining({ network: "eip155:8453", price: "$0.03" }),
      expect.objectContaining({ network: "eip155:1", price: "$0.03" }),
    ]);
  });

  it("uses per-service env var price when set", async () => {
    process.env.X402_PRICE_PERPLEXITY_SEARCH = "$0.10";
    process.env.X402_PRICE_TOKEN_PRICE = "$0.003";

    const app = createApp({ enableX402: false });
    const res = await request(app).get("/agent/services");
    expect(res.status).toBe(200);

    const search = res.body.services.find(
      (s: { id: string }) => s.id === "perplexity-search"
    );
    const tokenPrice = res.body.services.find(
      (s: { id: string }) => s.id === "token-price"
    );

    expect(search.payment.price).toBe("$0.10");
    expect(tokenPrice.payment.price).toBe("$0.003");
  });

  it("per-service env var overrides code-level default and global", async () => {
    process.env.X402_PRICE = "$0.99";
    process.env.X402_PRICE_PERPLEXITY_SEARCH = "$0.07";
    process.env.X402_PRICE_TOKEN_PRICE = "$0.002";

    const app = createApp({ enableX402: false });
    const res = await request(app).get("/agent/services");

    const search = res.body.services.find(
      (s: { id: string }) => s.id === "perplexity-search"
    );
    const tokenPrice = res.body.services.find(
      (s: { id: string }) => s.id === "token-price"
    );

    // Both overridden by service-specific env vars
    expect(search.payment.price).toBe("$0.07");
    expect(tokenPrice.payment.price).toBe("$0.002");
  });

  it("falls back to code-level default when no env vars set", async () => {
    const app = createApp({ enableX402: false });
    const res = await request(app).get("/agent/services");

    const search = res.body.services.find(
      (s: { id: string }) => s.id === "perplexity-search"
    );
    const tokenPrice = res.body.services.find(
      (s: { id: string }) => s.id === "token-price"
    );

    // perplexity-search: code default $0.03
    expect(search.payment.price).toBe("$0.03");
    // token-price: code default $0.0005
    expect(tokenPrice.payment.price).toBe("$0.0005");
  });
});

describe("GET /.well-known/agent-services", () => {
  it("returns a manifest with x402 protocol support", async () => {
    const app = createApp({ enableX402: false });
    const res = await request(app).get("/.well-known/agent-services");
    expect(res.status).toBe(200);
    expect(res.body.name).toBe("web4-service-agent-catalog");
    expect(res.body.protocols).toContain("x402");
    expect(Array.isArray(res.body.services)).toBe(true);
    expect(res.body.services[0].endpoint).toMatch(/^http:\/\//);
  });
});

describe("POST /agent/services/:serviceId/invoke", () => {
  it("invokes free services without payment headers", async () => {
    const app = createApp({ enableX402: false });
    const res = await request(app)
      .post("/agent/services/echo/invoke")
      .send({ message: "hello x402" });

    expect(res.status).toBe(200);
    expect(res.body.serviceId).toBe("echo");
    expect(res.body.output.message).toBe("hello x402");
    expect(typeof res.body.output.echoedAt).toBe("string");
  });

  it(
    "returns 402 for paid services when x402 middleware is enabled",
    async () => {
      const app = createApp({ enableX402: true });

      const res = await request(app)
        .post("/agent/services/perplexity-search/invoke")
        .send({ query: "latest x402 updates" });

      expect(res.status).toBe(402);
      expect(res.headers["payment-required"]).toBeDefined();
    },
    15_000
  );

  it("calls Perplexity and returns search output when x402 is disabled", async () => {
    process.env.PERPLEXITY_API_KEY = "test-key";
    const fetchMock = jest
      .fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>()
      .mockResolvedValue(
        new Response(
          JSON.stringify({
            model: "sonar-pro",
            citations: ["https://x402.org"],
            choices: [
              {
                message: {
                  content: "x402 is an HTTP 402 payment protocol for APIs.",
                },
              },
            ],
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }
        )
      );
    setFetchMock(fetchMock as unknown as typeof fetch);

    const app = createApp({ enableX402: false });
    const res = await request(app)
      .post("/agent/services/perplexity-search/invoke")
      .send({ query: "what is x402?" });

    expect(res.status).toBe(200);
    expect(res.body.serviceId).toBe("perplexity-search");
    expect(res.body.output.answer).toContain("x402");
    expect(res.body.output.citations).toEqual(["https://x402.org"]);
    expect(res.body.output.model).toBe("sonar-pro");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("routes Perplexity search through OpenRouter when configured", async () => {
    process.env.PERPLEXITY_API_PROVIDER = "openrouter";
    process.env.OPENROUTER_API_KEY = "openrouter-key";
    process.env.OPENROUTER_HTTP_REFERER = "https://example.com";
    process.env.OPENROUTER_APP_NAME = "web4-service-tests";

    const fetchMock = jest
      .fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>()
      .mockResolvedValue(
        new Response(
          JSON.stringify({
            model: "perplexity/sonar-pro",
            citations: ["https://openrouter.ai/docs/overview/models"],
            choices: [
              {
                message: {
                  content: "x402 can be used with paid API workflows.",
                },
              },
            ],
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }
        )
      );
    setFetchMock(fetchMock as unknown as typeof fetch);

    const app = createApp({ enableX402: false });
    const res = await request(app)
      .post("/agent/services/perplexity-search/invoke")
      .send({ query: "what is x402?" });

    expect(res.status).toBe(200);
    expect(res.body.serviceId).toBe("perplexity-search");
    expect(res.body.output.answer).toContain("x402");
    expect(res.body.output.citations).toEqual([
      "https://openrouter.ai/docs/overview/models",
    ]);
    expect(res.body.output.model).toBe("perplexity/sonar-pro");
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const requestUrl = fetchMock.mock.calls[0][0] as string;
    const requestInit = fetchMock.mock.calls[0][1] as RequestInit;
    expect(requestUrl).toBe("https://openrouter.ai/api/v1/chat/completions");
    expect(requestInit.method).toBe("POST");
    expect(requestInit.headers).toEqual(
      expect.objectContaining({
        Authorization: "Bearer openrouter-key",
        "Content-Type": "application/json",
        "HTTP-Referer": "https://example.com",
        "X-Title": "web4-service-tests",
      })
    );

    const requestBody = JSON.parse(String(requestInit.body)) as {
      model: string;
      messages: Array<{ content: string }>;
    };
    expect(requestBody.model).toBe("perplexity/sonar-pro");
    expect(requestBody.messages[1].content).toBe("what is x402?");
  });

  it("returns 503 when Perplexity API key is missing", async () => {
    const app = createApp({ enableX402: false });
    const res = await request(app)
      .post("/agent/services/perplexity-search/invoke")
      .send({ query: "web4.ai" });

    expect(res.status).toBe(503);
    expect(res.body.error).toBe("service_unavailable");
  });

  it("returns 503 when OpenRouter key is missing for OpenRouter provider", async () => {
    process.env.PERPLEXITY_API_PROVIDER = "openrouter";
    const app = createApp({ enableX402: false });
    const res = await request(app)
      .post("/agent/services/perplexity-search/invoke")
      .send({ query: "web4.ai" });

    expect(res.status).toBe(503);
    expect(res.body.error).toBe("service_unavailable");
    expect(res.body.message).toContain("OPENROUTER_API_KEY");
  });

  it("returns 502 when Perplexity API returns an error", async () => {
    process.env.PERPLEXITY_API_KEY = "test-key";
    const fetchMock = jest
      .fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>()
      .mockResolvedValue(
        new Response(JSON.stringify({ error: "rate limited" }), {
          status: 429,
          headers: { "Content-Type": "application/json" },
        })
      );
    setFetchMock(fetchMock as unknown as typeof fetch);

    const app = createApp({ enableX402: false });
    const res = await request(app)
      .post("/agent/services/perplexity-search/invoke")
      .send({ query: "x402" });

    expect(res.status).toBe(502);
    expect(res.body.error).toBe("upstream_request_failed");
    expect(res.body.upstreamStatusCode).toBe(429);
  });

  it("returns 400 when required search query is empty", async () => {
    process.env.PERPLEXITY_API_KEY = "test-key";
    const app = createApp({ enableX402: false });
    const res = await request(app)
      .post("/agent/services/perplexity-search/invoke")
      .send({ query: "   " });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("invalid_service_input");
  });

  it("returns 404 for unknown services", async () => {
    const app = createApp({ enableX402: false });
    const res = await request(app)
      .post("/agent/services/unknown/invoke")
      .send({ foo: "bar" });

    expect(res.status).toBe(404);
    expect(res.body.error).toBe("service_not_found");
  });

  it("includes x402 payment metadata for paid service", async () => {
    const app = createApp({ enableX402: false });
    const res = await request(app).get("/agent/services");

    const paidService = res.body.services.find(
      (service: { id: string }) => service.id === "perplexity-search"
    );

    expect(paidService).toBeDefined();
    expect(paidService.payment).toEqual(
      expect.objectContaining({
        scheme: "exact",
        asset: "USDC",
      })
    );
  });

});

describe("POST /agent/services/token-price/invoke", () => {
  it("returns token price data from CoinGecko", async () => {
    const fetchMock = jest
      .fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>()
      .mockImplementation(async (input) => {
        const url = typeof input === "string" ? input : (input as Request).url;
        if (url.includes("/search")) {
          return new Response(
            JSON.stringify({
              coins: [
                { id: "bitcoin", symbol: "btc", name: "Bitcoin" },
              ],
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          );
        }
        return new Response(
          JSON.stringify({
            bitcoin: {
              usd: 97500.42,
              usd_24h_change: 2.35,
              usd_market_cap: 1920000000000,
              usd_24h_vol: 45000000000,
              last_updated_at: 1700000000,
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      });
    setFetchMock(fetchMock as unknown as typeof fetch);

    const app = createApp({ enableX402: false });
    const res = await request(app)
      .post("/agent/services/token-price/invoke")
      .send({ token: "bitcoin" });

    expect(res.status).toBe(200);
    expect(res.body.serviceId).toBe("token-price");
    expect(res.body.output.id).toBe("bitcoin");
    expect(res.body.output.symbol).toBe("BTC");
    expect(res.body.output.name).toBe("Bitcoin");
    expect(res.body.output.price).toBe(97500.42);
    expect(res.body.output.currency).toBe("usd");
    expect(res.body.output.change24h).toBe(2.35);
    expect(res.body.output.marketCap).toBe(1920000000000);
    expect(res.body.output.volume24h).toBe(45000000000);
    expect(typeof res.body.output.lastUpdated).toBe("string");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("resolves token symbols via CoinGecko search", async () => {
    const fetchMock = jest
      .fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>()
      .mockImplementation(async (input) => {
        const url = typeof input === "string" ? input : (input as Request).url;
        if (url.includes("/search")) {
          return new Response(
            JSON.stringify({
              coins: [
                { id: "ethereum", symbol: "eth", name: "Ethereum" },
                { id: "ethereum-classic", symbol: "etc", name: "Ethereum Classic" },
              ],
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          );
        }
        return new Response(
          JSON.stringify({
            ethereum: {
              eur: 2100.5,
              eur_24h_change: -1.2,
              eur_market_cap: 250000000000,
              eur_24h_vol: 12000000000,
              last_updated_at: 1700000000,
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      });
    setFetchMock(fetchMock as unknown as typeof fetch);

    const app = createApp({ enableX402: false });
    const res = await request(app)
      .post("/agent/services/token-price/invoke")
      .send({ token: "ETH", currency: "eur" });

    expect(res.status).toBe(200);
    expect(res.body.output.id).toBe("ethereum");
    expect(res.body.output.symbol).toBe("ETH");
    expect(res.body.output.currency).toBe("eur");
    expect(res.body.output.price).toBe(2100.5);
  });

  it("returns 404 when token is not found", async () => {
    const fetchMock = jest
      .fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>()
      .mockResolvedValue(
        new Response(
          JSON.stringify({ coins: [] }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      );
    setFetchMock(fetchMock as unknown as typeof fetch);

    const app = createApp({ enableX402: false });
    const res = await request(app)
      .post("/agent/services/token-price/invoke")
      .send({ token: "nonexistent_token_xyz" });

    expect(res.status).toBe(404);
    expect(res.body.error).toBe("token_not_found");
  });

  it("returns 400 when token is empty", async () => {
    const app = createApp({ enableX402: false });
    const res = await request(app)
      .post("/agent/services/token-price/invoke")
      .send({ token: "   " });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("invalid_service_input");
  });

  it("returns 502 when CoinGecko API fails", async () => {
    const fetchMock = jest
      .fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>()
      .mockResolvedValue(
        new Response("rate limited", { status: 429 })
      );
    setFetchMock(fetchMock as unknown as typeof fetch);

    const app = createApp({ enableX402: false });
    const res = await request(app)
      .post("/agent/services/token-price/invoke")
      .send({ token: "bitcoin" });

    expect(res.status).toBe(502);
    expect(res.body.error).toBe("upstream_request_failed");
    expect(res.body.upstreamStatusCode).toBe(429);
  });

  it("appears in service catalog with payment metadata", async () => {
    const app = createApp({ enableX402: false });
    const res = await request(app).get("/agent/services");

    const tokenService = res.body.services.find(
      (service: { id: string }) => service.id === "token-price"
    );

    expect(tokenService).toBeDefined();
    expect(tokenService.name).toBe("Token Price Lookup (Paid)");
    expect(tokenService.payment).toEqual(
      expect.objectContaining({
        scheme: "exact",
        asset: "USDC",
      })
    );
  });

  it("serves cached results on repeated lookups", async () => {
    const fetchMock = jest
      .fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>()
      .mockImplementation(async (input) => {
        const url = typeof input === "string" ? input : (input as Request).url;
        if (url.includes("/search")) {
          return new Response(
            JSON.stringify({
              coins: [{ id: "bitcoin", symbol: "btc", name: "Bitcoin" }],
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          );
        }
        return new Response(
          JSON.stringify({
            bitcoin: {
              usd: 65000,
              usd_24h_change: 1.0,
              usd_market_cap: 1300000000000,
              usd_24h_vol: 40000000000,
              last_updated_at: 1700000000,
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      });
    setFetchMock(fetchMock as unknown as typeof fetch);

    const app = createApp({ enableX402: false });

    const first = await request(app)
      .post("/agent/services/token-price/invoke")
      .send({ token: "bitcoin" });
    expect(first.status).toBe(200);

    const second = await request(app)
      .post("/agent/services/token-price/invoke")
      .send({ token: "bitcoin" });
    expect(second.status).toBe(200);
    expect(second.body.output.price).toBe(65000);

    // search + price on first call; both cached on second call
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
