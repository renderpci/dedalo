// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// import
	import {clone, dd_console, get_json_langs} from '../../../core/common/js/utils/index.js'
	import {data_manager} from '../../../core/common/js/data_manager.js'
	import {ui} from '../../../core/common/js/ui.js'
	import {common, create_source} from '../../../core/common/js/common.js'
	import {tool_common, load_component} from '../../tool_common/js/tool_common.js'
	import {render_tool_lang_multi, is_component_empty} from './render_tool_lang_multi.js'
	import {translate_component_browser, dispose_browser_worker} from '../../tool_lang/js/browser_translation.js'



/**
* TOOL_LANG_MULTI
* Tool to translate contents from one language to the rest of the configured languages in any text component
*/
export const tool_lang_multi = function () {

	this.id				= null
	this.model			= null
	this.mode			= null
	this.node			= null
	this.ar_instances	= null
	this.status			= null
	this.events_tokens	= null
	this.type			= null
	this.source_lang	= null
	this.target_lang	= null
	this.langs			= null
	this.caller			= null
}//end page



/**
* COMMON FUNCTIONS
* extend component functions from component common
*/
// prototypes assign
	tool_lang_multi.prototype.render	= tool_common.prototype.render
	tool_lang_multi.prototype.refresh	= common.prototype.refresh
	tool_lang_multi.prototype.edit		= render_tool_lang_multi.prototype.edit



/**
* DESTROY
* Free the shared browser translation worker (and its cached model) on close.
* @return bool
*/
tool_lang_multi.prototype.destroy = function() {

	// release the client-side model worker
		dispose_browser_worker()

	return common.prototype.destroy.apply(this, arguments)
}//end destroy



/**
* INIT
* @param object options
* @return bool common_init
*/
tool_lang_multi.prototype.init = async function(options) {

	const self = this

	// call the generic common tool init
		const common_init = await tool_common.prototype.init.call(this, options);

	try {

		// langs
			const lang	= options.lang || page_globals.dedalo_data_lang
			const langs	= clone(page_globals.dedalo_projects_default_langs)
			// sort current lang as first
			const preferredOrder = [lang];
			langs.sort(function (a, b) {
				return preferredOrder.indexOf(b.value) - preferredOrder.indexOf(a.value);
			});

		// set the self specific vars not defined by the generic init (in tool_common)
			self.lang			= lang // page_globals.dedalo_data_lang
			self.langs			= langs // page_globals.dedalo_projects_default_langs
			self.source_lang	= options.caller ? options.caller.lang : lang
			self.target_lang	= null

			// lg-nolan case. If the tool is open from a nolan component, add the
			// component lang to the langs list because is not added by default in the page_globals.dedalo_projects_default_langs.
			const found = self.langs.find(el => el.value===self.source_lang)
			if (!found && self.source_lang==='lg-nolan') {
				const nolan = {
					label	: 'No lang',
					value	: 'lg-nolan',
					tld2	: 'nolan'
				}
				// Add to the beginning
				self.langs.unshift(nolan);
			}

	} catch (error) {
		self.error = error
		console.error(error)
	}


	return common_init
}//end init



/**
* BUILD_CUSTOM
* @param bool autoload = false
* @return bool common_build
*/
tool_lang_multi.prototype.build = async function(autoload=false) {

	const self = this

	// call generic common tool build
		const common_build = await tool_common.prototype.build.call(this, autoload);

	try {

		// main_element. fix main_element for convenience
			const main_element_ddo	= self.tool_config.ddo_map.find(el => el.role==="main_element")
			self.main_element		= self.ar_instances.find(el => el.tipo===main_element_ddo.tipo)

		// target translator. When user changes it, a local DB var is stored as 'translator_engine_select' in table 'status'
			const translator_engine_select_object = await data_manager.get_local_db_data(
				'translator_engine_select',
				'status'
			)
			if (translator_engine_select_object) {
				self.target_translator = translator_engine_select_object.value
			}

	} catch (error) {
		self.error = error
		console.error(error)
	}


	return common_build
}//end build_custom



/**
* GET_COMPONENT
* @param string lang
* @return object component_instance
*/
tool_lang_multi.prototype.get_component = async function(lang) {

	const self = this

	// to_delete_instances. Select instances with different lang to main_element
		const to_delete_instances = null

	// instance_options (clone context and edit)
		const options = Object.assign(clone(self.main_element.context),{
			self 				: self,
			lang				: lang,
			mode				: 'edit',
			section_id			: self.main_element.section_id,
			to_delete_instances	: to_delete_instances // array of instances to delete after create the new one
		})

	// call generic common tool build
		const component_instance = await load_component(options);


	return component_instance
}//end get_component



