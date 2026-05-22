// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global Promise, page_globals, SHOW_DEBUG, SHOW_DEVELOPER, DEDALO_TOOLS_URL, DEDALO_CORE_URL, get_label */
/*eslint no-undef: "error"*/



// imports
	import {data_manager} from '../../../core/common/js/data_manager.js'
	import {get_instance} from '../../../core/common/js/instances.js'
	import {dd_request_idle_callback} from '../../../core/common/js/events.js'
	import {common} from '../../../core/common/js/common.js'
	import {LZString as lzstring} from '../../../core/common/js/utils/lzstring.js'
	import {ui} from '../../../core/common/js/ui.js'
	import {
		clone,
		dd_console,
		printf,
		open_window,
		load_style
		} from '../../../core/common/js/utils/index.js'
	import {render_error} from './render_tool_common.js'



/**
* TOOL_COMMON
* Base constructor for tool instances.
* Provides shared initialization, build, render, and utility methods for all tools.
*
* @return {boolean}
*/
export const tool_common = function(){

	return true
}//end tool_common



/**
* INIT
* Generic tool init function.
*
* @param {Object} options - Configuration object for tool initialization
* @param {Object} options.caller - Instance that calls the tool
* @param {string} options.lang - Language code (e.g. "lg-eng")
* @param {string} options.mode - Tool mode (e.g. "edit")
* @param {string} options.model - Tool model name (e.g. "tool_indexation")
* @param {string} options.section_id - Section ID
* @param {string} options.section_tipo - Section tipo
* @param {string} options.tipo - Element tipo
* @param {Object} options.tool_config - Tool-specific configuration with ddo_map
*
* @return {boolean}
*/
tool_common.prototype.init = async function(options) {
	const self = this

	if(SHOW_DEVELOPER===true) {
		dd_console(`init tool options`, 'DEBUG', options)
	}

	// options validation
		if (!options || typeof options !== 'object') {
			console.error('Invalid init options:', options);
			return false
		}

	// safe init double control. To detect duplicated events cases
		if (self.is_init) {
			console.error('Duplicated init for element:', self);
			if(SHOW_DEBUG===true) {
				alert('Duplicated init element');
			}
			return false
		}

	// status update
		self.status = 'initializing'

	// options
		self.model			= options.model
		self.section_tipo	= options.section_tipo //
		self.section_id		= options.section_id
		self.lang			= options.lang
		self.mode			= options.mode || 'edit'
		self.config			= options.config // specific configuration that define, in current installation, things like machine translation will be used.
		self.tool_config	= options.tool_config
		self.caller			= options.caller

		// caller. Could be direct assigned (modal) or by URL caller_id (new window)
			// notify caller is already calculated (new window case)
			self.caller_is_calculated = !self.caller
			// caller fallback to window.opener.callers variable or local data base
			if (!self.caller) {

				// re-build from caller_ddo
					// searchParams
					const searchParams = new URLSearchParams(window.location.search)
					// raw_data
					const raw_data = searchParams.get('raw_data') // null if absent

					if (raw_data) {

						try {

							// Note that url param 'url_data' is an object stringify-ed and compressed-encoded
							// Expected raw_data decoded is an object as
							// {
							//	 caller_ddo : object {...},
							//	 tool_config : object {...}
							// }
							const url_data_string	= lzstring.decompressFromEncodedURIComponent(raw_data)
							if (!url_data_string) {
								throw new Error('Decompression returned empty result')
							}
							const url_data_object	= JSON.parse(url_data_string)
							if (!url_data_object || typeof url_data_object !== 'object') {
								throw new Error('Parsed URL data is not a valid object')
							}
							const caller_ddo		= url_data_object.caller_ddo
							const tool_config		= url_data_object.tool_config
							const caller_options	= url_data_object.caller_options

							// debug
							if(SHOW_DEBUG===true) {
								console.log(')) tool common url_data_object:', url_data_object);
							}

							// set and build caller
							if (!caller_ddo) {
								throw new Error('Missing caller_ddo in URL data')
							}

							// dataframe
							self.caller_dataframe = caller_ddo.caller_dataframe ?? null

							self.caller = await get_instance( caller_ddo )

							if (self.caller) {

								// set current tool as caller
								self.caller.caller = self

								// set caller options
								self.caller_options = caller_options ?? null

								// set label (see self.view_window())
								self.caller.label = caller_ddo.label ?? null

								// build caller when is not section
								if(caller_ddo.model!=='section'){
									// build only when the caller is a component, section will build by tm
									await self.caller.build(true)
								}

								// set tool_config
								self.tool_config = tool_config
							}
						} catch (error) {
							console.error('Error decoding/parsing raw_data from URL:', error, raw_data);
						}
					}else{
						console.error('Error. Unable to get raw_data from URL for caller_ddo:', window.location.search);
					}
			}

			// Check if the caller is available
			if (!self.caller) {

				// caller is not mandatory, but we alert for possible mistakes

				self.error = `Warning. Empty caller !`
				console.warn(self.error, self)

			}else{

				// tool_config. Contains the needed ddo_map
				if (!self.tool_config) {

					if (self.caller.config && self.caller.config.tool_context) {

						// section_tool case

						// from caller config (transcription case for example)
						self.tool_config = clone(self.caller.config.tool_context.tool_config)

					}else if (self.caller.tools) {

						// component case

						const tool_found = self.caller.tools.find(el => el.model===self.model)
						self.tool_config = tool_found?.tool_config || null
					}

					// final fallback
						if (!self.tool_config) {

							// fallback
								self.tool_config = {
									ddo_map : [{
										tipo				: self.caller.tipo,
										section_tipo		: self.caller.section_tipo,
										section_id			: self.caller.section_id,
										model				: self.caller.model,
										mode				: self.caller.mode, //'edit',
										lang				: self.caller.lang,
										role				: 'main_element',
										caller_dataframe	: (self.caller.model==='component_dataframe')
											? self.caller_dataframe
											: null
									}]
								}
								if(SHOW_DEBUG===true) {
									console.warn("-> tool_common init final fallback case self.tool_config:", self.tool_config);
								}
						}
				}

				// parse ddo_map section_id
				if (self.tool_config?.ddo_map) {
					self.tool_config.ddo_map.forEach(el => {
						if (el.section_id==='self' && el.section_tipo===self.caller.section_tipo) {
							el.section_id = self.caller.section_id || self.caller.section_id_selected
						}
					})
				}
			}

	// set some common vars
		self.node			= null
		self.type			= 'tool'
		self.ar_instances	= []
		self.events_tokens	= []
		self.get_tool_label	= get_tool_label // function get_label called by the different tools to obtain the own label in the current lang. The scope is for every tool.

	// set caller_dataframe default if not already set
		if (self.caller_dataframe === undefined) {
			self.caller_dataframe = null
		}

	// mark as initialized (after all async ops succeeded)
		self.is_init = true

	// set status
		self.status = 'initialized'


	return true
}//end init



