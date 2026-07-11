// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL, ts_object */
/*eslint no-undef: "error"*/


// imports
    import {area} from '../../area/js/area.js'



/**
* AREA_RESOURCE
* Canonical JS class for the Resource area within the Dédalo application shell.
*
* `area_resource` is a direct alias of the generic {@link area} constructor.
* All lifecycle behaviour (init → build → render → refresh → destroy),
* prototype methods (init, refresh, destroy, build_rqo_show, edit, list),
* and instance properties (id, model, type, tipo, mode, lang, datum,
* context, data, widgets, node, status) are inherited unchanged from `area`.
*
* The PHP counterpart (`class.area_resource extends area_common`) is equally
* empty — both sides delegate everything to the shared base.  Adding
* resource-specific overrides here (or on `area_resource.prototype`) is safe
* without breaking the common path.
*
* @type {Function} area_resource - same constructor reference as area
*/
export const area_resource = area



// @license-end
