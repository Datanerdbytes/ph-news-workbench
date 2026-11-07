// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { AuthAlert } from "./auth-alert";

afterEach(cleanup);

describe("AuthAlert", () => {
  it("renders errors as an alert with the destructive palette", () => {
    render(<AuthAlert>Invalid email or password.</AuthAlert>);
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("Invalid email or password.");
    expect(alert.className).toContain("text-destructive");
    expect(alert.querySelector("svg")).not.toBeNull();
  });

  it("renders status callouts as a status region", () => {
    render(<AuthAlert kind="status">Check your email.</AuthAlert>);
    const status = screen.getByRole("status");
    expect(status).toHaveTextContent("Check your email.");
    expect(status.className).not.toContain("text-destructive");
  });
});
