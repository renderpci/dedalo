// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL */
/*eslint no-undef: "error"*/



/**
* component_3d
*
* Client-side constructor and own-prototype methods for the 3D media component.
* Handles upload post-processing (posterframe creation and deletion) for 3D
* model files (GLB, GLTF, OBJ, …) displayed via the Three.js-based viewer.
*
* Lifecycle, build, save, render, and search methods are all inherited from
* component_common / common via prototype assignment (see "COMMON FUNCTIONS"
* block below).  The only logic that lives here is 3D-specific: generating
* and removing the static preview image (posterframe) that is shown in list
* views before the interactive viewer is initialised.
*
* Posterframe workflow (upload path):
*   1. After a 3D file is uploaded the upload widget calls upload_handler().
*   2. upload_handler() fires create_posterframe() immediately if the Three.js
*      viewer is already mounted, or defers via the 'viewer_ready_<id>' event
*      (published by view_default_edit_3d once the scene is rendered).
*   3. create_posterframe() calls viewer.get_image() to capture a 720×404 JPEG
*      blob, uploads it to the tmp directory via service_upload, then asks the
*      PHP API (dd_component_3d_api / move_file_to_dir) to move it into the
*      permanent posterframe directory for this record.
*   4. delete_posterframe() calls the PHP API (dd_component_3d_api /
*      delete_posterframe) to remove the persisted file from disk.
*
* Exports: {component_3d}
*
* @module component_3d
*/

// imports
	import {dd_console} from '../../common/js/utils/index.js'
	import {data_manager} from '../../common/js/data_manager.js'
	import {event_manager} from '../../common/js/event_manager.js'
	import {common, create_source} from '../../common/js/common.js'
	import {component_common} from '../../component_common/js/component_common.js'
	import {upload} from '../../services/service_upload/js/service_upload.js'
	import {render_edit_component_3d} from '../../component_3d/js/render_edit_component_3d.js'
	import {render_list_component_3d} from '../../component_3d/js/render_list_component_3d.js'
	import {render_search_component_3d} from '../../component_3d/js/render_search_component_3d.js'



	// Note about event_manager
	// the component_3d is configured by properties in the ontology,
	// it has subscribed to some events that comes defined in properties as: key_up_f2, key_up_esc, click_tag_tc
	// the events need to be linked to specific text_area and it's defined in ontology.



/**
* COMPONENT_3D
* Constructor for the 3D media component instance.
*
* All properties are intentionally left undefined here; they are set by
* component_common.prototype.init() (called during the init lifecycle step)
* via the options object that the page bootstrapper passes in.
*
* Key instance properties populated at init time:
* @var {string}          id           - Unique instance identifier (tipo_sectiontipo_sectionid_mode_lang).
* @var {string}          model        - Component model name, e.g. 'component_3d'.
* @var {string}          tipo         - Ontology tipo of this component, e.g. 'dd732'.
* @var {string}          section_tipo - Ontology tipo of the parent section, e.g. 'oh1'.
* @var {number|string}   section_id   - Record identifier of the parent section row.
* @var {string}          mode         - Current rendering mode: 'edit' | 'list' | 'search' | 'tm'.
* @var {string}          lang         - Active UI language code, e.g. 'lg-nolan'.
* @var {string}          section_lang - Language of the section (may differ from UI lang).
* @var {Object}          context      - Server context object (structure metadata, features, view).
* @var {Object}          data         - Server data object (entries array with file_info records).
* @var {Object}          parent       - Parent instance (section or tool that owns this component).
* @var {HTMLElement}     node         - Root DOM node managed by this instance.
* @var {Array}           tools        - Tool instances attached to this component.
* @var {HTMLVideoElement|null} video  - Video element reference (unused for 3D; kept for interface parity).
* @var {string}          quality      - Currently selected quality level, e.g. 'high', 'low'.
* @var {DocumentFragment} fragment   - Temporary DOM fragment used during rendering.
*/
export const component_3d = function(){

	this.id

	// element properties declare
	this.model
	this.tipo
	this.section_tipo
	this.section_id
	this.mode
	this.lang

	this.section_lang
	this.context
	this.data
	this.parent
	this.node

	this.tools
	this.video
	this.quality

	this.fragment
}//end  component_3d



