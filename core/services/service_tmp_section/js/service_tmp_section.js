// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, SHOW_DEBUG, DEDALO_CORE_URL, DEDALO_API_URL */
/*eslint no-undef: "error"*/



/**
* SERVICE_TMP_SECTION
*
* Lightweight service that instantiates a virtual "temporary section" composed
* of one or more real Dédalo components backed by the temporal data handler
* (matrix_temp_manager) instead of the standard database matrix.
*
* This pattern is used by import tools (tool_import_marc21, tool_import_zotero,
* tool_import_files, …) to show a live edit interface where the user fills in
* component values before the actual import is triggered. Because no real
* section_id exists yet, a sentinel value of 1 is used as a fake record identifier
* and `is_temporal: true` is set on each child component so that reads/writes go
* through matrix_temp_manager rather than the persistent database.
*
* Lifecycle (mirrors the standard Dédalo instance lifecycle):
*   init → build → (caller renders via service_tmp_section.edit) → get_components_data
*
* Main exports:
*   service_tmp_section — constructor / prototype chain
*
* Prototype methods delegated from common / render_edit_service_tmp_section:
*   render, destroy, refresh  (from common)
*   edit                      (from render_edit_service_tmp_section)
*/

// import
	import {get_instance} from '../../../common/js/instances.js'
	import {common} from '../../../common/js/common.js'
	import {render_edit_service_tmp_section} from './render_edit_service_tmp_section.js'



/**
* SERVICE_TMP_SECTION
* Constructor for the temporary-section service.
*
* All instance properties are seeded to null / a sentinel value here and
* fully populated during `init`. The constructor follows the same Dédalo
* convention used by every component and service: property declarations
* only, no logic.
*
* Notable properties:
*   ddo_map  {Array} — DDO descriptors for the child components that will be
*                      instantiated; injected via options.ddo_map in init().
*   caller   {Object} — The tool instance that owns this service; used to scope
*                       instance ids via id_variant so that multiple callers can
*                       run concurrently without key collisions in instances_map.
*/
export const service_tmp_section = function () {

	this.id					= null
	this.model				= null
	this.mode				= null
	this.node				= null
	this.ar_instances		= null
	this.status				= null
	this.events_tokens		= null
	this.type				= null
	this.caller				= null

	this.ddo_map			= null

	return true
}//end service_tmp_section



/**
* COMMON FUNCTIONS
* extend functions from common
*/
	// prototypes assign
	service_tmp_section.prototype.render	= common.prototype.render
	service_tmp_section.prototype.destroy	= common.prototype.destroy
	service_tmp_section.prototype.refresh	= common.prototype.refresh
	service_tmp_section.prototype.edit		= render_edit_service_tmp_section.prototype.edit



/**
* INIT
* Initialises the service instance.
*
* Delegates to common.prototype.init for standard property seeding (id, model,
* mode, lang, events_tokens, …), then extracts ddo_map from options so that
* build() can iterate over the component descriptors.
*
* @param {Object} options - Standard Dédalo init options bag
* @param {Array}  options.ddo_map - Array of DDO descriptor objects, each
*   describing one component to instantiate inside the temporary section.
*   Each descriptor must include at minimum: { model, mode, tipo,
*   section_tipo, type }.  Callers typically filter tool_config.ddo_map
*   by role (e.g. role==='input_component') before passing it here.
* @returns {Promise<boolean>} Resolves to the value returned by common.prototype.init
*/
service_tmp_section.prototype.init = async function(options) {

	const self = this

	// call the generic common init
		const common_init = await common.prototype.init.call(this, options);

	// fix
		self.ddo_map= options.ddo_map || []


	return common_init
}//end init



