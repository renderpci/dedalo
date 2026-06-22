import type { ComponentDatum } from '@dedalo/db';
import { searchChildren, type SearchQueryer } from '@dedalo/search';
import { ComponentRelationCommon } from './component_relation_common.ts';
import type { ComponentInit } from './component_common.ts';
import { resolveMatrixTable } from './matrix_table.ts';

/**
 * Read-side port of PHP `component_relation_children` get_value
 * (core/component_relation_children/class.component_relation_children.php).
 *
 * component_relation_children stores NO rows of its own. Its get_data() is
 * COMPUTED: it runs a related-mode SQL search for every record whose
 * component_relation_parent links back to this (section_tipo, section_id) pair —
 * the inverse of component_relation_parent. This is why the model could not be
 * point-read like the rest of the relation family: it needs the search engine.
 *
 * The label resolution and the ' | ' join are inherited UNCHANGED from
 * ComponentRelationCommon (rsc680's V6 ddo_map → rsc140 input_text title). Only
 * get_data() is overridden here.
 *
 * Children resolution (PHP get_children → build_children_sqo):
 *   1. parent_tipo  = the component_relation_parent paired with this children
 *      component (rsc680.relations → the entry whose model is
 *      component_relation_parent → rsc679). PHP: get_ar_related_parent_tipo via
 *      common::get_ar_related_by_model('component_relation_parent', tipo).
 *   2. filter locator = {section_tipo, section_id, from_component_tipo: parent_tipo,
 *      type: dd47 (DEDALO_RELATION_TYPE_PARENT_TIPO)} → the
 *      data_relations_flat_fct_st_si flat-index path, key
 *      "<parent_tipo>_<section_tipo>_<section_id>".
 *   3. order = section_map->thesaurus->order (rsc195, a component_number sibling-
 *      order dataframe). PHP precomputes the ordered child ids
 *      (compute_ordered_child_ids) and applies an array_position() ORDER BY.
 *      When the order list is empty, the search falls back to order_default
 *      (section_id ASC).
 *
 * (!) ORDERING — the risky part. The sibling order (rsc195) is a DATAFRAME paired
 * by id_key to each child's parent-link locator id. compute_ordered_child_ids
 * resolves, per child: the parent-link locator id (resolve_parent_link_id_key)
 * then the order value paired by that id_key (get_value_by_id_key). In the live
 * dedalo7_mib data the order items carry the legacy `id` field, NOT `id_key`, so
 * the id_key match yields nothing → every child's order is PHP_INT_MAX → the
 * stable sort PRESERVES the preliminary section_id-ASC order → array_position over
 * that list == section_id ASC. This port reproduces the SAME id_key contract, so
 * it yields the SAME (section_id-ASC) ordering, byte-green with PHP. Were the data
 * to carry real id_key order values, both engines would reorder identically.
 */

/** DEDALO_RELATION_TYPE_PARENT_TIPO (core/base/dd_tipos.php). */
const RELATION_TYPE_PARENT_TIPO = 'dd47';

/** One computed child locator (the search result becomes a relation locator). */
interface ChildLocator {
  section_tipo: string;
  section_id: number;
  from_component_tipo: string;
  type: string;
}

export class ComponentRelationChildren extends ComponentRelationCommon {
  protected readonly modelName = 'component_relation_children';

  /** Memoised computed children (PHP $this->data_resolved). */
  private childrenResolved: ComponentDatum[] | null | undefined;

  private constructor(init: ComponentInit) {
    super(init);
  }

  static async create(init: ComponentInit): Promise<ComponentRelationChildren> {
    const instance = new ComponentRelationChildren(init);
    await instance.resolveLang();
    return instance;
  }

