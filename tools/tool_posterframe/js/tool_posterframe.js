// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL */
/*eslint no-undef: "error"*/



// import needed modules
	import {clone, dd_console} from '../../../core/common/js/utils/index.js'
	import {data_manager} from '../../../core/common/js/data_manager.js'
	import {common, create_source} from '../../../core/common/js/common.js'
	import {tool_common} from '../../tool_common/js/tool_common.js'
	import {render_tool_posterframe} from './render_tool_posterframe.js' // self tool rendered (called from render common)



/**
* TOOL_POSTERFRAME
* Client-side controller for the Dédalo posterframe tool.
*
* Allows editors to extract a video still frame (posterframe) from an audiovisual
* or 3-D media component at a specific playback timecode and either:
*   a) Store it as the component's own posterframe thumbnail, or
*   b) Create a new portal record in a related section and attach the extracted
*      image as an "identifying image" via component_image — see PHP counterpart
*      class.tool_posterframe.php for the server-side FFmpeg pipeline.
*
* Architecture:
*   - Extends tool_common for generic lifecycle (init/build/render/destroy/refresh).
*   - Delegates the AV player embed to render_tool_posterframe (edit view).
*   - Server actions (create_identifying_image, get_ar_identifying_image) are gated
*     by API_ACTIONS in the PHP class (SEC-024 §9.2).
*
* Instance properties set by tool_common.init():
*   id, model, mode, node, ar_instances, events_tokens, status, type,
*   source_lang, target_lang, langs, caller, tool_config.
*
* `self.main_element` is resolved in build() from tool_config.ddo_map by
* role === 'main_element' and must be a component_av or component_3d instance.
*
* Supported media models: see `ar_allowed` below.
*
* @see tools/tool_posterframe/class.tool_posterframe.php  (server counterpart)
* @see tools/tool_posterframe/js/render_tool_posterframe.js  (UI render)
*/
export const tool_posterframe = function () {

	this.id				= null
	this.model			= null
	this.mode			= null
	this.node			= null
	this.ar_instances	= null
	this.events_tokens	= null
	this.status			= null
	this.main_element	= null
	this.type			= null
	this.source_lang	= null
	this.target_lang	= null
	this.langs			= null
	this.caller			= null

	// allowed models
	// Only these component models support posterframe operations (create/delete).
	// Any call to create_posterframe or delete_posterframe with a different model
	// short-circuits with a console.error.
	this.ar_allowed		= [
		'component_av',
		'component_3d'
	]

	return true
}//end page



/**
* COMMON FUNCTIONS
* Extend tool_posterframe with shared prototype methods from tool_common,
* common, and render_tool_posterframe.
*
* render: delegates to tool_common's generic render entry point, which
*   calls the concrete edit() assigned below.
* destroy / refresh: standard common lifecycle (clears DOM node, re-renders).
* edit: overrides the tool's render mode with the custom posterframe layout
*   (AV player + posterframe image + action buttons) from render_tool_posterframe.
*/
// prototypes assign
	// render : using common render entry point
	tool_posterframe.prototype.render	= tool_common.prototype.render
	tool_posterframe.prototype.destroy	= common.prototype.destroy
	tool_posterframe.prototype.refresh	= common.prototype.refresh
	tool_posterframe.prototype.edit		= render_tool_posterframe.prototype.edit



/**
* INIT
* Custom tool initialisation.
*
* Delegates entirely to tool_common.prototype.init, which seeds all shared
* instance properties (id, model, mode, caller, tool_config, etc.) from
* the `options` object. No additional per-tool setup is currently required
* beyond the generic init.
*
* @param {Object} options - Initialisation options forwarded from tool_common.
*   See tool_common.prototype.init for the full options contract:
*   { caller_ddo, tool_config, caller_options, ... }
* @returns {Promise<*>} Resolves with the return value of tool_common.prototype.init.
*/
tool_posterframe.prototype.init = async function(options) {

	const self = this

	// call the generic common tool init
		const common_init = await tool_common.prototype.init.call(this, options);

	// set the self specific vars not defined by the generic init (in tool_common)


	return common_init
}//end init



