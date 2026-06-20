// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, SHOW_DEVELOPER, DEDALO_CORE_URL */
/*eslint no-undef: "error"*/



/**
 * TOOL_DEV_TEMPLATE
 *
 * Production-shaped sample tool that serves as the canonical reference and
 * starting point when creating new Dédalo tools.
 *
 * To create a real tool from this template either copy the whole directory and
 * replace every 'tool_dev_template' occurrence with your tool name, or run the
 * scaffolder (preferred):
 *   php tools/tool_common/cli/create_tool.php --name=tool_myorg_mytool --label="My tool"
 *
 * Full documentation: docs/development/tools/ — in particular:
 *   - js_lifecycle.md   : client-side contract (init / build / render / destroy)
 *   - server_contract.md: PHP API_ACTIONS map and permission gates
 *   - register_json.md  : tool registration and ddo_map configuration
 *
 * This file defines:
 *   - `tool_dev_template` constructor — instance property declarations
 *   - Prototype lifecycle methods: init, build
 *   - Prototype action methods that wrap server calls via tool_request:
 *       get_some_data_from_server, file_upload_handler, run_background_demo
 *   - A reference-only prototype method: load_component_sample
 *
 * The concrete render logic lives in render_tool_dev_template.js; the standard
 * prototype assignments (render, destroy, refresh, edit) are wired in by the
 * wire_tool() call below.
 */



// import needed modules
// by default you will need the tool_common to init, build and render,
// wire_tool for the standard prototype wiring, and your render module.
	import {clone, dd_console} from '../../../core/common/js/utils/index.js'
// import data_manager only if you need raw API access; tool->server calls
// use this.tool_request() from tool_common instead.
// (!) For ordinary tool→server communication always prefer self.tool_request()
// over data_manager.request() directly, because tool_request adds the tool id,
// caller context, and security token automatically.
	import {data_manager} from '../../../core/common/js/data_manager.js'
// import get_instance to create and init sections or components
	import {get_instance, delete_instance} from '../../../core/common/js/instances.js'
// tool_common: base lifecycle (init/build/render), tool_request, wire_tool
	import {tool_common, load_component, wire_tool} from '../../tool_common/js/tool_common.js'
// specific render of the tool
	import {render_tool_dev_template} from './render_tool_dev_template.js'



/**
* TOOL_DEV_TEMPLATE
* Tool constructor. Declares every instance property used by this tool.
*
* All properties are initialised to null here and populated during
* init() / build(). Declaring them upfront makes the instance shape
* predictable and avoids implicit property creation during the lifecycle.
*
* Properties:
*   id            - unique tool instance identifier (set by tool_common.init)
*   model         - string model name, always 'tool_dev_template'
*   mode          - display mode: 'edit', 'list', etc.
*   node          - root HTMLElement rendered by render()
*   ar_instances  - array of live component/section instances built from ddo_map
*   events_tokens - array of event subscription tokens for cleanup in destroy()
*   status        - current lifecycle state (null | 'inited' | 'built' | 'ready')
*   main_element  - the ddo_map 'main_element' role instance (resolved in build)
*   type          - tool type as declared in register.json
*   caller        - the component/section that opened this tool
*   langs         - project default languages array from page_globals
*/
export const tool_dev_template = function () {

	this.id				= null
	this.model			= null
	this.mode			= null
	this.node			= null
	this.ar_instances	= null
	this.events_tokens	= null
	this.status			= null
	this.main_element	= null
	this.type			= null
	this.caller			= null
	this.langs			= null
}//end tool_dev_template



/**
* COMMON FUNCTIONS
* wire_tool performs the standard prototype assignments in one call,
* attaching the shared lifecycle methods from tool_common and the concrete
* render method from render_tool_dev_template:
*   render  <- tool_common.prototype.render   (full render dispatcher)
*   destroy <- common.prototype.destroy       (cleanup, event unsubscribe)
*   refresh <- common.prototype.refresh       (re-render in place)
*   edit    <- render_tool_dev_template.prototype.edit  (concrete DOM builder)
*
* This replaces the boilerplate of manually assigning each prototype.
* Add any extra tool-specific prototype methods after this call as usual.
*/
wire_tool(tool_dev_template, render_tool_dev_template)