/**
* BUILD
* Instantiates, initialises, and builds all child components described by ddo_map.
*
* For each DDO descriptor in ddo_map, a real Dédalo component instance is created
* via get_instance() with two important overrides:
*
*   section_id : 1            — Sentinel fake record id. No database row with this
*                               id needs to exist; the temporal handler ignores it.
*   is_temporal: true         — Tells component_common to use matrix_temp_manager
*                               instead of the persistent matrix, so saves go to a
*                               temporary in-memory store rather than the database.
*   id_variant : self.model   — Namespaces the instance key in instances_map using
*                               the service's own model name, preventing id clashes
*                               when two tools each build the same component tipo.
*   caller     : self         — Sets the service as the parent caller so that the
*                               component can walk up the ownership chain.
*
* All component instantiations run in parallel via Promise.all. The resolved
* instances are stored in self.ar_instances for later rendering and data extraction.
*
* (!) build() must complete before calling edit() or get_components_data(). Callers
* should always await build() or build(true) (the boolean is the autoload flag
* forwarded to each component's own build call).
*
* @param {boolean} [autoload=false] - Accepted for API symmetry with the standard
*   Dédalo build contract but not currently forwarded; each child component's
*   build() is always called with true (autoload forced on).
* @returns {Promise<boolean>} Always resolves to true once all components are built.
*/
service_tmp_section.prototype.build = async function(autoload=false) {

	const self = this

	// status update
		self.status = 'building'

	const ddo_map			= self.ddo_map
	const ddo_map_length	= ddo_map.length
	const ar_promises		= []
	for (let i = 0; i < ddo_map_length; i++) {

		const el = ddo_map[i]

		ar_promises.push( new Promise(async (resolve) => {

			const element_options = {
				model			: el.model,
				mode			: el.mode,
				tipo			: el.tipo,
				section_tipo	: el.section_tipo,
				section_id		: 1, // Fake temporal section_id
				lang			: self.lang,
				type			: el.type,
				id_variant		: self.model,  // id_variant prevents id conflicts
				is_temporal		: true, // This sets the component to use the temporal data handler (matrix_temp_manager)
				caller			: self // set tool as caller of the component :-)
			}

			// init and build instance
				get_instance(element_options) // load and init
				.then(function(element_instance){
					element_instance.build(true) // build, loading data
					.then(function(){
						resolve(element_instance)
					})
				})
		}))
	}//end for (let i = 0; i < ddo_map.length; i++)

	// set on finish
		await Promise.all(ar_promises).then((ar_instances) => {
			self.ar_instances = ar_instances
		})

	// status update
		self.status = 'built'


	return true
}//end build_custom



/**
* GET_COMPONENTS_DATA
* Collects the current in-memory data object from every instantiated child component.
*
* Iterates self.ar_instances in reverse order and pushes each component's
* `.data` property (the temporal datum written by matrix_temp_manager) into
* the result array. The array is then passed to the server import action as
* `components_temp_data` so the PHP side knows which field values the user
* entered before triggering the import.
*
* (!) This method must be called only after build() has resolved. Calling it
* before build() will throw because self.ar_instances is null.
*
* (!) The iteration is deliberately reversed (i = length-1 downto 0). This
* mirrors the render order produced by render_tmp_components, which iterates
* forward — the reversal here preserves the logical "last-entered" priority
* should consumers de-duplicate by tipo. Flag: the reversal reason is not
* documented anywhere in the codebase; verify with the original author if the
* order ever causes unexpected import behaviour.
*
* @returns {Array} Array of component data objects, one per child instance.
*   Each element is the `.data` property of the component — its exact shape
*   depends on the component model (e.g. { value: [...] } for input_text).
*/
service_tmp_section.prototype.get_components_data = function() {

	const self = this

	const components_temp_data = []

	const ar_instances			= self.ar_instances
	const ar_instances_length	= ar_instances.length
	for (let i = ar_instances_length - 1; i >= 0; i--) {
		const current_instance = ar_instances[i]
		components_temp_data.push(current_instance.data)
	}

	return components_temp_data;
}//end get_components_data



// @license-end
