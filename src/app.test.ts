import request from "supertest";
import app from "./app";

describe("GET /", () => {
  it("returns hello message", async () => {
    const res = await request(app).get("/");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ message: "Hello from web4-service!" });
  });
});

describe("GET /health", () => {
  it("returns ok status", async () => {
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
    expect(typeof res.body.uptime).toBe("number");
  });
});

describe("GET /agent/services", () => {
  it("returns the agent service catalog", async () => {
    const res = await request(app).get("/agent/services");
    expect(res.status).toBe(200);
    expect(res.body.protocol).toBe("x402-ready");
    expect(Array.isArray(res.body.services)).toBe(true);
    expect(res.body.services).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "echo" }),
        expect.objectContaining({
          id: "research-brief",
          payment: expect.objectContaining({ amount: "0.01" }),
        }),
      ])
    );
  });
});

describe("GET /.well-known/agent-services", () => {
  it("returns a manifest with x402 protocol support", async () => {
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
    const res = await request(app)
      .post("/agent/services/echo/invoke")
      .send({ message: "hello x402" });

    expect(res.status).toBe(200);
    expect(res.body.serviceId).toBe("echo");
    expect(res.body.output.message).toBe("hello x402");
    expect(typeof res.body.output.echoedAt).toBe("string");
  });

  it("returns 402 for paid services without signature", async () => {
    const res = await request(app)
      .post("/agent/services/research-brief/invoke")
      .send({ topic: "web4.ai" });

    expect(res.status).toBe(402);
    expect(res.body.error).toBe("payment_required");
    expect(res.body.serviceId).toBe("research-brief");
    expect(res.headers["payment-required"]).toBeDefined();
  });

  it("invokes paid services with a valid x402-style signature", async () => {
    const res = await request(app)
      .post("/agent/services/research-brief/invoke")
      .set("PAYMENT-SIGNATURE", "x402_demo_signature_abc123")
      .send({ topic: "x402", audience: "agent developers" });

    expect(res.status).toBe(200);
    expect(res.body.serviceId).toBe("research-brief");
    expect(res.body.output.topic).toBe("x402");
    expect(res.body.output.audience).toBe("agent developers");
    expect(Array.isArray(res.body.output.nextActions)).toBe(true);
    expect(res.headers["payment-response"]).toBeDefined();
  });

  it("returns 404 for unknown services", async () => {
    const res = await request(app)
      .post("/agent/services/unknown/invoke")
      .send({ foo: "bar" });

    expect(res.status).toBe(404);
    expect(res.body.error).toBe("service_not_found");
  });
});
