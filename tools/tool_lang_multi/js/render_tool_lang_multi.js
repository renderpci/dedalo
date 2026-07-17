// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



/**
* RENDER_TOOL_LANG_MULTI
* Client-side render layer for the multi-language translation tool.
*
* Responsibilities:
* - Build the full editing UI that shows every configured project language
*   simultaneously, one language slot per column (`target_component_container`).
* - Wire the per-slot and batch "translate" buttons to the translation engine
*   (browser AI or server-side service).
* - Maintain two instance-level maps on `self` that are shared with
*   `tool_lang_multi.js` methods:
*     · `self.lang_containers` — lang-value → target_component_container (for CSS highlights)
*     · `self.lang_components` — lang-value → loaded component instance (for reads/writes)
* - Track which language slot is the active translation source and update
*   the visual highlight via `set_source_lang()`.
*
* Module layout:
*   render_tool_lang_multi (constructor, exported) — placeholder constructor; edit()
*     is attached to the prototype and delegated from tool_lang_multi.prototype.edit.
*   get_content_data_edit (private) — builds the full content DOM: top bar
*     (translate-all button + engine selector), status banner, and all language slots.
*   create_target_component (exported) — creates one language column with its
*     spinner, streaming overlay, source-tracking listeners, and per-slot translate
*     button.
*   is_component_empty (exported) — emptiness predicate used before asking for
*     overwrite confirmation.
*   build_automatic_translation (private) — builds the engine-selector `<select>`
*     and device-mode checkbox sub-panel.
*
* Both `create_target_component` and `is_component_empty` are also imported by
* tool_lang_multi.js, which is why they are named exports rather than closures.
*
* @module render_tool_lang_multi
*/

// imports
	import {data_manager} from '../../../core/common/js/data_manager.js'
	import {ui} from '../../../core/common/js/ui.js'



/**
* RENDER_TOOL_LANG_MULTI
* Render namespace constructor for the multi-language translation tool.
* Instantiated once; `edit()` is the sole prototype method and is delegated
* from `tool_lang_multi.prototype.edit` (see tool_lang_multi.js).
* @returns {boolean} true
*/
export const render_tool_lang_multi = function() {

	return true
}//end render_tool_lang_multi



/**
* EDIT
* Render the tool in edit mode. Optionally returns just the inner content
* node (when `options.render_level === 'content'`) or the full wrapped
* component node.
*
* Called via `tool_lang_multi.prototype.edit` (prototype delegation).
* `this` is the `tool_lang_multi` instance.
*
* @param {Object} options - Render options.
* @param {string} [options.render_level='full'] - 'full' builds the wrapper
*   around the content; 'content' returns the raw content_data node for
*   embedding inside an existing container.
* @returns {Promise<HTMLElement>} The component wrapper (render_level 'full')
*   or the content_data element (render_level 'content').
*/
render_tool_lang_multi.prototype.edit = async function (options={}) {

	const self = this

	// options
		const render_level = options.render_level || 'full'

	// content_data
		const content_data = await get_content_data_edit(self)
		if (render_level==='content') {
			return content_data
		}

	// wrapper. ui build_edit returns component wrapper
		const wrapper = ui.tool.build_wrapper_edit(self, {
			content_data : content_data
		})


	return wrapper
}//end edit



