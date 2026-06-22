import { ComponentRelationCommon } from './component_relation_common.ts';
import type { ComponentInit } from './component_common.ts';

/**
 * Read-side port of PHP `component_radio_button` get_value
 * (core/component_radio_button/class.component_radio_button.php).
 *
 * radio_button is a SINGLE-select relation component: it stores at most one locator
 * in the 'relation' matrix column. It has NO own get_export_value — it inherits
 * component_relation_common::get_export_value, exactly like component_select, and
 * its only overrides are default_relation_type = dd151 (a save-side default,
 * irrelevant to read) and get_sortable() = true. The read semantics are therefore
 * IDENTICAL to component_select, so all resolution is inherited from
 * ComponentRelationCommon unchanged.
 */
export class ComponentRadioButton extends ComponentRelationCommon {
  protected readonly modelName = 'component_radio_button';

  private constructor(init: ComponentInit) {
    super(init);
  }

  static async create(init: ComponentInit): Promise<ComponentRadioButton> {
    const instance = new ComponentRadioButton(init);
    await instance.resolveLang();
    return instance;
  }
}
