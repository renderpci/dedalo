// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL, DEDALO_API_URL */
/*eslint no-undef: "error"*/



/**
* RENDER_SQO_TEST_ENVIRONMENT
* Client-side render module for the `sqo_test_environment` maintenance widget.
*
* This widget is a developer/administrator debugging tool that lets a global-admin
* user write a raw Search Query Object (SQO) in the browser and fire it directly
* against the `dd_utils_api → convert_search_object_to_sql_query` endpoint.  The
* server resolves the SQO through the normal Dédalo search pipeline and returns:
*   - `msg`          {string}  The resolved SQL string (placeholders substituted).
*   - `sql`          {string}  The raw, unresolved SQL with positional placeholders.
*   - `ar_section_id` {Array} Distinct `section_id` values from the result set.
*   - `db_data`      {Array}  Full raw row objects from the database.
*   - `errors`       {Array}  Non-empty when the pipeline rejected the SQO.
*
* The response is rendered inside `body_response` via the shared `print_response`
* helper from `render_area_maintenance.js`, which shows human-readable text plus an
* interactive JSON tree.
*
* Lazy-init contract
* ------------------
* The heavy svelte-jsoneditor instance is NOT built when the widget card is created.
* Instead `get_content_data_edit` registers `self.activate` (= `load_editor`) and
* the `sqo_test_environment.load()` method (in sqo_test_environment.js) calls it
* when the user opens the accordion card.  If `self._open` is already true at build
* time (the widget was opened before the async spinner resolved), `load_editor()` is
* called immediately inside the spinner callback.
*
* Editor persistence
* ------------------
* The SQO entered by the user is stored in `localStorage` under the key
* `'json_editor_sqo'`.  On next open the saved value is restored.  A hardcoded
* sample SQO (`section_tipo:["rsc170"], limit:5, offset:0`) is used as the
* fallback when no stored value exists.
*
* Module exports
* --------------
*   render_sqo_test_environment — prototype constructor (assigned onto
*                                 sqo_test_environment in sqo_test_environment.js).
*   (internal) get_content_data_edit — builds the widget body DOM.
*
* Server peer:  core/api/v1/common/class.dd_utils_api.php
*               → convert_search_object_to_sql_query()
* Lifecycle:    sqo_test_environment.js (init / build / render / load / destroy)
* Shared helpers: render_area_maintenance.js → print_response
*/

// imports
	import {ui} from '../../../../common/js/ui.js'
	import {data_manager} from '../../../../common/js/data_manager.js'
	import {createJSONEditor} from '../../../../../lib/jsoneditor/standalone.js'
	import {print_response} from '../../../js/render_area_maintenance.js'



/**
* RENDER_SQO_TEST_ENVIRONMENT
* Prototype constructor for the SQO test-environment render module.
*
* Acts as a no-op shell; all rendering logic lives in the prototype method `list`
* below.  `sqo_test_environment.js` wires both `edit` and `list` to
* `render_sqo_test_environment.prototype.list` so the widget uses the same layout
* in both display modes.
*
* Never instantiate this constructor directly; always call through a
* `sqo_test_environment` instance.
*/
export const render_sqo_test_environment = function() {

	return true
}//end render_sqo_test_environment