/**
* BUILD
* Generic tool build function. Loads basic tool config info (stored in component_json dd1353) and CSS files.
*
* @param {boolean} [autoload=false] - Whether to autoload tool context from API
* @param {Object} [options={}] - Build options
* @param {Function} [options.load_ddo_map] - Custom callback to load ddo_map elements
*
* @return {Promise<boolean>}
*/
tool_common.prototype.build = async function(autoload=false, options={}) {

	const self = this

	// status update
		self.status = 'building'

	// load self style
		const tool_css_url = DEDALO_TOOLS_URL + '/' + self.model + '/css/' + self.model + '.css' + `?v=${page_globals.dedalo_version}`
		await load_style(tool_css_url)

	// options
		// load_ddo_map could be a callback or the default loader function
		const load_ddo_map = typeof options.load_ddo_map==='function'
			? options.load_ddo_map
			: async function() {
				// default loads all elements inside ddo_map
				const ar_promises		= []
				const ddo_map			= self.tool_config && self.tool_config.ddo_map
					? self.tool_config.ddo_map
					: []

				const ddo_map_length = ddo_map.length
				for (let i = 0; i < ddo_map_length; i++) {

					// el. components / sections / areas used by the tool defined in tool_config.ddo_map
						const el = ddo_map[i]

					// skip caller ddo item when is section (case tool_diffusion very slow)
						if (self.caller && self.caller.model==='section' && self.caller.tipo===el.tipo && self.caller.section_tipo===el.section_tipo) {
							// self.ar_instances.push(self.caller)
							continue
						}

					// skip autoload false.
						if(el.autoload===false){
							continue
						}

					// menu skip ddo from menu
						if (el.model==='menu') {
							// console.warn('Ignored menu ddo:', el);
							continue
						}

					// lang. If is defined in properties, parse and use it, else use the tool lang
					// taking care to do not re-parse the value
						const current_el_lang = el.lang
							? el.lang // already exists
							: (typeof el.translatable!=='undefined' && el.translatable===false)
								? page_globals.dedalo_data_nolan // lg-nolan
								: page_globals.dedalo_data_lang // current data lang (DEDALO_DATA_LANG)

					ar_promises.push( (async () => {

						// new window cases. Caller is calculated, NOT from existing component, so we recycle the instance
							if (self.caller_is_calculated && el.tipo===self.caller.tipo) {
								console.log('Used already resolved caller instance:', self.caller);
								return self.caller
							}

						const element_options = {
							model				: el.model,
							mode				: el.mode,
							view 				: el.view,
							tipo				: el.tipo,
							section_tipo		: el.section_tipo,
							section_id			: el.section_id,
							lang				: current_el_lang,
							type				: el.type,
							properties			: el.properties || null,
							id_variant			: self.model,  // id_variant prevents id conflicts
							caller				: self, // set tool as caller of the component :-)
							caller_dataframe	: el.caller_dataframe || null
						}

						// init and build instance
							const element_instance = await get_instance(element_options) // load and init
							await element_instance.build(true) // build, loading data
							return element_instance
					})())
				}//end for (let i = 0; i < ddo_map.length; i++)

				// set on finish
				self.ar_instances = await Promise.all(ar_promises)

				return true
			  }//end async function() load_ddo_map

	// load_ddo_map. Exec load ddo_map elements
		await load_ddo_map()

	// load data if is not already received as option
		if (autoload===true) {
			if (self.context) {
				// catch invalid call. Page build must be false except the first start page
				console.error('Error. Ignored call to tool_common build with autoload=true. Tool already have context!', self.context);
			}else{

				// tool rqo. Create the basic rqo to load tool config data stored in component_json tipo 'dd1353'
					const rqo = {
						action			: 'get_element_context',
						prevent_lock	: true,
						// tool source for component JSON that stores full tool config
						source : {
							model			: self.model,
							section_tipo	: self.section_tipo,
							section_id		: self.section_id,
							mode			: self.mode,
							lang			: self.lang
						}
					}

				// load data. Load section data from db of the current tool.
				// Tool data configuration is inside the tool_registered section 'dd1324' and parsed into component_json 'dd1353',
				// The tool info was generated when it was imported / registered by admin
					const api_response = await data_manager.request({
						body : rqo
					})
					self.context = api_response.result?.[0] || null

				// config update
					if (self.context) {
						self.config = self.context.config
					}else{
						console.error('Error. Tool context not loaded from API response:', api_response);
					}

				// debug
					if(SHOW_DEBUG===true) {
						// console.log("/// [tool_common.build] api_response:", api_response);
						dd_console(`[tool_common.build] TOOL: ${self.model} api_response:`, 'DEBUG', api_response)
					}
			}
		}//end if (autoload===true && !self.context)

	// status update
		self.status = 'built'


	return true
}//end build



