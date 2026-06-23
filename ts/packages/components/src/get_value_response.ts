import { ComponentInputText } from './component_input_text.ts';
import { ComponentTextArea } from './component_text_area.ts';
import { ComponentGeneric } from './component_generic.ts';
import { ComponentDate } from './component_date.ts';
import { ComponentIri } from './component_iri.ts';
import { ComponentSelect } from './component_select.ts';
import { ComponentRadioButton } from './component_radio_button.ts';
import { ComponentCheckBox } from './component_check_box.ts';
import { ComponentRelationParent } from './component_relation_parent.ts';
import { ComponentRelationRelated } from './component_relation_related.ts';
import { ComponentRelationChildren } from './component_relation_children.ts';
import { ComponentSectionId } from './component_section_id.ts';
import { ComponentFilter } from './component_filter.ts';
import { ComponentPublication } from './component_publication.ts';
import type { ComponentInit, DataColumnName } from './component_common.ts';

/**
 * The set of component models whose get_value is resolved natively in TS. Any
 * model outside this set yields the PHP "model not valid" error shape and is
 * declined by the core-api read handler (the server proxies it to PHP).
 *
 * Data-column mapping per family (PHP section_record_data::$column_map):
 *   - component_input_text / component_text_area / component_email → 'string'
 *   - component_number                                             → 'number'
 *   - component_date                                               → 'date'
 *   - component_iri                                                → 'iri'
 *   - component_geolocation                                        → 'geo'
 *   - component_json                                               → 'misc'
 *   - component_select / radio_button / check_box / relation_parent /
 *     relation_related (RELATION family)                              → 'relation'
 *
 * component_relation_children is now supported: its dato is NOT stored — get_data()
 * is COMPUTED by a related-mode SQL search of every record whose
 * component_relation_parent links back at this record (via @dedalo/search's
 * data_relations_flat_fct_st_si flat-index path), ordered by the section_map
 * sibling-order. The label resolution + ' | ' join are inherited from
 * ComponentRelationCommon. Requires a search queryer in ResolveGetValueOptions.
 */
export const SUPPORTED_GET_VALUE_MODELS = new Set<string>([
  'component_input_text',
  'component_text_area',
  'component_email',
  'component_number',
  'component_date',
  'component_iri',
  'component_json',
  'component_geolocation',
  'component_select',
  'component_radio_button',
  'component_check_box',
  'component_relation_parent',
  'component_relation_related',
  'component_relation_children',
  // component_section_id: the section primary key itself (no matrix column) —
  // get_data() = [(int)section_id], get_value = that id as a string.
  'component_section_id',
  // component_publication: RELATION-family V5 select; relations [section(dropped),
  // input_text label]. Inherits component_relation_common::get_export_value exactly
  // like component_select (label resolved on the locator target at DEDALO_DATA_LANG).
  'component_publication',
  // component_filter: RELATION-family; label set HARDCODED to the project-name field
  // (dd156, input_text) on each stored project (dd153) locator (PHP resolve_ar_related_list
  // component_filter branch). Joined ' | ' across projects.
  'component_filter',
]);

/** Matrix family column for each supported model (PHP section_record_data::$column_map). */
function dataColumnForModel(model: string): DataColumnName | null {
  switch (model) {
    case 'component_input_text':
    case 'component_text_area':
    case 'component_email':
      return 'string';
    case 'component_number':
      return 'number';
    case 'component_date':
      return 'date';
    case 'component_iri':
      return 'iri';
    case 'component_geolocation':
      return 'geo';
    case 'component_json':
      return 'misc';
    case 'component_select':
    case 'component_radio_button':
    case 'component_check_box':
    case 'component_relation_parent':
    case 'component_relation_related':
    // component_publication / component_filter also store locators in 'relation'
    // (publication = a single selection; filter = project locators).
    case 'component_publication':
    case 'component_filter':
      // RELATION family: locators stored in the 'relation' matrix column.
      return 'relation';
    case 'component_relation_children':
      // No stored column (get_data is computed by search); 'relation' is a
      // harmless placeholder — ComponentRelationChildren overrides getData.
      return 'relation';
    case 'component_section_id':
      // No matrix column: the value is the section_id itself. 'relation' is a
      // harmless placeholder (ComponentSectionId never reads the column).
      return 'relation';
    default:
      return null;
  }
}

/**
 * The PHP `read` → get_component_value response envelope for a component value.
 *
 * Key order is byte-significant. PHP builds it as:
 *   get_component_value(): result, msg, errors          (stdClass insertion order)
 *   dd_manager::manage_request(): + action, + csrf_token
 *   json/index.php: + dedalo_last_error (+ debug under SHOW_DEBUG)
 *
 * The differ drops debug / dedalo_last_error / time and redacts csrf_token, so
 * the contract surface is {result, msg, errors, action, csrf_token} in this exact
 * order. `result` is the flat string value (or '' for empty/missing on this path).
 */
export interface GetValueResponse {
  result: string | false;
  msg: string;
  errors: string[];
  action: string;
  csrf_token: string;
}

export interface GetValueSource {
  tipo: string;
  section_tipo?: string;
  section_id?: number | string | null;
  model?: string;
  lang?: string;
  mode?: string;
  action: 'get_value';
  [k: string]: unknown;
}

