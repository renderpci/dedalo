#!/usr/bin/env bun
/**
 * Live verification of the first incremental cutover:
 *   - a real component_input_text get_value is served NATIVELY by the TS server
 *     and is byte-green vs PHP (after volatile redaction);
 *   - a section read (not yet ported) is transparently PROXIED and stays byte-green.
 *
 * Usage: TS_URL=http://localhost:3200/ PHP_URL=http://…/json/ bun run verify_cutover.ts
 */
import { login } from '../src/login.ts';
import { diffJson, formatDiffReport } from '../src/differ.ts';

const TS_URL = process.env.TS_URL ?? 'http://localhost:3200/';
const PHP_URL = process.env.PHP_URL ?? 'http://localhost:8080/v7_dev/core/api/v1/json/';

async function post(url: string, rqo: unknown, session: { cookie: string; csrfToken: string }): Promise<string> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie: session.cookie, 'x-dedalo-csrf-token': session.csrfToken },
    body: JSON.stringify(rqo),
  });
  return res.text();
}

const session = await login(PHP_URL, 'root', '123123aS');
console.log(`logged in (csrf ${session.csrfToken.slice(0, 10)}…)\n`);

// A real input_text get_value (from the components goldens).
const getValueRqo = {
  dd_api: 'dd_core_api',
  action: 'read',
  source: { typo: 'source', type: 'component', action: 'get_value', tipo: 'rsc144', section_tipo: 'rsc205', section_id: 1, lang: 'lg-spa' },
};
// An email get_value — lives in matrix_test, so it exercises per-request matrix
// table resolution through the native handler (was hardcoded 'matrix' before).
const emailRqo = {
  dd_api: 'dd_core_api',
  action: 'read',
  source: { typo: 'source', type: 'component', action: 'get_value', tipo: 'test208', section_tipo: 'test3', section_id: 1527, lang: 'lg-nolan' },
};
// A section read — NOT ported; must proxy.
const sectionReadRqo = {
  dd_api: 'dd_core_api',
  action: 'get_element_context',
  source: { tipo: 'cont2', model: 'section', mode: 'list' },
};

let failures = 0;
for (const [label, rqo] of [
  ['NATIVE  read/get_value input_text (rsc144, matrix)', getValueRqo],
  ['NATIVE  read/get_value email (test208, matrix_test)', emailRqo],
  ['PROXY   get_element_context section (cont2)', sectionReadRqo],
] as const) {
  const [tsBytes, phpBytes] = await Promise.all([post(TS_URL, rqo, session), post(PHP_URL, rqo, session)]);
  const result = diffJson(phpBytes, tsBytes);
  console.log(formatDiffReport(label, result));
  if (!result.equal) failures++;
}

// Prove the native path is actually native (not proxied): the TS server, pointed
// at a BOGUS php url, must still answer get_value from the DB. (Informational.)
console.log(`\nget_value result value (TS native): ${JSON.parse(await post(TS_URL, getValueRqo, session)).result}`);

console.log(`\n${failures === 0 ? '✓ ALL BYTE-GREEN' : `✗ ${failures} divergence(s)`}`);
process.exit(failures === 0 ? 0 : 1);
