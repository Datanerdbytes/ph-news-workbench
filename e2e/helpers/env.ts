import { readFileSync } from "node:fs";
import { join } from "node:path";

let cached: Record<string, string> | null = null;

/**
 * Minimal .env.local reader — Playwright runs outside Next, which owns real
 * env loading, and the suite must never hardcode credentials.
 */
export function envLocal(): Record<string, string> {
  if (cached) return cached;
  cached = {};
  const raw = readFileSync(join(process.cwd(), ".env.local"), "utf8");
  for (const line of raw.split("\n")) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (match) {
      cached[match[1]] = match[2].trim().replace(/^["']|["']$/g, "");
    }
  }
  return cached;
}

export function requireEnv(key: string): string {
  const value = envLocal()[key] ?? process.env[key];
  if (!value) throw new Error(`${key} is missing from .env.local`);
  return value;
}
