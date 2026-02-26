import request from "supertest";
import { createApp } from "./app";

const originalFetch = globalThis.fetch;

const setFetchMock = (mockImplementation: typeof fetch) => {
  Object.defineProperty(globalThis, "fetch", {
    value: mockImplementation,
    writable: true,
    configurable: true,
  });
};

afterEach(() => {
  setFetchMock(originalFetch);
  delete process.env.PERPLEXITY_API_KEY;
  delete process.env.PERPLEXITY_MODEL;
});

describe("GET /", () => {
  it("returns hello message", async () => {
    const app = createApp({ enableX402: false });
    const res = await request(app).get("/");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ message: "Hello from web4-service!" });
  });
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
          payment: expect.objectContaining({ price: "$0.02" }),
        }),
      ])
    );
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

  it("returns 402 for paid services when x402 middleware is enabled", async () => {
    const app = createApp({
      enableX402: true,
      syncFacilitatorOnStart: false,
    });

    const res = await request(app)
      .post("/agent/services/perplexity-search/invoke")
      .send({ query: "latest x402 updates" });

    expect(res.status).toBe(402);
    expect(res.headers["payment-required"]).toBeDefined();
  });

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

  it("returns 503 when Perplexity API key is missing", async () => {
    const app = createApp({ enableX402: false });
    const res = await request(app)
      .post("/agent/services/perplexity-search/invoke")
      .send({ query: "web4.ai" });

    expect(res.status).toBe(503);
    expect(res.body.error).toBe("service_unavailable");
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
