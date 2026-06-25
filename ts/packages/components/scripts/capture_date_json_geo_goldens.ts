/**
 * Capture per-component {context, data} ELEMENT goldens for component_date,
 * component_json and component_geolocation from the LIVE PHP standalone element
 * controller (read → get_data action → component->get_json()).
 *
 * These three models' JSON controllers append NO trailing fields to the
 * get_data_item base (no parent_tipo/parent_section_id/fallback_value/counter):
 * the standalone element data item is exactly the base 7 fields. So we capture
 * the pure component element via source.action='get_data' (NOT build_json_rows,
 * which stamps parent_tipo/row_section_id). The differ drops the SHOW_DEBUG-only
 * debug_* fields.
 *
 * component_iri is DECLINED (always with_lang_versions=true → transliterate_value +
 * an unconditional dd560 label-dataframe subdatum + counter; out of phase scope).
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
}

const CASES: Case[] = [
  // DATE — date_mode 'date' (single, structured start)
  { label: 'date_value_list', section_tipo: 'rsc170', section_id: 396818, tipo: 'rsc44', model: 'component_date', lang: 'lg-spa', mode: 'list' },
  { label: 'date_value_edit', section_tipo: 'rsc170', section_id: 396818, tipo: 'rsc44', model: 'component_date', lang: 'lg-spa', mode: 'edit' },
  // DATE — empty (record without this component) → entries null
  { label: 'date_empty_list', section_tipo: 'rsc170', section_id: 1, tipo: 'rsc44', model: 'component_date', lang: 'lg-spa', mode: 'list' },
  // DATE — range / BC (numisdata35), flat (rsc143), range multi (rsc224), empty fields (rsc342)
  { label: 'date_range_bc_list', section_tipo: 'numisdata3', section_id: 17618, tipo: 'numisdata35', model: 'component_date', lang: 'lg-spa', mode: 'list' },
  { label: 'date_range_multi_list', section_tipo: 'rsc205', section_id: 1, tipo: 'rsc224', model: 'component_date', lang: 'lg-spa', mode: 'list' },
  { label: 'date_flat_edit', section_tipo: 'rsc205', section_id: 15960, tipo: 'rsc143', model: 'component_date', lang: 'lg-spa', mode: 'edit' },
  { label: 'date_emptyfields_list', section_tipo: 'rsc332', section_id: 50577, tipo: 'rsc342', model: 'component_date', lang: 'lg-spa', mode: 'list' },
  // JSON — nested value object (misc column)
  { label: 'json_value_list', section_tipo: 'dd477', section_id: 10, tipo: 'dd596', model: 'component_json', lang: 'lg-spa', mode: 'list' },
  { label: 'json_value_edit', section_tipo: 'dd477', section_id: 10, tipo: 'dd596', model: 'component_json', lang: 'lg-spa', mode: 'edit' },
  // GEO — numeric geometry (geo column)
  { label: 'geo_value_list', section_tipo: 'rsc106', section_id: 1068, tipo: 'rsc900', model: 'component_geolocation', lang: 'lg-spa', mode: 'list' },
  { label: 'geo_value_edit', section_tipo: 'rsc106', section_id: 1068, tipo: 'rsc900', model: 'component_geolocation', lang: 'lg-spa', mode: 'edit' },
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

    const dataItem = data.find((d) => d.tipo === c.tipo && d.mode === c.mode);
    if (!dataItem) throw new Error(`No data item for ${c.label} (${JSON.stringify(obj).slice(0,300)})`);
    const elementLang = dataItem.lang as string;
    const ctxDdo = context.find((x) => x.tipo === c.tipo && x.mode === c.mode);
    if (!ctxDdo) throw new Error(`No context DDO for ${c.label}`);

    const golden = {
      label: c.label,
      inputs: {
        section_tipo: c.section_tipo,
        section_id: c.section_id,
        tipo: c.tipo,
        requestLang: c.lang,
        mode: c.mode,
        elementLang,
        model: c.model,
        matrixTable: 'matrix',
      },
      capturedAt: new Date().toISOString(),
      status: res.status,
      element: { context: [ctxDdo], data: [dataItem] },
    };
    await writeFile(join(FIXTURES, `${c.label}.json`), JSON.stringify(golden, null, 2) + '\n', 'utf8');
    console.log(`captured ${c.label}: entries=${JSON.stringify(dataItem.entries)?.slice(0,80)} keys=${Object.keys(dataItem).filter(k=>!k.startsWith('debug')).join(',')}`);
  }
}
void main();
