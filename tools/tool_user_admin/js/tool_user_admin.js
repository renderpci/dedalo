// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL */
/*eslint no-undef: "error"*/



// import needed modules
	import * as instances from '../../../core/common/js/instances.js'
	import {common} from '../../../core/common/js/common.js'
	import {tool_common} from '../../tool_common/js/tool_common.js'
	import {render_tool_user_admin} from './render_tool_user_admin.js' // self tool rendered (called from render common)



/**
* TOOL_USER_ADMIN
* Tool to manage user auto change values like email or password
*/
export const tool_user_admin = function () {

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
}//end tool_user_admin



/**
* COMMON FUNCTIONS
* extend component functions from component common
*/
// prototypes assign
	tool_user_admin.prototype.render			= tool_common.prototype.render
	tool_user_admin.prototype.destroy			= common.prototype.destroy
	tool_user_admin.prototype.refresh			= common.prototype.refresh
	// others
	tool_user_admin.prototype.build_rqo_show	= common.prototype.build_rqo_show
	// render mode edit (default). Set the tool custom manager to build the DOM nodes view
	tool_user_admin.prototype.edit				= render_tool_user_admin.prototype.edit
	tool_user_admin.prototype.list				= render_tool_user_admin.prototype.edit



/**
* INIT
* Custom tool init
* @param object options
* @return bool
*/
tool_user_admin.prototype.init = async function(options) {

	const self = this

	// call the generic common tool init
		const common_init = await tool_common.prototype.init.call(this, options);

	// set the self specific vars not defined by the generic init (in tool_common)

	return common_init
}//end init



/**
* BUILD
* Custom tool build
* @param bool autoload = false
* @return bool
*/
tool_user_admin.prototype.build = async function(autoload=false) {

	const self = this

	// call generic common tool build
		const common_build = await tool_common.prototype.build.call(this, autoload);

	try {

		// demo user case in demo installation. Generates and exception and control will be passed to the catch block
		// Note that the server security controls already handle this situation for added security
			const dedalo_entity	= page_globals.dedalo_entity
			const username		= page_globals.username
			if (dedalo_entity==='dedalo_demo' && username==='dedalo') {
				throw('Tool not allowed. dedalo_entity "dedalo_demo" cannot change user dedalo configuration')
			}

		// specific actions.. like fix main_element for convenience
			self.user_section = await self.build_user_section()

	} catch (error) {
		self.error = error
		console.error(error)
	}


	return common_build
}//end build_custom



/**
* GET_DDO_MAP
* Builds the default ddo_map of users section to use in this tool
* @return array ddo_map
*/
tool_user_admin.prototype.get_ddo_map = function() {

	// section_tipo
	const section_tipo = 'dd128'

	const ddo_map = [
		// section id . read only (!)
		{
			tipo			: 'dd330', // section id . read only (!)
			type			: 'component',
			typo			: 'ddo',
			model			: 'component_section_id',
			section_tipo	: section_tipo,
			parent			: section_tipo,
			// label		: 'section_id',
			mode			: 'edit',
			properties		: {
				css:{},
				show_interface : {
					tools : false
				}
			},
			permissions		: 1
		},
		// username . read only (!)
		{
			tipo			: 'dd132',
			type			: 'component',
			typo			: 'ddo',
			model			: 'component_input_text',
			section_tipo	: section_tipo,
			parent			: section_tipo,
			// label		: 'User name',
			mode			: 'edit',
			properties		: {
				css:{},
				show_interface : {
					tools : false
				}
			},
			// view			: 'line',
			permissions		: 1
		},
		// user profile . read only (!)
		{
			tipo			: 'dd1725',
			type			: 'component',
			typo			: 'ddo',
			model			: 'component_select',
			section_tipo	: section_tipo,
			parent			: section_tipo,
			// label		: 'User profile',
			mode			: 'edit',
			properties		: {
				css:{},
				show_interface : {
					tools : false
				}
			},
			// view			: 'line',
			permissions		: 1
		},
		// user full name . editable
		{
			tipo			: 'dd452',
			type			: 'component',
			typo			: 'ddo',
			model			: 'component_input_text',
			section_tipo	: section_tipo,
			parent			: section_tipo,
			// label		: 'Full user name',
			mode			: 'edit',
			properties		: {
				css:{},
				show_interface : {
					tools : false
				}
			}
		},
		// password . editable
		{
			tipo			: 'dd133',
			type			: 'component',
			typo			: 'ddo',
			model			: 'component_password',
			section_tipo	: section_tipo,
			parent			: section_tipo,
			// label		: 'Password',
			mode			: 'edit',
			properties		: {
				css:{},
				show_interface : {
					tools : false
				}
			}
		},
		// email . editable
		{
			tipo			: 'dd134',
			type			: 'component',
			typo			: 'ddo',
			model			: 'component_email',
			section_tipo	: section_tipo,
			parent			: section_tipo,
			// label		: 'email',
			mode			: 'edit',
			properties		: {
				css:{},
				show_interface : {
					tools : false
				}
			}
		},
		// projects . read only (!)
		// {
		// 	tipo			: 'dd170',
		// 	type			: 'component',
		// 	typo			: 'ddo',
		// 	model			: 'component_filter_master',
		// 	section_tipo	: section_tipo,
		// 	parent			: section_tipo,
		// 	// label		: 'Project',
		// 	mode			: 'edit',
		// 	properties		: {css:{}},
		// 	permissions		: 1
		// },
		// user image . editable
		{
			tipo			: 'dd522',
			type			: 'component',
			typo			: 'ddo',
			model			: 'component_image',
			section_tipo	: section_tipo,
			parent			: section_tipo,
			// label		: 'User image',
			mode			: 'edit',
			properties		: {
				css:{},
				show_interface : {
					// allow necessary upload tool here
					tools : true
				}
			}
		}
	]


	return ddo_map
}//end get_ddo_map



/**
* BUILD_USER_SECTION
* Initiate a new custom section (dd128)
* Note that, for speed, is built only when render is called
* @return object section
*/
tool_user_admin.prototype.build_user_section = async function() {

	const self = this

	// short vars
		const section_tipo	= 'dd128' // self.section_tipo
		const section_id	= '' + page_globals.user_id

	// ddo_map. Note that this ddo_map overwrite the default section request_config show ddo_map (!)
		const ddo_map = self.get_ddo_map()

	// request_config
		const request_config = [{
			api_engine	: 'dedalo',
			type		: 'main',
			show		: {
				ddo_map : ddo_map
			}
		}]

	// context
		const instance_options = {
			type			: 'section',
			typo			: 'ddo',
			tipo			: section_tipo,
			section_tipo	: section_tipo,
			section_id		: section_id,
			lang			: page_globals.dedalo_data_nolan,
			mode			: 'edit',
			model			: 'section',
			add_show		: true,
			caller			: self,
			request_config	: request_config,
			id_variant		: section_tipo +'_'+ section_id + '_build_user_section'
		}

	const section = await instances.get_instance(instance_options)
		// filter search disallow
			section.filter = false
		// inspector disallow
			section.inspector = false


	return section
}//end build_user_section



/**
* ON_CLOSE_ACTIONS
* Executes specific action on close the tool
* @param string open_as
* 	modal | window
* @return promise: bool
*/
tool_user_admin.prototype.on_close_actions = async function(open_as) {

	const self = this

	if (open_as==='modal') {
		// self.caller.refresh() // never refresh caller (component_json)
		self.destroy(true, true, true)
	}

	return true
}//end on_close_actions



// @license-end