/**
* BUILD
* Custom tool build step.
*
* After the shared tool_common build (which loads CSS, instantiates all ddo_map
* components, and optionally fetches context from the API), this method resolves
* `self.main_element` by locating the ddo_map entry whose `role` is 'main_element'
* and then finding the corresponding live instance in `self.ar_instances`.
*
* `self.main_element` is the AV or 3D component that will be embedded in the tool's
* player container. It must be a model listed in `self.ar_allowed`.
*
* Errors during main_element resolution are caught and stored on `self.error`
* (picked up by tool_common.prototype.render to display a generic error view).
*
* @param {boolean} [autoload=false] - When true, triggers an automatic data fetch
*   during the build phase (forwarded to tool_common.prototype.build).
* @returns {Promise<*>} Resolves with the return value of tool_common.prototype.build.
*/
tool_posterframe.prototype.build = async function(autoload=false) {

	const self = this

	// call generic common tool build
		const common_build = await tool_common.prototype.build.call(this, autoload);

	try {

		// specific actions.. like fix main_element for convenience
		// main_element
		// Find the ddo_map entry whose role is 'main_element', then look up the
		// already-instantiated component from ar_instances by its tipo.
			const main_element_ddo	= self.tool_config.ddo_map.find(el => el.role==='main_element')
			self.main_element		= self.ar_instances.find(el => el.tipo===main_element_ddo.tipo)

	} catch (error) {
		self.error = error
		console.error(error)
	}


	return common_build
}//end build_custom



/**
* CREATE_POSTERFRAME
* Delegate posterframe creation to the main_element component (component_av or
* component_3d) and optionally refresh the component if it had no prior posterframe.
*
* The actual frame extraction (FFmpeg) is handled entirely inside the component
* (main_element.create_posterframe()), not by this tool. This method acts as a
* guard layer (model allow-list check) and a conditional refresh trigger when
* the component was in the initial "no posterframe" state.
*
* Side effects:
*   - Calls main_element.create_posterframe() (triggers server-side file write).
*   - Calls main_element.refresh() when the current posterframe_url equals
*     page_globals.fallback_image (first-time extraction case).
*
* @returns {Promise<boolean>} Resolves with the component's result (true on
*   success, false on failure or unsupported model).
*/
tool_posterframe.prototype.create_posterframe = async function() {

	const self = this

	// allowed_components
		if (!self.ar_allowed.includes(self.main_element.model)) {
			console.error('Not supported model:', self.main_element.model);
			return false
		}

	// execute 'create_posterframe' in client side by component
		const result = await self.main_element.create_posterframe()

	// refresh
	// Only refresh the main_element when it had no posterframe before this call
	// (posterframe_url was still the fallback placeholder). After a refresh, the
	// component re-renders with the new thumbnail.
		if (self.main_element.data?.posterframe_url===page_globals.fallback_image) {
			// initial no posterframe case
			await self.main_element.refresh()
		}

		// return bool
		return result
}//end create_posterframe



/**
* DELETE_POSTERFRAME
* Prompt the user for confirmation, then delegate posterframe deletion to the
* main_element component (component_av or component_3d).
*
* A browser confirm() dialog is shown before any action is taken. Cancellation
* returns false immediately with no side effects. Model validation is applied
* after confirmation to surface unsupported component types clearly.
*
* Side effects:
*   - Calls main_element.delete_posterframe() when confirmed (triggers server-side
*     file removal).
*
* @returns {Promise<boolean>} Resolves with the component's result (true on
*   success, false when the user cancelled, the model is unsupported, or the
*   deletion failed).
*/
tool_posterframe.prototype.delete_posterframe = async function() {

	const self = this

	// confirm dialog
	// (!) Uses browser-native confirm() — blocks the main thread. Acceptable for
	// low-frequency destructive actions where a full modal would be overhead.
		if ( !confirm( (get_label.sure || 'Sure?') ) ) {
			return false
		}

	// allowed_components
		if (!self.ar_allowed.includes(self.main_element.model)) {
			console.error('Not supported model:', self.main_element.model);
			return false
		}

	// exec delete
		const result = await self.main_element.delete_posterframe()

	// return bool
	return result
}//end delete_posterframe