  /**
   * Override of get_data: compute the child locators via a related-mode SQL search
   * instead of reading the relation column. Returns the locators in PHP order
   * (section_id ASC for this data — see the ORDERING note above). Memoised.
   */
  protected override async getData(): Promise<ComponentDatum[] | null> {
    if (this.childrenResolved !== undefined) return this.childrenResolved;

    if (this.sectionId === null) {
      this.childrenResolved = null;
      return null;
    }
    if (this.searchQueryer === undefined) {
      throw new Error(
        `component_relation_children ${this.tipo}: get_data needs a search queryer (none provided)`,
      );
    }

    const parentTipo = await this.resolveParentRelationTipo();
    if (parentTipo === null) {
      // PHP returns [] (no children) when the parent tipo cannot be resolved.
      this.childrenResolved = [];
      return [];
    }

    // Precompute the ordered child ids (array_position ordering). When the list is
    // empty the search falls back to section_id ASC (order_default).
    const orderedChildIds = await this.computeOrderedChildIds(parentTipo);

    const rows = await searchChildren(this.searchQueryer, {
      parentSectionTipo: this.sectionTipo,
      parentSectionId: this.sectionId,
      parentRelationTipo: parentTipo,
      parentLinkType: RELATION_TYPE_PARENT_TIPO,
      table: this.matrixTable,
      ...(orderedChildIds.length > 0 ? { orderedChildIds } : {}),
    });

    const locators: ChildLocator[] = rows.map((r) => ({
      section_tipo: r.section_tipo,
      section_id: r.section_id,
      from_component_tipo: this.tipo,
      type: RELATION_TYPE_PARENT_TIPO,
    }));

    this.childrenResolved = locators as unknown as ComponentDatum[];
    return this.childrenResolved;
  }

  /**
   * Resolve the component_relation_parent tipo paired with this children component
   * (PHP get_ar_related_parent_tipo). The children component's `relations` array
   * lists the paired parent (rsc680 → [{tipo: rsc679}]); pick the entry whose
   * resolved model is component_relation_parent. Returns null when none is found.
   */
  private async resolveParentRelationTipo(): Promise<string | null> {
    const relationTipos = (await this.ontology.getRelationTipos(this.tipo)) ?? [];
    for (const relTipo of relationTipos) {
      const model = await this.ontology.getModelByTipo(relTipo);
      if (model === 'component_relation_parent') return relTipo;
    }
    return null;
  }

  /**
   * Port of compute_ordered_child_ids. Runs the preliminary (unordered, section_id
   * ASC) children search, then resolves each child's sibling-order value paired by
   * its parent-link id_key, and returns the child ids sorted ascending by that
   * order value (children without an order value sort last, preserving the
   * section_id-ASC preliminary order via a stable sort). Returns [] when the
   * section has no order component or no children — the caller then uses the
   * section_id-ASC default.
   */
  private async computeOrderedChildIds(parentTipo: string): Promise<number[]> {
    const orderComponentTipo = await this.resolveOrderComponentTipo();
    if (orderComponentTipo === null) return [];

    // Preliminary unordered fetch (section_id ASC default).
    const prelim = await searchChildren(this.searchQueryer!, {
      parentSectionTipo: this.sectionTipo,
      parentSectionId: this.sectionId!,
      parentRelationTipo: parentTipo,
      parentLinkType: RELATION_TYPE_PARENT_TIPO,
      table: this.matrixTable,
    });
    if (prelim.length === 0) return [];

    // PHP_INT_MAX equivalent: children with no order value sort last.
    const SORT_LAST = Number.MAX_SAFE_INTEGER;

    const items: Array<{ sectionId: number; order: number; idx: number }> = [];
    let idx = 0;
    for (const row of prelim) {
      const idKey = await this.resolveParentLinkIdKey(row.section_tipo, row.section_id, parentTipo);
      let orderValue: number | null = null;
      if (idKey > 0) {
        orderValue = await this.readOrderValueByIdKey(
          row.section_tipo,
          row.section_id,
          orderComponentTipo,
          idKey,
        );
      }
      items.push({
        sectionId: row.section_id,
        order: orderValue === null ? SORT_LAST : orderValue,
        idx: idx++,
      });
    }

    // Stable ascending sort by order value (idx tie-break preserves prelim order).
    items.sort((a, b) => (a.order - b.order) || (a.idx - b.idx));

    return items.map((it) => it.sectionId);
  }

  /**
   * Resolve the sibling-order component tipo from the section's section_map
   * (thesaurus.order). The section_map node is found by following the section's
   * virtual relation to its model section (e.g. rsc205 → rsc3) and locating the
   * descendant whose model is section_map; its properties.thesaurus.order is the
   * order component tipo (rsc195). Returns null when no order component is defined.
   */
  private async resolveOrderComponentTipo(): Promise<string | null> {
    const sectionMap = await this.resolveSectionMapProperties();
    if (sectionMap === null) return null;
    const thesaurus = sectionMap['thesaurus'];
    if (thesaurus === null || typeof thesaurus !== 'object') return null;
    const order = (thesaurus as Record<string, unknown>)['order'];
    return typeof order === 'string' && order !== '' ? order : null;
  }