/**
* GET_CONTENT_DATA_EDIT
* Build and populate the full edit-mode content node.
*
* Creates the top action bar (translate-all button + engine selector sub-panel),
* a shared status/progress banner, and the scrollable column grid of language
* slots. Initialises `self.lang_containers` and `self.lang_components` to empty
* maps that are progressively filled as each slot's async spinner resolves.
*
* The translate-all button is rendered unconditionally but its click handler is
* a no-op when no `translator_engine` is configured in the tool context, giving
* a graceful degradation path for installations without a translation service.
*
* @param {Object} self - The `tool_lang_multi` instance.
* @returns {Promise<HTMLElement>} The populated content_data element.
*/
const get_content_data_edit = async function(self) {

	const fragment = new DocumentFragment()

	// lang_containers. Map of lang value -> target_component_container (used for source highlight)
		self.lang_containers = {}
	// lang_components. Map of lang value -> component instance (used as translation source/target)
		self.lang_components = {}

	// top_container
		const top_container = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'top_container',
			parent			: fragment
		})

	// translator_engine config (from tool config section)
		const translator_engine = self.context?.config?.translator_engine?.value ?? false

	// automatic_translation
		// icon
		ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'button icon lang black',
			parent			: top_container
		})
		// button (one click translate to all languages). Alt+click overwrites without modal.
		const button_automatic_translation = ui.create_dom_element({
			element_type	: 'button',
			class_name		: 'warning button_automatic_translation',
			inner_html		: self.get_tool_label('automatic_translation') || 'Automatic translation',
			parent			: top_container
		})
		button_automatic_translation.addEventListener('click', function(e){
			e.stopPropagation()
			if (!translator_engine) {
				return
			}
			self.automatic_translation_all({ event: e })
		})

		if (translator_engine) {
			const automatic_tranlation_node = build_automatic_translation({
				self				: self,
				translator_engine	: translator_engine
			})
			top_container.appendChild(automatic_tranlation_node)
		}//end if (translator_engine)

	// status_container. Shared progress/status messages for the translate-all action
		self.status_container = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'status_container hide',
			parent			: top_container
		})

	// components container
		const components_container = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'components_container',
			parent			: fragment
		})

	// components list (source and targets)
		const langs_length = self.langs.length
		for (let i = 0; i < langs_length; i++) {
			const current_lang = self.langs[i] // object as {label:Spanish,value:lg-spa}
			const target_component_container = create_target_component(current_lang, self)
			components_container.appendChild(target_component_container)
		}

	// content_data
		const content_data = ui.tool.build_content_data(self)
		content_data.appendChild(fragment)


	return content_data
}//end get_content_data_edit



