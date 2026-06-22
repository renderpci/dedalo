import { ComponentRelationCommon } from './component_relation_common.ts';
import type { ComponentInit } from './component_common.ts';

/**
 * Read-side port of PHP `component_relation_related` get_value
 * (core/component_relation_related/class.component_relation_related.php).
 *
 * component_relation_related stores associative (related-term) links as an array of
 * locators in the 'relation' matrix column (type 'dd89', with a 'type_rel'
 * directionality key). It has NO own get_export_value / get_value override — it
 * inherits component_relation_common::get_export_value, so for get_value it is a
 * THIN subclass:
 *
 *   get_value() = get_export_value()->to_flat_string()
 *
 * IMPORTANT — get_export_value reads get_data() (the STORED locators), NOT
 * get_data_with_references(). The inverse-reference computation
 * (get_calculated_references / get_references_recursive) overrides ONLY
 * get_data_with_references and is surfaced solely by the JSON controller in 'edit'
 * mode as a separate `references` property — it never affects get_value. So the
 * computed-inverse graph (bidirectional dd467 / multidirectional dd621) is OUT of
 * the read/get_value path entirely; the get_export_value path is identical to the
 * other relation-family components.
 *
 * Every real component_relation_related carries an explicit `source.request_config`
 * (V6 ddo_map). For the simple single-input_text shape (e.g. test54 → test52) this
 * resolves byte-identically via ComponentRelationCommon's V6 path. Multi-level
 * ddo_maps (e.g. numisdata36: numisdata309 → numisdata303 nested descent, joined
 * with multiple sibling ddos) are DEFERRED — the shared resolver throws loudly so
 * they fall through to the PHP engine rather than producing a wrong-byte result.
 */
export class ComponentRelationRelated extends ComponentRelationCommon {
  protected readonly modelName = 'component_relation_related';

  private constructor(init: ComponentInit) {
    super(init);
  }

  static async create(init: ComponentInit): Promise<ComponentRelationRelated> {
    const instance = new ComponentRelationRelated(init);
    await instance.resolveLang();
    return instance;
  }
}
