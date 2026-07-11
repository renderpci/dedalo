// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, Promise, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



/**
* VIEW_MINI_PORTAL
* Compact, inline renderer for `component_portal` in list/read-only contexts.
*
* This module is invoked by `render_list_component_portal.list()` when the
* resolved view name is `'mini'`.  It renders all linked target records into a
* lightweight `<span>` wrapper (`build_wrapper_mini`) without any edit controls,
* toolbars, paginators, or dblclick mode-change handlers.
*
* The "mini" view is intended for embedded, space-constrained displays — for
* example, a portal field shown inside a parent record's compact row.  Each
* linked section record renders itself using the view determined by
* `context.children_view` (falling back to `context.view`, then `'text'`), so
* the inner presentation is fully configurable per ontology context.
*
* Architecture:
*   The module exports a single constructor stub (`view_mini_portal`) whose
*   static method `render` is the sole public API.  The constructor itself is
*   never instantiated; returning `true` is the conventional no-op pattern used
*   throughout Dédalo view modules.
*
* Key data shapes consumed from the component instance (`self`):
*   - `self.context.children_view` — optional view name override for child records;
*                                    takes priority over `context.view`.
*   - `self.context.view`          — fallback view name when `children_view` is absent.
*   - `self.ar_instances`          — `Array` accumulator for sub-instances; rendered
*                                    section_record objects are pushed here so that
*                                    `common.destroy()` can clean them up on teardown.
*
* Differences from other portal view modules:
*   - No columns_map, no paginator, no toolbar buttons — purely display.
*   - Uses `build_wrapper_mini` (`<span>`) rather than `build_wrapper_list` (`<div>`).
*   - No `render_level` short-circuit path (always renders the full wrapper).
*   - No `data.references` block (references are an edit/list feature only).
*   - No change_mode / dblclick handler — this view is always read-only.
*
* @module view_mini_portal
* @see render_list_component_portal.js  for the dispatcher that selects this module
*                                       when view === 'mini'.
* @see view_text_list_portal.js         for the similar inline text-only renderer.
* @see view_default_list_portal.js      for the full list renderer with columns/pager.
* @see docs/core/components/component_portal.md for the full portal specification.
*/



// imports
	import {get_section_records} from '../../section/js/section.js'
	import {ui} from '../../common/js/ui.js'



/**
* VIEW_MINI_PORTAL
* Constructor stub that acts as a namespace for the mini-view portal renderer.
*
* Never instantiated.  The static method `render` is the only callable member.
* Returning `true` is the conventional no-op pattern for Dédalo view-module
* constructor stubs.
*/
export const view_mini_portal = function() {

	return true
}//end view_mini_portal



/**
* RENDER
* Build and return the mini-view DOM node for a component_portal instance.
*
* Fetches all linked section records via `get_section_records`, renders each one
* in parallel using `Promise.all`, and appends the results into a `<span>` wrapper
* built by `ui.component.build_wrapper_mini`.
*
* The view used to render each child record is resolved from:
*   1. `self.context.children_view` — explicit per-context override, if set.
*   2. `self.context.view`          — the portal's own active view.
*   3. `'text'`                     — hard-coded fallback.
*
* Side effects:
*   - All instantiated section_record objects are pushed onto `self.ar_instances`
*     so that the portal's `destroy()` lifecycle method can release them.
*   - Child nodes are attached via a `DocumentFragment` for a single reflow.
*
* @param {Object} self - The `component_portal` instance being rendered.
*                        Must have `context`, `ar_instances`, and the standard
*                        component lifecycle properties set by `common.init()`.
* @returns {Promise<HTMLElement>} The `<span>` wrapper element containing all
*                                 rendered child record nodes, ready for DOM insertion.
*/
view_mini_portal.render = async function(self) {

	// ar_section_record
		// Resolve the view name that each child section_record should use when
		// rendering itself.  children_view lets the ontology specify a different
		// inner view (e.g. 'text') than the portal's own view (e.g. 'mini').
		const children_view	= self.context.children_view || self.context.view || 'text'

		const ar_section_record	= await get_section_records({
			caller	: self,
			view	: children_view
		})

		// store to allow destroy later
		// (!) All sub-instances must be tracked here; omitting this causes memory
		// leaks because common.destroy() only cleans up entries in ar_instances.
		self.ar_instances.push(...ar_section_record)

	// wrapper
		// build_wrapper_mini creates a <span> with CSS classes 'mini' and
		// '<model>_mini' (e.g. 'component_portal_mini').  Additional classes
		// 'portal' and 'view_mini' are appended below for selector specificity.
		const wrapper = ui.component.build_wrapper_mini(self)
		wrapper.classList.add('portal', 'view_mini')

	// add all nodes
		// Render all section records in parallel to minimise latency, then insert
		// them in original order via a DocumentFragment to trigger a single reflow.
		const length = ar_section_record.length
		if (length > 0) {
			const fragment = new DocumentFragment()
			const rendered_nodes = await Promise.all(ar_section_record.map(rec => rec.render()))
			for (let i = 0; i < length; i++) {
				if (rendered_nodes[i]) {
					fragment.appendChild(rendered_nodes[i])
				}
			}
			wrapper.appendChild(fragment)
		}

	return wrapper
}//end render



// @license-end
