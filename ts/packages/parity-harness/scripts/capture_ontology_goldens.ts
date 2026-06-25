#!/usr/bin/env bun
/**
 * Capture dd_ontology_api READ goldens from the live PHP engine and save them as
 * fixtures (verify_fixtures_live-compatible shape) under
 * packages/components/test/fixtures_ontology.
 *
 * These gate the native dd_ontology_api handler:
 *   - get_node        (several tipos)
 *   - resolve_term    (exact + fuzzy, with/without model + is_main)
 *   - resolve_section (exact + fuzzy — real sections only; superuser session)
 *   - search          (by model / parent / tld / is_model; include_data on/off)
 *   - get_glossary    (sections / section / path)
 *   - resolve_path    (a real hop path)
 *
 * The differ drops the volatile envelope fields (csrf_token / debug /
 * dedalo_last_error). Cases are picked to be byte-reproducible: no virtual
 * sections, no int-target portals (which fatal in PHP). The CSRF token rotates
 * per request, so each case re-uses the accumulated session token sequentially.
 *
 * Usage: PHP_URL=http://localhost:8080/v7_dev/core/api/v1/json/ bun run capture_ontology_goldens.ts
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { login } from '../src/login.ts';

const PHP_URL = process.env.PHP_URL ?? 'http://localhost:8080/v7_dev/core/api/v1/json/';
const OUT_DIR = join(import.meta.dir, '../../components/test/fixtures_ontology');

await mkdir(OUT_DIR, { recursive: true });

const cases: { label: string; rqo: Record<string, unknown> }[] = [
  // get_node
  { label: 'get_node_oh1', rqo: { dd_api: 'dd_ontology_api', action: 'get_node', source: { tipo: 'oh1' } } },
  { label: 'get_node_rsc197', rqo: { dd_api: 'dd_ontology_api', action: 'get_node', source: { tipo: 'rsc197' } } },
  { label: 'get_node_rsc85', rqo: { dd_api: 'dd_ontology_api', action: 'get_node', source: { tipo: 'rsc85' } } },
  { label: 'get_node_invalid', rqo: { dd_api: 'dd_ontology_api', action: 'get_node', source: { tipo: 'NOPE!!' } } },
  { label: 'get_node_missing', rqo: { dd_api: 'dd_ontology_api', action: 'get_node', source: {} } },
  // resolve_term
  { label: 'resolve_term_exact_eng', rqo: { dd_api: 'dd_ontology_api', action: 'resolve_term', source: { text: 'Oral History', lang: 'lg-eng', mode: 'exact' } } },
  { label: 'resolve_term_exact_model', rqo: { dd_api: 'dd_ontology_api', action: 'resolve_term', source: { text: 'Oral History', lang: 'lg-eng', mode: 'exact', model: 'section' } } },
  { label: 'resolve_term_exact_spa_default', rqo: { dd_api: 'dd_ontology_api', action: 'resolve_term', source: { text: 'Personas' } } },
  { label: 'resolve_term_fuzzy', rqo: { dd_api: 'dd_ontology_api', action: 'resolve_term', source: { text: 'Oral Hstory', mode: 'fuzzy', limit: 5 } } },
  { label: 'resolve_term_fuzzy_model', rqo: { dd_api: 'dd_ontology_api', action: 'resolve_term', source: { text: 'Personas', mode: 'fuzzy', model: 'section', limit: 5 } } },
  { label: 'resolve_term_no_match', rqo: { dd_api: 'dd_ontology_api', action: 'resolve_term', source: { text: 'zzqqxx_nomatch', mode: 'exact' } } },
  { label: 'resolve_term_missing_text', rqo: { dd_api: 'dd_ontology_api', action: 'resolve_term', source: {} } },
  // resolve_section (real sections; superuser)
  { label: 'resolve_section_exact_oh', rqo: { dd_api: 'dd_ontology_api', action: 'resolve_section', source: { text: 'Oral History', lang: 'lg-eng', mode: 'exact', limit: 1 } } },
  { label: 'resolve_section_exact_people', rqo: { dd_api: 'dd_ontology_api', action: 'resolve_section', source: { text: 'People', lang: 'lg-eng', mode: 'exact', limit: 1 } } },
  { label: 'resolve_section_missing_text', rqo: { dd_api: 'dd_ontology_api', action: 'resolve_section', source: {} } },
  // search
  { label: 'search_model_section_nodata', rqo: { dd_api: 'dd_ontology_api', action: 'search', source: { model: 'section', limit: 5 }, options: { include_data: false } } },
  { label: 'search_parent_oh1', rqo: { dd_api: 'dd_ontology_api', action: 'search', source: { parent: 'oh1' }, options: { include_data: false } } },
  { label: 'search_parent_oh1_data', rqo: { dd_api: 'dd_ontology_api', action: 'search', source: { parent: 'oh1', limit: 3 } } },
  { label: 'search_tld_oh', rqo: { dd_api: 'dd_ontology_api', action: 'search', source: { tld: 'oh', model: 'section' }, options: { include_data: false } } },
  { label: 'search_empty_criteria', rqo: { dd_api: 'dd_ontology_api', action: 'search', source: {} } },
  // get_glossary
  { label: 'glossary_sections', rqo: { dd_api: 'dd_ontology_api', action: 'get_glossary', source: { mode: 'sections' } } },
  { label: 'glossary_section_rsc197', rqo: { dd_api: 'dd_ontology_api', action: 'get_glossary', source: { mode: 'section', section_tipo: 'rsc197' } } },
  { label: 'glossary_section_dd922', rqo: { dd_api: 'dd_ontology_api', action: 'get_glossary', source: { mode: 'section', section_tipo: 'dd922' } } },
  { label: 'glossary_section_missing', rqo: { dd_api: 'dd_ontology_api', action: 'get_glossary', source: { mode: 'section' } } },
  { label: 'glossary_path', rqo: { dd_api: 'dd_ontology_api', action: 'get_glossary', source: { mode: 'path', path: ['oh1', 'oh24', 'rsc197', 'rsc85'] } } },
  { label: 'glossary_invalid_mode', rqo: { dd_api: 'dd_ontology_api', action: 'get_glossary', source: { mode: 'bogus' } } },
  // resolve_path
  { label: 'resolve_path_oh', rqo: { dd_api: 'dd_ontology_api', action: 'resolve_path', source: { path: ['oh1', 'oh24', 'rsc197', 'rsc85'] } } },
  { label: 'resolve_path_too_short', rqo: { dd_api: 'dd_ontology_api', action: 'resolve_path', source: { path: ['oh1'] } } },
  { label: 'resolve_path_missing', rqo: { dd_api: 'dd_ontology_api', action: 'resolve_path', source: {} } },
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