/**
* COMMON FUNCTIONS
* extend component functions from component common
*/
// prototypes assign
	// lifecycle
	component_3d.prototype.init					= component_common.prototype.init
	component_3d.prototype.build				= component_common.prototype.build
	component_3d.prototype.render				= common.prototype.render
	component_3d.prototype.refresh				= common.prototype.refresh
	component_3d.prototype.destroy				= common.prototype.destroy

	// change data
	component_3d.prototype.save					= component_common.prototype.save
	component_3d.prototype.update_data_value	= component_common.prototype.update_data_value
	component_3d.prototype.update_datum			= component_common.prototype.update_datum
	component_3d.prototype.change_value			= component_common.prototype.change_value
	component_3d.prototype.set_changed_data		= component_common.prototype.set_changed_data
	component_3d.prototype.build_rqo			= common.prototype.build_rqo

	// render
	component_3d.prototype.list					= render_list_component_3d.prototype.list
	component_3d.prototype.tm					= render_list_component_3d.prototype.list
	component_3d.prototype.edit					= render_edit_component_3d.prototype.edit
	component_3d.prototype.search				= render_search_component_3d.prototype.search

	component_3d.prototype.change_mode			= component_common.prototype.change_mode



/**
* UPLOAD_HANDLER
* Post-upload hook called by the upload widget after a 3D file has been
* transferred to the server.  Its sole responsibility is to ensure a
* posterframe (static preview JPEG) is created from the current 3D scene.
*
* Two cases are handled:
* - Viewer already mounted: create_posterframe() is called immediately because
*   self.viewer is available (set by view_default_edit_3d after Three.js init).
* - Viewer not yet ready: a one-shot subscription to 'viewer_ready_<id>' is
*   registered.  view_default_edit_3d publishes this event once the scene is
*   fully rendered, providing the viewer instance as the event payload.
*
* The subscription token is pushed onto self.events_tokens so that
* component_common.prototype.destroy() can clean it up when the instance
* is torn down.
*
* @returns {void}
*/
component_3d.prototype.upload_handler = async function() {

	const self = this

	// create posterframe from client side
	if (self.viewer) {
		// component is rendered and 3D viewer is already set
		self.create_posterframe()
	}else{
		// wait for viewer is ready
		const viewer_ready_handler = (viewer) => {
			self.create_posterframe(viewer)
		}
		self.events_tokens.push(
			event_manager.subscribe('viewer_ready_'+self.id, viewer_ready_handler)
		)
	}
}//end upload_handler



