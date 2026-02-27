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

  it("renders GitHub link pointing externally", () => {
    render(<Header />);
    const githubLinks = screen.getAllByText("GitHub");
    const desktopLink = githubLinks[0]!;
    expect(desktopLink.closest("a")).toHaveAttribute("href", "https://github.com/mapleeit/web4-service");
    expect(desktopLink.closest("a")).toHaveAttribute("target", "_blank");
  });
});
