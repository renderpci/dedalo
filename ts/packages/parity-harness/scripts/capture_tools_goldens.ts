#!/usr/bin/env bun
/**
 * Capture dd_tools_api READ goldens from the live PHP engine and save them as
 * fixtures (verify_fixtures_live-compatible shape) under
 * packages/components/test/fixtures_tools.
 *
 * These gate the native dd_tools_api handler. The only byte-reproducible action is
 * user_tools (SUPERUSER session): the full registered-tools list, optionally
 * filtered by options.ar_requested_tools. tool_request is NEVER served natively
 * (every sub-action is file-generating / mutating / un-ported), so it is not
 * captured here.
 *
 * The differ drops the volatile envelope fields (csrf_token / debug /
 * dedalo_last_error / action). The CSRF token rotates per request, so each case
 * re-uses the accumulated session token sequentially.
 *
 * Usage: PHP_URL=http://localhost:8080/v7_dev/core/api/v1/json/ bun run capture_tools_goldens.ts
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { login } from '../src/login.ts';

const PHP_URL = process.env.PHP_URL ?? 'http://localhost:8080/v7_dev/core/api/v1/json/';
const OUT_DIR = join(import.meta.dir, '../../components/test/fixtures_tools');

await mkdir(OUT_DIR, { recursive: true });

const cases: { label: string; rqo: Record<string, unknown> }[] = [
  // user_tools — all authorised tools (superuser → full registered set)
  { label: 'user_tools_all', rqo: { dd_api: 'dd_tools_api', action: 'user_tools', source: {}, options: {} } },
  // user_tools — name-filtered subset (order preserved; only matching names)
  {
    label: 'user_tools_requested_subset',
    rqo: {
      dd_api: 'dd_tools_api',
      action: 'user_tools',
      source: {},
      options: { ar_requested_tools: ['tool_export', 'tool_print', 'tool_lang'] },
    },
  },
  // user_tools — single tool with FLAT cached properties (tool_print) to pin the
  // install-time cache shape path.
  {
    label: 'user_tools_requested_print',
    rqo: {
      dd_api: 'dd_tools_api',
      action: 'user_tools',
      source: {},
      options: { ar_requested_tools: ['tool_print'] },
    },
  },
  // user_tools — a tool whose registry properties are null/absent (tool_diffusion)
  // → the DDO drops `properties`.
  {
    label: 'user_tools_requested_diffusion',
    rqo: {
      dd_api: 'dd_tools_api',
      action: 'user_tools',
      source: {},
      options: { ar_requested_tools: ['tool_diffusion'] },
    },
  },
  // user_tools — no matching name → empty result array.
  {
    label: 'user_tools_requested_nomatch',
    rqo: {
      dd_api: 'dd_tools_api',
      action: 'user_tools',
      source: {},
      options: { ar_requested_tools: ['tool_does_not_exist'] },
    },
  },
];

// Single shared session; CSRF rotates per request, so capture sequentially and
// thread the latest token forward.
const session = await login(PHP_URL, 'root', '123123aS');
let csrf = session.csrfToken;

for (const c of cases) {
  const res = await fetch(PHP_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      cookie: session.cookie,
      'x-dedalo-csrf-token': csrf,
    },
    body: JSON.stringify(c.rqo),
  });
  const responseBytes = await res.text();
  try {
    const parsed = JSON.parse(responseBytes) as { csrf_token?: string };
    if (typeof parsed.csrf_token === 'string') csrf = parsed.csrf_token;
  } catch {
    /* leave csrf unchanged */
  }
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