/**
* AUTOMATIC_TRANSLATION
* Call the API to translate the source lang component data to the target lang component data
* using a online service like babel or Google translator and save the resulting value
* (!) Tool lang config translator must to be exists in register_tools section
*
* @param string translator
* 	(name like 'babel' must to be defined in tool config)
* @param string source_lang
* 	(like 'lg-eng')
* @param string target_lang
* 	(like 'lg-spa')
* @param HTMLElement buttons_container
* 	(where will be place the message response)
*
* @return object api_response
*/
tool_lang_multi.prototype.automatic_translation = async function(translator, source_lang, target_lang, buttons_container) {

	const self = this

	// source. Note that second argument is the name of the function to manage the tool request like 'apply_value'
	// this generates a call as my_tool_name::my_function_name(options)
		const source = create_source(self, 'automatic_translation')

	// rqo
		const rqo = {
			dd_api	: 'dd_tools_api',
			action	: 'tool_request',
			source	: source,
			options	: {
				source_lang		: source_lang,
				target_lang		: target_lang,
				component_tipo	: self.main_element.tipo,
				section_id		: self.main_element.section_id,
				section_tipo	: self.main_element.section_tipo,
				translator		: translator,
				config			: self.context.config
			}
		}

	// call to the API, fetch data and get response
		const api_response = await data_manager.request({
			body : rqo,
			retries : 1, // one try only
			timeout : 3600 * 1000 // 3600 secs waiting response
		})
		if(SHOW_DEVELOPER===true) {
			dd_console("-> automatic_translation API api_response:",'DEBUG', api_response);
		}

		// user messages
			const msg_type = (api_response.result===false) ? 'error' : 'ok'
			ui.show_message(buttons_container, api_response.msg, msg_type)

		// reload target lang
			const target_component = self.ar_instances.find(el => el.tipo===self.main_element.tipo && el.lang===target_lang)
			target_component.refresh()
			if(SHOW_DEVELOPER===true) {
				dd_console('target_component', 'DEBUG', target_component)
			}

	return api_response
}//end automatic_translation



/**
* SET_SOURCE_LANG
* Set the active source language (the component the user is editing) and update
* the visual highlight. Falls back to DEDALO_DATA_LANG when none is focused.
* @param string lang (like 'lg-eng')
* @return bool
*/
tool_lang_multi.prototype.set_source_lang = function(lang) {

	const self = this

	if (!lang || lang===self.source_lang) {
		return false
	}

	self.source_lang = lang

	// update highlight across all language containers
		if (self.lang_containers) {
			Object.entries(self.lang_containers).forEach(([lang_value, container]) => {
				const title = container.querySelector('.target_component_title')
				if (lang_value===lang) {
					container.classList.add('source')
					if (title) title.classList.add('bold')
				}else{
					container.classList.remove('source')
					if (title) title.classList.remove('bold')
				}
			})
		}

	return true
}//end set_source_lang



/**
* TRANSLATE_TARGET
* Translate the current source component into one target language using the
* selected engine (browser = client-side AI, or server = babel/google).
* @param object options
* {
* 	target_lang			: string
* 	target_component	: object component instance
* 	container			: HTMLElement (target_component_container)
* 	translator_engine	: array (tool config engines)
* 	source_lang			: string (optional, defaults to self.source_lang)
* }
* @return promise
*/
tool_lang_multi.prototype.translate_target = async function(options) {

	const self = this

	// options
		const target_lang		= options.target_lang
		const target_component	= options.target_component
		const container			= options.container || null
		const source_lang		= options.source_lang || self.source_lang || self.lang
		const translator_engine	= options.translator_engine || (self.context.config
			? self.context.config.translator_engine.value
			: [])

	// resolve selected engine
		const translator_name	= self.translator_engine_select ? self.translator_engine_select.value : null
		const engine			= translator_engine.find(el => el.name===translator_name)

	// browser engine (client-side AI)
		if (engine && engine.type==='browser') {

			const source_component = self.lang_components ? self.lang_components[source_lang] : null
			if (!source_component) {
				ui.show_message(self.status_container, self.get_tool_label('empty_source') || 'Source component not available', 'error')
				return Promise.reject('Source component not available')
			}

			const device = (self.translator_device_checkbox && self.translator_device_checkbox.checked)
				? 'wasm'
				: 'webgpu'

			if (!self.json_langs) {
				self.json_langs = await get_json_langs() || []
			}

			return translate_component_browser({
				source_component			: source_component,
				target_component			: target_component,
				source_lang					: source_lang,
				target_lang					: target_lang,
				device						: device,
				status_container			: self.status_container,
				streaming_overlay			: container ? container.streaming_overlay : null,
				streaming_overlay_content	: container ? container.streaming_overlay_content : null,
				json_langs					: self.json_langs,
				get_label					: (key) => self.get_tool_label(key)
			})
		}

	// server engine (babel / google)
		return self.automatic_translation(translator_name, source_lang, target_lang, container)
}//end translate_target