/**
* INIT
* Initialises the tool instance: seeds common properties via the base
* tool_common.prototype.init, then sets any tool-specific instance vars.
*
* Mirrors the Dédalo tool lifecycle contract (step 1 of 3):
*   init → build → render
*
* The base init resolves the caller reference, loads tool_config (ddo_map
* from the server API or a synthetic fallback built from the caller), and
* assigns model, section_tipo, section_id, lang, and mode onto `this`.
*
* Custom tool code MUST be enclosed in a try/catch so that framework-level
* error recovery works: when self.error is set the render step falls back
* to the generic error view instead of crashing the whole page.
*
* @param {Object} options - initialisation options forwarded from open_tool
*   options.lang  {string} active UI language code (e.g. 'lg-spa')
* @returns {Promise<boolean>} resolves to the common_init sentinel value (true on success)
*/
tool_dev_template.prototype.init = async function(options) {

	const self = this

	// call the generic common tool init.
	// It assigns the common vars (model, section_tipo, section_id, lang, mode...),
	// resolves the caller and the tool_config (with its ddo_map) or creates a
	// fallback ddo_map from the caller when none is defined.
		const common_init = await tool_common.prototype.init.call(this, options);

	try {

		// (!) enclose custom tool code inside try/catch to allow Dédalo to recover
		// from exceptions or non-login scenarios (self.error triggers the error view)

		// set the self specific vars not defined by the generic init
			self.lang	= options.lang
			self.langs	= page_globals.dedalo_projects_default_langs

	} catch (error) {
		self.error = error
		console.error(error)
	}


	return common_init
}//end init



/**
* BUILD
* Builds the tool: loads the tool CSS, resolves every ddo_map entry into a
* live component/section instance (stored in self.ar_instances), then locates
* the 'main_element' role instance for convenient access during render.
*
* Mirrors the Dédalo tool lifecycle contract (step 2 of 3):
*   init → build → render
*
* The base tool_common.prototype.build handles CSS loading and ddo_map
* resolution. A custom load_ddo_map function can be injected as the third
* argument when the default instance factory is insufficient.
*
* After the common build, the tool resolves self.main_element by matching
* the 'main_element' ddo role to the correct live instance. This reference
* is used by the server-call methods (get_some_data_from_server, etc.) to
* supply the correct tipo/section_id/section_tipo context.
*
* @param {boolean} [autoload=false] - when true, immediately triggers a data
*   fetch after build (used when the tool is opened in a new browser window)
* @returns {Promise<boolean>} resolves to the common_build sentinel value (true on success)
*/
tool_dev_template.prototype.build = async function(autoload=false) {

	const self = this

	// call generic common tool build.
	// It loads the tool CSS and resolves every ddo_map element into a live
	// instance (self.ar_instances). Pass {load_ddo_map: fn} as third argument
	// to replace the default loader.
		const common_build = await tool_common.prototype.build.call(this, autoload);

	try {

		// locate the main element by its ddo_map role.
		// ddo_map entries carry a 'role' hint set in register.json / tool_config;
		// 'main_element' is the primary component this tool operates on.
			const main_element_ddo	= self.tool_config.ddo_map.find(el => el.role==='main_element')
			self.main_element		= self.ar_instances.find(el => el.tipo===main_element_ddo.tipo)

	} catch (error) {
		self.error = error
		console.error(error)
	}


	return common_build
}//end build



/**
* GET_SOME_DATA_FROM_SERVER
* Sample tool→server READ call. Dispatches action 'get_component_data' to the
* PHP static method tool_dev_template::get_component_data($options) via the
* tool_request helper inherited from tool_common.
*
* The server method is declared in API_ACTIONS with a 'tipo' read gate
* (min_level 1). The framework validates that gate before the PHP method runs —
* the client does not need to add extra permission checks here.
*
* Server response shape (response.result when successful):
*   { model: string, component_tipo: string, component_data: * }
*
* In your own tool, rename to reflect the actual operation, and adapt the
* options payload to match the corresponding PHP method signature.
*
* @returns {Promise<Object>} API response envelope {result, msg, errors}
*/
tool_dev_template.prototype.get_some_data_from_server = async function() {

	const self = this

	const response = await self.tool_request({
		action	: 'get_component_data',
		options	: {
			component_tipo	: self.main_element.tipo,
			section_id		: self.main_element.section_id,
			section_tipo	: self.main_element.section_tipo,
			config			: self.context.config
		}
	})

	if(SHOW_DEVELOPER===true) {
		dd_console("-> get_some_data_from_server API response:",'DEBUG',response);
	}

	return response
}//end get_some_data_from_server



