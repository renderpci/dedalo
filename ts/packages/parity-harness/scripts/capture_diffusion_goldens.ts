#!/usr/bin/env bun
/**
 * Capture dd_diffusion_api ONTOLOGY-READ goldens from the live PHP engine and save
 * them as fixtures (verify_fixtures_live-compatible shape) under
 * packages/components/test/fixtures_diffusion.
 *
 * These gate the native dd_diffusion_api handler's two byte-reproducible reads
 * (which read the diffusion ONTOLOGY, never the MariaDB diffusion engine):
 *   - get_ontology_map  (a real diffusion_tipo with + without process; missing-arg)
 *   - get_diffusion_info (sections WITH diffusion nodes of several models; a section
 *                         with NONE; missing-arg)
 *
 * Cases are picked from the configured diffusion domain (DEDALO_DIFFUSION_DOMAIN,
 * here 'numisdata_mib' → numisdata323). The differ drops the volatile envelope
 * fields (csrf_token / debug / dedalo_last_error). The CSRF token rotates per
 * request, so each case re-uses the accumulated session token sequentially.
 *
 * Usage: PHP_URL=http://localhost:8080/v7_dev/core/api/v1/json/ bun run capture_diffusion_goldens.ts
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { login } from '../src/login.ts';

const PHP_URL = process.env.PHP_URL ?? 'http://localhost:8080/v7_dev/core/api/v1/json/';
const OUT_DIR = join(import.meta.dir, '../../components/test/fixtures_diffusion');

await mkdir(OUT_DIR, { recursive: true });

const cases: { label: string; rqo: Record<string, unknown> }[] = [
  // get_ontology_map
  { label: 'ontology_map_missing', rqo: { dd_api: 'dd_diffusion_api', action: 'get_ontology_map', options: {} } },
  { label: 'ontology_map_table_no_process', rqo: { dd_api: 'dd_diffusion_api', action: 'get_ontology_map', options: { diffusion_tipo: 'numisdata708' } } },
  { label: 'ontology_map_field_with_process', rqo: { dd_api: 'dd_diffusion_api', action: 'get_ontology_map', options: { diffusion_tipo: 'numisdata240' } } },
  { label: 'ontology_map_section_no_process', rqo: { dd_api: 'dd_diffusion_api', action: 'get_ontology_map', options: { diffusion_tipo: 'numisdata665' } } },
  // get_diffusion_info — sections with diffusion nodes (various models + alias paths)
  { label: 'info_missing', rqo: { dd_api: 'dd_diffusion_api', action: 'get_diffusion_info', options: {} } },
  { label: 'info_section_alias_table', rqo: { dd_api: 'dd_diffusion_api', action: 'get_diffusion_info', options: { section_tipo: 'numisdata665' } } },
  { label: 'info_section_table_markdown', rqo: { dd_api: 'dd_diffusion_api', action: 'get_diffusion_info', options: { section_tipo: 'numisdata6' } } },
  { label: 'info_section_xml_owlclass', rqo: { dd_api: 'dd_diffusion_api', action: 'get_diffusion_info', options: { section_tipo: 'numisdata4' } } },
  { label: 'info_section_owlclass', rqo: { dd_api: 'dd_diffusion_api', action: 'get_diffusion_info', options: { section_tipo: 'numisdata3' } } },
  // get_diffusion_info — a section with NO diffusion nodes
  { label: 'info_section_none', rqo: { dd_api: 'dd_diffusion_api', action: 'get_diffusion_info', options: { section_tipo: 'oh1' } } },
  // validate — diffusion-config checks (global admin). No-arg = every map element;
  // a single sql element (passes), an rdf element (missing service_name → fails),
  // a markdown element (passes), and a non-element tipo (element_resolvable false).
  { label: 'validate_all', rqo: { dd_api: 'dd_diffusion_api', action: 'validate', options: {} } },
  { label: 'validate_element_sql', rqo: { dd_api: 'dd_diffusion_api', action: 'validate', options: { diffusion_element_tipo: 'numisdata29' } } },
  { label: 'validate_element_rdf', rqo: { dd_api: 'dd_diffusion_api', action: 'validate', options: { diffusion_element_tipo: 'numisdata325' } } },
  { label: 'validate_element_markdown', rqo: { dd_api: 'dd_diffusion_api', action: 'validate', options: { diffusion_element_tipo: 'numisdata1567' } } },
  { label: 'validate_non_element', rqo: { dd_api: 'dd_diffusion_api', action: 'validate', options: { diffusion_element_tipo: 'numisdata6' } } },
  // retry_pending_deletions count_only — native (a pure PG count of dd1758
  // unpublish_pending rows in matrix_activity_diffusion, NOT MariaDB; global-admin).
  { label: 'retry_count_only', rqo: { dd_api: 'dd_diffusion_api', action: 'retry_pending_deletions', options: { count_only: true } } },
  { label: 'retry_count_only_limit', rqo: { dd_api: 'dd_diffusion_api', action: 'retry_pending_deletions', options: { count_only: true, limit: 50 } } },
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
