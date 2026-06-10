import type { ApiError } from '../errors';

export function json(data: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

// RFC 9457 Problem Details response
export function problem(error: ApiError, instance: string): Response {
  const body: Record<string, unknown> = {
    type: error.type,
    title: error.title,
    status: error.status,
    detail: error.detail,
    instance,
    ...error.extensions,
  };

  const headers: Record<string, string> = {
    'Content-Type': 'application/problem+json',
  };
  if ('allow' in error && Array.isArray((error as { allow?: string[] }).allow)) {
    headers['Allow'] = (error as { allow: string[] }).allow.join(', ');
  }

  return new Response(JSON.stringify(body), { status: error.status, headers });
}

export function noContent(): Response {
  return new Response(null, { status: 204 });
}

export function html(content: string, status = 200): Response {
  return new Response(content, {
    status,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}

export function yaml(content: string, status = 200): Response {
  return new Response(content, {
    status,
    headers: { 'Content-Type': 'application/yaml' },
  });
}

export function binary(content: Uint8Array, contentType: string, status = 200): Response {
  return new Response(content, {
    status,
    headers: { 'Content-Type': contentType, 'Cache-Control': 'no-cache' },
  });
}
