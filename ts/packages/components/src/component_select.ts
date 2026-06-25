import { ComponentRelationCommon } from './component_relation_common.ts';
import type { ComponentInit } from './component_common.ts';
import type { ComponentDatum } from '@dedalo/db';

/**
 * Read-side port of PHP `component_select` get_value. component_select has NO own
 * get_export_value; it inherits component_relation_common::get_export_value (the V5
 * ddo_map path). All the resolution lives in ComponentRelationCommon, shared with
 * component_radio_button (identical single-select semantics) and component_check_box
 * (the multi-locator records-level join). component_select is single-select in real
 * data, but the records join is uniform so no special-casing is needed here.
 */
export class ComponentSelect extends ComponentRelationCommon {
  protected readonly modelName = 'component_select';

  private constructor(init: ComponentInit) {
    super(init);
  }

  static async create(init: ComponentInit): Promise<ComponentSelect> {
    const instance = new ComponentSelect(init);
    await instance.resolveLang();
    return instance;
  }

  /**
   * The RAW stored locators (get_data_lang) — the EDIT-mode `entries`. Nullable:
   * null when the component has no stored selection (PHP get_data_lang null), so
   * the edit element emits `entries: null` exactly as the live controller does.
   * (Distinct from the base rawLocators(), which collapses null → [] for the
   * relation main-item subdatum walk.)
   */
  async dataLocators(): Promise<ComponentDatum[] | null> {
    return this.getDataLang();
  }
}