/**
* RENDER
* This method is an alias of common.render to allow catching and managing start tool errors.
* Note that if self.error is defined (because an error was written in init or build phases)
* the tool common error will be used instead of the tool render.
*
* @param {Object} [options={}] - Render options
* @param {string} [options.render_level] - Level of depth that is rendered (full | content)
*
* @return {Promise<HTMLElement>}
*/
tool_common.prototype.render = async function(options={}) {

	const self = this

	// call the generic common render or render tool generic error
		const result = typeof self.error!=='undefined'
			? render_error(this, options)
			: await common.prototype.render.call(this, options);


	return result
}//end render



/**
* LOAD_COMPONENT
* Loads a component to place it in its respective container.
* Initializes and builds the component with the given options.
*
* @param {Object} options - Component load options
* @param {Object} options.self - Instance of the caller
* @param {string} options.model - Model of the component to load
* @param {string} options.mode - Mode of the component to load
* @param {string} options.tipo - Tipo of the component to load
* @param {string} options.section_tipo - Section tipo of the component to load
* @param {string} [options.section_lang] - Section lang of the component to load
* @param {string} options.lang - Lang of the component to load
* @param {string} [options.type] - Type of the component to load
* @param {string} [options.section_id] - Section ID of the component to load
* @param {string} [options.matrix_id] - Matrix ID of the component to load
* @param {string} [options.data_source] - Data source of the component to load
* @param {string} [options.id_variant] - ID variant to prevent ID conflicts (defaults to tool model)
* @param {Object[]} [options.to_delete_instances] - Array of instance objects to destroy
* @param {Object} [options.caller_dataframe] - Caller dataframe of the component to load
*
* @return {Promise<Object>}
*/
export const load_component = async function(options) {

	// options
		const self					= options.self
		const model					= options.model
		const mode					= options.mode
		const tipo					= options.tipo
		const section_tipo			= options.section_tipo
		const section_lang			= options.section_lang
		const lang					= options.lang
		const type					= options.type
		const section_id			= options.section_id || null
		const matrix_id				= options.matrix_id || null
		const data_source			= options.data_source || null
		const id_variant			= options.id_variant || self.model
		const to_delete_instances	= options.to_delete_instances
		const caller_dataframe		= options.caller_dataframe || null

	// component instance_options
		const instance_options = {
			model				: model,
			mode				: mode,
			tipo				: tipo,
			section_tipo		: section_tipo,
			section_id			: section_id,
			lang				: lang,
			section_lang		: section_lang,
			type				: type,
			id_variant			: id_variant, // id_variant prevents id conflicts
			caller				: self // set current tool as component caller (to check if component is inside tool or not)
		}

		if (matrix_id) {
			instance_options.matrix_id = matrix_id
		}

		if (data_source) {
			instance_options.data_source = data_source
		}

		if (caller_dataframe) {
			instance_options.caller_dataframe = caller_dataframe
		}

	// get instance and init
		const component_instance = await get_instance(instance_options)

	// clean instances
		if (to_delete_instances && to_delete_instances.length>0) {
			for (let i = self.ar_instances.length - 1; i >= 0; i--) {
				const current_instance = self.ar_instances[i]
				if (to_delete_instances.includes(current_instance)) {
					// remove from array of instances and destroy
					self.ar_instances.splice(i, 1)
					await current_instance.destroy()
				}
			}
		}

	// add component instance to current ar_instances if not already done
		const instance_found = self.ar_instances.find( el => el===component_instance )
		if (!instance_found) {
			self.ar_instances.push(component_instance)
		}

	// build
		await component_instance.build(true)


	return component_instance
}//end load_component



