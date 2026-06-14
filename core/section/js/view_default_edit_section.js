// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, Promise, SHOW_DEVELOPER, SHOW_DEBUG */
/*eslint no-undef: "error"*/



// imports
	import {get_section_records} from '../../section/js/section.js'
	import {set_element_css} from '../../page/js/css.js'
	import {ui} from '../../common/js/ui.js'
	import {apply_inspector_state, init_inspector_resize} from '../../inspector/js/render_inspector.js'



/**
* VIEW_DEFAULT_EDIT_SECTION
* Default view renderer for sections running in 'edit' mode.
*
* This module is the DOM-construction layer for the standard edit layout.
* It is invoked by `render_edit_section.edit` (core/section/js/render_edit_section.js)
* when `self.context.view` is 'default' (or absent).
*
* Responsibilities:
*  - Initialise and render all `section_record` instances for the current page
*    of data (via `get_section_records`).
*  - Assemble the full-page DOM: optional inspector panel, optional search filter
*    container, and the scrollable content area.
*  - Apply any per-section CSS overrides declared in `self.context.css` (v6
*    ontology style field).
*  - Support a lightweight 'content' render level for pagination refreshes that
*    rebuilds only the record rows, leaving chrome (inspector, search bar) intact.
*
* Export: `view_default_edit_section` — a static namespace object (constructor
* returns `true`); callers use `view_default_edit_section.render(self, options)`.
*/
export const view_default_edit_section = function() {

	return true
}//end view_default_edit_section



