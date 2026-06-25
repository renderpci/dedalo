#!/usr/bin/env bun
/**
 * Replay every captured golden through the LIVE TS server and diff the response
 * against the PHP golden bytes. This is the definitive end-to-end native-cutover
 * check: it proves the running server (not just the package library) resolves each
 * model+table natively, byte-green.
 *
 * Covers BOTH fixture sets:
 *   - components/test/fixtures  → dd_core_api `read`/get_value goldens
 *   - search/test/fixtures      → dd_core_api `count` goldens (no-filter)
 *
 * Usage: TS_URL=http://localhost:3202/ bun run verify_fixtures_live.ts
 */
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { login } from '../src/login.ts';
import { diffJson, formatDiffReport } from '../src/differ.ts';

const TS_URL = process.env.TS_URL ?? 'http://localhost:3202/';
const PHP_URL = process.env.PHP_URL ?? 'http://localhost:8080/v7_dev/core/api/v1/json/';
const FIXTURE_DIRS = [
  { label: 'read/get_value', dir: join(import.meta.dir, '../../components/test/fixtures') },
  { label: 'count', dir: join(import.meta.dir, '../../search/test/fixtures') },
  { label: 'get_element_context', dir: join(import.meta.dir, '../../components/test/fixtures_context') },
  { label: 'get_element_context/search', dir: join(import.meta.dir, '../../components/test/fixtures_search_context') },
  { label: 'read/build_json_rows', dir: join(import.meta.dir, '../../components/test/fixtures_read') },
  { label: 'read/time_machine', dir: join(import.meta.dir, '../../components/test/fixtures_tm') },
  { label: 'read/build_json_rows_edit', dir: join(import.meta.dir, '../../components/test/fixtures_read_edit') },
  { label: 'read/filtered_search', dir: join(import.meta.dir, '../../components/test/fixtures_search') },
  { label: 'read_raw', dir: join(import.meta.dir, '../../components/test/fixtures_read_raw') },
  { label: 'dd_utils_api', dir: join(import.meta.dir, '../../components/test/fixtures_utils') },
  { label: 'dd_ontology_api', dir: join(import.meta.dir, '../../components/test/fixtures_ontology') },
  { label: 'dd_diffusion_api', dir: join(import.meta.dir, '../../components/test/fixtures_diffusion') },
  { label: 'dd_agent_api', dir: join(import.meta.dir, '../../components/test/fixtures_agent') },
  { label: 'dd_tools_api', dir: join(import.meta.dir, '../../components/test/fixtures_tools') },
  { label: 'dd_ts_api', dir: join(import.meta.dir, '../../components/test/fixtures_ts_api') },
];

const session = await login(PHP_URL, 'root', '123123aS');
const headers = {
  'content-type': 'application/json',
  cookie: session.cookie,
  'x-dedalo-csrf-token': session.csrfToken,
};

// `--vs-live` (default ON; disable with VS_LIVE=0): in addition to diffing the TS
// response against the STORED golden bytes, also diff it against the CURRENT live
// PHP response for the same rqo, in the SAME session, SEQUENTIALLY. The stored
// golden can go stale (data edits) OR mask a session-stateful divergence that only
// appears once the session has accumulated sqo state from prior requests — the
// vs-golden check alone passed while the engine diverged live. vs-live is the real
// correctness signal; vs-golden is a fast regression net. Requests run strictly in
// order on one session so prior-request session state is exercised exactly as a
// browser would. (Plain-sqo lists proxy → vs-live trivially green for them.)
const VS_LIVE = process.env.VS_LIVE !== '0';

let total = 0;
let passGolden = 0;
let failGolden = 0;
let failLive = 0;
const failures: string[] = [];
for (const { label, dir } of FIXTURE_DIRS) {
  const files = (await readdir(dir)).filter((f) => f.endsWith('.json'));
  for (const f of files) {
    total++;
    const golden = JSON.parse(await readFile(join(dir, f), 'utf8')) as {
      label?: string;
      rqo: unknown;
      responseBytes: string;
    };
    const name = `[${label}] ${golden.label ?? f}`;
    const body = JSON.stringify(golden.rqo);
    // TS first, then live PHP — sequential on the shared session (NOT concurrent:
    // Dédalo rotates the CSRF token per request, so parallel fetches race it).
    const tsBytes = await (await fetch(TS_URL, { method: 'POST', headers, body })).text();
    const diffGolden = diffJson(golden.responseBytes, tsBytes);
    if (diffGolden.equal) passGolden++;
    else {
      failGolden++;
      failures.push('vs-GOLDEN ' + formatDiffReport(name, diffGolden));
    }
    if (VS_LIVE) {
      const phpBytes = await (await fetch(PHP_URL, { method: 'POST', headers, body })).text();
      const diffLive = diffJson(phpBytes, tsBytes);
      if (!diffLive.equal) {
        failLive++;
        failures.push('vs-LIVE-PHP ' + formatDiffReport(name, diffLive));
      }
    }
  }
}

console.log(`Replayed ${total} goldens through the live TS server (sequential, shared session).`);
console.log(`vs stored golden: ${passGolden} byte-green, ${failGolden} diverged.`);
if (VS_LIVE) console.log(`vs CURRENT live PHP: ${total - failLive} byte-green, ${failLive} diverged.`);
if (failures.length) console.log('\n' + failures.join('\n\n'));
process.exit(failGolden === 0 && failLive === 0 ? 0 : 1);
