import { ComponentRelationCommon } from './component_relation_common.ts';
import type { ComponentInit } from './component_common.ts';

/**
 * Read-side port of PHP `component_portal` (core/component_portal/
 * class.component_portal.php).
 *
 * component_portal is a RELATION-FAMILY component: it stores an array of locators
 * (the linked records) in the 'relation' matrix column — identical in shape to
 * component_relation_parent / component_relation_related
 * ({id, type, section_id, section_tipo, from_component_tipo}). It extends
 * component_relation_common in PHP and has NO read-relevant get_export_value /
 * get_data / get_list override (its overrides are save-side: add/remove element,
 * regenerate, set_data_external). So for the read path it is a THIN subclass.
 *
 * The portal JSON controller (component_portal_json.php) LIST/tm mode emits, like
 * the relation_parent controller:
 *   - a MAIN data-item whose `entries` are get_data_paginated() (the raw locators
 *     with a `paginated_key` appended), plus appended parent_tipo, parent_section_id
 *     (= get_section_id(), the HOST record id — NOT false like relation_parent) and
 *     a pagination {total, limit, offset} sub-object;
 *   - then get_subdatum($tipo, $value) per locator × per request_config show-ddo
 *     label column, appended AFTER the main item ([main, ...subdata], like
 *     relation_parent).
 *
 * EVERY real portal carries an explicit `source.request_config` (V6 ddo_map), so the
 * label component(s) resolve through ComponentRelationCommon's V6 path. NOTE: real
 * portals frequently link to a MEDIA section whose show-ddo column is
 * component_image (e.g. numisdata164 → rsc170/rsc29) — the shared resolver loud-throws
 * on a non-input_text-family label column, so a portal whose subdatum is a media
 * element correctly DECLINES (the media element DATA half is not ported — its
 * list_value filter depends on un-ported per-instance media config constants and the
 * appended external_source/posterframe_url are media-derived). A portal whose label
 * column is a leaf input_text-family component resolves byte-identically.
 *
 * The 'external' source mode (properties.source.mode==='external' + the client's
 * get_data_external flag) recomputes/saves inverse locators via set_data_external
 * before serving — a WRITE path, out of this read-only phase. The data-element
 * builder declines it loudly (see data_element.ts).
 */
export class ComponentPortal extends ComponentRelationCommon {
  protected readonly modelName = 'component_portal';

  private constructor(init: ComponentInit) {
    super(init);
  }

  static async create(init: ComponentInit): Promise<ComponentPortal> {
    const instance = new ComponentPortal(init);
    await instance.resolveLang();
    return instance;
  }
}