/**
* CREATE_TARGET_COMPONENT
* Build one language column: title bar, spinner placeholder, streaming overlay,
* source-tracking event listeners, and (when configured) a per-slot translate
* button injected into the rendered component's buttons fold.
*
* The function returns immediately after the container skeleton is created; the
* actual component load happens asynchronously inside `ui.load_item_with_spinner`.
* Once the async callback resolves, the spinner is replaced with the live
* component node and the streaming overlay / translate button are wired up.
*
* Side effects on `self`:
* - `self.lang_containers[lang.value]` is set to the returned container so that
*   `set_source_lang()` can toggle the `.source` / `.bold` CSS classes.
* - `self.lang_components[lang.value]` is set (inside the async callback) once
*   the component instance has been loaded and rendered.
*
* The returned container element also has two non-standard properties attached
* for the streaming use-case:
* - `container.streaming_overlay`         — the overlay `<div>`
* - `container.streaming_overlay_content` — the inner content `<div>`
*
* @param {Object} lang - Language descriptor from `page_globals.dedalo_projects_default_langs`.
* @param {string} lang.label - Human-readable label, e.g. 'English'.
* @param {string} lang.value - BCP 47-style language code, e.g. 'lg-eng'.
* @param {Object} self - The `tool_lang_multi` instance.
* @returns {HTMLElement} target_component_container — the column root element
*   (with the spinner already inserted; the component node replaces it later).
*/
export const create_target_component = (lang, self) => {

	// target_component_container
		const target_component_container = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'target_component_container'
		})

	// register container for source highlighting
		self.lang_containers[lang.value] = target_component_container

	// target_component_title
		const target_component_title = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'target_component_title',
			inner_html		: lang.label,
			parent			: target_component_container
		})

	// source highlight. Mark the current source lang
		if (lang.value===self.source_lang) {
			target_component_container.classList.add('source')
			target_component_title.classList.add('bold')
		}

		// load component gracefully
		ui.load_item_with_spinner({
			container			: target_component_container,
			preserve_content	: true,
			label				: lang.label,
			callback			: async () => {

				// component load (init and build component)
					const component = await self.get_component(lang.value)
					component.show_interface.tools = false
					self.lang_components[lang.value] = component
					// render node
					const node = await component.render({
						render_mode : 'edit'
					})

				// source tracking. When the user focuses/edits this component it becomes the source
					const set_as_source = () => {
						self.set_source_lang(lang.value)
					}
					node.addEventListener('focusin', set_as_source)
					node.addEventListener('input', set_as_source)

				// streaming overlay (used by the browser engine while translating)
					const streaming_overlay = ui.create_dom_element({
						element_type	: 'div',
						class_name		: 'streaming_overlay hide',
						parent			: target_component_container
					})
					const streaming_overlay_content = ui.create_dom_element({
						element_type	: 'div',
						class_name		: 'streaming_overlay_content',
						parent			: streaming_overlay
					})
					target_component_container.streaming_overlay			= streaming_overlay
					target_component_container.streaming_overlay_content	= streaming_overlay_content

				// translator_engine. Append translation button if exists
					const translator_engine = self.context?.config?.translator_engine?.value ?? false
					if (translator_engine) {
						const buttons_fold = node.querySelector('.buttons_fold')
						if (buttons_fold) {
							const button_translate = ui.create_dom_element({
								element_type	: 'span',
								class_name		: 'button lang',
								title			: self.get_tool_label('automatic_translation') || 'Automatic translation',
								parent			: buttons_fold
							})
							const fn_click = async function(e) {
								e.stopPropagation()

								// skip translating into the current source lang
									if (lang.value===self.source_lang) {
										return
									}

								// non empty value cases generates a confirm dialog
									if (is_component_empty(component)===false) {
										if(!confirm(self.get_tool_label('are_you_sure_to_overwrite_text') || 'Are you sure to overwrite the current value?')) {
											return
										}
									}

								target_component_container.classList.add('loading')

								try {
									await self.translate_target({
										target_lang			: lang.value,
										target_component	: component,
										container			: target_component_container,
										translator_engine	: translator_engine
									})
								} catch (error) {
									console.error('translate_target error:', error)
								}
								target_component_container.classList.remove('loading')
							}//end fn_click
							button_translate.addEventListener('click', fn_click)
						}
					}//end translator_engine

				return node
			}
		})//end ui.load_item_with_spinner


	return target_component_container
}//end create_target_component



/**
* IS_COMPONENT_EMPTY
* Check whether a component instance has no meaningful value.
*
* A component is considered empty when its `data.value` array is absent,
* zero-length, or contains only items whose resolved text is blank after
* trimming. Both plain-string items (e.g. component_input_text) and object
* items with a `.value` string property (e.g. component_text_area entries)
* are handled by the same predicate.
*
* Used before showing the overwrite-confirmation dialog: if the target slot
* is already empty there is nothing to overwrite and the confirm can be
* skipped safely.
*
* @param {Object} component - A loaded Dédalo component instance. Must expose
*   `component.data.value` (an Array of string or {value:string} items).
* @returns {boolean} true when the component contains no non-blank text.
*/
export const is_component_empty = (component) => {

	const value = component?.data?.value
	if (!value || value.length<1) {
		return true
	}

	// empty only when no element holds meaningful text (supports multi-value)
		return !value.some(item => {
			const text = (typeof item==='string')
				? item
				: (item?.value || '')
			return text && text.trim()!==''
		})
}//end is_component_empty



