/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL, DD_TIPOS */
/*eslint no-undef: "error"*/



// import needed modules
	import {clone} from '../../../core/common/js/utils/index.js'
	import {data_manager} from '../../../core/common/js/data_manager.js'
	// import {get_instance, delete_instance} from '../../../core/common/js/instances.js'
	import {common, create_source} from '../../../core/common/js/common.js'
	// import {ui} from '../../../core/common/js/ui.js'
	import {tool_common} from '../../tool_common/js/tool_common.js'
	import {render_tool_user_admin} from './render_tool_user_admin.js' // self tool rendered (called from render common)



/**
* tool_user_admin
* Tool to make interesting things
*/
export const tool_user_admin = function () {

	this.id				= null
	this.model			= null
	this.mode			= null
	this.node			= null
	this.ar_instances	= null
	this.events_tokens	= null
	this.status			= null
	this.main_component	= null
	this.type			= null
	this.source_lang	= null
	this.target_lang	= null
	this.langs			= null
	this.caller			= null


	return true
};//end page



/**
* COMMON FUNCTIONS
* extend component functions from component common
*/
// prototypes assign
	// render : using common render entry point
	tool_user_admin.prototype.render			= common.prototype.render
	// destroy : using common destroy method
	tool_user_admin.prototype.destroy			= common.prototype.destroy
	// refresh : using common refresh method
	tool_user_admin.prototype.refresh			= common.prototype.refresh
	// others
	tool_user_admin.prototype.build_rqo_show	= common.prototype.build_rqo_show
	// render mode edit (default). Set the tool custom manager to build the DOM nodes view
	tool_user_admin.prototype.list				= render_tool_user_admin.prototype.edit



/**
* INIT
* Custom tool init
*/
tool_user_admin.prototype.init = async function(options) {

	const self = this

	// call the generic common tool init
		const common_init = tool_common.prototype.init.call(this, options);

	// set the self specific vars not defined by the generic init (in tool_common)



	return common_init
};//end init



/**
* BUILD
* Custom tool build
*/
tool_user_admin.prototype.build = async function(autoload=false) {

	const self = this

	// call generic common tool build
		const common_build = await tool_common.prototype.build.call(this, autoload);


	// specific actions.. like fix main_component for convenience
		const context = self.build_context()
		// const generate_rqo = async function(){
		// 	// rqo_config. get the rqo_config from context
		// 	const rqo_config	= context.request_config
		// 		? context.request_config.find(el => el.api_engine==='dedalo')
		// 		: {}

		// 	// rqo build
		// 	const action	= 'search'
		// 	const add_show	= true
		// 	const rqo = await self.build_rqo_show(rqo_config, action, add_show)

		// 	// source (overwrite default created from tool instead section)
		// 		rqo.source.model		= context.model
		// 		rqo.source.tipo			= context.tipo
		// 		rqo.source.section_tipo	= context.section_tipo
		// 		rqo.source.section_id	= context.section_id

		// 	return rqo
		// }
		// const rqo = await generate_rqo()
		// console.log("rqo:",rqo);
		// const api_response = await data_manager.prototype.request({body:rqo})
		// console.log("api_response:",api_response);
		// self.section_data		= api_response.result.data
		// self.section_context	= api_response.result.context

	return common_build
};//end build_custom



