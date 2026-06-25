#!/usr/bin/env bun
/**
 * Capture SEARCH-MODE `get_element_context` goldens for COMPONENTS from the live
 * PHP engine (the search-builder UI renders each searchable component in
 * mode:'search' to draw its search input). Saved under
 * packages/components/test/fixtures_search_context.
 *
 * The search-mode context = the normal structure-context PLUS:
 *   - config.parent_grouper_label   (ontology term, DEDALO_DATA_LANG)
 *   - search_operators_info         (the model's static operator map)
 *   - search_options_title          (operator-tooltip HTML, label::get_label)
 *
 * Byte-reproducible for the scalar models whose operator map is static
 * (input_text/text_area/email/number/date/section_id/iri) + the UI-labels cache.
 *
 * Usage: PHP_URL=http://localhost:8080/v7_dev/core/api/v1/json/ bun run capture_search_context_goldens.ts
 */
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { login } from '../src/login.ts';

const PHP_URL = process.env.PHP_URL ?? 'http://localhost:8080/v7_dev/core/api/v1/json/';
const OUT_DIR = join(import.meta.dir, '../../components/test/fixtures_search_context');

const session = await login(PHP_URL, 'root', '123123aS');

const cases: { label: string; source: Record<string, unknown> }[] = [
  { label: 'search_input_text', source: { tipo: 'rsc137', section_tipo: 'rsc205', model: 'component_input_text', mode: 'search' } },
  { label: 'search_text_area', source: { tipo: 'rsc27', section_tipo: 'rsc205', model: 'component_text_area', mode: 'search' } },
  { label: 'search_email', source: { tipo: 'dd134', section_tipo: 'dd859', model: 'component_email', mode: 'search' } },
  { label: 'search_number', source: { tipo: 'numisdata134', section_tipo: 'numisdata4', model: 'component_number', mode: 'search' } },
  { label: 'search_date', source: { tipo: 'rsc44', section_tipo: 'rsc170', model: 'component_date', mode: 'search' } },
  // DECLINED → proxy (captured to assert the decline + proxy byte-parity):
  //  - component_section_id: standalone context adds `color` + tools=[] + path
  //    column:'section_id' (the section_id-specific build, not the generic one).
  //  - component_iri: stores properties.source.request_config → un-ported
  //    request_config build (+ tool_lang for translatable iri).
  { label: 'DECLINED_search_section_id', source: { tipo: 'rsc175', section_tipo: 'rsc167', model: 'component_section_id', mode: 'search' } },
  { label: 'DECLINED_search_iri', source: { tipo: 'rsc105', section_tipo: 'rsc170', model: 'component_iri', mode: 'search' } },
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
