// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL, DEDALO_API_URL */
/*eslint no-undef: "error"*/



/**
* RENDER_DEDALO_API_TEST_ENVIRONMENT
* Client-side render module for the `dedalo_api_test_environment` maintenance widget.
*
* Purpose
* -------
* Provides a live API sandbox inside the Dédalo maintenance dashboard.  An admin can
* type (or paste) any arbitrary Request Query Object (RQO) into an embedded JSON
* editor and fire it directly at the Dédalo worker via `data_manager.request()`.
* The raw API response is then rendered inline by `print_response()` (imported from
* the parent area_maintenance render module) so the administrator can inspect results
* without leaving the interface.
*
* Module architecture
* -------------------
* This file follows the Dédalo widget render pattern:
*   - The exported `render_dedalo_api_test_environment` constructor is a no-op
*     placeholder whose prototype methods are assigned onto the real widget
*     constructor (`dedalo_api_test_environment`) in `dedalo_api_test_environment.js`.
*   - `render_dedalo_api_test_environment.prototype.list` is the sole render entry
*     point; it is wired to both the `edit` and `list` prototype slots of the widget.
*   - The heavy JSON editor (`svelte-jsoneditor`) is constructed lazily: the
*     `get_content_data_edit()` function exposes `self.activate` so the parent widget's
*     `load()` method can trigger editor construction only when the accordion card is
*     first opened, avoiding expensive DOM work on page load.
*
* Key collaborators
* -----------------
*   `dedalo_api_test_environment.js` — widget lifecycle (init/build/render/load/destroy);
*     wires `load()` → `self.activate()` and sets `self._open` before calling it.
*   `render_area_maintenance.js`     — exports `print_response()` used to render results.
*   `data_manager`                   — XHR/fetch bridge; `request({body, retries, timeout})`
*     sends the RQO to the Dédalo worker and returns the standard API response envelope.
*   `ui`                             — DOM factory helpers and the spinner/lazy-load pattern.
*   `createJSONEditor`               — svelte-jsoneditor standalone build; renders the
*     interactive JSON text/tree editor into `json_editor_api_container`.
*
* RQO / API response shapes
* -------------------------
* The JSON editor is pre-populated with a representative RQO for a `section_oh1_edit`
* (read, section `rsc170`, limit 1).  Any valid Dédalo RQO object can be substituted.
* The response envelope returned by `data_manager.request()` has the shape:
*   { result: *, msg: string|string[], errors: string[], … }
*
* Persistence
* -----------
* The last valid RQO text the user typed is saved to `localStorage` under the key
* `'json_editor_api'` and reloaded on the next open so the session is preserved
* across page refreshes.
*
* CSS
* ---
* Styles live in `css/dedalo_api_test_environment.less` and are included via
* `area_maintenance.less`.  The editor container is intentionally tall (`50vh`,
* `min-height: 450px`) to give enough room for large RQO objects.
*
* Exports
* -------
*   render_dedalo_api_test_environment — prototype constructor (no-op body)
*/

// imports
	import {ui} from '../../../../common/js/ui.js'
	import {data_manager} from '../../../../common/js/data_manager.js'
	import {createJSONEditor} from '../../../../../lib/jsoneditor/standalone.js'
	import {print_response} from '../../../js/render_area_maintenance.js'



/**
* RENDER_DEDALO_API_TEST_ENVIRONMENT
* Prototype constructor for the render module.
*
* This constructor is intentionally a no-op (returns `true`).  It exists only to
* provide the namespace on which `list` is defined as a prototype method.
* `dedalo_api_test_environment.js` copies that prototype method onto the real widget
* constructor for both the `edit` and `list` render slots:
*
*   dedalo_api_test_environment.prototype.edit = render_dedalo_api_test_environment.prototype.list
*   dedalo_api_test_environment.prototype.list = render_dedalo_api_test_environment.prototype.list
*
* Never instantiate this constructor directly.
*/
export const render_dedalo_api_test_environment = function() {

	return true
}//end render_dedalo_api_test_environment



