import { describe, it, expect, vi, beforeEach } from "vitest";
import { fetchServices, invokeService } from "../lib/api";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

beforeEach(() => {
  mockFetch.mockReset();
});

describe("fetchServices", () => {
  it("returns parsed service list on success", async () => {
    const payload = {
      protocol: "x402-ready",
      x402Enabled: true,
      services: [{ id: "echo", name: "Echo" }],
    };
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(payload),
    });

    const result = await fetchServices();
    expect(mockFetch).toHaveBeenCalledWith("/agent/services");
    expect(result).toEqual(payload);
  });

  it("throws on non-ok response", async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 500 });
    await expect(fetchServices()).rejects.toThrow("Failed to fetch services: 500");
  });
});

describe("invokeService", () => {
  it("sends POST with JSON body and returns status + body", async () => {
    const body = { serviceId: "echo", output: { message: "hello" } };
    mockFetch.mockResolvedValue({
      status: 200,
      json: () => Promise.resolve(body),
    });

    const result = await invokeService("echo", { message: "hello" });
    expect(mockFetch).toHaveBeenCalledWith("/agent/services/echo/invoke", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "hello" }),
    });
    expect(result).toEqual({ status: 200, body });
  });

  it("returns null body when response is not JSON", async () => {
    mockFetch.mockResolvedValue({
      status: 500,
      json: () => Promise.reject(new Error("not json")),
    });

    const result = await invokeService("echo", {});
    expect(result).toEqual({ status: 500, body: null });
  });
});
