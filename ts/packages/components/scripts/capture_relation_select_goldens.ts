/**
 * Capture per-component {context, data} ELEMENT goldens for the RELATION/SELECT
 * family — component_select, component_radio_button, component_check_box,
 * component_relation_parent, component_relation_related, component_relation_children
 * — from the LIVE PHP standalone element controller (read → get_data action →
 * component->get_json()).
 *
 * Captures BOTH list and edit modes so the shape difference is visible:
 *   - select   list: entries = [ get_value() ]   (flat label string in an array)
 *   - radio    list: entries = get_list_value()  (raw locators, null-collapsed)
 *   - checkbox list: entries = get_list_value()  (raw locators, null-collapsed)
 *   - relation_* list: main item entries = get_data_paginated() (raw locators with
 *     paginated_key) + parent_tipo/parent_section_id/pagination + get_subdatum()
 *     label-column sub-elements appended to data (stamped from_component_tipo/
 *     parent_tipo/row_section_id).
 *
 * The differ drops the SHOW_DEBUG-only debug_* fields.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { login, captureResponse } from '@dedalo/parity-harness';

const API_URL = process.env.DEDALO_API_URL ?? 'http://localhost:8080/v7_dev/core/api/v1/json/';
const USER = process.env.DEDALO_API_USER ?? 'root';
const PASS = process.env.DEDALO_API_PASS ?? '123123aS';
const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), '..', 'test', 'fixtures_element');

interface Case {
  label: string;
  section_tipo: string;
  section_id: number;
  tipo: string;
  model: string;
  lang: string;
  mode: 'edit' | 'list';
  matrixTable?: string;
}

// Tipos reused from the get_value fixtures (already exercised in the get_value phase).
const CASES: Case[] = [
  // SELECT (numisdata157 → "Original"; numisdata4/60762). Single-select.
  { label: 'select_single_list', section_tipo: 'numisdata4', section_id: 60762, tipo: 'numisdata157', model: 'component_select', lang: 'lg-spa', mode: 'list' },
  { label: 'select_single_edit', section_tipo: 'numisdata4', section_id: 60762, tipo: 'numisdata157', model: 'component_select', lang: 'lg-spa', mode: 'edit' },
  // SELECT empty
  { label: 'select_empty_list', section_tipo: 'numisdata4', section_id: 1, tipo: 'numisdata157', model: 'component_select', lang: 'lg-spa', mode: 'list' },
  // RADIO (numisdata160 → "Para revisar"; numisdata4/53797). Single-select.
  { label: 'radio_single_list', section_tipo: 'numisdata4', section_id: 53797, tipo: 'numisdata160', model: 'component_radio_button', lang: 'lg-spa', mode: 'list' },
  { label: 'radio_single_edit', section_tipo: 'numisdata4', section_id: 53797, tipo: 'numisdata160', model: 'component_radio_button', lang: 'lg-spa', mode: 'edit' },
  { label: 'radio_empty_list', section_tipo: 'numisdata4', section_id: 1, tipo: 'numisdata160', model: 'component_radio_button', lang: 'lg-spa', mode: 'list' },
  // RADIO with NO stored data (numisdata4/82754 has no numisdata160) → get_list_value() null.
  { label: 'radio_nodata_list', section_tipo: 'numisdata4', section_id: 82754, tipo: 'numisdata160', model: 'component_radio_button', lang: 'lg-spa', mode: 'list' },
  // CHECK_BOX (test88; test3). single (1716) + empty-multi (1717).
  { label: 'checkbox_single_list', section_tipo: 'test3', section_id: 1716, tipo: 'test88', model: 'component_check_box', lang: 'lg-spa', mode: 'list', matrixTable: 'matrix_test' },
  { label: 'checkbox_single_edit', section_tipo: 'test3', section_id: 1716, tipo: 'test88', model: 'component_check_box', lang: 'lg-spa', mode: 'edit', matrixTable: 'matrix_test' },
  { label: 'checkbox_empty_list', section_tipo: 'test3', section_id: 1717, tipo: 'test88', model: 'component_check_box', lang: 'lg-spa', mode: 'list', matrixTable: 'matrix_test' },
  // RELATION_PARENT (rsc679; rsc205/5350). Single locator → title.
  { label: 'relation_parent_single_list', section_tipo: 'rsc205', section_id: 5350, tipo: 'rsc679', model: 'component_relation_parent', lang: 'lg-spa', mode: 'list' },
  { label: 'relation_parent_single_edit', section_tipo: 'rsc205', section_id: 5350, tipo: 'rsc679', model: 'component_relation_parent', lang: 'lg-spa', mode: 'edit' },
  { label: 'relation_parent_empty_list', section_tipo: 'rsc205', section_id: 1, tipo: 'rsc679', model: 'component_relation_parent', lang: 'lg-spa', mode: 'list' },
  // RELATION_RELATED (test54; test3/1527). Single locator.
  { label: 'relation_related_single_list', section_tipo: 'test3', section_id: 1527, tipo: 'test54', model: 'component_relation_related', lang: 'lg-spa', mode: 'list', matrixTable: 'matrix_test' },
  { label: 'relation_related_single_edit', section_tipo: 'test3', section_id: 1527, tipo: 'test54', model: 'component_relation_related', lang: 'lg-spa', mode: 'edit', matrixTable: 'matrix_test' },
  { label: 'relation_related_empty_list', section_tipo: 'test3', section_id: 1, tipo: 'test54', model: 'component_relation_related', lang: 'lg-spa', mode: 'list', matrixTable: 'matrix_test' },
  // RELATION_CHILDREN (rsc680; rsc205/18966). Computed children.
  { label: 'relation_children_single_list', section_tipo: 'rsc205', section_id: 18966, tipo: 'rsc680', model: 'component_relation_children', lang: 'lg-spa', mode: 'list' },
  { label: 'relation_children_empty_list', section_tipo: 'rsc205', section_id: 1, tipo: 'rsc680', model: 'component_relation_children', lang: 'lg-spa', mode: 'list' },
];

interface JsonObj { [k: string]: unknown }

async function main(): Promise<void> {
  const auth = await login(API_URL, USER, PASS);
  await mkdir(FIXTURES, { recursive: true });

  for (const c of CASES) {
    const rqo = {
      dd_api: 'dd_core_api',
      action: 'read',
      source: {
        typo: 'source',
        type: 'component',
        action: 'get_data',
        model: c.model,
        tipo: c.tipo,
        section_tipo: c.section_tipo,
        section_id: c.section_id,
        mode: c.mode,
        lang: c.lang,
      },
    };
    const res = await captureResponse({ apiUrl: API_URL, cookie: auth.cookie, csrfToken: auth.csrfToken }, rqo);
    const obj = JSON.parse(res.rawBytes) as { result?: { context?: JsonObj[]; data?: JsonObj[] } };
    const context = obj.result?.context ?? [];
    const data = obj.result?.data ?? [];

    // Capture the FULL element (all context + all data) — the relation family emits
    // the main item PLUS subdatum items, so we keep the whole {context,data}.
    const golden = {
      label: c.label,
      inputs: {
        section_tipo: c.section_tipo,
        section_id: c.section_id,
        tipo: c.tipo,
        requestLang: c.lang,
        mode: c.mode,
        model: c.model,
        matrixTable: c.matrixTable ?? 'matrix',
      },
      capturedAt: new Date().toISOString(),
      status: res.status,
      element: { context, data },
    };
    await writeFile(join(FIXTURES, `${c.label}.json`), JSON.stringify(golden, null, 2) + '\n', 'utf8');
    const mainItem = data.find((d) => d.tipo === c.tipo && d.mode === c.mode);
    console.log(`captured ${c.label}: ctx=${context.length} data=${data.length} mainEntries=${JSON.stringify(mainItem?.entries)?.slice(0,90)} mainKeys=${mainItem ? Object.keys(mainItem).filter(k=>!k.startsWith('debug')).join(',') : '-'}`);
  }
}
void main();
