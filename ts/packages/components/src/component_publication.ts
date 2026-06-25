import { ComponentRelationCommon } from './component_relation_common.ts';
import type { ComponentInit } from './component_common.ts';

/**
 * Read-side port of PHP `component_publication` (core/component_publication/
 * class.component_publication.php).
 *
 * component_publication is a RELATION-FAMILY component (extends
 * component_relation_common) that stores a single selection locator in the
 * 'relation' matrix column. Its JSON controller (component_publication_json.php)
 * behaves like the SELECT/datalist family rather than like relation_parent:
 *
 *   - LIST/tm mode: `entries` = get_list_value() (inherited from
 *     component_relation_common) — the LABELS of the datalist options whose locator
 *     matches the stored selection, in datalist order. Base-7 data item only (no
 *     parent_tipo / pagination / subdatum). Verified vs the live publication_single_list
 *     golden: entries = ["Sí"] (a single matched datalist label).
 *   - EDIT mode: `entries` = get_data_lang() (raw locator) PLUS a `datalist`
 *     (get_list_of_values) on the data item — the full option set. The datalist edit
 *     branch is NOT ported (this phase gates LIST), so the data-element builder
 *     declines edit/tm/search loudly.
 *
 * The datalist resolution reuses ComponentRelationCommon.getListValue (the same path
 * radio_button / check_box use), which is GATED to the byte-reachable V5 / single-
 * target / single-input_text-label shape (loud throw otherwise). Real publications
 * target a small system Sí/No section (e.g. rsc281 → dd64), matching that shape.
 */
export class ComponentPublication extends ComponentRelationCommon {
  protected readonly modelName = 'component_publication';

  private constructor(init: ComponentInit) {
    super(init);
  }

  static async create(init: ComponentInit): Promise<ComponentPublication> {
    const instance = new ComponentPublication(init);
    await instance.resolveLang();
    return instance;
  }
}
