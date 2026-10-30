import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import ErrorBoundary from "./ErrorBoundary";

function Boom({ message }) {
  throw new Error(message);
}

describe("ErrorBoundary", () => {
  afterEach(() => vi.restoreAllMocks());

  it("shows a message instead of a blank screen and clears it when the page changes", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { rerender } = render(<ErrorBoundary resetKey="/a"><Boom message="bad data" /></ErrorBoundary>);
    expect(screen.getByRole("alert")).toHaveTextContent("This page could not be shown");

    rerender(<ErrorBoundary resetKey="/b"><p>Other page</p></ErrorBoundary>);
    expect(screen.getByText("Other page")).toBeInTheDocument();
  });

  it("offers a reload when an old page file is gone after a release", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    render(<ErrorBoundary><Boom message="Failed to fetch dynamically imported module: /assets/Orders-abc.js" /></ErrorBoundary>);
    expect(screen.getByRole("alert")).toHaveTextContent("A new version is available");
    expect(screen.getByRole("button", { name: /reload/i })).toBeInTheDocument();
  });
});
