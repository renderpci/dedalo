/**
 * Capture per-component {context, data} ELEMENT goldens for component_input_text
 * from the LIVE PHP build_json_rows (read/search) response.
 *
 *   DEDALO_API_URL=http://localhost:8080/v7_dev/core/api/v1/json/ \
 *     bun run packages/components/scripts/capture_element_goldens.ts
 *
 * For each case we run a real `read`/search RQO (filter_by_locators → one record),
 * then EXTRACT from result.context + result.data the single input_text element:
 *   - context DDO: the result.context entry whose tipo/section_tipo/mode/lang match
 *   - data item:   the result.data entry with the matching tipo/section_tipo/mode/lang
 * and reassemble them into the {context:[ddo], data:[item]} sub-object the
 * component's own get_json() returns — the exact shape buildInputTextElement must
 * reproduce. We strip the assembly-level fields the section walk adds
 * (row_section_id, paginated_key) so the golden is the pure component element.
 *
 * The data item carries SHOW_DEBUG-only inline fields (debug_model/debug_label/
 * debug_dataframe) because the live root session runs with SHOW_DEBUG on; the
 * parity gate drops them (they are not part of the production contract), exactly
 * as the differ already drops the `debug` block.
 *
 * Writes one <label>.json into test/fixtures_element/.
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
  /** The input_text component tipo to extract. */
  tipo: string;
  /** The requested source.lang (the section data lang is the global DEDALO_DATA_LANG). */
  lang: string;
  mode: 'edit' | 'list';
  matrixTable?: string;
}

const CASES: Case[] = [
  // non-translatable single value (lg-nolan forced) — rsc137 "Código"
  { label: 'value_nolan_edit', section_tipo: 'rsc205', section_id: 1, tipo: 'rsc137', lang: 'lg-spa', mode: 'edit' },
  // translatable single value resolved at the section data lang (lg-spa) — rsc225 "Título uniforme"
  { label: 'value_spa_edit', section_tipo: 'rsc205', section_id: 1, tipo: 'rsc225', lang: 'lg-spa', mode: 'edit' },
  // translatable MULTI-ITEM (two entries same lang) — rsc144 "Lugar"
  { label: 'multi_item_edit', section_tipo: 'rsc205', section_id: 1, tipo: 'rsc144', lang: 'lg-spa', mode: 'edit' },
  // empty edit (entries:null) — rsc349 "Nombre personal"
  { label: 'empty_edit', section_tipo: 'rsc205', section_id: 1, tipo: 'rsc349', lang: 'lg-spa', mode: 'edit' },
  // FALLBACK edit: spa empty, eng present → entries:[], fallback_value:[eng item]
  { label: 'fallback_edit', section_tipo: 'numisdata3', section_id: 38693, tipo: 'numisdata81', lang: 'lg-spa', mode: 'edit' },
  // FALLBACK list: same record, list mode → entries:null, fallback_value:[eng item]
  { label: 'fallback_list', section_tipo: 'numisdata3', section_id: 38693, tipo: 'numisdata81', lang: 'lg-spa', mode: 'list' },
  // list-mode value (entries present) — rsc137 in list
  { label: 'value_list', section_tipo: 'rsc205', section_id: 1, tipo: 'rsc137', lang: 'lg-spa', mode: 'list' },
];

interface JsonObj { [k: string]: unknown }

/** Assembly-level keys the sections_json walk appends to each data item — not part of the component element. */
const ASSEMBLY_DATA_KEYS = ['row_section_id', 'paginated_key'];

function stripAssemblyKeys(item: JsonObj): JsonObj {
  const out: JsonObj = {};
  for (const k of Object.keys(item)) {
    if (ASSEMBLY_DATA_KEYS.includes(k)) continue;
    out[k] = item[k];
  }
  return out;
}

async function main(): Promise<void> {
  const auth = await login(API_URL, USER, PASS);
  await mkdir(FIXTURES, { recursive: true });

  for (const c of CASES) {
    const rqo = {
      dd_api: 'dd_core_api',
      action: 'read',
      source: {
        typo: 'source',
        action: 'search',
        model: 'section',
        tipo: c.section_tipo,
        section_tipo: c.section_tipo,
        section_id: c.section_id,
        mode: c.mode,
        lang: c.lang,
      },
      sqo: {
        section_tipo: [c.section_tipo],
        filter_by_locators: [{ section_tipo: c.section_tipo, section_id: String(c.section_id) }],
        offset: 0,
        select: [],
        full_count: false,
        limit: 1,
      },
    };

    const res = await captureResponse(
      { apiUrl: API_URL, cookie: auth.cookie, csrfToken: auth.csrfToken },
      rqo,
    );
    const obj = JSON.parse(res.rawBytes) as { result?: { context?: JsonObj[]; data?: JsonObj[] } };
    const context = obj.result?.context ?? [];
    const data = obj.result?.data ?? [];

    // data item: the result.data entry for this tipo/section_tipo/mode/lang.
    const dataItem = data.find(
      (d) =>
        d.tipo === c.tipo &&
        d.section_tipo === c.section_tipo &&
        d.mode === c.mode,
    );
    if (!dataItem) {
      throw new Error(`No data item found for ${c.label} (${c.tipo} ${c.section_tipo} ${c.mode})`);
    }
    const elementLang = dataItem.lang as string; // effective component lang (section data lang or nolan)

    // context DDO: the result.context entry for this tipo (matching mode + effective lang).
    const ctxDdo = context.find(
      (x) =>
        x.tipo === c.tipo &&
        x.section_tipo === c.section_tipo &&
        x.mode === c.mode,
    );
    if (!ctxDdo) {
      throw new Error(`No context DDO found for ${c.label} (${c.tipo})`);
    }

    // The component element {context, data} as get_json() returns it.
    const element = {
      context: [ctxDdo],
      data: [stripAssemblyKeys(dataItem)],
    };

    const golden = {
      label: c.label,
      // The inputs needed to rebuild the element with buildInputTextElement.
      inputs: {
        section_tipo: c.section_tipo,
        section_id: c.section_id,
        tipo: c.tipo,
        requestLang: c.lang,
        mode: c.mode,
        // The effective component lang the PHP element resolved to (= DEDALO_DATA_LANG
        // for translatable, lg-nolan for non-translatable). This is what the section
        // walk passes to get_instance (common::get_element_lang).
        elementLang,
        ...(c.matrixTable ? { matrixTable: c.matrixTable } : {}),
      },
      capturedAt: new Date().toISOString(),
      status: res.status,
      // The extracted element sub-object (PHP ground truth bytes for the DATA half + reused context).
      element,
    };

    const path = join(FIXTURES, `${c.label}.json`);
    await writeFile(path, JSON.stringify(golden, null, 2) + '\n', 'utf8');
    // eslint-disable-next-line no-console
    console.log(`captured ${c.label}: entries=${JSON.stringify(dataItem.entries)} fb=${JSON.stringify(dataItem.fallback_value)}`);
  }
}

void main();
