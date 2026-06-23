/**
 * Capture golden masters for the component get_value parity slice from the LIVE
 * PHP engine. Run once to (re)generate fixtures:
 *
 *   DEDALO_API_URL=http://localhost:8080/v7_dev/core/api/v1/json/ \
 *     bun run packages/components/scripts/capture_goldens.ts
 *
 * Writes one <label>.json GoldenMaster per case into test/fixtures/.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { login, captureResponse, type GoldenMaster } from '@dedalo/parity-harness';

const API_URL =
  process.env.DEDALO_API_URL ?? 'http://localhost:8080/v7_dev/core/api/v1/json/';
const USER = process.env.DEDALO_API_USER ?? 'root';
const PASS = process.env.DEDALO_API_PASS ?? '123123aS';

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), '..', 'test', 'fixtures');

interface Case {
  label: string;
  source: Record<string, unknown>;
  /** Matrix table the section lives in. Defaults to 'matrix' when omitted. */
  matrixTable?: string;
}

/** The RQO source shapes, matching the frontend get_value contract (tool_time_machine.js). */
const CASES: Case[] = [
  // translatable, requested lang present (lg-eng) — multi-lang record, expects only the eng slice
  {
    label: 'translatable_eng',
    source: {
      typo: 'source',
      type: 'component',
      action: 'get_value',
      tipo: 'numisdata81',
      section_tipo: 'numisdata3',
      section_id: 1420,
      lang: 'lg-eng',
    },
  },
  // same record, requested lang present (lg-spa) — expects the spa slice
  {
    label: 'translatable_spa',
    source: {
      typo: 'source',
      type: 'component',
      action: 'get_value',
      tipo: 'numisdata81',
      section_tipo: 'numisdata3',
      section_id: 1420,
      lang: 'lg-spa',
    },
  },
  // translatable, requested lang absent in data (lg-fra) — triggers fallback (eng main lang)
  {
    label: 'translatable_fallback',
    source: {
      typo: 'source',
      type: 'component',
      action: 'get_value',
      tipo: 'numisdata81',
      section_tipo: 'numisdata3',
      section_id: 1420,
      lang: 'lg-fra',
    },
  },
  // translatable, two items SAME lang (lg-spa) — tests the ' | ' records_separator join
  {
    label: 'translatable_multi_item',
    source: {
      typo: 'source',
      type: 'component',
      action: 'get_value',
      tipo: 'rsc144',
      section_tipo: 'rsc205',
      section_id: 1,
      lang: 'lg-spa',
    },
  },
  // non-translatable (lg-nolan forced) — single item
  {
    label: 'nolan',
    source: {
      typo: 'source',
      type: 'component',
      action: 'get_value',
      tipo: 'rsc398',
      section_tipo: 'rsc170',
      section_id: 399777,
      lang: 'lg-eng', // ignored; PHP forces lg-nolan because tipo is not translatable
    },
  },
  // empty / missing value: a record that does not have this component populated
  {
    label: 'empty_missing',
    source: {
      typo: 'source',
      type: 'component',
      action: 'get_value',
      tipo: 'numisdata81',
      section_tipo: 'numisdata3',
      section_id: 999999999,
      lang: 'lg-eng',
    },
  },

  // ── component_text_area (string column; own get_export_value, leaf sep ', ') ──
  // translatable, spa slice (single HTML item, no TR markup → passthrough)
  {
    label: 'text_area_spa',
    source: {
      typo: 'source', type: 'component', action: 'get_value',
      tipo: 'numisdata79', section_tipo: 'numisdata3', section_id: 11129, lang: 'lg-spa',
    },
  },
  // translatable, eng slice of a multi-lang record
  {
    label: 'text_area_eng',
    source: {
      typo: 'source', type: 'component', action: 'get_value',
      tipo: 'numisdata79', section_tipo: 'numisdata3', section_id: 2049, lang: 'lg-eng',
    },
  },
  // translatable, requested lang absent (lg-fra) → fallback chain
  {
    label: 'text_area_fallback',
    source: {
      typo: 'source', type: 'component', action: 'get_value',
      tipo: 'numisdata79', section_tipo: 'numisdata3', section_id: 2049, lang: 'lg-fra',
    },
  },
  // empty / missing record
  {
    label: 'text_area_empty',
    source: {
      typo: 'source', type: 'component', action: 'get_value',
      tipo: 'numisdata79', section_tipo: 'numisdata3', section_id: 999999999, lang: 'lg-eng',
    },
  },

  // ── component_email (string column; GENERIC get_export_value, json item) ──────
  // single item, non-translatable (no lang key) → {"id":N,"value":"…"}
  {
    label: 'email_single',
    matrixTable: 'matrix_test',
    source: {
      typo: 'source', type: 'component', action: 'get_value',
      tipo: 'test208', section_tipo: 'test3', section_id: 1527, lang: 'lg-eng',
    },
  },
  // two items (lg-nolan in storage) → json items joined with ', '
  {
    label: 'email_multi',
    matrixTable: 'matrix_test',
    source: {
      typo: 'source', type: 'component', action: 'get_value',
      tipo: 'test208', section_tipo: 'test3', section_id: 3819, lang: 'lg-eng',
    },
  },
  // empty / missing record
  {
    label: 'email_empty',
    matrixTable: 'matrix_test',
    source: {
      typo: 'source', type: 'component', action: 'get_value',
      tipo: 'test208', section_tipo: 'test3', section_id: 999999999, lang: 'lg-eng',
    },
  },

  // ── component_number (number column; GENERIC get_export_value, json item) ─────
  // float, precision 2: 10.68 → {"id":1,"value":10.68}
  {
    label: 'number_float',
    source: {
      typo: 'source', type: 'component', action: 'get_value',
      tipo: 'numisdata133', section_tipo: 'numisdata4', section_id: 127092, lang: 'lg-eng',
    },
  },
  // float that rounds: 10.945 (precision 2) → 10.95
  {
    label: 'number_float_round',
    source: {
      typo: 'source', type: 'component', action: 'get_value',
      tipo: 'numisdata133', section_tipo: 'numisdata4', section_id: 59160, lang: 'lg-eng',
    },
  },
  // integer-valued float field: 11 → {"id":1,"value":11}
  {
    label: 'number_intfloat',
    source: {
      typo: 'source', type: 'component', action: 'get_value',
      tipo: 'numisdata133', section_tipo: 'numisdata4', section_id: 34965, lang: 'lg-eng',
    },
  },
  // int type field: 12 → {"id":1,"value":12}
  {
    label: 'number_int',
    source: {
      typo: 'source', type: 'component', action: 'get_value',
      tipo: 'numisdata134', section_tipo: 'numisdata4', section_id: 114035, lang: 'lg-eng',
    },
  },
  // empty / missing record
  {
    label: 'number_empty',
    source: {
      typo: 'source', type: 'component', action: 'get_value',
      tipo: 'numisdata133', section_tipo: 'numisdata4', section_id: 999999999, lang: 'lg-eng',
    },
  },

  // ── component_date (date column; own get_export_value, data_item_to_value) ────
  // date_mode 'date', nested start with full Y/m/d/H/i/s → "2024/07/04"
  {
    label: 'date_full',
    source: {
      typo: 'source', type: 'component', action: 'get_value',
      tipo: 'rsc44', section_tipo: 'rsc170', section_id: 396818, lang: 'lg-eng',
    },
  },
  // date_mode 'date', FLAT item (no start wrapper) full Y/m/d → "2018/11/12"
  {
    label: 'date_flat',
    source: {
      typo: 'source', type: 'component', action: 'get_value',
      tipo: 'rsc143', section_tipo: 'rsc205', section_id: 15960, lang: 'lg-eng',
    },
  },
  // date_mode 'date', start with only mode (no date fields) → empty value
  {
    label: 'date_emptyfields',
    source: {
      typo: 'source', type: 'component', action: 'get_value',
      tipo: 'rsc342', section_tipo: 'rsc332', section_id: 50577, lang: 'lg-eng',
    },
  },
  // date_mode 'range', year-only BC both ends (padding=false) → "-100 <> -40"
  {
    label: 'date_range_bc',
    source: {
      typo: 'source', type: 'component', action: 'get_value',
      tipo: 'numisdata35', section_tipo: 'numisdata3', section_id: 17618, lang: 'lg-eng',
    },
  },
  // date_mode 'range', start-only partial Y/m/d (no end) → "2020/07/26"
  {
    label: 'date_range_start_only',
    source: {
      typo: 'source', type: 'component', action: 'get_value',
      tipo: 'numisdata229', section_tipo: 'numisdata224', section_id: 14168, lang: 'lg-eng',
    },
  },
  // date_mode 'range', multi-item (two atoms joined with records_separator ' | ')
  {
    label: 'date_range_multi',
    source: {
      typo: 'source', type: 'component', action: 'get_value',
      tipo: 'rsc224', section_tipo: 'rsc205', section_id: 1, lang: 'lg-eng',
    },
  },
  // empty / missing record
  {
    label: 'date_empty',
    source: {
      typo: 'source', type: 'component', action: 'get_value',
      tipo: 'rsc44', section_tipo: 'rsc170', section_id: 999999999, lang: 'lg-eng',
    },
  },

  // ── component_iri (iri column; own get_export_value, iri[+title]) ─────────────
  // single item, no title key → value = iri only
  {
    label: 'iri_single',
    source: {
      typo: 'source', type: 'component', action: 'get_value',
      tipo: 'numisdata234', section_tipo: 'numisdata224', section_id: 7390, lang: 'lg-eng',
    },
  },
  // single item, empty title ("") → value = iri only (empty title skipped)
  {
    label: 'iri_empty_title',
    source: {
      typo: 'source', type: 'component', action: 'get_value',
      tipo: 'numisdata99', section_tipo: 'numisdata300', section_id: 12, lang: 'lg-eng',
    },
  },
  // single item, non-empty title → value = "iri, title" (fields_separator ', ')
  {
    label: 'iri_with_title',
    source: {
      typo: 'source', type: 'component', action: 'get_value',
      tipo: 'numisdata275', section_tipo: 'numisdata4', section_id: 25419, lang: 'lg-eng',
    },
  },
  // multi-item, iri-only (no titles, no dataframe labels) → atoms joined with ' | '
  {
    label: 'iri_multi',
    source: {
      typo: 'source', type: 'component', action: 'get_value',
      tipo: 'numisdata265', section_tipo: 'numisdata6', section_id: 562, lang: 'lg-eng',
    },
  },
  // empty / missing record
  {
    label: 'iri_empty',
    source: {
      typo: 'source', type: 'component', action: 'get_value',
      tipo: 'numisdata234', section_tipo: 'numisdata224', section_id: 999999999, lang: 'lg-eng',
    },
  },

  // ── component_json (misc column; GENERIC get_export_value, json item) ─────────
  // nested object value → {"id":1,"value":{...}}
  {
    label: 'json_single',
    source: {
      typo: 'source', type: 'component', action: 'get_value',
      tipo: 'dd596', section_tipo: 'dd477', section_id: 10, lang: 'lg-eng',
    },
  },
  // empty / missing record
  {
    label: 'json_empty',
    source: {
      typo: 'source', type: 'component', action: 'get_value',
      tipo: 'dd596', section_tipo: 'dd477', section_id: 999999999, lang: 'lg-eng',
    },
  },

  // ── component_geolocation (geo column; GENERIC get_export_value, json item) ───
  // numeric lat/lon (float round-trip) → {"id":1,"alt":16,"lat":39.462571,...}
  {
    label: 'geo_numeric',
    source: {
      typo: 'source', type: 'component', action: 'get_value',
      tipo: 'rsc900', section_tipo: 'rsc106', section_id: 1068, lang: 'lg-eng',
    },
  },
  // string lat/lon + nested lib_data with high-precision float coordinates
  {
    label: 'geo_string_libdata',
    source: {
      typo: 'source', type: 'component', action: 'get_value',
      tipo: 'numisdata213', section_tipo: 'numisdata5', section_id: 7, lang: 'lg-eng',
    },
  },
  // empty / missing record
  {
    label: 'geo_empty',
    source: {
      typo: 'source', type: 'component', action: 'get_value',
      tipo: 'rsc900', section_tipo: 'rsc106', section_id: 999999999, lang: 'lg-eng',
    },
  },

  // ── component_radio_button (RELATION family, 'relation' column; single-select) ─
  // Inherits component_relation_common::get_export_value (V5 ddo_map). Identical
  // single-select semantics to component_select.
  //   numisdata160: relations [dd501 (section, dropped), dd503 (input_text label)].
  //   Target dd501 lives in matrix_dd. Child reads DEDALO_DATA_LANG (lg-spa).
  // single locator → dd501/2 → dd503 lg-spa = "Para revisar"
  {
    label: 'radio_single',
    source: {
      typo: 'source', type: 'component', action: 'get_value',
      tipo: 'numisdata160', section_tipo: 'numisdata4', section_id: 53797, lang: 'lg-spa',
    },
  },
  // SAME record requested as lg-eng — proves the child label is read at the GLOBAL
  // DEDALO_DATA_LANG (lg-spa), NOT the source lang: result is still "Para revisar".
  {
    label: 'radio_single_eng_request',
    source: {
      typo: 'source', type: 'component', action: 'get_value',
      tipo: 'numisdata160', section_tipo: 'numisdata4', section_id: 53797, lang: 'lg-eng',
    },
  },
  // a different selected option → dd501/1 → "Pendiente"
  {
    label: 'radio_single_b',
    source: {
      typo: 'source', type: 'component', action: 'get_value',
      tipo: 'numisdata160', section_tipo: 'numisdata4', section_id: 151745, lang: 'lg-spa',
    },
  },
  // empty / missing record (no locator)
  {
    label: 'radio_empty',
    source: {
      typo: 'source', type: 'component', action: 'get_value',
      tipo: 'numisdata160', section_tipo: 'numisdata4', section_id: 999999999, lang: 'lg-spa',
    },
  },

  // ── component_check_box (RELATION family, 'relation' column; MULTI-select) ─────
  // Inherits the same get_export_value; the only new shape is multiple locators
  // joined at the first indexed level with records_separator (' | ').
  //   test88: relations [dd64 (section, dropped), dd62 (input_text label)]; target
  //   section test3 lives in matrix_test. The dd62 label is EMPTY on every test3
  //   record in this install, so check_box values resolve to '' — but the
  //   structural shapes (single, multi, missing) are what we pin here.
  // (!) NOTE: dd578 (the other check_box with data) is FORCED to component_portal
  //     by ontology_node::get_model $temporal_models, so it is NOT a check_box at
  //     get_value time — test88 is the only genuine component_check_box with data.
  // single selection → test3/1716 → dd62 empty → ''
  {
    label: 'checkbox_single',
    matrixTable: 'matrix_test',
    source: {
      typo: 'source', type: 'component', action: 'get_value',
      tipo: 'test88', section_tipo: 'test3', section_id: 1716, lang: 'lg-spa',
    },
  },
  // MULTI-select (the records-level join path). Record test3/1717 holds TWO
  // locators (test3/1001, test3/1002). Both targets have an EMPTY dd62 → each child
  // component produces ZERO atoms → no record slot in join_atoms → to_flat_string
  // returns '' (NOT ' | '). This is the verified ground-truth rule for empty
  // multi-locator records: empty targets contribute nothing, so no records_separator
  // is emitted between them. (The non-empty ' | ' join is pinned by the hermetic
  // unit tests in unit_component_relation.test.ts, which reproduce join_atoms.)
  {
    label: 'checkbox_multi_empty',
    matrixTable: 'matrix_test',
    source: {
      typo: 'source', type: 'component', action: 'get_value',
      tipo: 'test88', section_tipo: 'test3', section_id: 1717, lang: 'lg-spa',
    },
  },
  // empty / missing record (no selection)
  {
    label: 'checkbox_empty',
    matrixTable: 'matrix_test',
    source: {
      typo: 'source', type: 'component', action: 'get_value',
      tipo: 'test88', section_tipo: 'test3', section_id: 999999999, lang: 'lg-spa',
    },
  },

  // ── component_relation_parent (RELATION family, 'relation' column) ────────────
  // Stored upward hierarchy locators; inherits component_relation_common's
  // get_export_value. rsc679 carries a V6 source.request_config whose ddo_map is a
  // single input_text label (rsc140) on the target rsc205. Single parent locator →
  // the target's rsc140 value.
  {
    label: 'relation_parent_single',
    source: {
      typo: 'source', type: 'component', action: 'get_value',
      tipo: 'rsc679', section_tipo: 'rsc205', section_id: 5350, lang: 'lg-spa',
    },
  },
  // SAME record requested as lg-eng — the rsc140 label is non-translatable (read at
  // DEDALO_DATA_NOLAN), so the value is unchanged by the source lang.
  {
    label: 'relation_parent_single_eng',
    source: {
      typo: 'source', type: 'component', action: 'get_value',
      tipo: 'rsc679', section_tipo: 'rsc205', section_id: 5350, lang: 'lg-eng',
    },
  },
  // a different parent record (distinct target title)
  {
    label: 'relation_parent_single_b',
    source: {
      typo: 'source', type: 'component', action: 'get_value',
      tipo: 'rsc679', section_tipo: 'rsc205', section_id: 19197, lang: 'lg-spa',
    },
  },
  // empty / missing record (no parent)
  {
    label: 'relation_parent_empty',
    source: {
      typo: 'source', type: 'component', action: 'get_value',
      tipo: 'rsc679', section_tipo: 'rsc205', section_id: 999999999, lang: 'lg-spa',
    },
  },

  // ── component_relation_related (RELATION family, 'relation' column) ───────────
  // Stored associative locators; inherits get_export_value (reads get_data, NOT
  // get_data_with_references — the computed inverse refs are edit-mode JSON only).
  // test54 carries a V6 request_config with a single input_text ddo (test52) on the
  // target test3. matrixTable matrix_test.
  // single locator → test3/3 → test52 = "Parent term 3"
  {
    label: 'relation_related_single',
    matrixTable: 'matrix_test',
    source: {
      typo: 'source', type: 'component', action: 'get_value',
      tipo: 'test54', section_tipo: 'test3', section_id: 1527, lang: 'lg-spa',
    },
  },
  // TWO locators where the FIRST target (test3/2) has an EMPTY test52 (no atoms →
  // no record slot) and the second (test3/3) has "Parent term 3". The empty-target
  // locator drops its slot, so the result is just "Parent term 3" (NOT
  // " | Parent term 3"). Same verified empty-record rule as checkbox_multi_empty,
  // exercising the records-level join on the relation_related path.
  {
    label: 'relation_related_multi_empty',
    matrixTable: 'matrix_test',
    source: {
      typo: 'source', type: 'component', action: 'get_value',
      tipo: 'test54', section_tipo: 'test3', section_id: 1753, lang: 'lg-spa',
    },
  },
  // empty / missing record (no relation)
  {
    label: 'relation_related_empty',
    matrixTable: 'matrix_test',
    source: {
      typo: 'source', type: 'component', action: 'get_value',
      tipo: 'test54', section_tipo: 'test3', section_id: 999999999, lang: 'lg-spa',
    },
  },

  // ── component_section_id (NO matrix column; value = the section_id) ───────────
  // get_data() = [(int)section_id]; get_value = that id as a string, regardless of
  // whether the matrix record exists. numisdata26 is the section_id component of
  // section numisdata3 (matrix table 'matrix'). With-value record → "1".
  {
    label: 'section_id_single',
    source: {
      typo: 'source', type: 'component', action: 'get_value',
      tipo: 'numisdata26', section_tipo: 'numisdata3', section_id: 1, lang: 'lg-spa',
    },
  },
  // a different (existing) record → "9529"
  {
    label: 'section_id_other',
    source: {
      typo: 'source', type: 'component', action: 'get_value',
      tipo: 'numisdata26', section_tipo: 'numisdata3', section_id: 9529, lang: 'lg-spa',
    },
  },
  // MISSING record (no matrix row): the value is still the requested section_id →
  // "999999999" (proves the value comes from section_id, NOT a stored column).
  {
    label: 'section_id_missing',
    source: {
      typo: 'source', type: 'component', action: 'get_value',
      tipo: 'numisdata26', section_tipo: 'numisdata3', section_id: 999999999, lang: 'lg-spa',
    },
  },

  // ── component_publication (RELATION family V5; relations [dd64 section, dd62 label]) ─
  // Inherits component_relation_common::get_export_value exactly like select: the
  // dd62 input_text label of the selected dd64 (si_no) target at DEDALO_DATA_LANG.
  // numisdata413 → dd64/1 → dd62 lg-spa = "Sí".
  {
    label: 'publication_single',
    source: {
      typo: 'source', type: 'component', action: 'get_value',
      tipo: 'numisdata413', section_tipo: 'numisdata3', section_id: 9529, lang: 'lg-spa',
    },
  },
  // SAME record requested as lg-eng: the dd62 label is resolved at the GLOBAL
  // DEDALO_DATA_LANG (lg-spa), NOT the source lang, so the value is still "Sí".
  {
    label: 'publication_eng_request',
    source: {
      typo: 'source', type: 'component', action: 'get_value',
      tipo: 'numisdata413', section_tipo: 'numisdata3', section_id: 9529, lang: 'lg-eng',
    },
  },
  // empty / missing record (no selection)
  {
    label: 'publication_empty',
    source: {
      typo: 'source', type: 'component', action: 'get_value',
      tipo: 'numisdata413', section_tipo: 'numisdata3', section_id: 999999999, lang: 'lg-spa',
    },
  },

  // ── component_filter (RELATION family; label HARDCODED to dd156 on dd153) ─────
  // get_value = the project-name field (dd156, input_text) on each stored project
  // (dd153) locator at DEDALO_DATA_LANG (lg-spa). numisdata128 in section numisdata3.
  // single project (dd153/1) → "MIB Antigüedad".
  {
    label: 'filter_single',
    source: {
      typo: 'source', type: 'component', action: 'get_value',
      tipo: 'numisdata128', section_tipo: 'numisdata3', section_id: 9529, lang: 'lg-spa',
    },
  },
  // TWO projects (dd153/1 + dd153/5) → labels joined with records_separator ' | ':
  // "MIB Antigüedad | Cores".
  {
    label: 'filter_multi',
    source: {
      typo: 'source', type: 'component', action: 'get_value',
      tipo: 'numisdata128', section_tipo: 'numisdata3', section_id: 16240, lang: 'lg-spa',
    },
  },
  // SAME single-project record requested as lg-eng: dd156 is resolved at DEDALO_DATA_LANG
  // (lg-spa), so the value is unchanged ("MIB Antigüedad").
  {
    label: 'filter_eng_request',
    source: {
      typo: 'source', type: 'component', action: 'get_value',
      tipo: 'numisdata128', section_tipo: 'numisdata3', section_id: 9529, lang: 'lg-eng',
    },
  },
  // empty / missing record (no projects)
  {
    label: 'filter_empty',
    source: {
      typo: 'source', type: 'component', action: 'get_value',
      tipo: 'numisdata128', section_tipo: 'numisdata3', section_id: 999999999, lang: 'lg-spa',
    },
  },
];

async function main(): Promise<void> {
  const auth = await login(API_URL, USER, PASS);
  await mkdir(FIXTURES, { recursive: true });

  for (const c of CASES) {
    const rqo = { dd_api: 'dd_core_api', action: 'read', source: c.source };
    const res = await captureResponse(
      { apiUrl: API_URL, cookie: auth.cookie, csrfToken: auth.csrfToken },
      rqo,
    );
    const golden: GoldenMaster & { matrixTable?: string } = {
      label: c.label,
      rqo,
      capturedAt: new Date().toISOString(),
      status: res.status,
      contentType: res.contentType,
      responseBytes: res.rawBytes,
      // Per-golden matrix table (email data lives in matrix_test). Omitted ⇒ 'matrix'.
      ...(c.matrixTable ? { matrixTable: c.matrixTable } : {}),
    };
    const path = join(FIXTURES, `${c.label}.json`);
    await writeFile(path, JSON.stringify(golden, null, 2) + '\n', 'utf8');
    // eslint-disable-next-line no-console
    console.log(`captured ${c.label} (status ${res.status}): ${res.rawBytes.slice(0, 200)}`);
  }
}

void main();
