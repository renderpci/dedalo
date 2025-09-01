// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, SHOW_DEBUG, DEDALO_CORE_URL, DEDALO_API_URL */
/*eslint no-undef: "error"*/



// import
	import {get_instance} from '../../../common/js/instances.js'
	import {common} from '../../../common/js/common.js'
	import {render_edit_service_tmp_section} from './render_edit_service_tmp_section.js'



/**
* SERVICE_TMP_SECTION
* Common service to manage basic upload files
* It is used by tools like 'service_tmp_section', 'tool_import' and more
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
* @param object options
* @return bool common_init
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
* @param bool autoload = false
* @return bool
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
				section_id		: 'tmp',
				lang			: self.lang,
				type			: el.type,
				id_variant		: self.model,  // id_variant prevents id conflicts
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
* @return array components_temp_data
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
