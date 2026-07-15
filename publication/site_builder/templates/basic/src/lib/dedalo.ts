/**
 * Typed fetch helpers for the Dédalo Publication API v2.
 *
 * The base URL is baked in at scaffold time (the platform substitutes it), so these
 * helpers work with no configuration. The API is read-only and public; no credentials are
 * needed. Everything here runs in the browser — the built site is static files that fetch
 * their data at runtime.
 *
 * See the full API contract at:  <base>/docs   and   <base>/openapi.yaml
 */

// Substituted by the site builder when this template is scaffolded.
export const API_BASE = '__PUBLICATION_API_URL__';

export interface Pagination {
  limit: number;
  offset: number;
  total?: number;
}

export interface ListResponse<T = Record<string, unknown>> {
  data: T[];
  pagination: Pagination;
  meta?: Record<string, unknown>;
}

async function apiGet<T>(path: string, params?: Record<string, string | number>): Promise<T> {
  const url = new URL(API_BASE.replace(/\/$/, '') + path);
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, String(value));
    }
  }
  const res = await fetch(url.toString(), { headers: { Accept: 'application/json' } });
  if (!res.ok) {
    throw new Error(`Publication API ${res.status}: ${url.pathname}`);
  }
  return (await res.json()) as T;
}

/** List the databases this publication exposes. */
export function listDatabases(): Promise<ListResponse<{ name: string }>> {
  return apiGet('/databases');
}

/** List the tables in a database. */
export function listTables(db: string): Promise<ListResponse<{ name: string; row_count?: number }>> {
  return apiGet(`/${encodeURIComponent(db)}/tables`);
}

/** List records from a table, with optional filter/sort/pagination query params. */
export function listRecords<T = Record<string, unknown>>(
  db: string,
  table: string,
  params?: Record<string, string | number>,
): Promise<ListResponse<T>> {
  return apiGet(`/${encodeURIComponent(db)}/tables/${encodeURIComponent(table)}/records`, params);
}

/** Fetch a single record (returns its language variants). */
export function getRecord<T = Record<string, unknown>>(
  db: string,
  table: string,
  id: string | number,
): Promise<{ data: T[]; meta?: Record<string, unknown> }> {
  return apiGet(`/${encodeURIComponent(db)}/tables/${encodeURIComponent(table)}/records/${encodeURIComponent(String(id))}`);
}

/** Full-text search within a table. */
export function search<T = Record<string, unknown>>(
  db: string,
  table: string,
  query: string,
  params?: Record<string, string | number>,
): Promise<ListResponse<T>> {
  return apiGet(`/${encodeURIComponent(db)}/tables/${encodeURIComponent(table)}/search`, { q: query, ...params });
}
