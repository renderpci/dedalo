// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_TOOLS_URL */
/*eslint no-undef: "error"*/



/**
* TOOL_IMPORT_ZOTERO
* Constructor and prototype chain for the Zotero bibliographic-import tool.
*
* This module defines the tool_import_zotero constructor and wires its lifecycle
* methods (init, build, render, destroy, refresh, edit) so it integrates with
* Dédalo's tool subsystem (tool_common + common).
*
* Purpose:
*   Lets operators batch-import bibliographic records from Zotero (exported as
*   CSL-JSON) into the Dédalo Publications section (default: rsc205).  Files are
*   staged via service_dropzone; batch-level defaults are collected through
*   service_tmp_section (ddo_map entries with role 'input_component').  On
*   import the server PHP class maps each Zotero field to the configured Dédalo
*   component tipos (see tool_config.map / register.json dd1633).
*
* Workflow (client side):
*   1. init()  — delegates to tool_common init; computes key_dir from the caller.
*   2. build() — instantiates service_dropzone (file staging) and
*                service_tmp_section (batch-default input components).
*   3. render/edit — delegated to render_tool_import_zotero.prototype.edit,
*                which renders the dropzone, input fields, and the import button.
*
* Exported symbols:
*   tool_import_zotero — the constructor (pick up from index.js barrel)
*/


// import
	import {get_instance} from '../../../core/common/js/instances.js'
	import {common} from '../../../core/common/js/common.js'
	import {tool_common} from '../../../core/tools_common/js/tool_common.js'
	import {render_tool_import_zotero} from './render_tool_import_zotero.js'



/**
* TOOL_IMPORT_ZOTERO
* Constructor for the Zotero bibliographic-import tool instance.
*
* All properties are initialised to null (or empty defaults) here and populated
* by init() / build().  The tool follows the standard Dédalo tool pattern:
*   prototype lifecycle methods (init, build, render, …) are assigned below
*   from tool_common / common / render_tool_import_zotero so the constructor
*   body stays minimal.
*
* Instance properties:
*   @var {string|null}        id                Unique instance identifier (set by tool_common.init)
*   @var {string|null}        model             Model name: 'tool_import_zotero'
*   @var {string|null}        mode              Render mode: always 'edit' for this tool
*   @var {HTMLElement|null}   node              Root DOM node (populated during render)
*   @var {Array|null}         ar_instances      Child component instances managed by this tool
*   @var {string|null}        status            Lifecycle status ('init', 'build', …)
*   @var {Array|null}         events_tokens     Event listener tokens for cleanup on destroy
*   @var {string|null}        type              Tool type identifier (from tool_common)
*   @var {string|null}        source_lang       Source language (unused in this tool, inherited slot)
*   @var {string|null}        target_lang       Target language (unused in this tool, inherited slot)
*   @var {Array|null}         langs             Available languages (unused in this tool)
*   @var {Object|null}        caller            The component or section instance that launched the tool
*   @var {string|null}        key_dir           Temp-upload directory key: '<caller.tipo>_<caller.section_tipo>'
*   @var {string|null}        tool_contanier    (!) Typo for 'tool_container' — do not rename (kept for compat)
*   @var {Array}              files_data        Dropzone file objects accumulated during the session
*   @var {Object|null}        service_dropzone  service_dropzone instance managing file staging
*   @var {Object|null}        service_tmp_section service_tmp_section instance for batch-default fields
*/
export const tool_import_zotero = function () {

	this.id						= null
	this.model					= null
	this.mode					= null
	this.node					= null
	this.ar_instances			= null
	this.status					= null
	this.events_tokens			= null
	this.type					= null
	this.source_lang			= null
	this.target_lang			= null
	this.langs					= null
	this.caller					= null
	this.key_dir				= null
	this.tool_contanier			= null
	this.files_data				= []

	// services
	this.service_dropzone		= null
	this.service_tmp_section	= null
}//end tool_import_zotero



