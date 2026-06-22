/**
 * Port of dd_core_api::get_element_context for a COMPONENT (model component_*).
 *
 * Builds the single structure-context DDO the frontend uses to render a field.
 * The PHP path is: component_common::get_instance(...) → get_json({get_context:
 * true, get_data:false}) → the component's *_json controller → get_structure_context
 * → build_structure_context(_core). For the ported point-read component models
 * (input_text / number / date) the *_json controller calls
 * get_structure_context($permissions, add_rqo=false) with add_rqo=false, so no
 * request_config / columns_map is built (both null → dropped from the DDO).
 *
 * The DDO field order is the dd_object property-declaration order (PHP
 * jsonSerialize = get_object_vars, null-filtered):
 *   typo, type, tipo, section_tipo, parent, parent_grouper, lang, mode, model,
 *   properties, permissions, label, translatable, tools, buttons, css, sortable,
 *   legacy_model, path
 * (view / children_view are null for these models → dropped; request_config /
 * columns_map null → dropped; id / info / labels null → dropped.)
 *
 * FIELD SOURCES (each traced to PHP):
 *   typo='ddo', type='component'  — dd_object constant + resolve_type_from_model.
 *   tipo                          — source.tipo.
 *   section_tipo                  — source.section_tipo.
 *   parent                        — resolve_context_parent(): no session ddo / no
 *                                   from_parent here ⇒ = section_tipo.
 *   parent_grouper                — ontology getParent(tipo).
 *   lang                          — translatable ? requestLang : nolan. The
 *                                   component is instantiated with this lang and
 *                                   get_lang() returns it (non-translatable forces
 *                                   nolan). For these non-translatable fields ⇒ nolan.
 *   mode                          — source.mode.
 *   model                         — get_class = source.model.
 *   properties                    — ontology getProperties(tipo) deep-clone with
 *                                   `css` removed (component, non-list).
 *   permissions                   — ROOT shortcut = 3 (see note). Non-root deferred.
 *   label                         — ontology term in DEDALO_APPLICATION_LANG (fallback).
 *   translatable                  — ontology getTranslatable(tipo).
 *   tools                         — get_tools()+create_tool_simple_context (empty in
 *                                   list mode; component tools only in non-list).
 *   buttons                       — [] (components never carry buttons).
 *   css                           — properties.css (null in list mode → dropped) +
 *                                   the virtual-section override section.css[tipo].
 *   sortable                      — get_sortable(): true except DEDALO_NOTES_TEXT_TIPO.
 *   legacy_model                  — ontology getLegacyModel(tipo) (model_tipo term).
 *   path                          — [] (request_config not built ⇒ get_order_path skipped).
 *
 * PERMISSIONS — ROOT SHORTCUT: security::get_security_permissions returns 3 when
 * the logged user is DEDALO_SUPERUSER (root). We serve only the root path (the
 * TS core does not yet own the session/user-id; like the count handler it assumes
 * the bridged session is root). Full non-root resolution (read_only_scope,
 * permissions_table, the per-section special cases, and the component-level
 * resolve_component_read_permission downgrades) is DEFERRED — components whose
 * tipo triggers those special cases are declined by canHandleRequest.
 */

import type { OntologyRepository } from '@dedalo/ontology';
import {
  filterComponentTools,
  getRegisteredTools,
  type SimpleToolObject,
  type ToolsQueryer,
} from './tools_registry.ts';
import type { ToolPropertiesMap } from './tool_properties_cache.ts';

/** DEDALO_DATA_NOLAN. */
const NOLAN = 'lg-nolan';
/** DEDALO_NOTES_TEXT_TIPO — the only component with sortable=false. */
const NOTES_TEXT_TIPO = 'rsc329';

/** Install config the context build needs (PHP define()s, injected — no globals). */
export interface ContextConfig {
  /** DEDALO_APPLICATION_LANG (component label lang). */
  applicationLang: string;
  /** DEDALO_STRUCTURE_LANG (legacy_model term lang). */
  structureLang: string;
  /** DEDALO_TOOLS_URL (e.g. '/v7_dev/tools') — base for tool css/icon urls. */
  toolsUrl: string;
}

