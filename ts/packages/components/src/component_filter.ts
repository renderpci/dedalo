/**
 * Read-side port of PHP `component_filter` (core/component_filter/) — the
 * project/scope access-control component every editable section carries.
 *
 * component_filter extends component_relation_common and stores its data in the
 * 'relation' matrix column as an array of locators pointing at PROJECT records in
 * the projects section (DEDALO_SECTION_PROJECTS_TIPO = 'dd153'), each with relation
 * type DEDALO_RELATION_TYPE_FILTER ('dd675') and from_component_tipo = the filter
 * component's own tipo. Its constructor forces lang = DEDALO_DATA_NOLAN (project
 * assignments are language-neutral), so the effective lang is always lg-nolan.
 *
 * This module ports the two pieces the EDIT-mode JSON DATA element needs beyond
 * the generic relation accessors (rawLocators / effectiveLang inherited from
 * ComponentRelationCommon):
 *
 *   - get_datalist() — the user-authorized project list (the checkbox grid), via a
 *     port of component_filter_master::get_user_authorized_projects(). For the ROOT
 *     user (a GLOBAL ADMIN) this is EVERY project in dd153 (an unlimited search over
 *     the projects section), each enriched with:
 *       · label  — the project name (DEDALO_PROJECTS_NAME_TIPO = 'dd156',
 *                  component_input_text) resolved at DEDALO_DATA_LANG with the
 *                  get_value_with_fallback_from_data chain
 *                  (lang → DEDALO_DATA_LANG_DEFAULT → lg-nolan → any project lang).
 *       · order  — the project order (tipo 'dd1631', component_number), as an int,
 *                  default 0.
 *       · parent — the NEAREST recursive ancestor project (via the projects
 *                  section's component_relation_parent chain) that is ALSO in the
 *                  authorized set, as a {section_tipo, section_id} locator, else null.
 *       · value  — a fresh {section_tipo, section_id} locator (NO id/type/
 *                  from_component_tipo — get_user_authorized_projects builds a bare
 *                  locator).
 *     The list is sorted alphabetically (case-insensitive, strcasecmp) by label.
 *
 *   - get_ar_target_section_tipo() — [DEDALO_SECTION_PROJECTS_TIPO] = ['dd153'].
 *   - get_order_path() — the two-step sortable path: this component, then the
 *     project-name field (dd156) on dd153.
 *
 * ── PARITY SCOPE / DECLINES (no guessed bytes) ──
 *   - Only the GLOBAL-ADMIN (root) datalist is byte-reproduced: ALL projects. The
 *     REGULAR-user datalist is component_filter_master::get_user_projects (the
 *     user's own dd170 assignments) — needs the User-section filter_master read +
 *     the security layer; NOT ported → buildFilterElement declines when the caller
 *     is not a global admin.
 *   - get_list_value (list/tm mode) intersects the stored locators with the
 *     authorized set and returns LABELS only — declined this phase (EDIT only here;
 *     list/tm/search not gated). The element builder throws for non-edit modes.
 *   - Multi-level parent resolution (a project whose direct parent is NOT in the
 *     set, forcing a walk to a grandparent) IS reproduced by the faithful
 *     get_parents_recursive walk, but no install data exercises it for root (all
 *     ancestors are in the all-projects set); reported, not separately gated.
 */

import { ComponentRelationCommon } from './component_relation_common.ts';
import type { ComponentInit, DataColumnName } from './component_common.ts';
import type { ComponentDatum, MatrixDbManager } from '@dedalo/db';
import type { OntologyRepository } from '@dedalo/ontology';
import type { LangConfig } from './lang_config.ts';
import { resolveMatrixTable } from './matrix_table.ts';

/** DEDALO_SECTION_PROJECTS_TIPO / DEDALO_FILTER_SECTION_TIPO_DEFAULT. */
export const PROJECTS_SECTION_TIPO = 'dd153';
/** DEDALO_PROJECTS_NAME_TIPO (component_input_text 'Proyecto (nombre)'). */
export const PROJECTS_NAME_TIPO = 'dd156';
/** Project order component (component_number 'Order') — PHP hardcodes 'dd1631'. */
export const PROJECTS_ORDER_TIPO = 'dd1631';

