#!/usr/bin/env bun
/**
 * Capture FILTERED-search `read` goldens from live PHP for the parity harness.
 *
 * A filtered search is dd_core_api `read` (default action) with an `sqo.filter`
 * (Mango) + EXPLICIT limit/offset (so PHP's session sqo-merge is a no-op and the
 * explicit filter is authoritative — verified byte-stable across fresh / prior-
 * request sessions). The matched, paginated section_ids are rendered through the
 * SAME build_json_rows path as the plain list.
 *
 * Writes one golden per case into packages/components/test/fixtures_search, in the
 * same {label, rqo, capturedAt, status, contentType, responseBytes} shape the read
 * goldens use, so verify_fixtures_live replays them like any other fixture.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { login } from '../src/login.ts';

const PHP_URL = process.env.PHP_URL ?? 'http://localhost:8080/v7_dev/core/api/v1/json/';
const OUT_DIR = join(import.meta.dir, '../../components/test/fixtures_search');

const src = (st: string) => ({
  typo: 'source',
  model: 'section',
  tipo: st,
  section_tipo: st,
  mode: 'list',
  lang: 'lg-spa',
});
const strClause = (ct: string, q: string, st = 'rsc205') => ({
  q,
  q_operator: null,
  lang: 'lg-spa',
  path: [{ section_tipo: st, component_tipo: ct, model: 'component_input_text', name: ct }],
});
const numClause = (ct: string, q: string, st = 'rsc205') => ({
  q,
  q_operator: null,
  lang: 'lg-spa',
  path: [{ section_tipo: st, component_tipo: ct, model: 'component_number', name: ct }],
});

const cases: Array<{ label: string; rqo: unknown }> = [
  {
    label: 'search_rsc205_str_contains',
    rqo: {
      dd_api: 'dd_core_api',
      action: 'read',
      sqo: { section_tipo: ['rsc205'], limit: 5, offset: 0, filter: { $and: [strClause('rsc141', 'ed')] } },
      source: src('rsc205'),
    },
  },
  {
    label: 'search_rsc205_str_equals',
    rqo: {
      dd_api: 'dd_core_api',
      action: 'read',
      sqo: { section_tipo: ['rsc205'], limit: 5, offset: 0, filter: { $and: [strClause('rsc141', '==Moneda')] } },
      source: src('rsc205'),
    },
  },
  {
    label: 'search_rsc205_num_equals',
    rqo: {
      dd_api: 'dd_core_api',
      action: 'read',
      sqo: { section_tipo: ['rsc205'], limit: 5, offset: 0, filter: { $and: [numClause('rsc195', '1')] } },
      source: src('rsc205'),
    },
  },
  {
    label: 'search_rsc205_empty_result',
    rqo: {
      dd_api: 'dd_core_api',
      action: 'read',
      sqo: {
        section_tipo: ['rsc205'],
        limit: 5,
        offset: 0,
        filter: { $and: [strClause('rsc141', 'zzqxnotfound')] },
      },
      source: src('rsc205'),
    },
  },
  {
    label: 'search_rsc205_and_two',
    rqo: {
      dd_api: 'dd_core_api',
      action: 'read',
      sqo: {
        section_tipo: ['rsc205'],
        limit: 5,
        offset: 0,
        filter: { $and: [strClause('rsc141', 'e'), numClause('rsc195', '1')] },
      },
      source: src('rsc205'),
    },
  },
  {
    label: 'search_rsc205_offset_page2',
    rqo: {
      dd_api: 'dd_core_api',
      action: 'read',
      sqo: { section_tipo: ['rsc205'], limit: 3, offset: 2, filter: { $and: [strClause('rsc141', 'e')] } },
      source: src('rsc205'),
    },
  },
];

const session = await login(PHP_URL, 'root', '123123aS');
let cookie = session.cookie;
let csrf = session.csrfToken;
const jar = new Map<string, string>();
for (const part of cookie.split('; ')) {
  const eq = part.indexOf('=');
  if (eq > 0) jar.set(part.slice(0, eq), part.slice(eq + 1));
}

await mkdir(OUT_DIR, { recursive: true });
for (const c of cases) {
  const body = JSON.stringify(c.rqo);
  const res = await fetch(PHP_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie, 'x-dedalo-csrf-token': csrf },
    body,
  });
  for (const sc of res.headers.getSetCookie?.() ?? []) {
    const fp = sc.split(';', 1)[0] ?? '';
    const eq = fp.indexOf('=');
    if (eq > 0) jar.set(fp.slice(0, eq).trim(), fp.slice(eq + 1).trim());
  }
  cookie = [...jar.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
  const responseBytes = await res.text();
  try {
    const j = JSON.parse(responseBytes) as { csrf_token?: string };
    if (typeof j.csrf_token === 'string') csrf = j.csrf_token;
  } catch {}
  const golden = {
    label: c.label,
    rqo: c.rqo,
    capturedAt: new Date().toISOString(),
    status: res.status,
    contentType: res.headers.get('content-type') ?? 'application/json',
    responseBytes,
  };
  await writeFile(join(OUT_DIR, `${c.label}.json`), JSON.stringify(golden, null, 2));
  console.log(`captured ${c.label} (${responseBytes.length} bytes, status ${res.status})`);
}
console.log(`\nWrote ${cases.length} search goldens to ${OUT_DIR}`);