/**
* BUILD_AUTOMATIC_TRANSLATION
* Build the engine-selector sub-panel: a `<select>` listing available
* translation engines plus a collapsible configuration area that exposes
* the device-mode checkbox (WebGPU vs WASM) for browser-based engines.
*
* The currently active engine is persisted to the local IndexedDB status
* table via `data_manager.set_local_db_data` so it survives page reloads.
* The device-mode preference is stored under the key 'translator_device_checkbox'.
*
* Visibility rules:
* - The configuration panel is hidden by default.
* - It is shown immediately if the initially selected engine has `type === 'browser'`
*   (because the device-mode option is only relevant for browser engines).
* - Selecting a different engine in the `<select>` toggles the panel live.
* - The gear icon button always toggles the panel open/closed.
*
* The sub-panel is only appended to the DOM when `translator_engine` is truthy
* (callers already guard this), so the returned element is always useful.
*
* @param {Object} options - Construction options.
* @param {Object} options.self - The `tool_lang_multi` instance. The function
*   sets `self.translator_engine_select` and `self.translator_device_checkbox`
*   so that `tool_lang_multi.prototype.resolve_engine` can read the current
*   user selection without querying the DOM from outside this module.
* @param {Array<Object>} options.translator_engine - Engine descriptors from
*   the tool config (`self.context.config.translator_engine.value`). Each
*   descriptor has the shape:
*   `{ name: string, label: string, type: 'browser'|'server', uri?: string, key?: string }`.
* @returns {HTMLElement} automatic_translation_container — the root element of
*   the engine selector panel.
*/
const build_automatic_translation = (options) => {

	// options
		const self				= options.self
		const translator_engine	= options.translator_engine

	// container
		const automatic_translation_container = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'automatic_translation_container'
		})

	// select
		self.translator_engine_select = ui.create_dom_element({
			element_type	: 'select',
			parent 			: automatic_translation_container
		})
		for (let i = 0; i < translator_engine.length; i++) {

			const engine = translator_engine[i]

			const option = ui.create_dom_element({
				element_type	: 'option',
				value			: engine.name,
				inner_html		: engine.label,
				parent			: self.translator_engine_select
			})

			if (self.target_translator===engine.name) {
				option.selected = true
			}
		}
		self.translator_engine_select.addEventListener('change', function(){
			data_manager.set_local_db_data({
				id		: 'translator_engine_select',
				value	: self.translator_engine_select.value
			}, 'status')

			// show/hide configuration based on engine type
			const selected_engine = translator_engine.find(el => el.name===self.translator_engine_select.value)
			if (selected_engine && selected_engine.type==='browser') {
				configuration_container.classList.remove('hide')
			}else{
				configuration_container.classList.add('hide')
			}
		})

	// configuration. open/close the configuration options
		const show_configuration = ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'icon gear',
			parent			: automatic_translation_container
		})
		show_configuration.addEventListener('click', function () {
			configuration_container.classList.toggle('hide')
		})

		const configuration_container = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'configuration_container hide',
			parent			: automatic_translation_container
		})

		// device checkbox (browser engine: webgpu by default, wasm/cpu when checked)
		const device_container = ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'device_container',
			parent 			: configuration_container
		})

		const option_label = ui.create_dom_element({
			element_type	: 'label',
			inner_html		: self.get_tool_label('cpu_device') || 'More compatible, slower.',
			parent			: device_container
		})

		const translator_device_checkbox = ui.create_dom_element({
			element_type	: 'input',
			type			: 'checkbox'
		})
		self.translator_device_checkbox = translator_device_checkbox
		option_label.prepend(translator_device_checkbox)

		const device_id = 'translator_device_checkbox'
		translator_device_checkbox.addEventListener('change', function(){
			data_manager.set_local_db_data({
				id		: device_id,
				value	: translator_device_checkbox.checked
			}, 'status')
		})
		data_manager.get_local_db_data(
			device_id,
			'status'
		).then(function( device_saved ){
			if(device_saved){
				translator_device_checkbox.checked = device_saved.value
			}
		})

		// initial visibility: show config if the default engine is browser type
		const initial_engine = translator_engine.find(el => el.name===self.target_translator)
		if (initial_engine && initial_engine.type==='browser') {
			configuration_container.classList.remove('hide')
		}


	return automatic_translation_container
}//end build_automatic_translation



// @license-end
