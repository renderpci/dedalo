// RFC 8288 Link header for offset pagination. The original request URL is
// cloned so filters, sort, and BASE_PATH are preserved.
export function buildLinkHeader(
  url: URL,
  limit: number,
  offset: number,
  rowCount: number,
  total?: number,
): string | undefined {
  if (limit <= 0) return undefined;

  const links: string[] = [];

  const hasNext = total !== undefined ? offset + limit < total : rowCount === limit;
  if (hasNext) {
    const next = new URL(url);
    next.searchParams.set('offset', String(offset + limit));
    next.searchParams.set('limit', String(limit));
    links.push(`<${next.pathname}${next.search}>; rel="next"`);
  }

  if (offset > 0) {
    const prev = new URL(url);
    prev.searchParams.set('offset', String(Math.max(0, offset - limit)));
    prev.searchParams.set('limit', String(limit));
    links.push(`<${prev.pathname}${prev.search}>; rel="prev"`);
  }

  return links.length > 0 ? links.join(', ') : undefined;
}