/** A bare project locator {section_tipo, section_id} (get_user_authorized_projects builds these). */
export interface ProjectLocator {
  section_tipo: string;
  section_id: string;
}

/**
 * One datalist option (component_filter::get_datalist item), in PHP stdClass
 * declaration order: type, label, section_tipo, section_id, value, parent, order.
 */
export interface FilterDatalistItem {
  type: 'project';
  label: string;
  section_tipo: string;
  section_id: string;
  value: ProjectLocator;
  parent: ProjectLocator | null;
  order: number;
}

/** A target-section descriptor (set_target_sections) — {tipo, label} only. */
export interface FilterTargetSection {
  tipo: string;
  label: string;
}

/**
 * The enumerate-projects-rows callback (port of get_user_authorized_projects'
 * unlimited search over the projects section for the GLOBAL-ADMIN branch). Returns
 * the project rows {section_tipo, section_id} in PHP search order (section_id ASC).
 * Injected so this module stays free of @dedalo/search.
 */
export type ProjectsRecordSearch = (
  sectionTipos: string[],
) => Promise<ReadonlyArray<{ section_tipo: string; section_id: number }>>;

/** Thrown for a filter render this phase declines (non-edit mode, non-root user). */
export class UnsupportedFilter extends Error {}

export class ComponentFilter extends ComponentRelationCommon {
  protected readonly modelName = 'component_filter';

  /**
   * Build a ComponentFilter. component_filter ALWAYS reads from the 'relation'
   * column and is non-translatable (effective lang forced to lg-nolan), exactly
   * like its component_relation_common base.
   */
  static async create(init: ComponentInit): Promise<ComponentFilter> {
    const instance = new ComponentFilter({ ...init, dataColumnName: 'relation' });
    await instance.resolveLang();
    return instance;
  }

  /** get_ar_target_section_tipo() → [DEDALO_SECTION_PROJECTS_TIPO]. */
  static targetSectionTipos(): string[] {
    return [PROJECTS_SECTION_TIPO];
  }

  /**
   * set_target_sections add (component_filter_json default branch): one descriptor
   * per target section tipo, {tipo, label}. label = the section term at
   * DEDALO_DATA_LANG (get_term_by_tipo). No permissions block (unlike select).
   */
  static async targetSections(
    ontology: OntologyRepository,
    dataLang: string,
  ): Promise<FilterTargetSection[]> {
    const out: FilterTargetSection[] = [];
    for (const tipo of ComponentFilter.targetSectionTipos()) {
      const label = (await ontology.getLabel(tipo, dataLang)) ?? '';
      out.push({ tipo, label });
    }
    return out;
  }

  /**
   * get_order_path(): the two-step sortable path — this component (the join
   * anchor), then the project-name field (dd156) on the projects section (dd153).
   * Each step in plain-object key order: component_tipo, model, name, section_tipo
   * (matches the live filter context `path`).
   */
  static async orderPath(
    ontology: OntologyRepository,
    componentTipo: string,
    sectionTipo: string,
    dataLang: string,
  ): Promise<Array<Record<string, unknown>>> {
    const selfModel = (await ontology.getModelByTipo(componentTipo)) ?? 'component_filter';
    const selfName = (await ontology.getLabel(componentTipo, dataLang)) ?? '';
    const nameModel = (await ontology.getModelByTipo(PROJECTS_NAME_TIPO)) ?? 'component_input_text';
    const nameName = (await ontology.getLabel(PROJECTS_NAME_TIPO, dataLang)) ?? '';
    return [
      {
        component_tipo: componentTipo,
        model: selfModel,
        name: selfName,
        section_tipo: sectionTipo,
      },
      {
        component_tipo: PROJECTS_NAME_TIPO,
        model: nameModel,
        name: nameName,
        section_tipo: PROJECTS_SECTION_TIPO,
      },
    ];
  }

  /** The RAW stored filter locators (get_data_lang) — the edit `entries`. */
  async dataLocators(): Promise<ComponentDatum[] | null> {
    return this.getDataLang();
  }