/**
* CREATE_POSTERFRAME
* Captures the current 3D scene view as a JPEG image and stores it as the
* posterframe for this component record.  The posterframe is used in list
* views (view_default_list_3d, view_mini_list_3d) as a static thumbnail so
* that the full Three.js viewer is not initialised unnecessarily.
*
* Steps performed:
*   1. Resolve the viewer instance (parameter takes precedence over self.viewer).
*   2. Capture a 720×404 JPEG blob via viewer.get_image().
*   3. Assign a canonical filename (<tipo>_<section_tipo>_<section_id>.jpg) to
*      the blob so the upload service stores it under the right name.
*   4. Upload the blob to the server tmp directory via service_upload
*      (resource_type '3d', allowed extension 'jpg').
*   5. Fix the filename in file_data returned by the upload to guard against
*      chunk-mode renaming.
*   6. Call the PHP API action 'move_file_to_dir' on dd_component_3d_api to
*      move the tmp file into the permanent 'posterframe' directory for this
*      section/component.
*
* Side effect: on success the posterframe file on disk is overwritten.
*
* (!) SHOW_DEVELOPER is used for the developer-level log at lines 183/221 but
*     is NOT declared in the global-pragma comment at the top of this file.
*     It is a page-global set in environment.js.php and referenced without
*     declaration — an eslint no-undef violation; add SHOW_DEVELOPER to the
*     file-level global pragma to silence the lint error.
*
* @param {Object} [viewer] - Three.js viewer instance returned by viewer.js.
*   If omitted, falls back to self.viewer set during edit-mode rendering.
* @returns {Promise<boolean>} true when the posterframe was moved to its
*   permanent location; false if the viewer is missing, the blob capture
*   fails, the upload fails, or the API move call fails.
*/
component_3d.prototype.create_posterframe = async function( viewer ) {

	const self = this

	// fallback to fixed self.viewer
		viewer = viewer || self.viewer
		if (!viewer) {
			console.error('Error getting viewer. 3D viewer is not set');
			return false
		}

	// image_blob
		const image_blob = await viewer.get_image({
			width	: 720,
			height	: 404
		})
		image_blob.name = self.tipo +'_'+ self.section_tipo +'_'+ self.section_id +'.jpg' // added name to the tmp file

	// debug
		if(SHOW_DEBUG===true) {
			console.log('3d create_posterframe image_blob:', image_blob);
		}

	// upload file (using service_upload)
		// upload file as another images to tmp directory
		const api_response = await upload({
			id					: self.id,
			file				: image_blob, // binary data as file
			resource_type		: '3d', // target dir
			allowed_extensions	: ['jpg'],
			key_dir				: '3d',
			max_size_bytes		: image_blob.size
		})
		if (!api_response.result) {
			console.error("Error on upload api_response:", api_response);
			return false
		}
		// file_data set
		const file_data = api_response.file_data
		// force to name as image_blob.name to prevent chunk mode issues
		file_data.name = image_blob.name

	// debug
		if(SHOW_DEBUG===true) {
			console.log('3d file_data (on upload finish):', file_data);
		}

	// move_file_to_dir
		const rqo = {
			dd_api	: 'dd_component_3d_api',
			action	: 'move_file_to_dir',
			source	: create_source(self),
			options	: {
				target_dir	: 'posterframe',
				file_data	: file_data
			}
		}

	// call to the API, fetch data and get response
		const move_api_response = await data_manager.request({
			body : rqo,
			retries : 1, // one try only
			timeout : 3600 * 1000 // 1 hour waiting response
		})

	// debug
		if(SHOW_DEVELOPER===true) {
			dd_console("-> upload_blob API response:",'DEBUG', move_api_response);
		}

	// result (boolean)
		const result = move_api_response.result


	return result
}//end create_posterframe



/**
* DELETE_POSTERFRAME
* Asks the PHP API to delete the posterframe file for this component record
* from disk.  Called when the user removes the 3D model or explicitly
* triggers a posterframe reset from the edit toolbar.
*
* The RQO (request-query-object) dispatched to dd_component_3d_api carries
* no file-specific options; the server resolves the target path from the
* component's section_tipo / section_id / tipo via create_source(self).
*
* (!) SHOW_DEVELOPER is referenced here (and in create_posterframe) but is
*     absent from the file-level global pragma — see note in the
*     create_posterframe doc-block above.
*
* @returns {Promise<boolean>} true if the PHP API confirms the file was
*   deleted; false on error or when the file did not exist.
*/
component_3d.prototype.delete_posterframe = async function() {

	const self = this

	// move_file_to_dir
		const rqo = {
			dd_api	: 'dd_component_3d_api',
			action	: 'delete_posterframe',
			source	: create_source(self),
			options	: {}
		}

	// call to the API, fetch data and get response
		const api_response = await data_manager.request({
			body : rqo,
			retries : 1, // one try only
			timeout : 3600 * 1000 // 1 hour waiting response
		})

	// debug
		if(SHOW_DEVELOPER===true) {
			dd_console("-> delete_posterframe API response:",'DEBUG', api_response);
		}


	return api_response.result
}//end delete_posterframe



// @license-end
