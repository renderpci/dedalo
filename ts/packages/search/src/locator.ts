/**
 * Read-side port of the minimal `locator` shape the search slice needs, plus the
 * two PHP statics search_related leans on:
 *   - locator::get_term_id_from_locator()  (core/common/class.locator.php)
 *   - the flat-index key composition used by search_related::parse_sql_query().
 *
 * A Dédalo locator identifies a target record (section_tipo + section_id) and may
 * carry a relation `type` (a dd-tipo) and a `from_component_tipo` (the component
 * field that holds the link). The related-mode search matches every row whose
 * `relation` JSONB column contains a back-link to one of these locators, using a
 * precomputed flat-string GIN index (data_relations_flat_*).
 */

/** The minimal locator the related-mode search consumes. */
export interface SearchLocator {
  section_tipo: string;
  /** Stored as a number or numeric string in matrix data; coerced to string for the key. */
  section_id: number | string;
  /** Relation type tipo (e.g. 'dd47' for the parent link). Optional. */
  type?: string;
  /** The component field holding the link (e.g. the relation_parent tipo). Optional. */
  from_component_tipo?: string;
}

/**
 * Port of PHP `locator::get_term_id_from_locator($locator)`
 * (core/common/class.locator.php line 812): `section_tipo . '_' . section_id`.
 * This is the BASE flat-locator string used by every data_relations_flat_* key
 * (NOT the tld-based ontology::get_term_id_from_locator, which search_related does
 * NOT use — it calls the locator:: static).
 *
 * Example: {section_tipo:'rsc205', section_id:2755} → "rsc205_2755".
 */
export function getTermIdFromLocator(locator: SearchLocator): string {
  return `${locator.section_tipo}_${locator.section_id}`;
}
