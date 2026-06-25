// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL, tool_dummy */
/*eslint no-undef: "error"*/



/**
* RENDER_TOOL_ONTOLOGY_PARSER
*
* Client-side render layer for the tool_ontology_parser tool.
*
* This module is the visual half of the ontology parser tool, which lets
* authorised developers select individual ontology TLDs (top-level domains)
* or entire typology groups and then trigger two long-running server operations:
*
*   - Export   — serialises each selected ontology to a JSON COPY file on the
*                server so it can be distributed to other Dédalo installations.
*   - Regenerate — rebuilds the dd_ontology table rows from the master ontology
*                  data, effectively resyncing the run-time ontology cache.
*
* The module exports one symbol:
*   render_tool_ontology_parser — constructor (prototype pattern); its `edit`
*   method is mixed into tool_ontology_parser.prototype via tool_ontology_parser.js.
*
* Data shapes consumed from the tool instance (`self`):
*   self.ontologies           {Array}  — flat list of ontology descriptor objects
*                                        returned by the server's get_ontologies API:
*                                        { target_section_tipo, tld, name,
*                                          typology_id, typology_name }
*   self.selected_ontologies  {Array}  — mutable array of tld strings that the
*                                        user has checked; persisted to localStorage
*                                        so selections survive page reloads.
*
* Security note — SEC-031: all API response text (msg / errors / ar_msg) is
* written through _render_msg_lines() which emits DOM text nodes, never innerHTML,
* so backend error strings cannot inject HTML or scripts.
*/

// imports
	import {ui} from '../../../core/common/js/ui.js'
	import {dd_request_idle_callback} from '../../../core/common/js/events.js'

// SEC-031: helper to render API messages safely. Splits on `<br>` literals and emits
// text nodes so api_response.msg / errors / ar_msg cannot inject HTML/script when
// they include user-supplied filenames, ontology codes, or backend error fragments.
const _render_msg_lines = (target, lines) => {
	target.replaceChildren()
	const arr = Array.isArray(lines) ? lines : [String(lines ?? '')]
	arr.forEach((line, i) => {
		if (i > 0) target.appendChild(document.createElement('br'))
		const parts = String(line ?? '').split(/<br\s*\/?>/i)
		parts.forEach((part, j) => {
			if (j > 0) target.appendChild(document.createElement('br'))
			if (part.length) target.appendChild(document.createTextNode(part))
		})
	})
}



/**
* RENDER_TOOL_ONTOLOGY_PARSER
* Constructor for the render layer of the ontology parser tool.
*
* Acts purely as a prototype namespace — no instance state is initialised here.
* The `edit` method defined on its prototype is mixed into the tool's prototype
* by tool_ontology_parser.js so that tool_common's render lifecycle can invoke it.
*
* @returns {boolean} Always returns true (constructor placeholder).
*/
export const render_tool_ontology_parser = function() {

	return true
}//end render_tool_ontology_parser



/**
* EDIT
* Render tool DOM nodes
* This function is called by render common attached in 'tool_dummy.js'
* @param {Object} options
* @param {string} [options.render_level='full'] - 'full' builds the complete wrapper;
*   'content' returns only the inner content_data element (used for partial refreshes).
* @returns {Promise<HTMLElement>} wrapper (render_level==='full') or content_data element.
*/
render_tool_ontology_parser.prototype.edit = async function(options) {

	const self = this

	// options
		const render_level = options.render_level || 'full'

	// content_data
		const content_data = await get_content_data(self)
		if (render_level==='content') {
			return content_data
		}

	// wrapper. ui build_edit returns a standard built tool wrapper
		const wrapper = ui.tool.build_wrapper_edit(self, {
			content_data : content_data
		})
		// set pointers
		wrapper.content_data = content_data


	return wrapper
}//end edit



