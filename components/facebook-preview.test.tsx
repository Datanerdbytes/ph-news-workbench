// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { FacebookPreview } from "./facebook-preview";

afterEach(cleanup);

describe("FacebookPreview", () => {
  it("shows the connection state in the header and footer", () => {
    const { rerender } = render(<FacebookPreview text="hello" connected />);
    expect(screen.getByText("Connected")).toBeInTheDocument();
    expect(
      screen.getByText("Page connected — ready to publish.")
    ).toBeInTheDocument();

    rerender(<FacebookPreview text="hello" connected={false} />);
    expect(screen.getByText("Not connected")).toBeInTheDocument();
    expect(
      screen.getByText("Preview only — connect your Facebook Page to publish.")
    ).toBeInTheDocument();
  });

  it("renders the draft text and page identity", () => {
    render(
      <FacebookPreview text="Breaking news" pageName="NeuralVerse" />
    );
    expect(screen.getByText("Breaking news")).toBeInTheDocument();
    expect(screen.getByText("NeuralVerse")).toBeInTheDocument();
  });

  it("uses a placeholder when the draft is empty", () => {
    render(<FacebookPreview text="" />);
    expect(screen.getByText("Your draft will appear here.")).toBeInTheDocument();
  });

  it("renders a single image attachment", () => {
    render(<FacebookPreview text="x" imageUrls={["https://cdn.example/a.jpg"]} />);
    const images = screen.getAllByRole("img");
    expect(images).toHaveLength(1);
    expect(images[0]).toHaveAttribute("src", "https://cdn.example/a.jpg");
  });

  it("grids up to four attachments with a +N overflow badge", () => {
    const urls = ["1", "2", "3", "4", "5"].map(
      (n) => `https://cdn.example/${n}.jpg`
    );
    render(<FacebookPreview text="x" imageUrls={urls} />);

    // PageAvatar has no picture here, so every <img> is an attachment tile.
    expect(screen.getAllByRole("img")).toHaveLength(4);
    expect(screen.getByText("+1")).toBeInTheDocument();
  });

  it("falls back to initials for the page avatar when there is no picture", () => {
    render(<FacebookPreview text="x" pageName="The Daily Buzz" />);
    // PageAvatar renders the first letter, uppercased.
    expect(screen.getByText("T")).toBeInTheDocument();
  });
});