/**
* OPEN_TOOL
* Init, build and render the tool requested.
* Called by page observe event (init).
* To load a tool, do not call directly; publish an event as:
*
* ```js
* event_manager.publish('open_tool', {
* 	caller: self,
* 	tool_context: {
* 		css: "/v6/tools/tool_lang/css/tool_lang.css",
* 		icon: "/v6/tools/tool_lang/img/icon.svg",
* 		label: "Translation",
* 		mode: "edit",
* 		model: "tool_lang",
* 		name: "tool_lang",
* 		properties: {open_as: 'modal', windowFeatures: null},
* 		section_id: 8,
* 		section_tipo: "dd1324",
* 		show_in_component: true
* 	}
* })
* ```
*
* The event is fired by the tool button created with method ui.build_tool_button.
* When the user triggers the click event, a publish 'open_tool' is made.
*
* @param {Object} options - Tool open options
* @param {Object} options.caller - Object caller (instance)
* @param {Object|string} options.tool_context - Tool context object or model name string
* @param {Object|null} [options.caller_options] - Additional data for the tool
* @param {string|null} [options.open_as] - Mode of visualization: window, modal, tab, popup
* @param {string|Object|null} [options.windowFeatures] - Window features string or object
*
* @return {Promise<Object|boolean>}
*/
export const open_tool = async (options) => {

	// debug
		if(SHOW_DEBUG===true) {
			console.warn("------ open_tool call options:",options);
		}

	// options validation
		if (!options || typeof options!=='object') {
			console.error('open_tool: invalid options', options);
			return false
		}

	// options
		// tool_context. If is string, resolve context from API using value as model
		const tool_context = typeof options.tool_context==='string'
			? await (async ()=>{
				// tool rqo. Create the basic rqo to load tool config data stored in component_json tipo 'dd1353'
				const rqo = {
					action			: 'get_element_context',
					prevent_lock	: true,
					source			: {
						model : options.tool_context // expected name as 'tool_upload'
					}
				}
				try {
					const api_response = await data_manager.request({
						body : rqo
					})
					if (api_response.result && api_response.result[0]) {
						return api_response.result[0] // tool context object
					}
					return null
				} catch (error) {
					console.error('open_tool: failed to resolve tool_context from API:', error);
					return null
				}
			  })()
			 : options.tool_context
				? clone(options.tool_context) // (!) full clone here to avoid circular references
				: null

		// check tool context
		if (!tool_context) {
			console.error('The tool cannot be opened without context. Check the tools registration in the current user\'s profile.');
			return false
		}

		// caller. Instance that calls the tool, normally a component or section
		const caller = options.caller
		// caller_options. Object with additional data for the tool
		const caller_options = options.caller_options || null
		// open_as. Mode of tool visualization: modal, tab, popup
		const open_as = options.open_as
			? options.open_as // overwrite context value when is passed
			: tool_context?.properties?.open_as
				? tool_context.properties.open_as
				: 'modal' // default is 'modal'
		// windowFeatures. Features to pass to the tool visualizer
		// (normally standard JAVASCRIPT text features like: "left=100,top=100,width=320,height=320")
		const current_windowFeatures = options.windowFeatures
			? options.windowFeatures // overwrite context value when is passed
			: tool_context?.properties?.windowFeatures
				? tool_context.properties.windowFeatures
				: null

	// open tool visualization
	return (open_as==='window')
		? await view_window({
			tool_context	: tool_context, // object
			caller			: caller, // object like component_input_text instance
			caller_options	: caller_options,
			windowFeatures	: current_windowFeatures // string like 'left=100,top=100,width=320,height=320'
		  })
		: await view_modal({
			tool_context	: tool_context, // object
			caller			: caller, // object like component_input_text instance
			caller_options	: caller_options,
			open_as			: open_as, // string like 'tab' | 'popup'
			windowFeatures	: current_windowFeatures // string like 'left=100,top=100,width=320,height=320'
		  })
}//end open_tool



