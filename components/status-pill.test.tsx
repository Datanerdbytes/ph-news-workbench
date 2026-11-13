// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { StatusPill, statusMeta } from "./status-pill";

afterEach(cleanup);

describe("statusMeta", () => {
  it("maps every known status to a label and colors", () => {
    expect(statusMeta("drafted").label).toBe("Drafted");
    expect(statusMeta("published").label).toBe("Published");
    expect(statusMeta("failed").label).toBe("Failed");
    expect(statusMeta("canceled").label).toBe("Canceled");
    expect(statusMeta("scheduled").label).toBe("Scheduled");
    expect(statusMeta("retrying").label).toBe("Retrying");
  });

  it("falls back to Pending for unknown statuses", () => {
    expect(statusMeta("mystery")).toEqual(statusMeta("pending"));
    expect(statusMeta("mystery").label).toBe("Pending");
  });
});

describe("StatusPill", () => {
  it("renders the status label with a decorative dot", () => {
    render(<StatusPill status="published" />);
    const pill = screen.getByText("Published").closest("span")!;
    expect(pill).toHaveTextContent("Published");
    expect(pill.querySelector("span[aria-hidden]")).not.toBeNull();
  });

  it("merges extra classes onto the pill", () => {
    const { container } = render(
      <StatusPill status="failed" className="ml-2" />
    );
    expect(container.firstElementChild!.className).toContain("ml-2");
    expect(container.firstElementChild!.className).toContain("text-destructive");
  });

  it("keeps retrying visually distinct from canceled", () => {
    const { container: retrying } = render(<StatusPill status="retrying" />);
    expect(retrying.firstElementChild!.className).toContain("text-info");
    const { container: canceled } = render(<StatusPill status="canceled" />);
    expect(canceled.firstElementChild!.className).toContain("text-warning");
  });

  it("uses the brand palette for scheduled posts", () => {
    const { container } = render(<StatusPill status="scheduled" />);
    expect(container.firstElementChild!.className).toContain("text-brand");
  });
});
