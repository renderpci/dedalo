/**
 * Capture filtered-count golden masters for the dd_core_api `count` action from
 * the LIVE PHP engine. Writes into @dedalo/search's fixtures dir so the existing
 * count_integration parity gate (which globs that dir) picks them up.
 *
 *   DEDALO_API_URL=http://localhost:8080/v7_dev/core/api/v1/json/ \
 *     bun run packages/components/scripts/capture_filtered_count_goldens.ts
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { login, captureResponse, type GoldenMaster } from '@dedalo/parity-harness';

const API_URL = process.env.DEDALO_API_URL ?? 'http://localhost:8080/v7_dev/core/api/v1/json/';
const USER = process.env.DEDALO_API_USER ?? 'root';
const PASS = process.env.DEDALO_API_PASS ?? '123123aS';
const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'search', 'test', 'fixtures');

const ST = 'rsc205';
const strStep = (ct: string) => ({ section_tipo: ST, component_tipo: ct, model: 'component_input_text', name: ct });
const numStep = (ct: string) => ({ section_tipo: ST, component_tipo: ct, model: 'component_number', name: ct });
const strClause = (ct: string, q: string) => ({ q, q_operator: null, lang: 'lg-spa', path: [strStep(ct)] });
const numClause = (ct: string, q: string) => ({ q, q_operator: null, lang: 'lg-spa', path: [numStep(ct)] });

function rqo(label: string, filter: unknown) {
  return {
    label,
    rqo: {
      dd_api: 'dd_core_api', action: 'count',
      source: { tipo: ST, model: 'section', mode: 'list' },
      sqo: { section_tipo: [ST], filter },
    },
  };
}

const CASES = [
  rqo('count_filter_str_equals', { $and: [strClause('rsc141', '==1')] }),                       // 23
  rqo('count_filter_str_contains', { $and: [strClause('rsc141', 'ed')] }),                       // 7
  rqo('count_filter_num_equals', { $and: [numClause('rsc195', '1')] }),                          // 183
  rqo('count_filter_and_two', { $and: [strClause('rsc141', 'ed'), strClause('rsc141', '2')] }),  // 4
  rqo('count_filter_or_two', { $or: [strClause('rsc141', 'ed'), strClause('rsc141', '2')] }),    // 10
  rqo('count_filter_no_match', { $and: [strClause('rsc141', '==zzznomatchqq')] }),               // 0
];

async function main() {
  await mkdir(FIXTURES, { recursive: true });
  const session = await login(API_URL, USER, PASS);
  const cfg = { apiUrl: API_URL, cookie: session.cookie, csrfToken: session.csrfToken };
  for (const c of CASES) {
    const res = await captureResponse(cfg, c.rqo);
    const golden: GoldenMaster & { matrixTables: string[] } = {
      label: c.label,
      rqo: c.rqo,
      matrixTables: ['matrix'],
      capturedAt: new Date().toISOString(),
      status: res.status,
      contentType: res.contentType,
      responseBytes: res.rawBytes,
    };
    await writeFile(join(FIXTURES, `${c.label}.json`), JSON.stringify(golden, null, 2));
    const parsed = JSON.parse(res.rawBytes) as { result?: { total?: number } };
    console.log(`  ✓ ${c.label}: total=${parsed.result?.total} (${res.rawBytes.length} bytes)`);
  }
}
main();
