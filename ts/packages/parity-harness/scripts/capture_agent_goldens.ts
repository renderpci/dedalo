#!/usr/bin/env bun
/**
 * Capture dd_agent_api READ goldens from the live PHP engine and save them as
 * fixtures (verify_fixtures_live-compatible shape) under
 * packages/components/test/fixtures_agent.
 *
 * These gate the native dd_agent_api handler (the byte-reproducible subset):
 *   - count_records       (no-filter, tipo-form, real section; + error paths)
 *   - list_sections_index (superuser → the full artifact-derived {tipo,label} index)
 *
 * The DECLINED actions (describe_section / get_section_map / read_record_view /
 * search_records_view / get_media_url / set_field_by_label, plus the filtered /
 * human-name / virtual count cases) are NOT captured here — the handler proxies
 * them to PHP, so there is nothing to diff natively. A handful are captured as
 * "decline" fixtures purely to prove the proxy stays byte-faithful end-to-end.
 *
 * The differ drops the volatile envelope fields (csrf_token / debug /
 * dedalo_last_error). CSRF rotates per request, so cases run sequentially with the
 * accumulated session token threaded forward.
 *
 * Usage: PHP_URL=http://localhost:8080/v7_dev/core/api/v1/json/ bun run capture_agent_goldens.ts
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { login } from '../src/login.ts';

const PHP_URL = process.env.PHP_URL ?? 'http://localhost:8080/v7_dev/core/api/v1/json/';
const OUT_DIR = join(import.meta.dir, '../../components/test/fixtures_agent');

await mkdir(OUT_DIR, { recursive: true });

const cases: { label: string; rqo: Record<string, unknown> }[] = [
  // count_records — native (no filter, tipo-form, real section)
  { label: 'count_oh1_spa', rqo: { dd_api: 'dd_agent_api', action: 'count_records', source: { section_tipo: 'oh1', lang: 'lg-spa' } } },
  { label: 'count_oh1_eng', rqo: { dd_api: 'dd_agent_api', action: 'count_records', source: { section_tipo: 'oh1', lang: 'lg-eng' } } },
  { label: 'count_rsc197_spa', rqo: { dd_api: 'dd_agent_api', action: 'count_records', source: { section_tipo: 'rsc197', lang: 'lg-spa' } } },
  { label: 'count_rsc170', rqo: { dd_api: 'dd_agent_api', action: 'count_records', source: { section_tipo: 'rsc170', lang: 'lg-spa' } } },
  { label: 'count_iso2_lang', rqo: { dd_api: 'dd_agent_api', action: 'count_records', source: { section_tipo: 'oh1', lang: 'en' } } },
  { label: 'count_default_lang', rqo: { dd_api: 'dd_agent_api', action: 'count_records', source: { section_tipo: 'oh1' } } },
  // count_records — native error paths (no fatal label path)
  { label: 'count_missing_st', rqo: { dd_api: 'dd_agent_api', action: 'count_records', source: { lang: 'lg-spa' } } },
  { label: 'count_not_a_section', rqo: { dd_api: 'dd_agent_api', action: 'count_records', source: { section_tipo: 'oh14', lang: 'lg-spa' } } },
  // list_sections_index — native (superuser → full artifact index)
  { label: 'list_sections_spa', rqo: { dd_api: 'dd_agent_api', action: 'list_sections_index', source: { lang: 'lg-spa' } } },
  { label: 'list_sections_eng', rqo: { dd_api: 'dd_agent_api', action: 'list_sections_index', source: { lang: 'lg-eng' } } },
  { label: 'list_sections_no_source', rqo: { dd_api: 'dd_agent_api', action: 'list_sections_index' } },

  // get_media_url — native. rsc29 is a component_image on the real section rsc170;
  // section_id 210355 sits in the max_items_folder=1000 shard /210000. The file is
  // NOT on disk in this install, so test_file=true (default_add=false) → url:null,
  // file_exist:false (verified vs psql + the component_media_common::get_url probe).
  // No image-processing fields (no dimensions) are in the response.
  { label: 'media_rsc29_default', rqo: { dd_api: 'dd_agent_api', action: 'get_media_url', source: { section_tipo: 'rsc170', section_id: 210355, component_tipo: 'rsc29' } } },
  { label: 'media_rsc29_15MB', rqo: { dd_api: 'dd_agent_api', action: 'get_media_url', source: { section_tipo: 'rsc170', section_id: 210355, component_tipo: 'rsc29', quality: '1.5MB' } } },
  { label: 'media_rsc29_notabs', rqo: { dd_api: 'dd_agent_api', action: 'get_media_url', source: { section_tipo: 'rsc170', section_id: 210355, component_tipo: 'rsc29', absolute: false } } },
  // get_media_url — native error paths (no resolution needed; match PHP verbatim).
  { label: 'media_missing_st', rqo: { dd_api: 'dd_agent_api', action: 'get_media_url', source: { section_id: 210355, component_tipo: 'rsc29' } } },
  { label: 'media_missing_sid', rqo: { dd_api: 'dd_agent_api', action: 'get_media_url', source: { section_tipo: 'rsc170', component_tipo: 'rsc29' } } },
  { label: 'media_not_media', rqo: { dd_api: 'dd_agent_api', action: 'get_media_url', source: { section_tipo: 'rsc170', section_id: 210355, component_tipo: 'rsc26' } } },

  // read_record_view — native (TIPO-shaped, real, all-scalar-get_value sections).
  // rsc567 (Motivos de restauración) = section_id + input_text; nexus57 (Tipologías de
  // redes) = section_id + number + input_text. Both EMPTY in this install (no matrix
  // rows), so every field is null except Id (the section_id, returned as a string even
  // for a non-existent record). These two are the ONLY tipo-shaped all-scalar sections
  // (numisdata481/486 and hierarchy13 ALSO qualify by model but their >5-letter tipo
  // hits PHP's label fatal path → they MUST proxy, captured below as 'decline').
  { label: 'read_rsc567_id1', rqo: { dd_api: 'dd_agent_api', action: 'read_record_view', source: { section_tipo: 'rsc567', section_id: 1, lang: 'lg-spa' } } },
  { label: 'read_rsc567_id1_tipos', rqo: { dd_api: 'dd_agent_api', action: 'read_record_view', source: { section_tipo: 'rsc567', section_id: 1, lang: 'lg-spa', include_tipos: true } } },
  { label: 'read_nexus57_id1', rqo: { dd_api: 'dd_agent_api', action: 'read_record_view', source: { section_tipo: 'nexus57', section_id: 1, lang: 'lg-spa' } } },
  { label: 'read_nexus57_id1_eng', rqo: { dd_api: 'dd_agent_api', action: 'read_record_view', source: { section_tipo: 'nexus57', section_id: 1, lang: 'lg-eng' } } },
  { label: 'read_rsc567_missing_record', rqo: { dd_api: 'dd_agent_api', action: 'read_record_view', source: { section_tipo: 'rsc567', section_id: 999999, lang: 'lg-spa' } } },
  // read_record_view — native error paths (no resolution; match PHP verbatim).
  { label: 'read_missing_st', rqo: { dd_api: 'dd_agent_api', action: 'read_record_view', source: { section_id: 1, lang: 'lg-spa' } } },
  { label: 'read_missing_sid', rqo: { dd_api: 'dd_agent_api', action: 'read_record_view', source: { section_tipo: 'rsc567', lang: 'lg-spa' } } },

  // search_records_view — native (no filter, tipo-form, all-scalar section).
  { label: 'search_rsc567', rqo: { dd_api: 'dd_agent_api', action: 'search_records_view', source: { section_tipo: 'rsc567', lang: 'lg-spa' } } },
  { label: 'search_rsc567_count', rqo: { dd_api: 'dd_agent_api', action: 'search_records_view', source: { section_tipo: 'rsc567', lang: 'lg-spa', full_count: true } } },
  { label: 'search_nexus57_paged', rqo: { dd_api: 'dd_agent_api', action: 'search_records_view', source: { section_tipo: 'nexus57', lang: 'lg-spa', limit: 5, offset: 0, full_count: true } } },
  { label: 'search_missing_st', rqo: { dd_api: 'dd_agent_api', action: 'search_records_view', source: { lang: 'lg-spa' } } },

  // describe_section — native (TIPO-shaped, real, all-scalar section → no targets).
  { label: 'describe_rsc567_spa', rqo: { dd_api: 'dd_agent_api', action: 'describe_section', source: { section_tipo: 'rsc567', lang: 'lg-spa' } } },
  { label: 'describe_rsc567_tipos', rqo: { dd_api: 'dd_agent_api', action: 'describe_section', source: { section_tipo: 'rsc567', lang: 'lg-spa', include_tipos: true } } },
  { label: 'describe_nexus57_spa', rqo: { dd_api: 'dd_agent_api', action: 'describe_section', source: { section_tipo: 'nexus57', lang: 'lg-spa' } } },
  { label: 'describe_nexus57_eng_tipos', rqo: { dd_api: 'dd_agent_api', action: 'describe_section', source: { section_tipo: 'nexus57', lang: 'lg-eng', include_tipos: true } } },
  { label: 'describe_iso2_lang', rqo: { dd_api: 'dd_agent_api', action: 'describe_section', source: { section_tipo: 'nexus57', lang: 'en' } } },
  // describe_section — native error paths (no fatal label path).
  { label: 'describe_missing_st', rqo: { dd_api: 'dd_agent_api', action: 'describe_section', source: { lang: 'lg-spa' } } },
  { label: 'describe_not_a_section', rqo: { dd_api: 'dd_agent_api', action: 'describe_section', source: { section_tipo: 'rsc571', lang: 'lg-spa' } } },
  // describe_section — DECLINE → proxy: oh1 carries LINK / media components → targets
  // need the un-ported first_target_section_tipo resolution.
  { label: 'describe_oh1_links_decline', rqo: { dd_api: 'dd_agent_api', action: 'describe_section', source: { section_tipo: 'oh1', lang: 'lg-spa', include_tipos: true } } },

  // get_section_map — native (ARTIFACT path; entry returned verbatim, lang ignored).
  { label: 'getmap_rsc567', rqo: { dd_api: 'dd_agent_api', action: 'get_section_map', source: { section: 'rsc567', lang: 'lg-spa' } } },
  { label: 'getmap_nexus57', rqo: { dd_api: 'dd_agent_api', action: 'get_section_map', source: { section: 'nexus57', lang: 'lg-spa' } } },
  { label: 'getmap_oh1', rqo: { dd_api: 'dd_agent_api', action: 'get_section_map', source: { section: 'oh1', lang: 'lg-eng' } } },
  // get_section_map — native error paths.
  { label: 'getmap_missing', rqo: { dd_api: 'dd_agent_api', action: 'get_section_map', source: {} } },
  { label: 'getmap_not_a_section', rqo: { dd_api: 'dd_agent_api', action: 'get_section_map', source: { section: 'rsc571', lang: 'lg-spa' } } },
  // get_section_map — DECLINE → proxy: a human-NAME identifier needs un-ported resolution.
  { label: 'getmap_humanname_decline', rqo: { dd_api: 'dd_agent_api', action: 'get_section_map', source: { section: 'Motivos de restauración', lang: 'lg-spa' } } },

  // read_record_view — DECLINE → proxy (prove the proxy stays byte-faithful):
  //   oh1: a real, populated, tipo-shaped section but it carries LINK_MODELS
  //        components (portal/select/relation/filter) whose agent value is the
  //        view-specific locator expansion, not get_value → gate declines → proxy.
  //   rsc170: a section carrying a component_image (media, non-scalar) → proxy.
  { label: 'read_oh1_links_decline', rqo: { dd_api: 'dd_agent_api', action: 'read_record_view', source: { section_tipo: 'oh1', section_id: 1, lang: 'lg-spa' } } },
  // search_records_view — DECLINE → proxy: a filter with rules (label->tipo skip
  // resolution deferred, same boundary as count_records).
  { label: 'search_rsc567_filtered_decline', rqo: { dd_api: 'dd_agent_api', action: 'search_records_view', source: { section_tipo: 'rsc567', lang: 'lg-spa', filter: { operator: 'AND', rules: [{ field: 'Motivo de restauración', operator: 'contains', value: 'x' }] } } } },
];

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
