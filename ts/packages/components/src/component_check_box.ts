import { ComponentRelationCommon } from './component_relation_common.ts';
import type { ComponentInit } from './component_common.ts';

/**
 * Read-side port of PHP `component_check_box` get_value
 * (core/component_check_box/class.component_check_box.php).
 *
 * check_box is the MULTI-select sibling of component_radio_button: it accumulates an
 * ARRAY of locators in the 'relation' matrix column. It has NO own get_export_value
 * — it inherits component_relation_common::get_export_value (its only overrides are
 * default_relation_type = dd151, a save-side default, and get_sortable()/get_datalist).
 *
 * The records-level join is the new shape over select/radio: multiple selected
 * locators each become a record slot, joined with records_separator (' | ', the
 * first indexed relation level), with the per-record label components joined by
 * fields_separator (', '). A locator whose target produces NO atoms leaves no slot
 * (so two empty selections collapse to '', NOT ' | ' — verified against the live
 * checkbox_multi_empty golden). All of this lives in ComponentRelationCommon's
 * uniform getValue(); check_box needs no read-side override.
 */
export class ComponentCheckBox extends ComponentRelationCommon {
  protected readonly modelName = 'component_check_box';

  private constructor(init: ComponentInit) {
    super(init);
  }

  static async create(init: ComponentInit): Promise<ComponentCheckBox> {
    const instance = new ComponentCheckBox(init);
    await instance.resolveLang();
    return instance;
  }
}
