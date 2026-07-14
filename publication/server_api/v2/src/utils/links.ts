/**
 * The `Link` header (RFC 8288) that makes offset pagination navigable: a client
 * follows `rel="next"` rather than reconstructing the query it just sent.
 *
 * Building the links FROM the request URL, instead of composing them from the
 * parameters, is what keeps them correct: every filter, the sort, and any path
 * prefix the deployment is mounted under (BASE_PATH, or a reverse proxy's) are
 * carried over untouched, and only `offset` moves. Nothing here needs to know what
 * the other parameters mean.
 *
 * Only the path and query are emitted — a relative reference. An absolute URL would
 * have to guess the public scheme and host, which a proxied service cannot do
 * reliably; a relative one resolves against the request the client already made.
 */
export function buildLinkHeader(
  url: URL,
  limit: number,
  offset: number,
  rowCount: number,
  total?: number,
): string | undefined {
  // limit=0 is the count-only request: there are no pages to walk.
  if (limit <= 0) return undefined;

  const links: string[] = [];

  // With `count=true` the total is known and `next` is exact. Without it, a full
  // page is the only evidence that more rows exist — so `next` is emitted
  // optimistically, and a last page that happens to be exactly `limit` long will
  // advertise a `next` that resolves to an empty page. That is the documented price
  // of not paying for a COUNT(*).
  const hasNext = total !== undefined ? offset + limit < total : rowCount === limit;
  if (hasNext) {
    // Cloned, never mutated in place: the caller's URL is still being read by the
    // handler that passed it in.
    const next = new URL(url);
    next.searchParams.set('offset', String(offset + limit));
    // `limit` is set explicitly because the request may have relied on the default;
    // a link that omitted it would silently re-page at whatever the default becomes.
    next.searchParams.set('limit', String(limit));
    links.push(`<${next.pathname}${next.search}>; rel="next"`);
  }

  if (offset > 0) {
    const prev = new URL(url);
    // Clamped at 0: an offset that walked past the start (a client that raised
    // `limit` mid-traversal) must land on the first page, not on a negative offset.
    prev.searchParams.set('offset', String(Math.max(0, offset - limit)));
    prev.searchParams.set('limit', String(limit));
    links.push(`<${prev.pathname}${prev.search}>; rel="prev"`);
  }

  // No header at all when neither direction applies — an empty Link header is not a
  // thing, and a client must not have to distinguish "no next page" from "".
  return links.length > 0 ? links.join(', ') : undefined;
}