/**
* VIEW_MODAL
* Opens the tool in a modal view.
*
* @param {Object} options - Modal view options
* @param {Object} options.tool_context - Tool context object
* @param {Object} options.caller - Caller instance
* @param {Object|null} [options.windowFeatures] - Window features to customize modal size
*
* @return {Promise<Object|boolean>}
*/
const view_modal = async function(options) {

	// options
		const caller			= options.caller
		const windowFeatures	= options.windowFeatures || null

	// validate caller
		if (!caller) {
			console.error('view_modal: missing caller');
			return false
		}

	// tool context (clone to avoid mutating the passed-in object)
		const tool_context = Object.assign({}, options.tool_context || {}, {
			lang		: caller.lang,
			type		: 'tool',
			id_variant	: caller.id_base // prevent instance id collisions
		})

	// instance options
		const instance_options = Object.assign({
			caller : caller // add caller to tool_context (only to refresh it on close the tool)
		}, tool_context)

	// instance load / recover
		const tool_instance = await get_instance(instance_options)

	// stop if already loaded (toggle tool)
		if (tool_instance && tool_instance.status && tool_instance.status!=='initialized') {
			return false
		}

	// load tool CSS
		const tool_css_url = tool_context.css?.url
		if(tool_css_url) {
			// Don't await here. Race conditions are handled
			load_style(tool_css_url)
		}

	// modal
		const loading_label = get_label.loading || 'Loading tool..'
		const header = ui.create_dom_element({
			element_type	: 'div',
			class_name		: `tool_header ${tool_context.name} header`,
			inner_html		: `<div class="tool_name_container">
								<div class="label"><span class="button white" style="mask: url("${tool_context.icon}");"></span>${tool_context.label}</div>
								<div class="description">${loading_label}</div>
							  </div>`
		})
		const body = ui.create_dom_element({
			element_type	: 'div',
			class_name		: `wrapper_tool ${tool_context.name} edit body`,
			inner_html		: loading_label
		})
		body.style.minHeight = '15rem'
		const modal = ui.attach_to_modal({
			header		: header,
			body		: body,
			footer		: null,
			callback	: (dd_modal) => {

				ui.load_item_with_spinner({
					container			: body,
					label				: tool_context.label,
					preserve_content	: false,
					replace_container	: true,
					callback			: async () => {

						// invalid tool common render
						const render_invalid_tool = () => {
							// Create a wrapper element with a message indicating the tool is invalid
							const msg = tool_instance
								? `${tool_instance.context?.label} (${tool_instance.model}) called from: ${caller.label} (${caller.model} - ${caller.tipo})`
								: `Called from: ${caller.label} (${caller.model} - ${caller.tipo})`
							const wrapper = ui.create_dom_element({
								element_type	: 'div',
								inner_html		: msg,
								class_name		: 'body content'
							});
							wrapper.slot = 'body';

							// Create and configure the tool header for the invalid tool case
							const tool_header = ui.create_dom_element({
								element_type	: 'div',
								inner_html		: 'Invalid tool configuration',
								class_name		: 'tool_name_container label header'
							});
							tool_header.slot = 'header';
							header.replaceWith(tool_header);

							return wrapper;
						}

						// no valid tool instance case
						if (!tool_instance) {
							return render_invalid_tool();
						}

						try {
							// Build and render the tool instance
							await tool_instance.build(true);
							const wrapper = await tool_instance.render();

							// Ensure the wrapper contains a valid tool header
							if (!wrapper.tool_header) {
								throw new Error('Invalid tool wrapper: missing tool_header');
							}

							// Set up the header
							wrapper.tool_header.slot = 'header';
							wrapper.tool_header.classList.add('header');
							header.replaceWith(wrapper.tool_header);

							// Set up the body
							wrapper.slot = 'body';
							// body.replaceWith(wrapper);

							// ! note that function 'load_item_with_spinner' will replace
							// body content with tool instance rendered node

							// Link the wrapper to the modal
							wrapper.modal = modal;

							// Return the configured wrapper
							return wrapper;
						} catch (error) {
							console.log('tool_instance:', tool_instance);
							console.error(error, caller);
							return render_invalid_tool();
						}
					}
				})
			}
		})
		modal.on_close	= () => {

			// remove modal from DOM (original on_close was overwritten,
			// so we must call remove() explicitly to avoid DOM leak)
			modal.remove()

			if (tool_instance && typeof tool_instance.on_close_actions==='function') {

				// custom actions
				tool_instance.on_close_actions('modal')

			}else if (tool_instance) {

				tool_instance.destroy(true, true, true)
				caller.refresh({
					refresh_id_base_lang : true
				})
				.then(()=>{
					// re-select the caller component
					dd_request_idle_callback(
						() => {
							ui.component.activate(caller)
						}
					)
				})
				.catch(err => {
					console.error('view_modal: caller.refresh failed:', err)
				})
			}

			// re-select the caller component
			if (caller.type==='component') {
				dd_request_idle_callback(
					() => {
						ui.component.activate(caller)
					}
				)
			}
		}

	// windowFeatures. To customize the modal size in a tool, set tool properties
	// `windowFeatures` like `{"windowFeatures":{"width":"34rem","maxWidth":"100%"}}`
		if (windowFeatures && typeof windowFeatures==='object') {
			for (let [key, value] of Object.entries(windowFeatures)) {
				modal.modal_content.style[key] = value
			}
		}


	return tool_instance
}//end view_modal



