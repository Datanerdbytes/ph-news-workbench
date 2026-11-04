export function readPageIds(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter(
      (entry): entry is string => typeof entry === 'string' && entry.length > 0
    );
  }

  if (typeof value === 'string' && value.trim()) {
    try {
      return readPageIds(JSON.parse(value));
    } catch {
      return [];
    }
  }

  return [];
}

export function readText(value: unknown, max = 5000): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}