/**
* LIST
* Creates the nodes of current widget.
* The created wrapper will be append to the widget body in area_maintenance
*
* Entry point for both the `list` and `edit` render slots of this widget.
* Builds the full widget DOM tree: a standard `ui.widget` wrapper that contains
* `content_data`, which in turn holds the JSON editor, the submit button, and the
* response area.  The heavy editor is constructed lazily via `self.activate` — see
* `get_content_data_edit()` for details.
*
* When `options.render_level === 'content'` the method returns just the raw
* `content_data` element without the outer wrapper.  This is the fast-refresh path
* used by `common.prototype.refresh` to surgically replace the inner content in place.
*
* @param {Object} options - Render options forwarded from the lifecycle caller
* @param {string} [options.render_level='full'] - Controls the return value:
*   'full'    → returns the full widget wrapper with header/body shell (normal first render)
*   'content' → returns the raw content_data element only (used by refresh)
* 	Sample:
* 	{
*		render_level : "full"
*		render_mode : "list"
*   }
* @returns {Promise<HTMLElement>} wrapper
* 	To append to the widget body node (area_maintenance)
*/
render_dedalo_api_test_environment.prototype.list = async function(options) {

	const self = this

	const render_level = options.render_level || 'full'

	// content_data
		const content_data = await get_content_data_edit(self)
		if (render_level==='content') {
			return content_data
		}

	// wrapper. ui build_edit returns widget wrapper
		const wrapper = ui.widget.build_wrapper_edit(self, {
			content_data : content_data
		})
		// set pointers
		wrapper.content_data = content_data


	return wrapper
}//end list



