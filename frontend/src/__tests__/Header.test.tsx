import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import Header from "../components/Header";

describe("Header", () => {
  it("renders the brand name", () => {
    render(<Header />);
    expect(screen.getByText("web4-service")).toBeInTheDocument();
  });

  it("renders navigation links", () => {
    render(<Header />);
    expect(screen.getByText("Features")).toBeInTheDocument();
    expect(screen.getByText("Services")).toBeInTheDocument();
    expect(screen.getByText("Playground")).toBeInTheDocument();
  });

  it("renders docs link pointing externally", () => {
    render(<Header />);
    const docsLinks = screen.getAllByText("Docs");
    const desktopLink = docsLinks[0]!;
    expect(desktopLink.closest("a")).toHaveAttribute("target", "_blank");
  });
});
