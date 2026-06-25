/**
 * HTTP client for capturing real JSON-API responses from a running PHP Dédalo
 * (or, later, from the TS engine — both speak the same RQO contract). Mirrors the
 * existing diffusion `php_client.ts`: forwards Cookie + CSRF, POSTs an RQO, and —
 * crucially for parity — returns the RAW response bytes, not a reparsed object.
 *
 * Configuration via environment:
 *   DEDALO_API_URL        e.g. http://localhost:8080/dedalo/core/api/v1/json/
 *   DEDALO_SESSION_COOKIE raw Cookie header value for an authenticated session
 *   DEDALO_CSRF_TOKEN     CSRF token matching that session
 */

export interface CaptureConfig {
  apiUrl: string;
  cookie?: string;
  csrfToken?: string;
  timeoutMs?: number;
}

export interface CaptureResult {
  status: number;
  ok: boolean;
  /** Raw response body exactly as sent on the wire (the parity ground truth). */
  rawBytes: string;
  contentType: string | null;
}

export function configFromEnv(env: Record<string, string | undefined> = process.env): CaptureConfig {
  const apiUrl = env.DEDALO_API_URL;
  if (!apiUrl) {
    throw new Error(
      'DEDALO_API_URL is required (e.g. http://localhost:8080/dedalo/core/api/v1/json/)',
    );
  }
  const cfg: CaptureConfig = { apiUrl };
  if (env.DEDALO_SESSION_COOKIE) cfg.cookie = env.DEDALO_SESSION_COOKIE;
  if (env.DEDALO_CSRF_TOKEN) cfg.csrfToken = env.DEDALO_CSRF_TOKEN;
  return cfg;
}

export async function captureResponse(
  cfg: CaptureConfig,
  rqo: Record<string, unknown>,
): Promise<CaptureResult> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (cfg.cookie) headers['Cookie'] = cfg.cookie;
  if (cfg.csrfToken) headers['X-Dedalo-Csrf-Token'] = cfg.csrfToken;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), cfg.timeoutMs ?? 120_000);
  try {
    const res = await fetch(cfg.apiUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(rqo),
      signal: controller.signal,
    });
    const rawBytes = await res.text();
    return {
      status: res.status,
      ok: res.ok,
      rawBytes,
      contentType: res.headers.get('content-type'),
    };
  } finally {
    clearTimeout(timeout);
  }
}