/**
* AUTOMATIC_TRANSLATION_ALL
* One-click translation of the current source component into every configured
* language (except the source). Opens an overwrite/skip modal first; holding
* Alt while clicking overwrites without the modal.
* @param object options
* {
* 	event : MouseEvent (optional, used to detect Alt key)
* }
* @return promise array of per-lang results
*/
tool_lang_multi.prototype.automatic_translation_all = async function(options={}) {

	const self		= this
	const event		= options.event || null

	// engines from tool config
		const translator_engine = self.context.config
			? self.context.config.translator_engine.value
			: []
		if (!translator_engine || translator_engine.length<1) {
			return false
		}

	// source. The focused component lang, else DEDALO_DATA_LANG (self.lang)
		const source_lang		= self.source_lang || self.lang
		const source_component	= self.lang_components ? self.lang_components[source_lang] : null
		if (!source_component || is_component_empty(source_component)) {
			ui.show_message(self.status_container, self.get_tool_label('empty_source') || 'Source text is empty', 'error')
			return false
		}

	// overwrite policy. Alt+click overwrites without asking, else open modal
		let mode // 'overwrite' | 'skip'
		if (event && event.altKey) {
			mode = 'overwrite'
		}else{
			mode = await ask_overwrite_mode(self)
			if (!mode) {
				return false // cancelled
			}
		}

	// target langs (all configured except the source)
		const targets = self.langs.filter(item => item.value!==source_lang)

	// resolve engine type once
		const translator_name	= self.translator_engine_select ? self.translator_engine_select.value : null
		const engine			= translator_engine.find(el => el.name===translator_name)
		const is_browser		= !!(engine && engine.type==='browser')
		const device			= (self.translator_device_checkbox && self.translator_device_checkbox.checked)
			? 'wasm'
			: 'webgpu'
		if (is_browser && !self.json_langs) {
			self.json_langs = await get_json_langs() || []
		}

	// status
		if (self.status_container) {
			self.status_container.classList.remove('hide')
		}

	// translate sequentially (single GPU/worker reused across langs)
		const results = []
		for (let i = 0; i < targets.length; i++) {

			const lang				= targets[i]
			const target_component	= self.lang_components ? self.lang_components[lang.value] : null
			const container			= self.lang_containers ? self.lang_containers[lang.value] : null

			if (!target_component) {
				continue
			}

			// skip non-empty targets when mode is 'skip'
				if (mode==='skip' && is_component_empty(target_component)===false) {
					continue
				}

			if (container) {
				container.classList.add('loading')
			}

			try {
				if (is_browser) {
					await translate_component_browser({
						source_component			: source_component,
						target_component			: target_component,
						source_lang					: source_lang,
						target_lang					: lang.value,
						device						: device,
						status_container			: self.status_container,
						streaming_overlay			: container ? container.streaming_overlay : null,
						streaming_overlay_content	: container ? container.streaming_overlay_content : null,
						json_langs					: self.json_langs,
						get_label					: (key) => self.get_tool_label(key)
					})
				}else{
					await self.automatic_translation(translator_name, source_lang, lang.value, container)
				}
				results.push({ lang: lang.value, ok: true })
			} catch (error) {
				console.error('automatic_translation_all error for', lang.value, error)
				results.push({ lang: lang.value, ok: false })
			}

			if (container) {
				container.classList.remove('loading')
			}
		}

	// summary message
		const ok_count			= results.filter(r => r.ok).length
		const completed_label	= self.get_tool_label('translation_completed') || 'Translation completed'
		if (self.status_container) {
			ui.show_message(self.status_container, `${completed_label} (${ok_count}/${results.length})`, 'ok')
		}

	return results
}//end automatic_translation_all



/**
* ASK_OVERWRITE_MODE
* Open a modal asking whether to overwrite existing translations or skip
* languages that already have content.
* @param object self
* @return promise<string|null> 'overwrite' | 'skip' | null (cancelled)
*/
const ask_overwrite_mode = (self) => {

	return new Promise(function(resolve){

		let resolved = false
		const finish = (mode) => {
			if (resolved) {
				return
			}
			resolved = true
			resolve(mode)
		}

		// header
			const header = ui.create_dom_element({
				element_type	: 'div',
				inner_html		: self.get_tool_label('automatic_translation') || 'Automatic translation'
			})

		// body
			const body = ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'tool_lang_multi_modal_body'
			})
			ui.create_dom_element({
				element_type	: 'p',
				inner_html		: self.get_tool_label('translate_all_confirm') || 'Translate the source text into all languages?',
				parent			: body
			})

		// footer
			const footer = ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'content footer distribute'
			})
			// skip non-empty
				const button_skip = ui.create_dom_element({
					element_type	: 'button',
					class_name		: 'secondary skip',
					inner_html		: self.get_tool_label('skip_non_empty') || 'Skip non-empty',
					parent			: footer
				})
				button_skip.addEventListener('click', function(e){
					e.stopPropagation()
					finish('skip')
					modal.on_close()
				})
			// overwrite all
				const button_overwrite = ui.create_dom_element({
					element_type	: 'button',
					class_name		: 'warning overwrite',
					inner_html		: self.get_tool_label('overwrite') || 'Overwrite all',
					parent			: footer
				})
				button_overwrite.addEventListener('click', function(e){
					e.stopPropagation()
					finish('overwrite')
					modal.on_close()
				})

		// modal. on_close (X / overlay) resolves null when no choice was made
			const modal = ui.attach_to_modal({
				header		: header,
				body		: body,
				footer		: footer,
				size		: 'small',
				on_close	: () => finish(null)
			})
	})
}//end ask_overwrite_mode



// @license-end