/**
* GET_AR_IDENTIFYING_IMAGE
* Fetch the list of portal components that carry an `identifying_image` property
* for all sections that hold an inverse reference to the current media section.
*
* Each array entry represents a candidate target for `create_identifying_image`
* and is used by render_tool_posterframe to populate the identifying_image
* <select> options.
*
* Server-side logic (PHP class.tool_posterframe.php → get_ar_identifying_image):
*   1. Loads the section identified by main_element.section_tipo / section_id.
*   2. Iterates inverse references (sections that link TO this section).
*   3. For each inverse section, looks up portal components whose ontology node
*      has `properties.identifying_image` defined.
*   4. Returns an array of objects:
*      { section_id, section_tipo, component_portal, component_image, label }
*
* (!) SHOW_DEVELOPER is not declared in the /*global*\/ header of this file.
*     The eslint no-undef directive will flag it as an error. Do not fix here;
*     add 'SHOW_DEVELOPER' to the /*global*\/ list in a separate code commit.
*
* @returns {Promise<Array>} Resolves with the array of identifying image descriptor
*   objects returned by the API. Resolves with whatever `response.result` holds
*   (typically an empty array when no inverse references define identifying_image).
*/
tool_posterframe.prototype.get_ar_identifying_image = async function() {

	const self = this

	// source. Note that second argument is the name of the function to manage the tool request like 'apply_value'
	// this generates a call as my_tool_name::my_function_name(options)
		const source = create_source(self, 'get_ar_identifying_image')

	// rqo
		const rqo = {
			dd_api	: 'dd_tools_api',
			action	: 'tool_request',
			source	: source,
			options	: {
				section_tipo	: self.main_element.section_tipo,
				section_id		: self.main_element.section_id
			}
		}

	// call to the API, fetch data and get response
		return new Promise(function(resolve){

			data_manager.request({
				body : rqo
			})
			.then(function(response){
				if(SHOW_DEVELOPER===true) {
					dd_console("-> get_ar_identifying_image API response:",'DEBUG',response);
				}

				const result = response.result // array of objects

				resolve(result)
			})
		})
}//end get_ar_identifying_image



/**
* CREATE_IDENTIFYING_IMAGE
* Prompt the user for confirmation, then create a new identifying image in a
* target portal section by extracting the current video frame via the server-side
* FFmpeg pipeline.
*
* Full server-side workflow (PHP class.tool_posterframe.php → create_identifying_image):
*   1. Instantiates the target component_portal and adds a new portal element.
*   2. Instantiates component_image inside the new portal record to hold the image.
*   3. Resolves the AV source file (preferring original quality, falling back to
*      default if the original does not exist on disk).
*   4. Runs FFmpeg to extract the frame at `current_time` and write it to the
*      component_image path.
*   5. Calls component_image.process_uploaded_file to create all required formats
*      and thumbnail sizes.
*
* The operation can take up to 120 seconds on large video files (timeout is set
* accordingly in the rqo).
*
* (!) A browser confirm() is shown before any network request. Cancellation
*     returns false immediately with no server-side side effects.
*
* (!) SHOW_DEVELOPER is not declared in the /*global*\/ header of this file.
*     See note in get_ar_identifying_image above.
*
* @param {Object} item_value - Descriptor for the target portal/image pair.
*   Expected shape: { section_id, section_tipo, component_portal, component_image }
*   (an element from get_ar_identifying_image result array).
* @param {number} current_time - Video element currentTime (seconds) at which
*   to extract the posterframe still.
* @returns {Promise<*>} Resolves with `response.result` (true on success, false
*   or an error object on failure).
*/
tool_posterframe.prototype.create_identifying_image = async function(item_value, current_time) {

	const self = this

	// confirm dialog
		if ( !confirm( (get_label.sure || 'Sure?') ) ) {
			return false
		}

	// source. Note that second argument is the name of the function to manage the tool request like 'apply_value'
	// this generates a call as my_tool_name::my_function_name(options)
		const source = create_source(self, 'create_identifying_image')

	// rqo
		const rqo = {
			dd_api	: 'dd_tools_api',
			action	: 'tool_request',
			source	: source,
			options	: {
				tipo			: self.main_element.tipo,
				section_tipo	: self.main_element.section_tipo,
				section_id		: self.main_element.section_id,
				item_value		: item_value,
				current_time	: current_time
			}
		}

	// call to the API, fetch data and get response
		return new Promise(function(resolve){

			data_manager.request({
				body : rqo,
				retries : 1, // one try only
				timeout : 120 * 1000 // 120 secs waiting response
			})
			.then(function(response){
				if(SHOW_DEVELOPER===true) {
					dd_console("-> create_identifying_image API response:",'DEBUG',response);
				}

				const result = response.result // array of objects

				resolve(result)
			})
		})
}//end create_identifying_image



// @license-end