/**
* LIST
* Builds and returns the full widget DOM wrapper for the SQO test environment.
*
* When `render_level` is `'content'` the method returns only the inner
* `content_data` element (useful for partial refreshes).  For any other value
* it wraps it in the standard widget shell via `ui.widget.build_wrapper_edit`.
*
* The heavy JSON editor is NOT built here — it is registered via `self.activate`
* inside `get_content_data_edit` and called by `sqo_test_environment.load()` when
* the accordion is opened.
*
* @param {Object} options - Render configuration supplied by the widget lifecycle.
* @param {string} [options.render_level="full"] - `'content'` returns only the
*   inner content node; any other value returns the full wrapper.
* @param {string} [options.render_mode="list"] - Informational; not currently
*   branched on in this module.
* @returns {Promise<HTMLElement>} The widget wrapper (or inner content_data when
*   `render_level === 'content'`).
*/
render_sqo_test_environment.prototype.list = async function(options) {

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
* Builds the interactive content area for the SQO test-environment widget.
*
* Creates a `<div>` as the root `content_data` node, then delegates all inner
* DOM construction to an async `ui.load_item_with_spinner` callback so the page
* remains responsive while the spinner is shown.
*
* Inside the spinner callback the following elements are built and appended to a
* `DocumentFragment` (flushed to the DOM in a single paint by the spinner helper):
*
*   1. `<label>` — static "Test Search Query Object (SQO)" heading.
*   2. `<button class="button_submit">` — triggers the API call on click.
*   3. `<div class="editor_json_container">` — mount-point for svelte-jsoneditor.
*   4. `<div class="body_response">` — receives `print_response()` output.
*
* The JSON editor is NOT mounted immediately.  A `load_editor` closure is stored
* on `self.activate` so the host's `load()` method can call it when the user opens
* the accordion card.
*
* Side effects:
*   - Sets `self.editor = null` at the start to clear any stale editor reference
*     from a previous render cycle.
*   - Sets `self.activate` to `load_editor` (the deferred editor mount function).
*   - If `self._open` is already `true` at build time (the card was opened before
*     the async spinner resolved), `load_editor()` is called immediately.
*
* (!) `body_response` is declared AFTER `button_submit` in document order, but
* the click handler closes over it — this relies on JS closure semantics (the
* variable is captured by reference, not by value) and works correctly because the
* click can only fire after the spinner callback has returned and the DOM has been
* committed.  However the `body_response` node is undefined at the point where
* `print_response` is called if the outer `container` variable is somehow shadowed;
* see flags.
*
* @param {Object} self - The `sqo_test_environment` instance that owns the widget.
* @returns {Promise<HTMLElement>} content_data — the root container node (already
*   populated with a spinner placeholder; the real content replaces it asynchronously).
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
						inner_html		: 'Test Search Query Object (SQO)',
						parent			: container
					})

				// button_submit
					const button_submit = ui.create_dom_element({
						element_type	: 'button',
						class_name		: 'button_submit border light',
						inner_html		: `OK`,
						parent			: container
					})
					// click event — reads the editor text, submits it to the API, and
					// renders the result via print_response()
					const click_handler = async (e) => {
						e.stopPropagation()

						// guard: skip if the editor content is too short to be a valid SQO
						const editor_text = self.editor.get().text
						if (editor_text.length<3) {
							return false
						}

						// parse eagerly to give early feedback; `sqo` will be falsy if the
						// JSON is structurally empty (e.g. `null` or `false`)
						const sqo = JSON.parse(editor_text)
						if (!sqo) {
							console.warn("Invalid editor text", sqo);
							return false
						}

						// build the Request Query Object for dd_utils_api.
						// `options` carries the raw SQO; the server re-parses and
						// security-scrubs it via search_query_object::sanitize_client_sqo
						// before passing it into the search pipeline.
						const rqo = {
							dd_api	: 'dd_utils_api',
							action	: 'convert_search_object_to_sql_query',
							options	: sqo
						}

						// loading — dim content + a self-contained spinner ON the button
						content_data.classList.add('loading')
						button_submit.classList.add('button_spinner')

						try {
							// data_manager — single retry, long timeout because a complex SQO
							// can trigger a slow full-table scan in the DB
							const api_response = await data_manager.request({
								body : rqo,
								retries : 1, // one try only
								timeout : 3600 * 1000 // 1 hour waiting response
							})

							// (!) `body_response` is declared further down in the same callback
							// scope.  The call is safe because click events can only fire after
							// the full DocumentFragment has been committed to the DOM; at that
							// point `body_response` is already in scope and assigned.
							print_response(body_response, api_response)
						} finally {
							content_data.classList.remove('loading')
							button_submit.classList.remove('button_spinner')
						}
					}
					button_submit.addEventListener('click', click_handler)

				// json_editor_api_container — mount target for the svelte-jsoneditor
					const json_editor_api_container = ui.create_dom_element({
						element_type	: 'div',
						class_name		: 'editor_json_container',
						parent			: container
					})

				// JSON editor — deferred mount closure.
				// `load_editor` is NOT called immediately; it is assigned to
				// `self.activate` and invoked by sqo_test_environment.load() when
				// the user expands the widget accordion.
					const load_editor = () => {

						if (self.editor) { return } // already built — prevent double-mount

						// restore last-edited SQO from localStorage, falling back to a
						// minimal sample that queries the first 5 records of tipo rsc170
						const sample_data	= '{"section_tipo":["rsc170"],"limit":5,"offset":0}'
						const saved_value	= localStorage.getItem('json_editor_sqo')
						const editor_value	= saved_value || sample_data

						// create the svelte-jsoneditor instance in 'text' mode so the user
						// can type or paste any SQO JSON directly.  `onChange` auto-saves
						// valid JSON to localStorage to survive page reloads.
						const editor = createJSONEditor({
							target	: json_editor_api_container,
							props	: {
								content 	: {text : editor_value},
								mode		: 'text',
								onChange	: (updatedContent, previousContent, { contentErrors, patchResult }) => {
									if(typeof contentErrors==='undefined'){
										// check is JSON valid and store
										try {
											const body_options = JSON.parse(updatedContent.text)
											if (body_options) {
												window.localStorage.setItem('json_editor_sqo', updatedContent.text);
											}
										} catch (error) {
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

				// add at end body_response — placed after the editor so it appears
				// below the input area in the rendered layout
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
