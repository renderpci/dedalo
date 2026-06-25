// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL, ts_object */
/*eslint no-undef: "error"*/

// imports
	import {area} from '../../area/js/area.js'

/**
* AREA_TOOL
* Named alias that exposes the generic {@link area} constructor under the
* area_tool identity.
*
* In Dédalo, area_tool is one of the top-level root areas registered in the
* global application shell (see area.php::get_areas()).  It holds the set of
* administrative/utility tools surfaced to the user (e.g. export, diffusion,
* print, maintenance utilities).  On the server side (class.area_tool.php) it
* extends area_common as an empty subclass, which means all behaviour is fully
* inherited from the shared area prototype without modification.
*
* The client-side module registry resolves the JS constructor by matching
* context.model (e.g. "area_tool") to an imported named export.  Each area
* variant therefore needs its own named export even when all runtime behaviour
* is identical.  This module satisfies that contract without duplicating code:
* every area_tool instance is an ordinary {@link area} instance, inheriting its
* full prototype chain (build, render, init, destroy, refresh, etc.) from
* area.prototype and area_common.prototype.
*
* @module area_tool
* @exports {Function} area_tool - the area constructor (direct reference, not a wrapper)
*/
export const area_tool = area

// @license-end