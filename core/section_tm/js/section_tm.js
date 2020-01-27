/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {event_manager} from '../../common/js/event_manager.js'
	import {data_manager} from '../../common/js/data_manager.js'
	import * as instances from '../../common/js/instances.js'
	import {common,create_source} from '../../common/js/common.js'
	import {paginator} from '../../search/js/paginator.js'
	import {search} from '../../search/js/search.js'
	import {inspector} from '../../inspector/js/inspector.js'
	import {ui} from '../../common/js/ui.js'
	import {render_section_tm} from './render_section_tm.js'



/**
* SECTION
*/
export const section_tm = function() {

	this.id

	// element properties declare
	this.model
	this.type
	this.tipo
	this.section_tipo
	this.section_id
	this.mode
	this.lang

	this.datum
	this.context
	this.data

	this.ar_section_id

	this.node
	this.ar_instances

	this.status
	this.paginator

	return true
}//end section_tm