/**
* COMMON FUNCTIONS
* extend component functions from component common
*/
// prototypes assign
	tool_import_zotero.prototype.render		= tool_common.prototype.render
	tool_import_zotero.prototype.destroy	= common.prototype.destroy
	tool_import_zotero.prototype.refresh	= common.prototype.refresh
	tool_import_zotero.prototype.edit		= render_tool_import_zotero.prototype.edit



/**
* INIT
* Custom tool initialiser.
*
* Delegates to tool_common.prototype.init to seed all standard tool properties
* from `options`, then sets key_dir — the composite upload-directory key that
* uniquely identifies the caller's staging area on the server.
*
* key_dir format: '<caller.tipo>_<caller.section_tipo>'
* (e.g. 'rsc349_rsc205')  — used by service_dropzone and later passed inside
* the rqo.options.key_dir field so the server can locate staged files.
*
* @param {Object} options - Tool initialisation options forwarded from instances.js
* @returns {Promise<boolean>} Resolves to the result of tool_common.prototype.init
*/
tool_import_zotero.prototype.init = async function(options) {

	const self = this

	// call the generic common tool init
		const common_init = await tool_common.prototype.init.call(this, options);

	// upload_manager_init
		self.key_dir = self.caller.tipo + '_' + self.caller.section_tipo


	return common_init
}//end init



/**
* BUILD
* Custom tool build.
*
* Calls tool_common.prototype.build with a no-op load_ddo_map override so the
* generic build step does NOT attempt to resolve the full ddo_map (which would
* instantiate all DDO entries, including those not relevant here).  Only the
* ddo_map entries with role === 'input_component' are resolved — they are passed
* directly to service_tmp_section.
*
* Two services are built in sequence:
*
*   service_dropzone
*     Handles file staging (Zotero JSON + optional companion PDFs).
*     Receives allowed_extensions from self.allowed_extensions (usually set in
*     tool_config); component_option and file_processor are null for this tool
*     because file type routing is done server-side by the PHP import logic.
*
*   service_tmp_section
*     Renders one lightweight "virtual" section whose components correspond to
*     the ddo_map entries with role === 'input_component'.  These provide
*     batch-level default values (e.g. project, language) that are collected at
*     import time via get_components_data() and forwarded to the API as
*     components_temp_data.
*
* (!) Note that common build resolve all components inside 'self.tool_config.ddo_map' and
* here we do not want this, but only with role 'input_component' and with tmp section_id
*
* Any error thrown during service instantiation is stored in self.error and
* logged; the render step checks self.error and shows an error UI if set.
*
* @param {boolean} [autoload=false] - When true, tool_common.build also triggers
*   a data fetch after building instances; passed through unchanged.
* @returns {Promise<boolean>} Resolves to the result of tool_common.prototype.build
*/
tool_import_zotero.prototype.build = async function(autoload=false) {

	const self = this

	// common_build. call generic common tool build
		const common_build = await tool_common.prototype.build.call(this, autoload, {
			load_ddo_map : () => { return []} // prevents to auto load ddo_map
		});

	try {

		// service_dropzone
			self.service_dropzone = await get_instance({
				model 				: 'service_dropzone',
				mode 				: 'edit',
				caller 				: self,
				allowed_extensions	: self.allowed_extensions || [],
				key_dir				: self.key_dir,
				component_option	: null,
				file_processor		: null
			})
			await self.service_dropzone.build()

		// Service tmp_section
			self.service_tmp_section = await get_instance({
				model	: 'service_tmp_section',
				mode	: 'edit',
				caller	: self,
				// only ddo_map entries marked as 'input_component' feed the tmp section;
				// other roles (e.g. 'component_option', 'main') are handled server-side
				ddo_map	: self.tool_config.ddo_map.filter(el => el.role==='input_component')
			})
			await self.service_tmp_section.build()

	} catch (error) {
		self.error = error
		console.error(error)
	}


	return common_build
}//end build



// @license-end
