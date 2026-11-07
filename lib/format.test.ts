import { afterEach, describe, expect, it, vi } from "vitest";
import {
  formatCost,
  formatDateTime,
  formatDomain,
  formatLongDate,
  imageSrc,
  stripMarkdown,
  timeAgo,
  wordCount,
} from "./format";

afterEach(() => {
  vi.useRealTimers();
});

describe("formatDomain", () => {
  it("returns the hostname without www", () => {
    expect(formatDomain("https://www.inquirer.net/story")).toBe("inquirer.net");
    expect(formatDomain("https://sub.gmane.org/x")).toBe("sub.gmane.org");
  });

  it("falls back to 'source' for invalid links", () => {
    expect(formatDomain("not a url")).toBe("source");
  });
});

describe("timeAgo", () => {
  it("uses relative labels inside the first week", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-07T12:00:00Z"));

    expect(timeAgo(new Date("2026-11-07T11:59:45Z"))).toBe("just now");
    expect(timeAgo(new Date("2026-11-07T11:45:00Z"))).toBe("15m ago");
    expect(timeAgo(new Date("2026-11-07T09:00:00Z"))).toBe("3h ago");
    expect(timeAgo(new Date("2026-11-05T12:00:00Z"))).toBe("2d ago");
  });

  it("switches to a short date after a week", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-07T12:00:00Z"));

    const tenDaysAgo = new Date("2026-10-28T12:00:00Z");
    expect(timeAgo(tenDaysAgo)).toBe(
      tenDaysAgo.toLocaleDateString("en-PH", { month: "short", day: "numeric" })
    );
  });

  it("returns an empty string for invalid dates", () => {
    expect(timeAgo("not a date")).toBe("");
  });
});

describe("date formatting", () => {
  it("formats long dates and datetimes as en-PH", () => {
    const date = new Date("2026-11-07T08:05:00Z");
    expect(formatLongDate(date)).toBe(
      date.toLocaleDateString("en-PH", {
        weekday: "long",
        month: "long",
        day: "numeric",
        year: "numeric",
      })
    );
    expect(formatDateTime(date)).toBe(
      date.toLocaleString("en-PH", {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })
    );
  });
});

describe("imageSrc", () => {
  it("passes through URLs and data URIs", () => {
    expect(imageSrc("https://example.com/a.png")).toBe(
      "https://example.com/a.png"
    );
    expect(imageSrc("data:image/png;base64,AAAA")).toBe(
      "data:image/png;base64,AAAA"
    );
  });

  it("wraps bare base64 as a PNG data URI", () => {
    expect(imageSrc("AAAA")).toBe("data:image/png;base64,AAAA");
  });
});

describe("formatCost and wordCount", () => {
  it("formats cost with five decimal places", () => {
    expect(formatCost(0.123456789)).toBe("$0.12346");
    expect(formatCost(1)).toBe("$1.00000");
  });

  it("counts words across whitespace runs", () => {
    expect(wordCount("one two   three\n\tfour")).toBe(4);
    expect(wordCount("")).toBe(0);
    expect(wordCount("   \n  ")).toBe(0);
  });
});

describe("stripMarkdown", () => {
  it("strips headings, blockquotes, and horizontal rules", () => {
    expect(stripMarkdown("# Head")).toBe("Head");
    expect(stripMarkdown("### Deeper head")).toBe("Deeper head");
    expect(stripMarkdown("> quoted")).toBe("quoted");
    expect(stripMarkdown("---\ntext\n***")).toBe("text");
  });

  it("unwraps code blocks and inline code", () => {
    expect(stripMarkdown("```js\nconst a = 1;\n```")).toBe("const a = 1;");
    expect(stripMarkdown("run `npm run dev` now")).toBe("run npm run dev now");
  });

  it("unwraps images and links", () => {
    expect(stripMarkdown("![alt text](https://x.com/i.png)")).toBe("alt text");
    expect(stripMarkdown("[read this](https://x.com/a)")).toBe(
      "read this (https://x.com/a)"
    );
    // When the label is the URL itself, keep just the URL.
    expect(stripMarkdown("[https://x.com/a](https://x.com/a)")).toBe(
      "https://x.com/a"
    );
  });

  it("converts list markers to bullets", () => {
    expect(stripMarkdown("- first\n- second")).toBe("• first\n• second");
    expect(stripMarkdown("* star\n1. also")).toBe("• star\n1. also");
  });

  it("strips bold, italic, and strikethrough markers", () => {
    expect(stripMarkdown("**bold** and __also bold__")).toBe(
      "bold and also bold"
    );
    expect(stripMarkdown("*it* and _it_ and ~~gone~~")).toBe(
      "it and it and gone"
    );
  });

  it("normalizes newlines, trailing spaces, and outer whitespace", () => {
    expect(stripMarkdown("a\r\nb")).toBe("a\nb");
    expect(stripMarkdown("a   \nb")).toBe("a\nb");
    expect(stripMarkdown("a\n\n\n\nb")).toBe("a\n\nb");
    expect(stripMarkdown("  wrapped  ")).toBe("wrapped");
  });

  it("handles a mixed real-world message", () => {
    const input = [
      "## Breaking",
      "Officials **confirmed** the *results* today.",
      "",
      "- Point `one`",
      "- Point two",
      "",
      "",
      "",
      "Read [the report](https://example.com/report).",
    ].join("\n");
    expect(stripMarkdown(input)).toBe(
      "Breaking\nOfficials confirmed the results today.\n\n• Point one\n• Point two\n\nRead the report (https://example.com/report)."
    );
  });
});
