import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Playground from "../components/Playground";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

const servicesResponse = {
  protocol: "x402-ready",
  x402Enabled: true,
  services: [
    {
      id: "echo",
      name: "Echo Agent Tool",
      description: "Free utility endpoint",
      endpoint: "/agent/services/echo/invoke",
      inputSchema: { type: "object", properties: { message: { type: "string" } } },
      outputSchema: { type: "object", properties: { message: { type: "string" } } },
    },
  ],
};

beforeEach(() => {
  mockFetch.mockReset();
  mockFetch.mockImplementation((url: string) => {
    if (url === "/agent/services") {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(servicesResponse),
      });
    }
    return Promise.resolve({
      status: 200,
      json: () => Promise.resolve({ serviceId: "echo", output: { message: "hello" } }),
    });
  });
});

describe("Playground", () => {
  it("renders title and description", async () => {
    render(<Playground />);
    expect(screen.getByText("API Playground")).toBeInTheDocument();
  });

  it("loads services and shows send button", async () => {
    render(<Playground />);
    await waitFor(() => {
      expect(screen.getByText("Send Request")).toBeInTheDocument();
    });
  });

  it("sends request and displays response", async () => {
    render(<Playground />);
    const user = userEvent.setup();

    await waitFor(() => {
      expect(screen.getByText("Send Request")).toBeInTheDocument();
    });

    await user.click(screen.getByText("Send Request"));

    await waitFor(() => {
      expect(screen.getByText("200")).toBeInTheDocument();
    });
  });
});
