#!/usr/bin/env bun
/**
 * Capture `get_element_context` goldens for COMPONENTS from the live PHP engine
 * and save them as fixtures (verify_fixtures_live-compatible shape) under
 * packages/components/test/fixtures_context.
 *
 * These goldens gate the native dd_core_api `get_element_context` action (the
 * per-component structure-context DDO) for byte-parity. Re-capture only when the
 * PHP context contract intentionally changes, against the install whose lang/url
 * config the context build is pinned to (lg-spa / /v7_dev).
 *
 * Usage: PHP_URL=http://localhost:8080/v7_dev/core/api/v1/json/ bun run capture_context.ts
 */
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { login } from '../src/login.ts';

const PHP_URL = process.env.PHP_URL ?? 'http://localhost:8080/v7_dev/core/api/v1/json/';
const OUT_DIR = join(import.meta.dir, '../../components/test/fixtures_context');

const session = await login(PHP_URL, 'root', '123123aS');

const cases: { label: string; source: Record<string, unknown> }[] = [
  { label: 'context_input_text_edit', source: { tipo: 'rsc137', section_tipo: 'rsc205', model: 'component_input_text', mode: 'edit' } },
  { label: 'context_input_text_list', source: { tipo: 'rsc137', section_tipo: 'rsc205', model: 'component_input_text', mode: 'list' } },
  { label: 'context_number_edit', source: { tipo: 'numisdata134', section_tipo: 'numisdata4', model: 'component_number', mode: 'edit' } },
  { label: 'context_number_list', source: { tipo: 'numisdata134', section_tipo: 'numisdata4', model: 'component_number', mode: 'list' } },
  { label: 'context_date_edit', source: { tipo: 'rsc44', section_tipo: 'rsc170', model: 'component_date', mode: 'edit' } },
  { label: 'context_date_list', source: { tipo: 'rsc44', section_tipo: 'rsc170', model: 'component_date', mode: 'list' } },
];

for (const c of cases) {
  const rqo = { dd_api: 'dd_core_api', action: 'get_element_context', source: c.source };
  const res = await fetch(PHP_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie: session.cookie, 'x-dedalo-csrf-token': session.csrfToken },
    body: JSON.stringify(rqo),
  });
  const responseBytes = await res.text();
  const fixture = {
    label: c.label,
    rqo,
    capturedAt: new Date().toISOString(),
    status: res.status,
    contentType: res.headers.get('content-type'),
    responseBytes,
  };
  await writeFile(join(OUT_DIR, `${c.label}.json`), JSON.stringify(fixture, null, 2) + '\n');
  console.log(`saved ${c.label} (status ${res.status})`);
}
