import { config } from '../config';

const CACHEABLE_TYPES = ['application/json', 'application/yaml', 'text/html'];

function stripBasePath(pathname: string): string {
  if (config.BASE_PATH && pathname.startsWith(config.BASE_PATH)) {
    return pathname.slice(config.BASE_PATH.length) || '/';
  }
  return pathname;
}

function isCacheable(req: Request, res: Response): boolean {
  if (req.method !== 'GET' || res.status !== 200) return false;

  const contentType = res.headers.get('content-type') || '';
  if (!CACHEABLE_TYPES.some(type => contentType.includes(type))) return false;

  try {
    const pathname = stripBasePath(new URL(req.url).pathname);
    if (pathname === '/health') return false;
    if (config.MCP_ENABLED && pathname === config.MCP_PATH) return false;
  } catch {
    return false;
  }

  return true;
}

function etagMatches(ifNoneMatch: string, etag: string): boolean {
  const normalize = (tag: string) => tag.trim().replace(/^W\//, '');
  if (ifNoneMatch.trim() === '*') return true;
  return ifNoneMatch.split(',').some(tag => normalize(tag) === normalize(etag));
}

// Public read-only data: every cacheable 200 gets a weak ETag (the outer
// compression layer changes bytes per encoding) and Cache-Control, with
// If-None-Match revalidation answered as 304.
export function withHttpCache(handler: (req: Request) => Promise<Response>): (req: Request) => Promise<Response> {
  return async (req: Request) => {
    const res = await handler(req);

    if (!isCacheable(req, res)) return res;

    const body = await res.arrayBuffer();
    const etag = `W/"${Bun.hash(new Uint8Array(body)).toString(16)}"`;

    const headers = new Headers(res.headers);
    headers.set('ETag', etag);
    headers.set(
      'Cache-Control',
      config.CACHE_MAX_AGE > 0 ? `public, max-age=${config.CACHE_MAX_AGE}` : 'no-cache',
    );
    headers.set('Vary', 'Accept-Encoding');

    const ifNoneMatch = req.headers.get('if-none-match');
    if (ifNoneMatch && etagMatches(ifNoneMatch, etag)) {
      headers.delete('Content-Length');
      return new Response(null, { status: 304, headers });
    }

    return new Response(body, {
      status: res.status,
      statusText: res.statusText,
      headers,
    });
  };
}
