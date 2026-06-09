export function parseJsonStrings<T>(data: T): T {
  if (data === null || data === undefined) return data;

  if (Array.isArray(data)) {
    return data.map(item => parseJsonStrings(item)) as T;
  }

  if (typeof data === 'object') {
    const result: Record<string, unknown> = {};
    for (const key in data) {
      const value = (data as Record<string, unknown>)[key];
      if (typeof value === 'string' && isJsonLike(value)) {
        try {
          result[key] = JSON.parse(value);
        } catch {
          result[key] = value;
        }
      } else if (typeof value === 'object' && value !== null) {
        result[key] = parseJsonStrings(value);
      } else {
        result[key] = value;
      }
    }
    return result as T;
  }

  return data;
}

function isJsonLike(value: string): boolean {
  if (value.length < 2) return false;
  const first = value[0];
  return first === '[' || first === '{';
}