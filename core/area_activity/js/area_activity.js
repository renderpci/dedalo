// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL, ts_object */
/*eslint no-undef: "error"*/

// imports
	import {area} from '../../area/js/area.js'

/**
* AREA_ACTIVITY
* Named alias that exposes the generic {@link area} constructor under the
* area_activity identity.
*
* Dédalo's routing layer looks up the JS module by a per-area class name
* (e.g. "area_activity"), so each area type needs its own named export even
* when all behaviour is shared. This module satisfies that contract without
* duplicating any code: every area_activity instance is an ordinary area
* instance, inheriting its full prototype chain (build, render, init, destroy,
* etc.) from area.prototype and area_common.prototype.
*
* The PHP counterpart (class.area_activity.php) follows the same pattern —
* an empty subclass of area_common — for identical reasons.
*
* @module area_activity
* @exports {Function} area_activity - the area constructor (same reference)
*/
export const area_activity = area

// @license-end