/**
* VIEW_WINDOW
* Opens the tool in a new browser window or tab.
*
* @param {Object} options - Window view options
* @param {Object} options.tool_context - Tool context object
* @param {Object} options.caller - Caller instance
* @param {Object|null} [options.caller_options] - Additional data for the tool
* @param {string|Object|null} [options.windowFeatures] - Window features string or object
*
* @return {Promise<Window|null>}
*/
const view_window = async function(options) {

	// options
		const tool_context		= options.tool_context
		const caller			= options.caller
		const caller_options	= options.caller_options || null
		// const open_as		= options.open_as
		const windowFeatures	= options.windowFeatures || null

	// caller guard
		if (!caller) {
			console.error('view_window: caller is required');
			return null;
		}
		// windowFeatures sample:
			// {
			// 	left	: 'return screen.width -760',
			// 	top		: 0,
			// 	width	: 760,
			// 	height	: 500
			// }

	// short vars
		const name			= tool_context.name
		const tool_config	= tool_context.tool_config || null

	// fix current instance as caller in global window to be accessible from new window
		// window.callers = window.callers || {}
		// window.callers[caller.id] = caller

	// caller_ddo. Minimum caller data to re-build it from tool
		const caller_ddo = {
			id_variant			: caller.id_variant || null,
			tipo				: caller.tipo,
			section_tipo		: caller.section_tipo,
			section_id			: caller.section_id,
			section_id_selected	: caller.section_id_selected,
			mode				: caller.mode,
			model				: caller.model,
			lang				: caller.lang,
			label				: caller.label
		}

	// caller_dataframe . Used for dataframe
		if(caller.model==='component_dataframe'){
			caller_ddo.caller_dataframe = {
				section_tipo		: caller.section_tipo,
				section_id			: caller.section_id,
				section_id_key		: caller.data.section_id_key,
				section_tipo_key	: caller.data.section_tipo_key,
				main_component_tipo	: caller.tipo
			}
		}

	// URL
		// raw_data will be compressed and de-compressed from target window
		const raw_data = lzstring.compressToEncodedURIComponent(
			JSON.stringify({
				caller_ddo		: caller_ddo,
				tool_config		: tool_config,
				caller_options	: caller_options
			})
		)
		const url = DEDALO_CORE_URL + `/page/?tool=${name}&menu=false&raw_data=` + raw_data
		if (url.length>3000) {
			console.warn('Warning. The URL is too long:', url.length);
		}

	// window features
		const parsed_windowFeatures = typeof windowFeatures==='string'
			? windowFeatures // string case as 'left=100,top=100,width=320,height=320'
			: (windowFeatures && typeof windowFeatures==='object')
				? (()=>{ // object case as {"left":"return screen.width -760","top":0,"width":760,"height":500}

					const parsed_pairs = []
					for(const key in windowFeatures) {

						// value could be a Function as string like 'return screen.width -500'
						// @see https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Function
						const value = typeof windowFeatures[key]==='string' && windowFeatures[key].indexOf('return')===0
							? Function(windowFeatures[key])() // parse and auto exec the created Function
							: windowFeatures[key]

						const pair = `${key}=${value}`

						parsed_pairs.push(pair)
					}

					const parsed_string = parsed_pairs.join(',')

					return parsed_string
				  })()
				: null // null or non-object case

	// tool_window
		const window_name	= name +'_'+ (caller.id_base || '')
		const tool_window	= open_window({
			url			: url,
			target		: window_name,
			features	: parsed_windowFeatures || 'new_tab'
		})
		if (!tool_window) {
			console.error('view_window: popup blocked or failed to open');
		}
		// this window focus event (not use blur because tool_upload blurs on open file window)
		const fn_refresh_caller = function() {
			window.removeEventListener('focus', fn_refresh_caller)
			// refresh caller
			// Note that in some situations, caller is not an instance like in grid_dd indexation button
				if (caller && typeof caller.refresh==='function') {
					const render_level = (caller.mode==='list')
						? 'full'
						: 'content'
					caller.refresh({
						refresh_id_base_lang	: true,
						render_level			: render_level
					})
				}
		}
		window.addEventListener('focus', fn_refresh_caller)


	return tool_window
}//end view_window



