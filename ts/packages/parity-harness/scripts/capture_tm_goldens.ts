#!/usr/bin/env bun
/**
 * Capture TIME-MACHINE single-component read goldens from live PHP.
 *
 * The tm read is the standalone single-component `get_data` action with
 * source.data_source='tm' + a matrix_id (matrix_time_machine row PK). PHP renders
 * the historical snapshot as {result:{context:[ddo(mode:tm)], data:[item(mode:tm,
 * entries=snapshot)]}, msg, errors} (+ the router action/csrf decoration).
 *
 * Cases (verified against the restored dedalo7_mib, section test3 / matrix_test):
 *   - NATIVE (TS serves from matrix_time_machine): input_text (multi + single item),
 *     number, date, email, json, geolocation (the json/geo context `features` block is
 *     now ported, so their tm element reproduces byte-for-byte; email's get_list_value
 *     null-collapse over the lang-less tm snapshot item is reproduced via the
 *     class-level supports_translation flag).
 *
 * Writes goldens into packages/components/test/fixtures_tm so verify_fixtures_live
 * replays them through the running TS server and diffs vs golden AND vs live PHP.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { login } from '../src/login.ts';

const PHP_URL = process.env.PHP_URL ?? 'http://localhost:8080/v7_dev/core/api/v1/json/';
const OUT_DIR = join(import.meta.dir, '../../components/test/fixtures_tm');

function tmRqo(
  model: string,
  tipo: string,
  sectionId: number,
  matrixId: number,
  lang: string,
  sectionTipo = 'test3',
) {
  return {
    dd_api: 'dd_core_api',
    action: 'read',
    source: {
      typo: 'source',
      type: 'component',
      action: 'get_data',
      model,
      tipo,
      section_tipo: sectionTipo,
      section_id: sectionId,
      lang,
      mode: 'tm',
      data_source: 'tm',
      matrix_id: matrixId,
    },
  };
}

const cases: Array<{ label: string; rqo: unknown }> = [
  // NATIVE input_text: matrix_id 49304311 snapshot has TWO items (Value to Keep +
  // Value to Delete) — the historical state before one was deleted.
  { label: 'tm_input_text_two_items', rqo: tmRqo('component_input_text', 'test52', 5037, 49304311, 'lg-spa') },
  // NATIVE input_text: matrix_id 49304313 snapshot has ONE item (the later state).
  { label: 'tm_input_text_one_item', rqo: tmRqo('component_input_text', 'test52', 5037, 49304313, 'lg-spa') },
  // NATIVE number (single value, nolan).
  { label: 'tm_number', rqo: tmRqo('component_number', 'test211', 1, 49304425, 'lg-spa') },
  // NATIVE date (structured datum).
  { label: 'tm_date', rqo: tmRqo('component_date', 'test145', 1, 49304414, 'lg-spa') },
  // NATIVE email: get_list_value() over the tm snapshot null-collapses (the snapshot
  // item {id,value} has no `lang` key, so the email get_data_lang lang-filter
  // [supports_translation=true, effective lang lg-nolan] drops it → entries:null). The
  // generic structure-context + the null entries are reproduced byte-for-byte.
  { label: 'tm_email', rqo: tmRqo('component_email', 'test208', 5034, 49303648, 'lg-spa') },
  // NATIVE json: the json context `features` ({allowed_extensions, default_target_quality})
  // is ported; entries = the stored JSON value off the tm snapshot (misc col).
  { label: 'tm_json', rqo: tmRqo('component_json', 'test18', 1, 49304424, 'lg-spa') },
  // NATIVE geolocation: the geo context `features` ({geo_provider}) + sortable=false /
  // no-`path` are ported; entries = the geometry object off the tm snapshot (geo col).
  { label: 'tm_geolocation', rqo: tmRqo('component_geolocation', 'test100', 1, 49304419, 'lg-spa') },
  // NATIVE geolocation in a DIFFERENT section (numisdata6): a geometry with lib_data
  // (FeatureCollection layers) — exercises the verbatim passthrough of the nested
  // geo JSON off the tm snapshot.
  {
    label: 'tm_geolocation_libdata',
    rqo: tmRqo('component_geolocation', 'numisdata264', 2, 49303893, 'lg-spa', 'numisdata6'),
  },
  // NATIVE DATALIST family tm: entries = get_list_value() over the dd490-filtered tm
  // snapshot, matched against the target section's datalist (record-search enumerated).
  // publication = bare generic context; radio_button / check_box = rich relation context.
  { label: 'tm_publication', rqo: tmRqo('component_publication', 'test92', 1, 49304428, 'lg-spa') },
  { label: 'tm_publication_empty', rqo: tmRqo('component_publication', 'test92', 1, 49300847, 'lg-spa') },
  { label: 'tm_radio_button', rqo: tmRqo('component_radio_button', 'rsc722', 9699, 49304443, 'lg-spa', 'rsc205') },
  { label: 'tm_check_box', rqo: tmRqo('component_check_box', 'test88', 1, 49303296, 'lg-spa') },
  { label: 'tm_check_box_no_match', rqo: tmRqo('component_check_box', 'test88', 1, 49304413, 'lg-spa') },
];

const session = await login(PHP_URL, 'root', '123123aS');
let cookie = session.cookie;
let csrf = session.csrfToken;
const jar = new Map<string, string>();
for (const part of cookie.split('; ')) {
  const eq = part.indexOf('=');
  if (eq > 0) jar.set(part.slice(0, eq), part.slice(eq + 1));
}

await mkdir(OUT_DIR, { recursive: true });
for (const c of cases) {
  const body = JSON.stringify(c.rqo);
  const res = await fetch(PHP_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie, 'x-dedalo-csrf-token': csrf },
    body,
  });
  for (const sc of res.headers.getSetCookie?.() ?? []) {
    const fp = sc.split(';', 1)[0] ?? '';
    const eq = fp.indexOf('=');
    if (eq > 0) jar.set(fp.slice(0, eq).trim(), fp.slice(eq + 1).trim());
  }
  cookie = [...jar.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
  const responseBytes = await res.text();
  try {
    const j = JSON.parse(responseBytes) as { csrf_token?: string };
    if (typeof j.csrf_token === 'string') csrf = j.csrf_token;
  } catch {}
  const golden = {
    label: c.label,
    rqo: c.rqo,
    capturedAt: new Date().toISOString(),
    status: res.status,
    contentType: res.headers.get('content-type') ?? 'application/json',
    responseBytes,
  };
  await writeFile(join(OUT_DIR, `${c.label}.json`), JSON.stringify(golden, null, 2));
  console.log(`captured ${c.label} (${responseBytes.length} bytes, status ${res.status})`);
}
console.log(`\nWrote ${cases.length} tm goldens to ${OUT_DIR}`);