/**
* RENDER
* Build and return the full DOM tree for a section in edit mode.
*
* Two render levels are supported, controlled by `options.render_level`:
*  - 'full'    (default) — constructs the entire wrapper including inspector,
*              search container, and record list. Used on first load.
*  - 'content' — rebuilds only the record rows (content_data) and returns
*              early. Used by the paginator to swap in the next page without
*              re-rendering chrome. `self.node_body` is updated so the
*              pagination handler can find the live container.
*
* Inspector rendering:
*  The inspector panel is rendered and appended to the fragment BEFORE
*  `content_data` so CSS grid / flexbox can place it to the side. Its persisted
*  rail/width state is applied via `apply_inspector_state` before the fragment
*  is attached to the live DOM to avoid a layout flicker on first paint.
*  If the section has a paginator AND an inspector, the paginator is rendered
*  inside `self.inspector.paginator_container` (an element owned by the
*  inspector's own DOM tree).
*
* CSS injection (v6 compatibility):
*  When `self.context.css` is present, `set_element_css` injects a `<style>`
*  scoped to `{section_tipo}_{tipo}.edit`. The optional `add_class` sub-object
*  maps target keys ('wrapper' | 'content_data') to arrays of CSS class names
*  that are spread onto the corresponding DOM nodes. Unknown keys emit a
*  `console.warn` and are skipped.
*
* @param {Object} self    - Live section instance. Expected properties:
*   - {Array}   ar_instances     — cached section_record instances (falsy on first render)
*   - {Object}  inspector        — inspector instance, or `false` when disabled
*   - {Object}  paginator        — paginator instance, or falsy when absent
*   - {Object}  filter           — search filter instance, or falsy when absent
*   - {Object}  context          — section context including optional `.css` and `.view`
*   - {string}  id               — DOM id for the wrapper `<section>`
*   - {string}  type             — section type string (e.g. 'section')
*   - {string}  model            — section model identifier (e.g. 'section')
*   - {string}  section_tipo     — ontology tipo of the parent section
*   - {string}  tipo             — ontology tipo of this section
*   - {string}  mode             — current mode ('edit')
*   - {string}  view             — current view ('default')
* @param {Object} options - Render options.
*   - {string} [render_level='full'] — 'full' | 'content'
* @returns {Promise<HTMLElement>} The root `<section>` wrapper ('full'), or the
*   inner `content_data` `<div>` ('content').
*/
view_default_edit_section.render = async function(self, options) {

	// options
		const render_level = options.render_level || 'full'

	// ar_section_record. section_record instances (initialized and built)
	// Re-use cached instances when already present (e.g. pagination re-renders
	// from a different page reset ar_instances before calling render again).
		self.ar_instances = self.ar_instances && self.ar_instances.length>0
			? self.ar_instances
			: await get_section_records({caller: self})

	// content_data
		const content_data = await get_content_data(self, self.ar_instances)
		// fix last content_data (for pagination selection)
		// (!) self.node_body must point to the current content container so the
		// paginator can call replaceWith / replaceChildren on the correct node.
		self.node_body = content_data
		if (render_level==='content') {
			return content_data
		}

	const fragment = new DocumentFragment()

	// buttons
		// const current_buttons = get_buttons(self);

	// inspector
	// The inspector panel hosts the paginator and provides metadata/ontology info.
	// It is conditionally present: `self.inspector` is an instance when enabled,
	// or the boolean `false` when the section is configured without one.
		if (self.inspector) {
			const inspector_container = ui.create_dom_element({
				element_type	: 'div',
				id				: 'inspector_container',
				class_name		: 'inspector_container',
				parent			: fragment
			})

			// build and render inspector
			await self.inspector.build()
			const inspector_wrapper = await self.inspector.render()
			if (inspector_wrapper) {
				inspector_container.appendChild(inspector_wrapper)

				// apply persisted rail / width state BEFORE the fragment is attached,
				// so the very first layout uses the correct width (no flicker)
				apply_inspector_state(self.inspector, inspector_container)

				// left-edge drag handle to resize the panel width
				const resize_handle = ui.create_dom_element({
					element_type	: 'div',
					class_name		: 'inspector_resize_handle',
					title			: get_label.resize || 'Resize',
					parent			: inspector_container
				})
				init_inspector_resize(resize_handle, self.inspector)

				// paginator inside inspector
				// When a paginator is present it lives inside the inspector's own
				// `paginator_container` node rather than at the section level, so
				// navigation controls stay visible alongside the metadata panel.
				if (self.paginator) {
					await self.paginator.build()
					const paginator_wrapper = await self.paginator.render()
					if (paginator_wrapper) {
						self.inspector.paginator_container.appendChild(paginator_wrapper)
					}
				}
			}
		}

	// search filter
	// Placeholder container only — the actual search UI component is rendered
	// into this node by the section's filter instance during its own init/render
	// lifecycle. We just need the anchor in the correct DOM position.
		if (self.filter) {
			const search_container = ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'search_container',
				parent			: fragment
			})
			self.search_container = search_container
		}

	// content_data add to fragment
		fragment.appendChild(content_data)

	// wrapper
	// The <section> element carries a compound CSS class string that allows
	// per-section-tipo and per-mode style rules without extra specificity hacks.
		const wrapper = ui.create_dom_element({
			element_type	: 'section',
			id				: self.id,
			class_name		: `wrapper_${self.type} ${self.model} ${self.section_tipo}_${self.tipo} ${self.tipo} ${self.mode} view_${self.view}`
		})
		if (self.inspector===false) {
			// 'no_inspector' shifts content to full width via CSS when no panel exists.
			wrapper.classList.add('no_inspector')
		}
		// append fragment
		wrapper.appendChild(fragment)
		// set pointers
		wrapper.content_data = content_data

	// css v6
	// Inject any per-section CSS rules declared in the ontology context.
	// `set_element_css` creates / updates a <style> tag scoped to the selector.
		if (self.context && self.context.css) {
			const selector = `${self.section_tipo}_${self.tipo}.edit`
			set_element_css(selector, self.context.css)
			// add_class
			// Ontology-defined extra CSS classes applied to named DOM nodes.
			// Expected shape of self.context.css.add_class:
				// sample
				// "add_class": {
				// "wrapper": [
				// 	"bg_warning"
				// ]
				// }
				if (self.context.css.add_class) {

					for(const css_key in self.context.css.add_class) {
						const values = self.context.css.add_class[css_key]
						// Only 'wrapper' and 'content_data' are supported target keys.
						const element = css_key==='wrapper'
							? wrapper
							: css_key==='content_data'
								? content_data
								: null

						if (element) {
							element.classList.add(...values)
						}else{
							console.warn("Invalid css class selector was ignored:", css_key);
						}
					}
				}
		}


	return wrapper
}//end render



