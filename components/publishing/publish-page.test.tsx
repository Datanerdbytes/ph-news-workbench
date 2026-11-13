// @vitest-environment jsdom
import { cleanup, render, screen, fireEvent } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PlatformMark } from "@/components/platform-mark";

vi.mock("@/components/app-frame", async () => {
  const { createElement } = await import("react");
  return {
    AppFrame: ({ children }: React.PropsWithChildren) =>
      createElement("div", null, children),
  };
});

import {
  FilePicker,
  PlatformPublishPage,
  ScheduleField,
  mediaFileError,
  resolveScheduledFor,
  type PlatformConnectionState,
} from "./publish-page";

afterEach(cleanup);

const connection = (
  overrides: Partial<PlatformConnectionState> = {}
): PlatformConnectionState => ({
  loading: false,
  connected: false,
  configured: true,
  unreachable: false,
  connect: vi.fn(),
  ...overrides,
});

function renderPage(state: Partial<PlatformConnectionState> = {}) {
  return render(
    <PlatformPublishPage
      eyebrow="Publishing"
      title="Instagram"
      mark={<PlatformMark platform="instagram" className="size-7" />}
      platformName="Instagram"
      gateHint="Publishing tools post with the Instagram Graph API, so a business account must be connected first."
      connectLabel="Connect Instagram"
      connection={connection(state)}
    >
      <p>composer body</p>
    </PlatformPublishPage>
  );
}

describe("PlatformPublishPage", () => {
  it("routes connected users straight to the composer", () => {
    renderPage({ connected: true });
    expect(screen.getByText("composer body")).toBeInTheDocument();
    expect(screen.queryByText("Connect Instagram")).not.toBeInTheDocument();
  });

  it("shows a loading skeleton while the connection resolves", () => {
    renderPage({ loading: true });
    expect(screen.getByText("Instagram")).toBeInTheDocument();
    expect(
      document.querySelector('div[class*="animate-pulse"]')
    ).not.toBeNull();
    expect(screen.queryByText("composer body")).not.toBeInTheDocument();
  });

  it("branded gate prompts to connect and wires the CTA", () => {
    const connect = vi.fn();
    renderPage({ connect });
    expect(screen.getAllByText("Connect Instagram").length).toBe(2);
    expect(
      screen.getByText(
        "Publishing tools post with the Instagram Graph API, so a business account must be connected first."
      )
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Connect Instagram" }));
    expect(connect).toHaveBeenCalledOnce();
  });

  it("explains unconfigured environments without a CTA", () => {
    renderPage({ configured: false });
    expect(screen.getByText("Instagram is not configured")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Add the Instagram app credentials to this environment before publishing."
      )
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Connect Instagram" })
    ).not.toBeInTheDocument();
  });
});

describe("resolveScheduledFor", () => {
  const now = new Date("2026-11-13T09:00:00Z");

  it("accepts a value inside the 10-minute-to-75-day window", () => {
    // datetime-local values parse as *local* time — build the expectation
    // from the same string so the test is timezone-independent.
    expect(resolveScheduledFor("2026-11-14T09:00", now)).toBe(
      new Date("2026-11-14T09:00").toISOString()
    );
  });

  it("rejects missing, unparseable, and out-of-window values", () => {
    expect(resolveScheduledFor("", now)).toBeNull();
    expect(resolveScheduledFor("not-a-date", now)).toBeNull();
    // 5 minutes out — below the 10-minute floor.
    expect(resolveScheduledFor("2026-11-13T09:05", now)).toBeNull();
    // 80 days out — past the 75-day ceiling.
    expect(resolveScheduledFor("2027-02-01T09:00", now)).toBeNull();
  });
});

function makeFile(name: string, type: string, size: number): File {
  const file = new File(["x"], name, { type });
  Object.defineProperty(file, "size", { value: size });
  return file;
}

const storyVideoOpts = {
  types: ["video/mp4", "video/quicktime"],
  extensions: [".mp4", ".mov"],
  typeLabel: "an MP4 or MOV file",
  maxBytes: 100 * 1024 * 1024,
  maxLabel: "100 MB",
} as const;

describe("mediaFileError", () => {
  it("accepts a supported, in-limit file", () => {
    expect(
      mediaFileError(makeFile("clip.mp4", "video/mp4", 1024), storyVideoOpts)
    ).toBeNull();
  });

  it("rejects unsupported types with the label copy", () => {
    expect(
      mediaFileError(
        makeFile("clip.avi", "video/x-msvideo", 1024),
        storyVideoOpts
      )
    ).toBe("Choose an MP4 or MOV file.");
  });

  it("rejects oversized files before any upload starts", () => {
    expect(
      mediaFileError(
        makeFile("clip.mp4", "video/mp4", 100 * 1024 * 1024 + 1),
        storyVideoOpts
      )
    ).toBe("The file must be 100 MB or smaller.");
  });

  it("falls back to the extension when the browser reports no MIME type", () => {
    expect(mediaFileError(makeFile("clip.MOV", "", 1024), storyVideoOpts)).toBeNull();
    expect(mediaFileError(makeFile("clip.webm", "", 1024), storyVideoOpts)).toBe(
      "Choose an MP4 or MOV file."
    );
  });
});

describe("FilePicker validation", () => {
  const imageLimit = 20 * 1024 * 1024;

  function renderImagePicker(onPick: (file: File | null) => void) {
    return render(
      <FilePicker
        id="test-file"
        accept="image/jpeg,image/png,image/webp"
        label="Choose an image"
        file={null}
        onPick={onPick}
        icon={<span />}
        validate={(file) =>
          mediaFileError(file, {
            types: ["image/jpeg", "image/png", "image/webp"],
            typeLabel: "a JPEG, PNG, or WebP image",
            maxBytes: imageLimit,
            maxLabel: "20 MB",
          })
        }
      />
    );
  }

  it("shows an inline reason and does not stage an invalid pick", () => {
    const onPick = vi.fn();
    renderImagePicker(onPick);
    const input = screen.getByLabelText("File");
    fireEvent.change(input, {
      target: { files: [makeFile("huge.png", "image/png", imageLimit + 1)] },
    });
    expect(screen.getByRole("alert")).toHaveTextContent(
      "The file must be 20 MB or smaller."
    );
    expect(onPick).not.toHaveBeenCalled();
  });

  it("stages a valid pick and clears the error", () => {
    const onPick = vi.fn();
    renderImagePicker(onPick);
    const input = screen.getByLabelText("File");
    fireEvent.change(input, {
      target: { files: [makeFile("ok.png", "image/png", 1024)] },
    });
    expect(onPick).toHaveBeenCalledWith(expect.any(File));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});

describe("ScheduleField", () => {
  it("labels the datetime input and shows an inline error when given one", () => {
    const { rerender } = render(
      <ScheduleField
        enabled={false}
        onEnabled={() => {}}
        value=""
        onChange={() => {}}
      />
    );
    expect(
      screen.queryByLabelText("Publish date and time")
    ).not.toBeInTheDocument();

    rerender(
      <ScheduleField
        enabled
        onEnabled={() => {}}
        value="2026-11-14T09:00"
        onChange={() => {}}
        error="Pick a time between 10 minutes and 75 days from now."
      />
    );
    const input = screen.getByLabelText("Publish date and time");
    expect(input).toBeInTheDocument();
    expect(input.getAttribute("min")).toBeTruthy();
    expect(input.getAttribute("max")).toBeTruthy();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Pick a time between 10 minutes and 75 days from now."
    );
  });
});
