/**
 * SPEC ↔ ROUTER — the closed route table is stated ONCE in prose
 * (engineering/PUBLICATION_HOST_SPEC.md §6, the "route" column) and ENFORCED once in code
 * (src/router.ts `ROUTES`). A rule stated in a document needs a gate (DEC-12), so this
 * test holds the two equal in BOTH directions: a route the router serves that the spec
 * does not name is an undocumented door, and a route the spec names that the router does
 * not serve is a promise nobody keeps.
 *
 * Both sides are LITERAL: the router has no parameter segments by design (every path is a
 * literal, so no route can take a free value — tests/router.test.ts), and the spec spells
 * the per-API release routes out the same way. Normalization is only: method upper-cased,
 * BASE_PATH peeled when present. Nothing else is forgiven: a renamed segment reddens.
 *
 * Reads a repo file outside the package (the spec). That is a dev-time gate only; a
 * deployed agent never runs its tests.
 */

import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { BASE_PATH, ROUTES } from '../src/router';

const SPEC_FILE = join(import.meta.dir, '..', '..', '..', 'engineering', 'PUBLICATION_HOST_SPEC.md');
const SPEC_ROUTE = /`(GET|POST) (\/[^`\s]*)`/g;

function normalize(method: string, path: string): string {
  const relative = path.startsWith(`${BASE_PATH}/`) ? path.slice(BASE_PATH.length) : path;
  return `${method.toUpperCase()} ${relative}`;
}

function specSection6(): string {
  const text = readFileSync(SPEC_FILE, 'utf8');
  const start = text.indexOf('\n## 6.');
  if (start === -1) throw new Error(`${SPEC_FILE}: no "## 6." heading — the route table has nowhere to live`);
  const end = text.indexOf('\n## ', start + 1);
  return text.slice(start, end === -1 ? undefined : end);
}

function specRoutes(): string[] {
  const out = new Set<string>();
  for (const m of specSection6().matchAll(SPEC_ROUTE)) out.add(normalize(m[1] ?? '', m[2] ?? ''));
  return [...out].sort();
}

function routerRoutes(): string[] {
  return [...new Set(ROUTES.map(r => normalize(r.method, r.path)))].sort();
}

describe('spec §6 ↔ src/router.ts route table', () => {
  test('normalization peels BASE_PATH and the method case, nothing else (anti-vacuity)', () => {
    expect(normalize('post', `${BASE_PATH}/v1/releases/v2/rollback`)).toBe('POST /v1/releases/v2/rollback');
    expect(normalize('GET', '/v1/status')).not.toBe(normalize('GET', '/v1/statuses'));
    expect(normalize('POST', '/v1/releases/v1')).not.toBe(normalize('POST', '/v1/releases/v2'));
  });

  test('the spec states a route column (one literal row per router route)', () => {
    expect(specRoutes().length).toBeGreaterThanOrEqual(8);
  });

  test('the spec and the router name exactly the same routes', () => {
    expect(specRoutes()).toEqual(routerRoutes());
  });
});
