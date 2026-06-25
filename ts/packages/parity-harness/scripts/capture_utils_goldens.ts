#!/usr/bin/env bun
/**
 * Capture dd_utils_api READ/INFO goldens from the live PHP engine and save them
 * as fixtures (verify_fixtures_live-compatible shape) under
 * packages/components/test/fixtures_utils.
 *
 * These gate the native dd_utils_api handler:
 *   - get_login_context   (native — config + ontology reads)
 *   - get_install_context (native — installed state, empty properties)
 * The differ drops the volatile envelope fields (csrf_token / debug /
 * dedalo_last_error) automatically.
 *
 * Re-capture only against the install whose lang/version config the builders are
 * pinned to (lg-spa / monedaiberica / 7.0.0.dev).
 *
 * Usage: PHP_URL=http://localhost:8080/v7_dev/core/api/v1/json/ bun run capture_utils_goldens.ts
 */
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { login } from '../src/login.ts';

const PHP_URL = process.env.PHP_URL ?? 'http://localhost:8080/v7_dev/core/api/v1/json/';
const OUT_DIR = join(import.meta.dir, '../../components/test/fixtures_utils');

const session = await login(PHP_URL, 'root', '123123aS');

const cases: { label: string; rqo: Record<string, unknown> }[] = [
  {
    label: 'utils_get_login_context',
    rqo: { dd_api: 'dd_utils_api', action: 'get_login_context', source: 'login' },
  },
  {
    label: 'utils_get_install_context',
    rqo: { dd_api: 'dd_utils_api', action: 'get_install_context', source: 'install' },
  },
];

for (const c of cases) {
  const res = await fetch(PHP_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      cookie: session.cookie,
      'x-dedalo-csrf-token': session.csrfToken,
    },
    body: JSON.stringify(c.rqo),
  });
  const responseBytes = await res.text();
  const fixture = {
    label: c.label,
    rqo: c.rqo,
    capturedAt: new Date().toISOString(),
    status: res.status,
    contentType: res.headers.get('content-type'),
    responseBytes,
  };
  await writeFile(join(OUT_DIR, `${c.label}.json`), JSON.stringify(fixture, null, 2) + '\n');
  console.log(`saved ${c.label} (status ${res.status})`);
}
