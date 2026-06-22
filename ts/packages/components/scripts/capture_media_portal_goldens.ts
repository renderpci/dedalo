/**
 * Capture per-component {context, data} ELEMENT goldens for the MEDIA/PORTAL
 * family — component_portal, component_publication, component_image,
 * component_av, component_pdf — from the LIVE PHP standalone element controller
 * (read → get_data action → component->get_json()).
 *
 * - portal/publication (relation column): main item = get_data_paginated() raw
 *   locators + parent_tipo/parent_section_id/pagination, then get_subdatum()
 *   label-column sub-elements (relation-family shape).
 * - image/av/pdf (media column): list/tm → get_list_value() (filtered stored
 *   files_info) + external_source; edit → get_data_lang() + external_source +
 *   base_svg_url (image only).
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

const CASES: Case[] = [
  // PORTAL (numisdata164 → numisdata4; relation column). 1/2 have data, 281 empty.
  { label: 'portal_single_list', section_tipo: 'numisdata4', section_id: 1, tipo: 'numisdata164', model: 'component_portal', lang: 'lg-spa', mode: 'list' },
  { label: 'portal_single_edit', section_tipo: 'numisdata4', section_id: 1, tipo: 'numisdata164', model: 'component_portal', lang: 'lg-spa', mode: 'edit' },
  { label: 'portal_empty_list', section_tipo: 'numisdata4', section_id: 281, tipo: 'numisdata164', model: 'component_portal', lang: 'lg-spa', mode: 'list' },
  // PORTAL rsc395 (rsc205) — different target.
  { label: 'portal_rsc395_list', section_tipo: 'rsc205', section_id: 66, tipo: 'rsc395', model: 'component_portal', lang: 'lg-spa', mode: 'list' },
  // PUBLICATION (rsc281 → rsc205; relation). 1/2 data, 79 empty.
  { label: 'publication_single_list', section_tipo: 'rsc205', section_id: 1, tipo: 'rsc281', model: 'component_publication', lang: 'lg-spa', mode: 'list' },
  { label: 'publication_single_edit', section_tipo: 'rsc205', section_id: 1, tipo: 'rsc281', model: 'component_publication', lang: 'lg-spa', mode: 'edit' },
  { label: 'publication_empty_list', section_tipo: 'rsc205', section_id: 79, tipo: 'rsc281', model: 'component_publication', lang: 'lg-spa', mode: 'list' },
  // IMAGE (rsc29 → rsc170; media). 1/2 data, 145 empty.
  { label: 'image_single_list', section_tipo: 'rsc170', section_id: 1, tipo: 'rsc29', model: 'component_image', lang: 'lg-spa', mode: 'list' },
  { label: 'image_single_edit', section_tipo: 'rsc170', section_id: 1, tipo: 'rsc29', model: 'component_image', lang: 'lg-spa', mode: 'edit' },
  { label: 'image_empty_list', section_tipo: 'rsc170', section_id: 145, tipo: 'rsc29', model: 'component_image', lang: 'lg-spa', mode: 'list' },
  { label: 'image_76849_list', section_tipo: 'rsc170', section_id: 76849, tipo: 'rsc29', model: 'component_image', lang: 'lg-spa', mode: 'list' },
  // IMAGE with a non-null external_source (rsc496 sibling iri carries a non-empty
  // dataframe → get_external_source() returns the iri). Section 189522.
  { label: 'image_external_source_list', section_tipo: 'rsc170', section_id: 189522, tipo: 'rsc29', model: 'component_image', lang: 'lg-spa', mode: 'list' },
  // AV (rsc35 → rsc167; media). 1/2 data, 3 empty.
  { label: 'av_single_list', section_tipo: 'rsc167', section_id: 1, tipo: 'rsc35', model: 'component_av', lang: 'lg-spa', mode: 'list' },
  { label: 'av_single_edit', section_tipo: 'rsc167', section_id: 1, tipo: 'rsc35', model: 'component_av', lang: 'lg-spa', mode: 'edit' },
  { label: 'av_empty_list', section_tipo: 'rsc167', section_id: 3, tipo: 'rsc35', model: 'component_av', lang: 'lg-spa', mode: 'list' },
  // PDF (rsc209 → rsc205; media). 1/28 data, 2 empty.
  { label: 'pdf_single_list', section_tipo: 'rsc205', section_id: 1, tipo: 'rsc209', model: 'component_pdf', lang: 'lg-spa', mode: 'list' },
  { label: 'pdf_single_edit', section_tipo: 'rsc205', section_id: 1, tipo: 'rsc209', model: 'component_pdf', lang: 'lg-spa', mode: 'edit' },
  { label: 'pdf_empty_list', section_tipo: 'rsc205', section_id: 2, tipo: 'rsc209', model: 'component_pdf', lang: 'lg-spa', mode: 'list' },
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
    console.log(
      `captured ${c.label}: ctx=${context.length} data=${data.length} ` +
      `mainKeys=${mainItem ? Object.keys(mainItem).filter((k) => !k.startsWith('debug')).join(',') : '-'} ` +
      `entries=${JSON.stringify(mainItem?.entries)?.slice(0, 140)}`,
    );
  }
}
void main();