/**
* GET_CONTENT_DATA
* Render tool body or 'content_data'
*
* Builds the full tool body as a DocumentFragment and then wraps it in the
* standard content_data container returned by ui.tool.build_content_data.
*
* DOM structure produced:
*   content_data
*   ├── h2.user_info                    (instructional text from tool labels)
*   ├── div.ontologies_list_container   (checkbox tree of typologies → TLDs)
*   ├── div.buttons_container
*   │   ├── button.warning.gear         (Export)
*   │   └── button.warning.repair       (Regenerate)
*   ├── div.messages_container          (primary status / result message)
*   ├── div.messages_container.process_messages.hidden  (per-TLD log lines)
*   └── div.messages_container.process_error.hidden     (per-TLD error lines)
*
* The Export and Regenerate buttons share the same UX pattern:
*   1. Confirm dialog guards against accidental invocation.
*   2. Empty selection aborts early with an alert.
*   3. A loading spinner is attached to content_data.parentNode while the API
*      call is in flight (timeout: 180 s, retries: 1 — see tool_ontology_parser.js).
*   4. The three message containers are updated via _render_msg_lines (SEC-031).
*
* (!) messages_container, process_messages_container, and process_error_container
*     are declared AFTER the buttons but referenced inside the button click closures.
*     This works because the closures capture the binding by reference and the
*     variables are in the same function scope — they exist by the time any click
*     can fire.  It is NOT a temporal dead zone issue (let/const are in the same
*     block, resolved before any async event fires).
*
* @param {Object} self - The tool_ontology_parser instance.
* @returns {Promise<HTMLElement>} The populated content_data wrapper element.
*/
const get_content_data = async function(self) {

	const fragment = new DocumentFragment()

	// user_info
		ui.create_dom_element({
			element_type	: 'h2',
			class_name		: 'user_info',
			inner_html		: self.get_tool_label('user_info'),
			parent			: fragment
		})

	// ontologies_list_container
		const ontologies_list_container = ui.create_dom_element({
			element_type	: 'div',
			class_name 		: 'ontologies_list_container',
			parent 			: fragment
		});
		const ontologies_list = render_ontologies_list(self)
		ontologies_list_container.appendChild(ontologies_list)

	// buttons container
		const buttons_container = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'buttons_container',
			parent			: fragment
		})

		// button_export
			const button_export = ui.create_dom_element({
				element_type	: 'button',
				class_name		: 'warning gear',
				inner_html		: self.get_tool_label('export') || 'Export',
				parent			: buttons_container
			})
			// click event
			const click_export_handler = async (e) => {
				e.stopPropagation();

				// Guard: require explicit user confirmation before a potentially
				// long-running, filesystem-writing server operation.
				if (!confirm(get_label.sure || 'Sure?')) {
					return
				}

				// Guard: at least one ontology TLD must be selected.
				if (self.selected_ontologies.length===0) {
					alert("Error: empty selection");
					return
				}

				// messages clean
					[
						messages_container
					]
					.forEach(el => el.classList.remove('error'))

				// spinner
					let spinner
					const set_loading = ( set ) => {

						if (set===true) {

							content_data.classList.add('loading')
							messages_container.replaceChildren()

							// spinner
							spinner = ui.create_dom_element({
								element_type	: 'div',
								class_name		: 'spinner inside',
								parent			: content_data.parentNode
							})

						}else{

							content_data.classList.remove('loading')
							spinner.remove()
						}
					}
					set_loading(true)

				// call API
					const api_response = await self.export_ontologies()
					if(SHOW_DEBUG===true) {
						console.log('export_ontologies api_response', api_response)
					}

					if (!api_response) {
						console.error('Error getting API response: export_ontologies');
						return
					}

				// user messages (SEC-031)
					_render_msg_lines(messages_container, api_response.msg ?? 'Unknown error')

				// process errors (SEC-031)
					if (api_response.errors?.length) {
						_render_msg_lines(process_error_container, api_response.errors)
						process_error_container.classList.remove('hidden')
					}else{
						process_error_container.replaceChildren()
						process_error_container.classList.add('hidden')
					}

				// process messages (SEC-031)
					if (api_response.ar_msg?.length) {
						_render_msg_lines(process_messages_container, api_response.ar_msg)
						process_messages_container.classList.remove('hidden')
					}else{
						process_messages_container.replaceChildren()
						process_messages_container.classList.add('hidden')
					}

				set_loading(false)
			}
			button_export.addEventListener('click', click_export_handler)

		// button_regenerate
			const button_regenerate = ui.create_dom_element({
				element_type	: 'button',
				class_name		: 'warning repair',
				inner_html		: self.get_tool_label('regenerate') || 'Regenerate',
				parent			: buttons_container
			})
			// click event
			const click_regenerate_handler = async (e) => {
				e.stopPropagation();

				// Guard: require explicit user confirmation before regenerating
				// all dd_ontology rows (a destructive, potentially slow operation).
				if (!confirm(get_label.sure || 'Sure?')) {
					return
				}

				// Guard: at least one ontology TLD must be selected.
				if (self.selected_ontologies.length===0) {
					alert("Error: empty selection");
					return
				}

				// messages clean
					[
						messages_container
					]
					.forEach(el => el.classList.remove('error'))

				// spinner
					let spinner
					const set_loading = ( set ) => {

						if (set===true) {

							content_data.classList.add('loading')
							messages_container.replaceChildren()

							// spinner
							spinner = ui.create_dom_element({
								element_type	: 'div',
								class_name		: 'spinner inside',
								parent			: content_data.parentNode
							})

						}else{

							content_data.classList.remove('loading')
							spinner.remove()
						}
					}
					set_loading(true)

				// call API
					const api_response = await self.regenerate_ontologies()
					if(SHOW_DEBUG===true) {
						console.log('regenerate_ontologies api_response', api_response)
					}

					if (!api_response) {
						console.error('Error getting API response: regenerate_ontologies');
						return
					}

				// user messages (SEC-031)
					_render_msg_lines(messages_container, api_response.msg ?? 'Unknown error')

				// process errors (SEC-031)
					if (api_response.errors?.length) {
						_render_msg_lines(process_error_container, api_response.errors)
						process_error_container.classList.remove('hidden')
					}else{
						process_error_container.replaceChildren()
						process_error_container.classList.add('hidden')
					}

				// process messages (SEC-031)
					if (api_response.ar_msg?.length) {
						_render_msg_lines(process_messages_container, api_response.ar_msg)
						process_messages_container.classList.remove('hidden')
					}else{
						process_messages_container.replaceChildren()
						process_messages_container.classList.add('hidden')
					}

				set_loading(false)
			}
			button_regenerate.addEventListener('click', click_regenerate_handler)

	// messages_container
		const messages_container = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'messages_container',
			parent			: fragment
		})
		const process_messages_container = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'messages_container process_messages hidden',
			parent			: fragment
		})
		const process_error_container = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'messages_container process_error hidden',
			parent			: fragment
		})

	// content_data
		const content_data = ui.tool.build_content_data(self)
		content_data.appendChild(fragment)


	return content_data
}//end get_content_data