/**
* GET_CONTENT_DATA
* Build the scrollable record list container for the current page of data.
*
* Iterates `ar_section_record` (already-built section_record instances) and
* calls `render()` on each in parallel via `Promise.all`, then appends the
* resulting nodes in order to preserve row sequence. When the array is empty a
* localised "No records found" placeholder is shown instead.
*
* The returned `<div class="content_data {mode}">` is stored on `self.node_body`
* by the caller so the paginator can locate and replace it without traversing
* the wider DOM.
*
* Performance note: a `performance.now()` timing block is present but commented
* out. The `SHOW_DEVELOPER` guard exists to allow it to be re-enabled for
* profiling without leaving noise in production logs.
*
* @param {Object} self              - Section instance (used for `self.mode`).
* @param {Array}  ar_section_record - Initialised and built section_record instances.
* @returns {Promise<HTMLElement>} The content_data `<div>` ready to be inserted
*   into the fragment.
*/
const get_content_data = async function(self, ar_section_record) {
	// const t0 = performance.now()

	const fragment = new DocumentFragment()

	// add all section_record rendered nodes
		const ar_section_record_length = ar_section_record.length
		if (ar_section_record_length===0) {
			// no records found case
			const row_item = no_records_node()
			fragment.appendChild(row_item)
		}else{
			// parallel mode
			// All section_record renders are fired concurrently; order is preserved
			// by iterating the resolved values array in index order.
				const ar_promises = ar_section_record.map(el => el.render())
				const values = await Promise.all(ar_promises)
				for (let i = 0; i < values.length; i++) {
					fragment.appendChild(values[i])
				}
		}

	// content_data
		const content_data = document.createElement('div')
			  content_data.classList.add('content_data', self.mode) // ,'nowrap','full_width'
			  content_data.appendChild(fragment)

	// debug
	// SHOW_DEVELOPER guard: re-enable the timing lines below when profiling
	// individual section renders. Do not remove this block.
		if(SHOW_DEVELOPER===true) {
			// const total = (performance.now()-t0).toFixed(3)
			// dd_console(`__Time [view_default_edit_section.get_content_data]: ${total} ms`,'DEBUG', [ar_section_record, total/ar_section_record_length])
		}


	return content_data
}//end get_content_data



/**
* GET_BUTTONS
* Placeholder that returns an empty array.
*
* (!) This function is currently unused — the call site is commented out in
* `render`. It exists as a hook for future button-bar support in the edit
* section view (compare with the fully implemented `get_buttons` in
* `view_default_list_section.js`).
*
* @param {Object} self - Section instance (unused).
* @returns {Array} Always an empty array.
*/
const get_buttons = function(self) {

	const buttons = []


	return buttons
}//end get_buttons



/**
* NO_RECORDS_NODE
* Create a localised empty-state placeholder element shown when a search or
* page load returns zero records.
*
* Uses `get_label.no_records` (resolved at runtime from the active language
* pack) with a hard-coded English fallback string.
*
* @returns {HTMLElement} A `<div class="no_records">` element ready to append.
*/
const no_records_node = () => {

	const node = ui.create_dom_element({
		element_type	: 'div',
		class_name		: 'no_records',
		inner_html		: get_label.no_records || 'No records found'
	})

	return node
}//end no_records_node



// @license-end
