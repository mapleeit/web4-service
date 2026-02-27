import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Hero from "../components/Hero";

const writeText = vi.fn().mockResolvedValue(undefined);

beforeEach(() => {
  writeText.mockClear();
  Object.defineProperty(global.navigator, "clipboard", {
    value: { writeText },
    writable: true,
    configurable: true,
  });
});

describe("Hero", () => {
  it("renders the headline", () => {
    render(<Hero />);
    expect(screen.getByText("x402-Powered")).toBeInTheDocument();
    expect(screen.getByText("Agent Services")).toBeInTheDocument();
  });

  it("renders the service URL", () => {
    render(<Hero />);
    expect(screen.getByText("GET /agent/services")).toBeInTheDocument();
  });

  it("shows Copied! after clicking copy button", async () => {
    render(<Hero />);
    const user = userEvent.setup();
    await user.click(screen.getByText("Copy"));

    await waitFor(() => {
      expect(screen.getByText("Copied!")).toBeInTheDocument();
    });
  });

  it("renders playground CTA link", () => {
    render(<Hero />);
    const cta = screen.getByText("Try the Playground");
    expect(cta.closest("a")).toHaveAttribute("href", "#playground");
  });
});