export interface ResolveGetValueOptions {
  matrix: ComponentInit['matrix'];
  ontology: ComponentInit['ontology'];
  langConfig: ComponentInit['langConfig'];
  /** Matrix table the section lives in (PHP resolves via section→table map). */
  matrixTable: string;
  /**
   * Parameterised SQL queryer (a Db). Required only for component_relation_children
   * (its get_data is a related-mode search). Optional for the point-read models.
   */
  searchQueryer?: ComponentInit['searchQueryer'];
}

export interface BuildGetValueOptions extends ResolveGetValueOptions {
  /** The CSRF token to echo back (volatile; redacted by the parity differ). */
  csrfToken: string;
}

/** The pre-decoration part of the get_value envelope (PHP get_component_value). */
export interface GetValueResult {
  result: string | false;
  msg: string;
  errors: string[];
}

/**
 * Resolve a get_value request to its {result, msg, errors} — the part PHP's
 * get_component_value returns, BEFORE dd_manager decorates with action/csrf_token.
 * Used both by the standalone buildGetValueResponse and by the core-api read
 * handler (where the router adds the decoration).
 */
export async function resolveGetValue(
  source: GetValueSource,
  opts: ResolveGetValueOptions,
): Promise<GetValueResult> {
  const tipo = source.tipo;
  const sectionTipo = source.section_tipo ?? source.tipo;
  const requestedLang = source.lang ?? opts.langConfig.dataLang;
  const sectionId = normalizeSectionId(source.section_id);

  const model = source.model ?? (await opts.ontology.getModelByTipo(tipo));
  const dataColumnName = model !== null ? dataColumnForModel(model) : null;
  if (model === null || dataColumnName === null || !SUPPORTED_GET_VALUE_MODELS.has(model)) {
    return {
      result: false,
      msg: `Error. model not valid: ${model ?? ''}`,
      errors: ['invalid model'],
    };
  }

  const init: ComponentInit = {
    tipo,
    sectionTipo,
    sectionId,
    lang: requestedLang,
    dataColumnName,
    matrixTable: opts.matrixTable,
    matrix: opts.matrix,
    ontology: opts.ontology,
    langConfig: opts.langConfig,
    ...(opts.searchQueryer !== undefined ? { searchQueryer: opts.searchQueryer } : {}),
  };

  // Dispatch to the model's resolver. input_text and text_area have their own
  // get_export_value; email and number share the generic component_common path.
  const value = await resolveValueForModel(model, init);
  return { result: value, msg: 'OK. Request done successfully', errors: [] };
}

/** Resolve get_value for a supported model, returning the flat string value. */
async function resolveValueForModel(model: string, init: ComponentInit): Promise<string> {
  switch (model) {
    case 'component_input_text': {
      const component = await ComponentInputText.create(init);
      return component.getValue();
    }
    case 'component_text_area': {
      const component = await ComponentTextArea.create(init);
      return component.getValue();
    }
    case 'component_email':
    case 'component_number':
    // json (misc column) and geolocation (geo column) inherit the GENERIC
    // component_common::get_export_value path unchanged (no override, no
    // supports_translation): each item → json_encode($item), joined with ', '.
    case 'component_json':
    case 'component_geolocation': {
      const component = await ComponentGeneric.create(init, model);
      return component.getValue();
    }
    case 'component_date': {
      const component = await ComponentDate.create(init);
      return component.getValue();
    }
    case 'component_iri': {
      const component = await ComponentIri.create(init);
      return component.getValue();
    }
    case 'component_select': {
      const component = await ComponentSelect.create(init);
      return component.getValue();
    }
    case 'component_radio_button': {
      const component = await ComponentRadioButton.create(init);
      return component.getValue();
    }
    case 'component_check_box': {
      const component = await ComponentCheckBox.create(init);
      return component.getValue();
    }
    case 'component_relation_parent': {
      const component = await ComponentRelationParent.create(init);
      return component.getValue();
    }
    case 'component_relation_related': {
      const component = await ComponentRelationRelated.create(init);
      return component.getValue();
    }
    case 'component_relation_children': {
      const component = await ComponentRelationChildren.create(init);
      return component.getValue();
    }
    case 'component_section_id': {
      const component = await ComponentSectionId.create(init);
      return component.getValue();
    }
    case 'component_publication': {
      const component = await ComponentPublication.create(init);
      return component.getValue();
    }
    case 'component_filter': {
      const component = await ComponentFilter.create(init);
      return component.getValue();
    }
    default:
      // unreachable: callers gate on SUPPORTED_GET_VALUE_MODELS first.
      return '';
  }
}

/**
 * Build the full PHP `read`/get_component_value response object for an
 * input_text component get_value request.
 *
 * Reproduces get_component_value(): resolves model (here: requires
 * component_input_text), computes the effective component lang via
 * get_translatable (translatable ? lang : nolan), instantiates the component,
 * and sets result = $element->get_value(). On a non-input_text / unresolvable
 * model PHP returns the "model not valid" error shape.
 */
export async function buildGetValueResponse(
  source: GetValueSource,
  opts: BuildGetValueOptions,
): Promise<GetValueResponse> {
  const { result, msg, errors } = await resolveGetValue(source, opts);
  // dd_manager decoration: + action (= the rqo action 'read') + csrf_token.
  return { result, msg, errors, action: 'read', csrf_token: opts.csrfToken };
}

/** section_id may arrive as a numeric string; PHP coerces with (int) downstream. */
function normalizeSectionId(raw: number | string | null | undefined): number | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === 'number') return Number.isInteger(raw) ? raw : null;
  const n = Number.parseInt(raw, 10);
  return Number.isNaN(n) ? null : n;
}