  /**
   * Resolve the section_map properties for this section_tipo (PHP
   * section::get_section_map): find the section_map node (direct child, or via the
   * section's virtual relations to its model section), return its properties.
   */
  private async resolveSectionMapProperties(): Promise<Record<string, unknown> | null> {
    // 1. direct child with model section_map.
    const directMap = await this.findSectionMapNode(this.sectionTipo);
    if (directMap !== null) return this.ontology.getProperties(directMap);

    // 2. follow virtual relations (the section's model section, e.g. rsc3).
    const relations = (await this.ontology.getRelationTipos(this.sectionTipo)) ?? [];
    for (const relTipo of relations) {
      const model = await this.ontology.getModelByTipo(relTipo);
      if (model !== 'section') continue;
      const mapNode = await this.findSectionMapNode(relTipo);
      if (mapNode !== null) return this.ontology.getProperties(mapNode);
    }
    return null;
  }

  /** Find a section_map node among the direct children of a section tipo. */
  private async findSectionMapNode(sectionTipo: string): Promise<string | null> {
    const children = await this.ontology.getChildren(sectionTipo);
    for (const childTipo of children) {
      const model = await this.ontology.getModelByTipo(childTipo);
      if (model === 'section_map') return childTipo;
    }
    return null;
  }

  /**
   * Port of resolve_parent_link_id_key: the child's parent-link locator id (the
   * order dataframe's id_key). Reads the child's component_relation_parent data
   * (the relation column entry for the parent relation tipo) and returns the `id`
   * of the locator that targets THIS parent (section_tipo + section_id). Returns 0
   * when not found.
   */
  private async resolveParentLinkIdKey(
    childSectionTipo: string,
    childSectionId: number,
    parentRelationTipo: string,
  ): Promise<number> {
    const childTable = await resolveMatrixTable(this.ontology, childSectionTipo);
    const items = await this.matrix.getComponentData(
      childTable,
      childSectionTipo,
      childSectionId,
      'relation',
      parentRelationTipo,
    );
    if (items === null) return 0;
    for (const loc of items) {
      const l = loc as Record<string, unknown>;
      if (
        l['section_tipo'] === this.sectionTipo &&
        Number.parseInt(String(l['section_id']), 10) === this.sectionId &&
        l['id'] !== undefined
      ) {
        const id = Number.parseInt(String(l['id']), 10);
        return Number.isNaN(id) ? 0 : id;
      }
    }
    return 0;
  }

  /**
   * Read the order component's value paired by id_key (PHP
   * get_value_by_id_key → get_data_by_id_key). The order component is a number-
   * column dataframe; its item paired by id_key is the one whose `id_key` equals
   * the given key. The live data carries the legacy `id` field instead of
   * `id_key`, so this match yields null (→ child sorts last) — see the ORDERING
   * note on the class. Returns the numeric order value, or null when unpaired.
   */
  private async readOrderValueByIdKey(
    childSectionTipo: string,
    childSectionId: number,
    orderComponentTipo: string,
    idKey: number,
  ): Promise<number | null> {
    const childTable = await resolveMatrixTable(this.ontology, childSectionTipo);
    const items = await this.matrix.getComponentData(
      childTable,
      childSectionTipo,
      childSectionId,
      'number',
      orderComponentTipo,
    );
    if (items === null || items.length === 0) return null;
    for (const item of items) {
      const it = item as Record<string, unknown>;
      // Unified contract: pairing key is id_key (NOT id). PHP get_data_by_id_key
      // filters strictly on item.id_key === id_key.
      if (it['id_key'] !== undefined && Number.parseInt(String(it['id_key']), 10) === idKey) {
        const v = it['value'];
        if (v === null || v === undefined || v === '') return null;
        const n = typeof v === 'number' ? v : Number.parseInt(String(v), 10);
        return Number.isNaN(n) ? null : n;
      }
    }
    return null;
  }
}

// Re-export so the model dispatch can type the queryer dependency without a deep import.
export type { SearchQueryer };
