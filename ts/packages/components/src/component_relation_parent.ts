import { ComponentRelationCommon } from './component_relation_common.ts';
import type { ComponentInit } from './component_common.ts';

/**
 * Read-side port of PHP `component_relation_parent` get_value
 * (core/component_relation_parent/class.component_relation_parent.php).
 *
 * component_relation_parent stores the upward (parent) hierarchy link as an array
 * of locators in the 'relation' matrix column. It has NO own get_export_value /
 * get_value / get_data override — it inherits component_relation_common's
 * get_export_value entirely (its overrides are all save-side: add_parent,
 * set_child_order, the static tree-traversal helpers, get_sortable). So for the
 * read/get_value path it is a THIN subclass:
 *
 *   get_value() = get_export_value()->to_flat_string()
 *
 * The only read-relevant difference from select/check_box is that every real
 * component_relation_parent carries an explicit `source.request_config` (the V6
 * ddo_map), so the label component(s) are resolved from that ddo_map — handled
 * uniformly by ComponentRelationCommon's V6 path. For the common single-input_text
 * ddo_map shape (e.g. rsc679 → rsc140) the resolution is byte-identical to the V5
 * path. Shapes this slice does not reproduce (value_with_parents hierarchy chains,
 * nested/descended ddo_maps) are gated loudly by the shared resolver.
 *
 * Note: the locator's stored type is DEDALO_RELATION_TYPE_PARENT_TIPO ('dd47'), but
 * the read path ignores it (get_export_value resolves the label on the locator's
 * own section_tipo/section_id regardless of relation type).
 */
export class ComponentRelationParent extends ComponentRelationCommon {
  protected readonly modelName = 'component_relation_parent';

  private constructor(init: ComponentInit) {
    super(init);
  }

  static async create(init: ComponentInit): Promise<ComponentRelationParent> {
    const instance = new ComponentRelationParent(init);
    await instance.resolveLang();
    return instance;
  }
}
