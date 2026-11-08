// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { InstagramPreview } from "./instagram-preview";

afterEach(cleanup);

describe("InstagramPreview", () => {
  it("renders the media placeholder and caption prompt while empty", () => {
    render(<InstagramPreview imageUrl={null} caption="" connected={false} />);
    expect(
      screen.getByText("Your caption appears here…")
    ).toBeInTheDocument();
    expect(screen.getByText("No image selected yet")).toBeInTheDocument(
    );
  });

  it("previews the staged image bytes and the caption", () => {
    render(
      <InstagramPreview
        imageUrl="https://blob/public/instagram/x.jpg"
        caption="Something something 1:1"
        username="neuralverse"
        connected
      />
    );
    const image = screen.getByAltText("Post media");
    expect(image).toHaveAttribute(
      "src",
      "https://blob/public/instagram/x.jpg"
    );
    const captionLine = screen.getByText(
      (_, element) =>
        element?.tagName === "P" &&
        element.textContent === "neuralverse Something something 1:1"
    );
    expect(captionLine).toBeInTheDocument();
    expect(screen.getByText("neuralverse liked this")).toBeInTheDocument();
    expect(screen.getByText("Just now · Feed post")).toBeInTheDocument();
  });
});
