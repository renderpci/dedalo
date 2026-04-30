// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {common} from '../../common/js/common.js'
	import {component_common} from '../../component_common/js/component_common.js'
	import {event_manager} from '../../common/js/event_manager.js'
	import {render_edit_component_publication} from '../../component_publication/js/render_edit_component_publication.js'
	import {render_list_component_publication} from '../../component_publication/js/render_list_component_publication.js'
	import {render_search_component_publication} from '../../component_publication/js/render_search_component_publication.js'



export const component_publication = function(){

	this.id				= null

	// element properties declare
	this.model			= null
	this.tipo			= null
	this.section_tipo	= null
	this.section_id		= null
	this.mode			= null
	this.lang			= null

	this.section_lang	= null
	this.context		= null
	this.data			= null
	this.parent			= null
	this.node			= null
}//end component_publication



/**
* COMMON FUNCTIONS
* extend component functions from component common
*/
// prototypes assign
	component_publication.prototype.init				= component_common.prototype.init
	component_publication.prototype.build				= component_common.prototype.build
	component_publication.prototype.render				= common.prototype.render
	component_publication.prototype.destroy				= common.prototype.destroy
	component_publication.prototype.refresh				= common.prototype.refresh
	component_publication.prototype.save				= component_common.prototype.save
	component_publication.prototype.load_data			= component_common.prototype.load_data
	component_publication.prototype.get_value			= component_common.prototype.get_value
	component_publication.prototype.set_value			= component_common.prototype.set_value
	component_publication.prototype.update_data_value	= component_common.prototype.update_data_value
	component_publication.prototype.set_changed_data	= component_common.prototype.set_changed_data
	component_publication.prototype.update_datum		= component_common.prototype.update_datum
	component_publication.prototype.change_value		= component_common.prototype.change_value
	component_publication.prototype.build_rqo			= common.prototype.build_rqo

	// render
	component_publication.prototype.list				= render_list_component_publication.prototype.list
	component_publication.prototype.tm					= render_list_component_publication.prototype.list
	component_publication.prototype.search				= render_search_component_publication.prototype.search
	component_publication.prototype.edit				= render_edit_component_publication.prototype.edit

	component_publication.prototype.change_mode			= component_common.prototype.change_mode



/**
* CHANGE_HANDLER
* Manages the change event actions across edit and search views.
* @param object options
*  - value: the locator value to set
*  - action: 'update' or 'remove' (default: 'update')
*  - index: entry index for edit mode (default: 0)
* @return bool
*/
component_publication.prototype.change_handler = async function(options) {

	const self = this

	// options
		const value		= options.value
		const action	= options.action || 'update'
		const index		= options.index || 0

	// build changed_data based on mode
		const entries	= self.data.entries || []
		const changed_data = [Object.freeze({
			action	: action,
			id		: entries[index]?.id || null,
			value	: value
		})]

	if (self.mode==='search') {

		// update the instance data (previous to save)
		self.update_data_value(changed_data[0])

		// publish search. Event to update the DOM elements of the instance
		event_manager.publish('change_search_element', self)

	}else{

		// force to save on every change
		await self.change_value({
			changed_data	: changed_data,
			refresh			: false
		})

		// publish the publication locator value. (ex: used to change state of notes tag)
		event_manager.publish('change_publication_value_'+self.id_base, value)
	}


	return true
}//end change_handler



// @license-end