/**
* GET_CONTENT_DATA_EDIT
* Builds the inner content DOM for the API sandbox widget.
*
* Constructs a `<div>` shell immediately (so the caller can return it while async
* work proceeds) and then populates it inside a `ui.load_item_with_spinner` callback,
* which shows a spinner until the callback resolves and then replaces it with the
* actual content.
*
* DOM structure produced inside the spinner callback
* --------------------------------------------------
* DocumentFragment
*   <label>               — instructional text for the editor
*   <button.button_submit> — fires the API call on click
*   <div.editor_json_container> — mount point for the svelte-jsoneditor instance
*   <div.body_response>   — populated by `print_response()` after each API call
*
* Lazy editor construction
* ------------------------
* The svelte-jsoneditor (`createJSONEditor`) is expensive to mount; it is NOT
* constructed immediately.  Instead, a `load_editor` closure is defined and exposed
* via two hooks:
*   - `self.activate` — called by the widget's `load()` method when the accordion
*     card is first opened by the user.
*   - Immediate call inside `get_content_data_edit` if `self._open === true`, which
*     handles the edge case where `load()` ran before the spinner callback completed.
*
* The editor is also guarded by an early-return sentinel (`if (self.editor) return`)
* so repeated `activate()` calls are idempotent.
*
* localStorage persistence
* ------------------------
* The editor is seeded with the last value stored in `localStorage` under the key
* `'json_editor_api'`, falling back to a hard-coded sample RQO.  The `onChange`
* handler persists each syntactically valid JSON edit back to localStorage.
*
* Side effects
* ------------
* Sets `self.editor = null` at the top to reset stale references from a previous
* render cycle (e.g. after a refresh).  Sets `self.activate` and may set
* `self.editor` once the JSON editor is created.
*
* @param {Object} self - The `dedalo_api_test_environment` widget instance.
*   Expected properties used:
*     {*}        self.value   — widget value payload (not used here but kept for symmetry)
*     {boolean}  self._open   — set to true by `load()` before calling `activate()`
*     {string}   self.name    — widget display name, passed to the spinner label
*     {Function} self.activate — written by this function; called by `load()`
*     {Object}   self.editor  — written by this function; the jsoneditor instance
* @returns {Promise<HTMLElement>} content_data — The outer `<div>` container element.
*   It is returned before the spinner callback resolves; the inner nodes are injected
*   asynchronously by `ui.load_item_with_spinner`.
*/
const get_content_data_edit = async function(self) {

	// reset per-build state so a refresh rebuilds the editor into the new container
		self.editor = null

	// short vars
		const value = self.value || {}

	// content_data
		const content_data = ui.create_dom_element({
			element_type : 'div'
		})

	// load editor gracefully
		ui.load_item_with_spinner({
			container			: content_data,
			preserve_content	: false,
			label				: self.name,
			callback			: async () => {

				// container
					const container = new DocumentFragment()

				// label
					ui.create_dom_element({
						element_type	: 'label',
						inner_html		: 'API send RQO (Request Query Object) default dd_api is "dd_core_api"',
						parent			: container
					})

				// button_submit
					const button_submit = ui.create_dom_element({
						element_type	: 'button',
						class_name		: 'button_submit border light',
						inner_html		: `OK`,
						parent			: container
					})
					// click event
					const click_handler = async (e) => {
						e.stopPropagation()

						// Bail out early if the editor text is too short to be a valid RQO
						// (minimum meaningful JSON object is at least 3 chars, e.g. `{}`)
						const editor_text = self.editor.get().text
						if (editor_text.length<3) {
							return false
						}

						const rqo = JSON.parse(editor_text)
						if (!rqo) {
							console.warn("Invalid editor text", rqo);
							return false
						}

						// loading — dim content + a self-contained spinner ON the button
						content_data.classList.add('loading')
						button_submit.classList.add('button_spinner')

						try {
							// data_manager
							// Send the RQO directly to the Dédalo worker.
							// retries:1 means a single attempt only (no auto-retry on failure).
							// timeout is intentionally set to 1 hour to accommodate long-running
							// admin operations (e.g. rebuilds, migrations) that may take minutes.
							// (!) `body_response` referenced here is declared below this closure.
							//     The click handler captures it via closure — this is intentional.
							const api_response = await data_manager.request({
								body : rqo,
								retries : 1, // one try only
								timeout : 3600 * 1000 // 1 hour waiting response
							})

							print_response(body_response, api_response)
						} finally {
							content_data.classList.remove('loading')
							button_submit.classList.remove('button_spinner')
						}
					}
					button_submit.addEventListener('click', click_handler)

				// json_editor_api_container
					const json_editor_api_container = ui.create_dom_element({
						element_type	: 'div',
						class_name		: 'editor_json_container',
						parent			: container
					})

				// JSON editor
					const load_editor = () => {

						if (self.editor) { return } // already built

						// localStorage
						// Fallback sample RQO: a `read` action on section rsc170 with limit 1.
						// This gives new users a valid starting point and shows the expected RQO shape.
						const sample_data	= '{"id":"section_oh1_edit_lg-eng","action":"read","source":{"typo":"source","type":"section","action":"search","model":"section","tipo":"rsc170","section_tipo":"rsc170","section_id":null,"mode":"edit","view":null,"lang":"lg-eng"},"sqo":{"section_tipo":["rsc170"],"limit":1,"offset":0}}'
						const saved_value	= localStorage.getItem('json_editor_api')
						// Prefer the user's last saved RQO; fall back to the built-in sample.
						const editor_value	= saved_value || sample_data

						const editor = createJSONEditor({
							target	: json_editor_api_container,
							props	: {
								content 	: {text : editor_value},
								// 'text' mode: the editor shows the raw JSON string rather than
								// a tree, which is better for copy-paste of large RQO objects.
								mode		: 'text',
								onChange	: (updatedContent, previousContent, { contentErrors, patchResult }) => {
									if(typeof contentErrors==='undefined'){
										// check is JSON valid and store
										// Only persist to localStorage when there are no content
										// errors — avoids overwriting a good saved value with a
										// partially-typed invalid JSON string.
										try {
											const body_options = JSON.parse(updatedContent.text)
											if (body_options) {
												window.localStorage.setItem('json_editor_api', updatedContent.text);
											}
										} catch (error) {
											// Silently ignore parse errors: the editor already
											// shows inline validation indicators to the user.
											// console.error(error)
										}
									}
								}
							}
						})

						// set pointer
						self.editor = editor
					}

					// expose the loader so the host can trigger it when the widget is opened
					self.activate = load_editor
					// if the widget was opened before this container was ready, load now
					if (self._open) {
						load_editor()
					}

				// add at end body_response
				// (!) `body_response` must be declared AFTER the click handler above so that
				//     the closure captures the correct node reference; do not hoist this declaration.
					const body_response = ui.create_dom_element({
						element_type	: 'div',
						class_name		: 'body_response',
						parent			: container
					})

				return container
			}
		})//end ui.load_item_with_spinner


	return content_data
}//end get_content_data_edit



// @license-end
