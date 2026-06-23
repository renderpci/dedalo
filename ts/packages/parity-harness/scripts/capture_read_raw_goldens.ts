#!/usr/bin/env bun
/**
 * Capture `read_raw` goldens from live PHP for the parity harness.
 *
 * read_raw is a RAW record read driven by the base list search:
 *   - type 'section'   → result = the raw matrix rows (default projection).
 *   - type 'component' → result = the raw stored column-slice for the tipo per record.
 * The empty-sqo case returns result:[]. The response envelope is
 * {result, msg, errors, table} (+ the router action/csrf decoration).
 *
 * Writes one golden per case into packages/components/test/fixtures_read_raw, in the
 * same {label, rqo, capturedAt, status, contentType, responseBytes} shape the other
 * goldens use, so verify_fixtures_live replays them like any other fixture.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { login } from '../src/login.ts';

const PHP_URL = process.env.PHP_URL ?? 'http://localhost:8080/v7_dev/core/api/v1/json/';
const OUT_DIR = join(import.meta.dir, '../../components/test/fixtures_read_raw');

const cases: Array<{ label: string; rqo: unknown }> = [
  {
    // SECTION: the full raw matrix rows (oh1 has 2 records).
    label: 'read_raw_oh1_section',
    rqo: {
      dd_api: 'dd_core_api',
      action: 'read_raw',
      options: { section_tipo: 'oh1', tipo: 'oh1', type: 'section' },
      sqo: { section_tipo: ['oh1'], limit: 5, offset: 0 },
    },
  },
  {
    // COMPONENT: the raw stored string-column slice for oh14 per record.
    label: 'read_raw_oh1_component_input_text',
    rqo: {
      dd_api: 'dd_core_api',
      action: 'read_raw',
      options: {
        section_tipo: 'oh1',
        tipo: 'oh14',
        model: 'component_input_text',
        type: 'component',
      },
      sqo: { section_tipo: ['oh1'], limit: 5, offset: 0 },
    },
  },
  {
    // COMPONENT with offset: paginated component slice.
    label: 'read_raw_oh1_component_offset',
    rqo: {
      dd_api: 'dd_core_api',
      action: 'read_raw',
      options: {
        section_tipo: 'oh1',
        tipo: 'oh14',
        model: 'component_input_text',
        type: 'component',
      },
      sqo: { section_tipo: ['oh1'], limit: 1, offset: 1 },
    },
  },
  {
    // SECTION with a content section that has more records (rsc205 numismatics).
    label: 'read_raw_rsc205_section_limit3',
    rqo: {
      dd_api: 'dd_core_api',
      action: 'read_raw',
      options: { section_tipo: 'rsc205', tipo: 'rsc205', type: 'section' },
      sqo: { section_tipo: ['rsc205'], limit: 3, offset: 0 },
    },
  },
  {
    // COMPONENT relation column slice (oh17 portal → relation column).
    label: 'read_raw_oh1_component_portal_relation',
    rqo: {
      dd_api: 'dd_core_api',
      action: 'read_raw',
      options: {
        section_tipo: 'oh1',
        tipo: 'oh17',
        model: 'component_portal',
        type: 'component',
      },
      sqo: { section_tipo: ['oh1'], limit: 5, offset: 0 },
    },
  },
  {
    // EMPTY sqo → result:[] (the search is skipped), table set.
    label: 'read_raw_oh1_empty_sqo',
    rqo: {
      dd_api: 'dd_core_api',
      action: 'read_raw',
      options: { section_tipo: 'oh1', tipo: 'oh1', type: 'section' },
    },
  },
  {
    // ERROR: empty section_tipo (the byte-identical error envelope).
    label: 'read_raw_error_empty_section_tipo',
    rqo: {
      dd_api: 'dd_core_api',
      action: 'read_raw',
      options: { tipo: 'oh1', type: 'section' },
      sqo: { section_tipo: ['oh1'], limit: 1 },
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
console.log(`\nWrote ${cases.length} read_raw goldens to ${OUT_DIR}`);
