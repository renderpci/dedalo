/**
 * Transparent PHP-proxy fallback.
 *
 * Any (dd_api, action) not yet natively ported is forwarded to the live PHP API
 * and its response returned VERBATIM (raw bytes, original status + content-type).
 * This makes the TS server byte-parity-correct from day one and lets handlers
 * port incrementally: as each action goes native, it stops proxying and must pass
 * the golden-master diff. Raw bytes are passed through — never parse+re-encode, as
 * that would risk reordering JSON keys and breaking byte parity.
 */

const FORWARD_REQUEST_HEADERS = ['cookie', 'x-dedalo-csrf-token', 'content-type', 'origin'];
const FORWARD_RESPONSE_HEADERS = ['content-type', 'set-cookie'];

export interface ProxyResult {
  status: number;
  bytes: ArrayBuffer;
  headers: Headers;
}

export async function proxyToPhp(
  phpApiUrl: string,
  rawBody: ArrayBuffer | string,
  requestHeaders: Headers,
  timeoutMs = 120_000,
): Promise<ProxyResult> {
  const headers = new Headers();
  for (const h of FORWARD_REQUEST_HEADERS) {
    const v = requestHeaders.get(h);
    if (v !== null) headers.set(h, v);
  }
  if (!headers.has('content-type')) headers.set('content-type', 'application/json');

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(phpApiUrl, {
      method: 'POST',
      headers,
      body: rawBody,
      signal: controller.signal,
    });
    const bytes = await res.arrayBuffer();
    const out = new Headers();
    for (const h of FORWARD_RESPONSE_HEADERS) {
      const v = res.headers.get(h);
      if (v !== null) out.set(h, v);
    }
    return { status: res.status, bytes, headers: out };
  } finally {
    clearTimeout(timeout);
  }
}