  /**
   * Port of component_filter::get_datalist() for the GLOBAL-ADMIN (root) branch:
   * the user-authorized project list = EVERY project in dd153, each resolved to its
   * label / order / nearest-in-set parent, sorted alphabetically by label.
   *
   * @param projectsSearch enumerate ALL dd153 rows (the unlimited admin search).
   */
  async getDatalist(projectsSearch: ProjectsRecordSearch): Promise<FilterDatalistItem[]> {
    const projects = await ComponentFilter.getUserAuthorizedProjects(
      projectsSearch,
      this.ontology,
      this.matrix,
      this.langConfig,
    );
    // Sort by label ASC, case-insensitive (PHP usort + strcasecmp).
    projects.sort((a, b) => strcasecmp(a.label, b.label));
    return projects;
  }

  /**
   * Port of component_filter_master::get_user_authorized_projects() (GLOBAL-ADMIN
   * branch). Builds one enriched FilterDatalistItem per project row, BEFORE the
   * sort (the caller sorts). Static + dependency-injected so there is no
   * per-request module state.
   */
  static async getUserAuthorizedProjects(
    projectsSearch: ProjectsRecordSearch,
    ontology: OntologyRepository,
    matrix: MatrixDbManager,
    langConfig: LangConfig,
  ): Promise<FilterDatalistItem[]> {
    const projectsTable = (await resolveMatrixTable(ontology, PROJECTS_SECTION_TIPO)) ?? 'matrix';
    const parentTipo = await resolveParentTipo(ontology, PROJECTS_SECTION_TIPO);

    // GLOBAL-ADMIN: ALL projects (the unlimited search), section_id ASC.
    const rows = await projectsSearch([PROJECTS_SECTION_TIPO]);
    const dataSet: ProjectLocator[] = rows.map((r) => ({
      section_tipo: r.section_tipo,
      section_id: String(r.section_id),
    }));
    const inSet = (loc: ProjectLocator): boolean =>
      dataSet.some((d) => d.section_tipo === loc.section_tipo && d.section_id === loc.section_id);

    const out: FilterDatalistItem[] = [];
    for (const row of rows) {
      // label (dd156, get_value_with_fallback_from_data chain).
      const nameData = await matrix.getComponentData(
        projectsTable,
        PROJECTS_SECTION_TIPO,
        row.section_id,
        'string',
        PROJECTS_NAME_TIPO,
      );
      const label = valueWithFallbackFromData(nameData, langConfig);

      // order (dd1631, component_number) — (int)($order_data[0]->value ?? 0).
      const orderData = await matrix.getComponentData(
        projectsTable,
        PROJECTS_SECTION_TIPO,
        row.section_id,
        'number',
        PROJECTS_ORDER_TIPO,
      );
      const order = toInt((orderData?.[0] as { value?: unknown } | undefined)?.value);

      // parent: the nearest recursive ancestor that is ALSO in the authorized set.
      let parent: ProjectLocator | null = null;
      const ancestors = await getParentsRecursive(
        matrix,
        projectsTable,
        parentTipo,
        PROJECTS_SECTION_TIPO,
        row.section_id,
      );
      for (const anc of ancestors) {
        if (inSet(anc)) {
          parent = { section_tipo: anc.section_tipo, section_id: anc.section_id };
          break;
        }
      }

      out.push({
        type: 'project',
        label,
        section_tipo: row.section_tipo,
        section_id: String(row.section_id),
        value: { section_tipo: row.section_tipo, section_id: String(row.section_id) },
        parent,
        order,
      });
    }
    return out;
  }
}

/** PHP strcasecmp: byte comparison of the lowercased strings. */
function strcasecmp(a: string, b: string): number {
  const la = a.toLowerCase();
  const lb = b.toLowerCase();
  return la < lb ? -1 : la > lb ? 1 : 0;
}

/** PHP (int) cast of an order value (string/number/null → int, default 0). */
function toInt(raw: unknown): number {
  if (typeof raw === 'number') return Math.trunc(raw);
  if (typeof raw === 'string') {
    const n = Number.parseInt(raw, 10);
    return Number.isNaN(n) ? 0 : n;
  }
  return 0;
}