/**
 * Build a ContextConfig from a Dédalo-style env map (the DEDALO_* vars).
 * Mirrors the PHP config compiler:
 *   DEDALO_APPLICATION_LANG  ← DEDALO_APPLICATION_LANGS_DEFAULT
 *   DEDALO_STRUCTURE_LANG    (defaults 'lg-spa')
 *   DEDALO_TOOLS_URL         ← DEDALO_TOOLS_URL, else DEDALO_ROOT_WEB + '/tools'
 * Passed explicitly (never read from a module global) so there is no
 * cross-request mutable state.
 */
export function contextConfigFromEnv(
  env: Record<string, string | undefined> = process.env,
): ContextConfig {
  const applicationLang = env.DEDALO_APPLICATION_LANGS_DEFAULT ?? 'lg-eng';
  const structureLang = env.DEDALO_STRUCTURE_LANG ?? 'lg-spa';
  const rootWeb = env.DEDALO_ROOT_WEB ?? '/dedalo';
  const toolsUrl = env.DEDALO_TOOLS_URL ?? `${rootWeb.replace(/\/$/, '')}/tools`;
  return { applicationLang, structureLang, toolsUrl };
}

/** RQO source for a component get_element_context. */
export interface ElementContextSource {
  tipo: string;
  section_tipo?: string;
  model?: string;
  lang?: string;
  mode?: string;
  [k: string]: unknown;
}

export interface BuildComponentElementContextOptions {
  ontology: OntologyRepository;
  /** Queryer for the tools registry reads. */
  toolsQueryer: ToolsQueryer;
  contextConfig: ContextConfig;
  /** Default request lang (DEDALO_DATA_LANG) when source.lang is absent. */
  dataLang: string;
  /**
   * Install-time registered-tools cache map (name→properties); when set, tool
   * DDO `properties` come from it verbatim. See tool_properties_cache.ts.
   */
  toolProperties?: ToolPropertiesMap;
}

/** The element-context envelope (pre router-decoration). */
export interface ElementContextResponse {
  result: unknown[] | false;
  msg: string;
  errors: string[];
}

/**
 * Build the {result:[DDO], msg, errors} response for a component
 * get_element_context. The router adds action + csrf_token.
 */
