// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL, ts_object */
/*eslint no-undef: "error"*/

// imports
	import {area} from '../../area/js/area.js'

/**
* AREA_PUBLICATION
* Publication-mode area instance constructor, aliased directly from the generic
* {@link area} base class.
*
* area_publication is intentionally identical to area: the publication context
* requires no behavioural differences at the JS layer — all publication-specific
* logic lives in the server-side class.area_publication.php (which itself is an
* empty subclass of area_common). The alias exists so that:
*
*   1. The import path `area_publication/js/area_publication.js` stays consistent
*      with every other area module, allowing the dynamic loader to resolve it by
*      convention without special-casing.
*   2. Importing code can reference `area_publication` as a distinct named symbol,
*      making intent explicit even though the runtime value is `=== area`.
*
* Inherited behaviour (from area and its prototype chain):
*   - init           ← area_common.prototype.init
*   - build          ← area.prototype.build  (fetches context + data, fires autoload)
*   - render         ← area.prototype.render (delegates to common.render)
*   - refresh        ← common.prototype.refresh
*   - destroy        ← common.prototype.destroy
*   - build_rqo_show ← common.prototype.build_rqo_show
*   - edit           ← render_area.prototype.edit
*   - list           ← render_area.prototype.list
*/
export const area_publication = area

// @license-end