/**
* RENDER_ONTOLOGIES_LIST
* Creates the checkbox list selectors of all available ontology sections
*
* Builds a two-level collapsible checkbox tree:
*
*   Level 1 — Typology group (label + parent checkbox)
*     Level 2 — Individual ontology TLD items (label + child checkbox)
*
* Each typology label acts as a collapsible toggle (via ui.collapse_toggle_track).
* Its open/closed state is persisted to the local DB under the key
* 'tool_ontology_parser_<typology_id>'.
*
* Checking/unchecking a parent checkbox cascades to all child checkboxes via
* synthetic 'change' events, so the child change handlers maintain
* self.selected_ontologies consistently.
*
* Child checkbox state changes are debounced through dd_request_idle_callback
* before writing to localStorage ('selected_ontologies') so that rapid
* check/uncheck sequences do not thrash storage.
*
* Ontology item label display logic:
*   - The `tld` value is always the primary visible text (set as inner_html of
*     the label and as its title attribute for overflow tooltip).
*   - If the first segment of `name` (before ' | ') differs from `tld`, a child
*     <span class="item_label_name"> is appended with the human-readable name.
*
* @param {Object} self - The tool_ontology_parser instance.
*   self.ontologies          {Array}  flat list of ontology descriptors
*                                     (each has: tld, name, typology_id, typology_name)
*   self.selected_ontologies {Array}  mutable array of currently selected tld strings
* @returns {DocumentFragment} fragment containing the full typology/TLD tree.
*/
const render_ontologies_list = function (self) {

	const ontologies = self.ontologies || []

	// parents unique
	// Deduplicate ontologies by typology_id to build the top-level grouping.
	// Map is used for O(1) dedup: iterating via values() preserves the last
	// occurrence per key, which is fine since all entries for a typology share
	// the same typology_id / typology_name.
	const key = 'typology_id';
	const unique_typologies = [...new Map(ontologies.map(el => [el[key], el] )).values()];

	// Sort typologies ascending by typology_id.  Entries without a typology_id
	// (null/undefined) are placed first by returning 0 (stable sort).
	const sorted_typologies = unique_typologies
		.sort( (a,b) => {
			if (!a.typology_id) {
				return 0
			}
			return a.typology_id < b.typology_id ? -1 : 0
		})

	const fragment = new DocumentFragment()

	const sorted_typologies_length = sorted_typologies.length
	for (let i = 0; i < sorted_typologies_length; i++) {

		const typology_item = sorted_typologies[i]

		// typology_label — the collapsible group header.
		// 'icon_arrow' CSS class renders the collapse indicator; the 'up' class
		// is toggled by collapse_toggle_track's expose/collapse callbacks.
			const typology_label = ui.create_dom_element({
				element_type	: 'label',
				class_name		: 'item_label typology_label unselectable icon_arrow',
				inner_html		: typology_item.typology_name || 'Without typology',
				parent			: fragment
			})
			// Prevent the label's native click behaviour (which would toggle the
			// checkbox inside it) — only the explicit checkbox click is acted on.
			typology_label.addEventListener('click', (e) => {
				e.preventDefault() // prevent interactions with the input checkbox
			})

		// input checkbox
		// The parent checkbox is a UI convenience: checking it sets ALL children.
		// It does NOT have its own entry in self.selected_ontologies; only child
		// TLD strings are stored there.
			const typology_input_checkbox = ui.create_dom_element({
				element_type	: 'input',
				type			: 'checkbox',
				id				: typology_item.typology_id,
				value			: typology_item.typology_id
			})
			// change event handler
			// Cascade the parent checkbox state to every child input by dispatching
			// synthetic 'change' events so the children's own handlers run.
			const change_handler = (e) => {
				const children_nodes = children_container.querySelectorAll('input')
				for (let k = children_nodes.length - 1; k >= 0; k--) {
					children_nodes[k].checked = typology_input_checkbox.checked
					children_nodes[k].dispatchEvent( new Event('change') );
				}
			}
			typology_input_checkbox.addEventListener('change', change_handler)
			// stopPropagation keeps the click from bubbling up to typology_label's
			// click handler (which calls e.preventDefault) — without this the
			// checkbox state would toggle twice.
			typology_input_checkbox.addEventListener('click', (e) => {
				e.stopPropagation()
			})
			typology_label.append(typology_input_checkbox)

		// children_container — holds the individual TLD rows for this typology.
			const children_container = ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'children_container',
				parent			: fragment
			})

		// track collapse toggle state of content
		// ui.collapse_toggle_track persists open/closed state per collapsed_id
		// in the local DB so the panel remembers its state across reloads.
			ui.collapse_toggle_track({
				toggler				: typology_label,
				container			: children_container,
				collapsed_id		: 'tool_ontology_parser_' + typology_item.typology_id,
				collapse_callback	: () => {typology_label.classList.remove('up')},
				expose_callback		: () => {typology_label.classList.add('up')},
				default_state		: 'opened' // 'opened|closed'
			})

		// children group items
		// Filter to this typology's TLDs and sort alphabetically by name.
			const children_ontologies = ontologies.filter(el => el.typology_id === typology_item.typology_id)
				.sort( (a,b) => (a.name < b.name) ? -1 : 0)

			const children_len = children_ontologies.length
			// Track how many children start out checked so we can set the parent
			// checkbox to checked if all children are pre-selected.
			let children_checked_counter = 0 // number of checked children counter
			for (let j = 0; j < children_len; j++) {

				const child = children_ontologies[j];

				// item_label — primary text is the TLD; tooltip via title attribute.
				const item_label = ui.create_dom_element({
					element_type	: 'label',
					class_name		: 'item_label unselectable',
					inner_html		: child.tld,
					title			: child.tld,
					parent			: children_container
				})

				// item_label_name — optional supplementary human-readable name.
				// The server stores names as "TLD | human name | ..." pipe-separated.
				// Only the first segment is shown; if it equals the TLD it would be
				// redundant, so the <span> is omitted in that case.
				const name_first_part = child.name.split(' | ')[0]
				if (name_first_part!==child.tld) {
					 ui.create_dom_element({
						element_type	: 'span',
						class_name		: 'item_label_name',
						inner_html		: name_first_part,
						parent			: item_label
					})
				}

				// input checkbox
				const input_checkbox = ui.create_dom_element({
					element_type	: 'input',
					type			: 'checkbox',
					id				: child.tld,
					value			: child.tld
				})
				// set value
				// Restore the previously persisted selection from self.selected_ontologies
				// (which was populated from localStorage during tool build).
				if (self.selected_ontologies.find(el => el===child.tld)) {
					input_checkbox.checked = true
					children_checked_counter++ // update counter
				}
				item_label.prepend(input_checkbox)
				// change event handler
				// Keeps self.selected_ontologies in sync with the checkbox state and
				// persists the updated array to localStorage via an idle callback so
				// rapid toggling does not block the main thread.
				const change_handler = (e) => {
					if (input_checkbox.checked) {
						// add if not is not already included
						if (!self.selected_ontologies.includes(child.tld)) {
							self.selected_ontologies.push(child.tld)
						}
					}else{
						const index = self.selected_ontologies.indexOf(child.tld)
						if (index > -1) {
							self.selected_ontologies.splice(index, 1)
						}
					}
					// save selected_ontologies value as localStorage
					dd_request_idle_callback(
						() => {
							// current stored value
							const value_string = JSON.stringify( self.selected_ontologies )
							if (value_string!==localStorage.getItem('selected_ontologies')) {
								// store_value
								localStorage.setItem('selected_ontologies', value_string);
								if(SHOW_DEBUG===true) {
									// console.log("Saved localStorage.setItem:", localStorage.getItem('selected_ontologies'));
								}
							}
						}
					)
				}
				input_checkbox.addEventListener('change', change_handler)
			}

		// update grouper checked value. if all children are check, then parent id checked
			if (children_checked_counter===children_len) {
				typology_input_checkbox.checked = true
			}
	}


	return fragment
}//end render_ontologies_list



// @license-end
