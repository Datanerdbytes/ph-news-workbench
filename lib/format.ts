export function formatDomain(link: string): string {
  try {
    return new URL(link).hostname.replace(/^www\./, "");
  } catch {
    return "source";
  }
}

export function timeAgo(input: string | Date): string {
  const date = typeof input === "string" ? new Date(input) : input;
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (!Number.isFinite(seconds)) return "";
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString("en-PH", { month: "short", day: "numeric" });
}

export function formatLongDate(input: string | Date = new Date()): string {
  const date = typeof input === "string" ? new Date(input) : input;
  return date.toLocaleDateString("en-PH", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

export function formatDateTime(input: string | Date): string {
  const date = typeof input === "string" ? new Date(input) : input;
  return date.toLocaleString("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function imageSrc(url: string): string {
  if (url.startsWith("http") || url.startsWith("data:")) return url;
  return `data:image/png;base64,${url}`;
}

export function formatCost(value: number): string {
  return `$${value.toFixed(5)}`;
}

export function wordCount(text: string): number {
  const trimmed = text.trim();
  return trimmed ? trimmed.split(/\s+/).length : 0;
}

// Facebook posts are plain text: Markdown markers would show up literally.
export function stripMarkdown(input: string): string {
  let text = input.replace(/\r\n?/g, "\n");

  text = text.replace(/(```|~~~)[a-zA-Z0-9-]*\n?([\s\S]*?)\1/g, "$2");
  text = text.replace(/`([^`]+)`/g, "$1");
  text = text.replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1");
  text = text.replace(
    /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
    (_match, label: string, url: string) =>
      label.trim() === url ? url : `${label} (${url})`
  );

  text = text.replace(/^#{1,6}\s+/gm, "");
  text = text.replace(/^>\s?/gm, "");
  text = text.replace(/^([-*_])\1{2,}\s*$/gm, "");
  text = text.replace(/^(\s*)[-*+]\s+/gm, "$1• ");

  text = text.replace(/(\*\*|__)(?=\S)([\s\S]*?\S)\1/g, "$2");
  text = text.replace(/~~(?=\S)([\s\S]*?\S)~~/g, "$1");
  text = text.replace(/(^|[^\w*])\*(?=\S)([^*\n]+?)\*(?![\w*])/g, "$1$2");
  text = text.replace(/(^|[^\w_])_(?=\S)([^_\n]+?)_(?![\w_])/g, "$1$2");
  text = text.replace(/\*\*/g, "");

  text = text.replace(/[ \t]+$/gm, "");
  text = text.replace(/\n{3,}/g, "\n\n");
  return text.trim();
}