/**
 * Port of component_string_common::get_value_with_fallback_from_data(): resolve a
 * label from a string-component datum array, trying lang → dataLangDefault →
 * lg-nolan → each project lang in order, returning '' when none has a value.
 * (decorate_untranslated is never applied here: get_datalist passes decorate=false.)
 */
function valueWithFallbackFromData(
  data: ComponentDatum[] | null,
  langConfig: LangConfig,
): string {
  if (!data || data.length === 0) return '';
  const lookup = new Map<string, unknown>();
  for (const item of data) {
    const it = item as { lang?: unknown; value?: unknown };
    if (typeof it.lang === 'string') lookup.set(it.lang, it.value);
  }
  const phpEmpty = (v: unknown): boolean =>
    v === undefined || v === null || v === '' || v === 0 || v === '0' || v === false;

  let value = lookup.get(langConfig.dataLang);
  if (phpEmpty(value)) {
    if (langConfig.dataLang !== langConfig.dataLangDefault) {
      value = lookup.get(langConfig.dataLangDefault);
    }
    if (phpEmpty(value)) value = lookup.get(langConfig.nolan);
    if (phpEmpty(value)) {
      for (const current of langConfig.allLangs) {
        if (current === langConfig.dataLang || current === langConfig.dataLangDefault) continue;
        value = lookup.get(current);
        if (!phpEmpty(value)) break;
      }
    }
  }
  // to_string: null/undefined → '' (the project labels here are plain strings).
  return value === undefined || value === null ? '' : String(value);
}

/**
 * Resolve the projects section's component_relation_parent tipo (get_parent_tipo):
 * the first component_relation_parent in the section's recursive children. Returns
 * null when the section has no parent component (no hierarchy).
 */
async function resolveParentTipo(
  ontology: OntologyRepository,
  sectionTipo: string,
): Promise<string | null> {
  const children = await ontology.getRecursiveChildren(sectionTipo, []);
  for (const child of children) {
    if ((await ontology.getModelByTipo(child)) === 'component_relation_parent') return child;
  }
  return null;
}

/** The direct parent locators of a project record (component_relation_parent get_data). */
async function getDirectParents(
  matrix: MatrixDbManager,
  table: string,
  parentTipo: string | null,
  sectionTipo: string,
  sectionId: number,
): Promise<ProjectLocator[]> {
  if (parentTipo === null) return [];
  const data = await matrix.getComponentData(table, sectionTipo, sectionId, 'relation', parentTipo);
  const out: ProjectLocator[] = [];
  for (const loc of data ?? []) {
    const l = loc as { section_tipo?: unknown; section_id?: unknown };
    if (typeof l.section_tipo === 'string' && l.section_id !== undefined && l.section_id !== null) {
      out.push({ section_tipo: l.section_tipo, section_id: String(l.section_id) });
    }
  }
  return out;
}

/**
 * Port of component_relation_parent::get_parents_recursive(): every unique ancestor
 * of a record, DFS pre-order (direct parents first, then their parents). Dedupes by
 * 'section_tipo_section_id'; path-local `visited` set guards cycles (a node may be
 * revisited via a different path). Returns ancestors in discovery order.
 */
async function getParentsRecursive(
  matrix: MatrixDbManager,
  table: string,
  parentTipo: string | null,
  sectionTipo: string,
  sectionId: number,
): Promise<ProjectLocator[]> {
  const unique = new Map<string, ProjectLocator>();
  async function walk(curTipo: string, curId: number, visited: Set<string>): Promise<void> {
    const key = `${curTipo}_${curId}`;
    if (visited.has(key)) return; // cycle on this path
    visited.add(key);
    const parents = await getDirectParents(matrix, table, parentTipo, curTipo, curId);
    for (const parent of parents) {
      const pk = `${parent.section_tipo}_${parent.section_id}`;
      if (!unique.has(pk)) {
        unique.set(pk, parent);
        await walk(parent.section_tipo, Number.parseInt(parent.section_id, 10), new Set(visited));
      }
    }
  }
  await walk(sectionTipo, sectionId, new Set());
  return [...unique.values()];
}

export { valueWithFallbackFromData, getParentsRecursive };
export type { DataColumnName };
