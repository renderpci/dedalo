// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL, ts_object */
/*eslint no-undef: "error"*/

// imports
	import {area} from '../../area/js/area.js'

/**
* AREA_ADMIN
* Re-export shim that makes area_admin a named alias for the core area class.
*
* On the server side (class.area_admin.php) area_admin extends area_common,
* but on the client side the two area variants share identical behaviour —
* any difference is handled inside the shared area prototype methods themselves
* (e.g. via context.model checks).  A separate class definition would therefore
* be redundant, so this module simply re-exports area under the area_admin name,
* keeping the JavaScript model in sync with the PHP model hierarchy without
* duplicating code.
*
* Callers that import area_admin receive the same constructor and prototype
* chain as callers that import area directly.  The export name is used by the
* module registry to resolve the correct class for instances whose context.model
* equals 'area_admin'.
*
* @module area_admin
* @exports {Function} area_admin - the area constructor (direct reference, not a wrapper)
*/
export const area_admin = area

// @license-end
