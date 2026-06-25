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
  // ── widened models ──
  // email (generic shape, both modes)
  { label: 'context_email_edit', source: { tipo: 'rsc102', section_tipo: 'rsc280', model: 'component_email', mode: 'edit' } },
  { label: 'context_email_list', source: { tipo: 'rsc102', section_tipo: 'rsc280', model: 'component_email', mode: 'list' } },
  // publication (generic shape, both modes)
  { label: 'context_publication_edit', source: { tipo: 'actv4', section_tipo: 'actv1', model: 'component_publication', mode: 'edit' } },
  { label: 'context_publication_list', source: { tipo: 'actv4', section_tipo: 'actv1', model: 'component_publication', mode: 'list' } },
  // text_area (LIST only — edit adds toolbar_buttons/features)
  { label: 'context_text_area_list', source: { tipo: 'numisdata149', section_tipo: 'numisdata1', model: 'component_text_area', mode: 'list' } },
  // json (generic + features), both modes
  { label: 'context_json_edit', source: { tipo: 'dd596', section_tipo: 'dd585', model: 'component_json', mode: 'edit' } },
  { label: 'context_json_list', source: { tipo: 'dd596', section_tipo: 'dd585', model: 'component_json', mode: 'list' } },
  // geolocation (generic + features + sortable:false + no path), both modes
  { label: 'context_geo_edit', source: { tipo: 'actv110', section_tipo: 'actv1', model: 'component_geolocation', mode: 'edit' } },
  { label: 'context_geo_list', source: { tipo: 'actv110', section_tipo: 'actv1', model: 'component_geolocation', mode: 'list' } },
  // filter (generic + minimal target_sections), both modes
  { label: 'context_filter_edit', source: { tipo: 'actv16', section_tipo: 'actv1', model: 'component_filter', mode: 'edit' } },
  { label: 'context_filter_list', source: { tipo: 'actv16', section_tipo: 'actv1', model: 'component_filter', mode: 'list' } },
  // select (relation request_config context), both modes
  { label: 'context_select_edit', source: { tipo: 'actv7', section_tipo: 'actv1', model: 'component_select', mode: 'edit' } },
  { label: 'context_select_list', source: { tipo: 'actv7', section_tipo: 'actv1', model: 'component_select', mode: 'list' } },
  // relation_parent (request_config + view/children_view + generic path), both modes
  { label: 'context_relation_parent_edit', source: { tipo: 'actv22', section_tipo: 'actv1', model: 'component_relation_parent', mode: 'edit' } },
  { label: 'context_relation_parent_list', source: { tipo: 'actv22', section_tipo: 'actv1', model: 'component_relation_parent', mode: 'list' } },
  // relation_related (request_config + view/children_view + 2-step path), both modes
  { label: 'context_relation_related_edit', source: { tipo: 'actv24', section_tipo: 'actv1', model: 'component_relation_related', mode: 'edit' } },
  { label: 'context_relation_related_list', source: { tipo: 'actv24', section_tipo: 'actv1', model: 'component_relation_related', mode: 'list' } },
  // section_id (generic context + color slot + tools=[] + empty path), both modes
  { label: 'context_section_id_edit', source: { tipo: 'numisdata8', section_tipo: 'numisdata1', model: 'component_section_id', mode: 'edit' } },
  { label: 'context_section_id_list', source: { tipo: 'numisdata8', section_tipo: 'numisdata1', model: 'component_section_id', mode: 'list' } },
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