/**
* GET_TOOL_LABEL
* Returns the label in the current language.
* If the label is not defined in the current language, it tries the default language,
* then any available language. Returns null if nothing is found.
*
* @param {string} label_name - Label key like 'indexation_tool'
* @param {...string} rest - Additional strings for printf interpolation
*
* @return {string|null}
*   Localized label like 'Indexation Tool', or null if not found
*/
const get_tool_label = function(label_name, ...rest) {

	const tool_labels = this.context?.labels
	if (!tool_labels) {
		return null
	}

	// single-pass: match by priority (current lang > default lang > any lang)
	const lang_current	= page_globals.dedalo_application_lang
	const lang_default	= page_globals.dedalo_application_langs_default

	let found_current	= null
	let found_default	= null
	let found_any		= null

	const len = tool_labels.length
	for (let i = 0; i < len; i++) {
		const el = tool_labels[i]
		if (el.name !== label_name) continue

		if (!found_any) {
			found_any = el
		}
		if (!found_default && el.lang === lang_default) {
			found_default = el
		}
		if (!found_current && el.lang === lang_current) {
			found_current = el
			break // highest priority, no need to continue
		}
	}

	const found = found_current || found_default || found_any

	return found
		? printf(found.value, ...rest)
		: null
}//end get_tool_label



// @license-end