export async function buildComponentElementContext(
  source: ElementContextSource,
  opts: BuildComponentElementContextOptions,
): Promise<ElementContextResponse> {
  const { ontology, contextConfig } = opts;

  const tipo = source.tipo;
  const sectionTipo = source.section_tipo ?? source.tipo;
  const model = typeof source.model === 'string' ? source.model : await ontology.getModelByTipo(tipo);
  const requestLang = source.lang ?? opts.dataLang;
  const mode = source.mode ?? 'list';

  if (model === null || !model.startsWith('component_')) {
    return { result: false, msg: 'Error. Request failed', errors: ['unsupported model'] };
  }

  // lang: translatable ? requestLang : nolan (PHP component_lang rule + the
  // instance's fix_language_nolan for non-translatable elements).
  const translatable = await ontology.getTranslatable(tipo);
  const lang = translatable ? requestLang : NOLAN;

  // properties (ontology, deep clone) with css removed.
  const propsSource = (await ontology.getProperties(tipo)) ?? {};
  const properties: Record<string, unknown> = { ...propsSource };
  const ontologyCss = (properties as { css?: unknown }).css;
  delete (properties as { css?: unknown }).css;

  // css: in list mode the component edit-css is removed (null → dropped).
  // Otherwise the component css = properties.css, possibly overridden by the
  // section's virtual-css map (section.properties.css[tipo]).
  let css: unknown = mode === 'list' ? null : (ontologyCss ?? null);
  const sectionProps = await ontology.getProperties(sectionTipo);
  const sectionCss = (sectionProps as { css?: Record<string, unknown> } | null)?.css;
  if (sectionCss && Object.prototype.hasOwnProperty.call(sectionCss, tipo)) {
    css = sectionCss[tipo];
  }

  // parent_grouper: ontology parent.
  const parentGrouper = await ontology.getParent(tipo);

  // parent: resolve_context_parent → section_tipo (no session/from_parent here).
  const parent = sectionTipo;

  // label: ontology term in DEDALO_APPLICATION_LANG (with fallback). Note: a
  // properties.label override per application lang would win, but the ported
  // models carry no properties.label.
  const label = await ontology.getLabel(tipo, contextConfig.applicationLang);

  // legacy_model: model_tipo term in DEDALO_STRUCTURE_LANG.
  const legacyModel = await ontology.getLegacyModel(tipo);

  // sortable.
  const sortable = tipo !== NOTES_TEXT_TIPO;

  // permissions: ROOT shortcut.
  const permissions = 3;

  // tools: only in NON-list mode for components (PHP get_structure_context_core
  // gate: section/area→list, else mode!=='list'). buttons: always [].
  let tools: unknown[] = [];
  if (mode !== 'list') {
    const registered = await getRegisteredTools(opts.toolsQueryer, ontology, opts.toolProperties);
    const filtered = filterComponentTools(registered, {
      model,
      tipo,
      sectionTipo,
      mode,
      translatable,
      // with_lang_versions is a per-component flag; for the ported models it is
      // false (it only affects requirement_translatable tools, none of which
      // apply to these components).
      withLangVersions: false,
    });
    tools = filtered
      .filter((tool) => {
        // mode check: skip a tool whose properties.mode is set and differs from
        // the current mode (PHP get_structure_context_core tool loop).
        const props = tool.properties;
        const toolMode =
          props && typeof props === 'object' && !Array.isArray(props)
            ? (props as { mode?: unknown }).mode
            : undefined;
        return toolMode === undefined || toolMode === mode;
      })
      .map((tool) => buildToolDdo(tool, contextConfig));
  }

  // Assemble in PHP dd_object property-declaration order, dropping nulls.
  const ddo: Record<string, unknown> = {};
  ddo.typo = 'ddo';
  ddo.type = 'component';
  ddo.tipo = tipo;
  ddo.section_tipo = sectionTipo;
  if (parent !== null) ddo.parent = parent;
  if (parentGrouper !== null) ddo.parent_grouper = parentGrouper;
  if (lang !== null) ddo.lang = lang;
  ddo.mode = mode;
  ddo.model = model;
  ddo.properties = properties;
  ddo.permissions = permissions;
  if (label !== null) ddo.label = label;
  ddo.translatable = translatable;
  ddo.tools = tools;
  ddo.buttons = [];
  if (css !== null) ddo.css = css;
  ddo.sortable = sortable;
  if (legacyModel !== null) ddo.legacy_model = legacyModel;
  ddo.path = [];

  return { result: [ddo], msg: 'OK. Request done successfully', errors: [] };
}

/**
 * Build one tool DDO — port of tool_common::create_tool_simple_context for the
 * (no tool_config) case. Field order = dd_object declaration order, null-filtered:
 *   typo, type, section_tipo, mode, model, [properties], label, css, [developer],
 *   name, icon, show_in_inspector, show_in_component
 * developer is ALWAYS dropped: PHP reads $tool_object->developer[0]->value[0]
 * but developer is a plain string, so the access yields null (faithful bug port).
 */
function buildToolDdo(tool: SimpleToolObject, cfg: ContextConfig): Record<string, unknown> {
  // label: match DEDALO_APPLICATION_LANG, else first lang value, else the name.
  const matched = tool.label.find((l) => l.lang === cfg.applicationLang);
  const label =
    (matched?.value ?? tool.label[0]?.value) || tool.name || 'Unknown';

  const base = `${cfg.toolsUrl}/${tool.name}`;
  const css = { url: `${base}/css/${tool.name}.css` };
  const icon = `${base}/img/icon.svg`;

  const ddo: Record<string, unknown> = {};
  ddo.typo = 'ddo';
  ddo.type = 'tool';
  ddo.section_tipo = tool.sectionTipo;
  ddo.mode = 'edit'; // create_tool_simple_context hardcodes 'edit'
  ddo.model = tool.name;
  if (tool.properties !== null && tool.properties !== undefined) ddo.properties = tool.properties;
  ddo.label = label;
  ddo.css = css;
  // developer dropped (see docblock)
  ddo.name = tool.name;
  ddo.icon = icon;
  ddo.show_in_inspector = tool.showInInspector;
  ddo.show_in_component = tool.showInComponent;
  return ddo;
}