/**
* GET_DDO_MAP
* @return array ddo_map
*/
tool_user_admin.prototype.get_ddo_map = function() {

	// section_tipo from environment DD_TIPOS
	const section_tipo = DD_TIPOS.DEDALO_SECTION_USERS_TIPO

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
			permissions		: 1
		},
		// user profile . read only (!)
		{
			tipo			: DD_TIPOS.DEDALO_USER_PROFILE_TIPO,
			type			: 'component',
			typo			: 'ddo',
			model			: 'component_select',
			section_tipo	: section_tipo,
			parent			: section_tipo,
			// label		: 'User profile',
			mode			: 'edit',
			permissions		: 1
		},
		// username . read only (!)
		{
			tipo			: DD_TIPOS.DEDALO_USER_NAME_TIPO,
			type			: 'component',
			typo			: 'ddo',
			model			: 'component_input_text',
			section_tipo	: section_tipo,
			parent			: section_tipo,
			// label		: 'User name',
			mode			: 'edit',
			permissions		: 1
		},
		// password . editable
		{
			tipo			: DD_TIPOS.DEDALO_USER_PASSWORD_TIPO,
			type			: 'component',
			typo			: 'ddo',
			model			: 'component_password',
			section_tipo	: section_tipo,
			parent			: section_tipo,
			// label		: 'Password',
			mode			: 'edit'
		},
		// user full name . editable
		{
			tipo			: DD_TIPOS.DEDALO_FULL_USER_NAME_TIPO,
			type			: 'component',
			typo			: 'ddo',
			model			: 'component_input_text',
			section_tipo	: section_tipo,
			parent			: section_tipo,
			// label		: 'Full user name',
			mode			: 'edit'
		},
		// email . editable
		{
			tipo			: DD_TIPOS.DEDALO_USER_EMAIL_TIPO,
			type			: 'component',
			typo			: 'ddo',
			model			: 'component_email',
			section_tipo	: section_tipo,
			parent			: section_tipo,
			// label		: 'email',
			mode			: 'edit'
		},
		// projects . read only (!)
		{
			tipo			: DD_TIPOS.DEDALO_FILTER_MASTER_TIPO,
			type			: 'component',
			typo			: 'ddo',
			model			: 'component_filter_master',
			section_tipo	: section_tipo,
			parent			: section_tipo,
			// label		: 'Project',
			mode			: 'edit',
			permissions		: 1
		},
		// user image . editable
		{
			tipo			: DD_TIPOS.DEDALO_USER_IMAGE_TIPO,
			type			: 'component',
			typo			: 'ddo',
			model			: 'component_image',
			section_tipo	: section_tipo,
			parent			: section_tipo,
			// label		: 'User image',
			mode			: 'edit'
		}
	]

	return ddo_map
};//end get_ddo_map



/**
* BUILD_CONTEXT
* Build a new custom request config based on caller requirements
*/
tool_user_admin.prototype.build_context = function() {

	const self = this

	// short vars
		const section_tipo	= DD_TIPOS.DEDALO_SECTION_USERS_TIPO // self.section_tipo
		const section_id	= page_globals.user_id

	// sample
		// ['tipo' => 'dd330',						'permissions' => 1],	// section id . read only (!)
		// ['tipo' => DEDALO_USER_PROFILE_TIPO, 	'permissions' => 1],	// user profile . read only (!)
		// ['tipo' => DEDALO_USER_NAME_TIPO, 		'permissions' => 1],	// username . read only (!)
		// ['tipo' => DEDALO_USER_PASSWORD_TIPO, 	'permissions' => 2],	// password
		// ['tipo' => DEDALO_FULL_USER_NAME_TIPO, 	'permissions' => 2],	// user full name
		// ['tipo' => DEDALO_USER_EMAIL_TIPO, 		'permissions' => 2],	// email
		// ['tipo' => DEDALO_FILTER_MASTER_TIPO,	'permissions' => 1],	// projects . read only (!)
		// ['tipo' => DEDALO_USER_IMAGE_TIPO, 		'permissions' => 2]		// user image

	// ddo_map. Note that this ddo_map overwrite the default section request_config show ddo_map (!)
		const ddo_map = self.get_ddo_map()

	// filter_by_locators
		const filter_by_locators = [{
			section_tipo	: section_tipo,
			section_id		: section_id,
			lang			: page_globals.dedalo_data_nolan // (!) used only in time machine to filter by column lang
		}]

	// sqo
		const sqo = {
			id					: 'tmp',
			mode				: 'edit',
			section_tipo		: [{tipo:section_tipo}],
			filter_by_locators	: filter_by_locators,
			limit				: 1,
			offset				: 0
		}

	// request_config
		const request_config = [{
			api_engine	: 'dedalo',
			// source		: source,
			sqo			: sqo,
			show		: {
				ddo_map : ddo_map
			}
		}]

	// context
		const context = {
			type			: 'section',
			typo			: 'ddo',
			tipo			: section_tipo,
			section_tipo	: section_tipo,
			lang			: page_globals.dedalo_data_nolan,
			mode			: 'edit',
			model			: 'section',
			parent			: section_tipo,
			request_config	: request_config
		}
		console.log("tool_user_admin build_context context:",context);

	return context
};//end build_context



/**
* LOAD_COMPONENT_SAMPLE
*/
tool_user_admin.prototype.load_component_sample = async function(lang) {

	const self = this

	// context (clone and edit)
		const context = Object.assign(clone(self.main_component.context),{
			lang		: lang,
			mode		: 'edit',
			section_id	: self.main_component.section_id
		})

	// options
		const options = {
			context : context
		}

	// call generic common tool build
		const component_instance = tool_common.prototype.load_component.call(self, options);


	return component_instance
};//end load_component_sample