/**
* FILE_UPLOAD_HANDLER
* Sample service_upload integration — the second leg of an upload flow.
*
* Lifecycle:
*   1. The render layer opens a service_upload widget.
*   2. When service_upload finishes, it fires 'upload_file_done_{tool.id}'.
*   3. The render's event listener calls this method, passing the event
*      payload (which contains file_data from service_upload).
*   4. This method forwards file_data to the server via tool_request so the
*      PHP handler (handle_upload_file) can move/process the file.
*
* The server method is declared in API_ACTIONS with a 'tipo' write gate
* (min_level 2). The server further validates that the resolved file path
* stays inside DEDALO_UPLOAD_TMP_DIR (path-traversal defense).
*
* options.file_data shape (produced by service_upload):
*   { name: string, key_dir: string, tmp_name: string, … }
*
* @param {Object} options - event payload from 'upload_file_done'
*   options.file_data {Object} - file descriptor produced by service_upload
* @returns {Promise<Object>} API response envelope {result, msg, errors}
*/
tool_dev_template.prototype.file_upload_handler = async function(options) {

	const self = this

	const response = await self.tool_request({
		action	: 'handle_upload_file',
		options	: {
			component_tipo	: self.main_element.tipo,
			section_id		: self.main_element.section_id,
			section_tipo	: self.main_element.section_tipo,
			config			: self.context.config,
			file_data		: options.file_data
		}
	})

	if(SHOW_DEVELOPER===true) {
		dd_console("-> file_upload_handler API response:",'DEBUG',response);
	}

	return response
}//end file_upload_handler



/**
* RUN_BACKGROUND_DEMO
* Sample background execution via the tool_request helper.
*
* When `background: true` is passed, tool_request tells the server to detach
* the action as a separate CLI process via process_runner.php. The HTTP call
* returns immediately with response.result = { pid: number }, allowing the
* UI to stay responsive while the long-running PHP method executes offline.
*
* The server-side method (long_process_demo) must appear in BOTH:
*   - API_ACTIONS      — so dd_tools_api can dispatch it (HTTP path)
*   - BACKGROUND_RUNNABLE — so process_runner.php can execute it (CLI path)
*
* (!) The CLI background path bypasses dd_tools_api, so the PHP method gates
* its own developer-only permission as defense in depth. See class.tool_dev_template.php.
*
* Progress feedback for truly long operations should use a polling endpoint
* or a WebSocket; the background pid alone only confirms detachment.
*
* @returns {Promise<Object>} API response envelope; result.pid on success
*/
tool_dev_template.prototype.run_background_demo = async function() {

	const self = this

	const response = await self.tool_request({
		action		: 'long_process_demo',
		background	: true,
		options		: {
			iterations : 3
		}
	})

	if(SHOW_DEVELOPER===true) {
		dd_console("-> run_background_demo API response (pid):",'DEBUG',response);
	}

	return response
}//end run_background_demo



/**
* LOAD_COMPONENT_SAMPLE
* Reference method demonstrating how to load a component using the lower-level
* data_manager API directly (two-step: context first, then full component data).
*
* This pattern is needed only when you cannot rely on the automatic ddo_map
* resolution in tool_common.prototype.build — for example, when the component
* to load is determined at runtime by user interaction rather than at build time.
*
* Step 1 — fetch the context (schema shape, labels, config, tool list):
*   data_manager.request({ body: { action: 'get_element_context', source: ddo } })
*   The context is stored on self.main_element.context so render can reach it.
*
* Step 2 — use load_component (from tool_common) to build the full instance
*   (context + data) and register it in self.ar_instances.
*   prevent_lock: true avoids acquiring an edit lock during context load.
*
* Note: options.langs is assigned to `lang` (not `langs`). This is the
* existing code shape — do not rename.
*
* @param {Object} options - load options
*   options.ddo  {Object} - ddo descriptor {model, section_tipo, section_id, mode, lang}
*   options.langs {string} - language code for the component (despite the plural name)
* @returns {Promise<Object>} the built and initialised component instance
*/
tool_dev_template.prototype.load_component_sample = async function(options) {

	const self = this

	const ddo	= options.ddo
	const lang	= options.langs

	// first load the context of the component
		const rqo = {
			action	: 'get_element_context',
			source : {
				model			: ddo.model,
				section_tipo	: ddo.section_tipo,
				section_id		: ddo.section_id,
				mode			: ddo.mode, // edit || list
				lang			: ddo.lang
			},
			prevent_lock : true
		}
		const api_response = await data_manager.request({
			body : rqo
		})
		self.main_element.context = api_response.result.context

	// second, with the context, load the full component (context and data).
	// clone the context so tool_common's load_component can extend it without
	// mutating the cached context object on self.main_element.
		const load_options = Object.assign(clone(self.main_element.context),{
			self 		: self, // tool instance; the built component joins self.ar_instances
			lang		: lang,
			mode		: 'edit',
			section_id	: self.main_element.section_id
		})
		const component_instance = await load_component(load_options);


	return component_instance
}//end load_component_sample



// @license-end
