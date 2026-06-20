// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL, ts_object */
/*eslint no-undef: "error"*/

// imports
	import {area} from '../../area/js/area.js'

/**
* AREA_ROOT
* Named alias that exposes the generic {@link area} constructor under the
* area_root identity.
*
* In Dédalo, area_root is a top-level navigational node in the ontology tree —
* it serves as the root entry point of the application shell and is always the
* first navigable area presented to the user after login.  On the server side
* (class.area_root.php) it extends area_common as an empty subclass, meaning
* all behaviour is inherited without modification.
*
* The client-side routing layer resolves the JS module by matching context.model
* (e.g. "area_root") against the registered module map.  Each area variant
* therefore needs its own named export even when all runtime behaviour is
* identical.  This module satisfies that contract without duplicating code: every
* area_root instance is an ordinary {@link area} instance, inheriting its full
* prototype chain (build, render, init, destroy, refresh, etc.) from
* area.prototype and area_common.prototype.
*
* @module area_root
* @exports {Function} area_root - the area constructor (direct reference, not a wrapper)
*/
export const area_root = area

// @license-end