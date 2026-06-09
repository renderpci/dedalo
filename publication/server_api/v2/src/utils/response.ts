export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
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
    headers: { 'Content-Type': 'application/yaml', 'Cache-Control': 'no-cache' },
  });
}

export function binary(content: Uint8Array, contentType: string, status = 200): Response {
  return new Response(content, {
    status,
    headers: { 'Content-Type': contentType, 'Cache-Control': 'no-cache' },
  });
}
