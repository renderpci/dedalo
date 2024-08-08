// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// import
	import {get_instance} from '../../../core/common/js/instances.js'
	import {common} from '../../../core/common/js/common.js'
	import {tool_common} from '../../tool_common/js/tool_common.js'
	import {render_tool_numisdata_order_coins} from './render_tool_numisdata_order_coins.js'



/**
* TOOL_NUMISDATA_ORDER_COINS
* Tool to translate contents from one language to other in any text component
*/
export const tool_numisdata_order_coins = function () {

	this.id							= null
	this.model						= null
	this.mode						= null
	this.node						= null
	this.ar_instances				= null
	this.status						= null
	this.events_tokens				= []
	this.type						= null
	this.source_lang				= null
	this.target_lang				= null
	this.langs						= null
	this.caller						= null
	this.media_component			= null // component av that will be transcribed (it could be the caller)
	this.epigraphy	= null // component text area where we are working into the tool
	this.relation_list				= null // datum of relation_list (to obtaim list of top_section_tipo/id)

	return true
}//end page



/**
* COMMON FUNCTIONS
* extend component functions from component common
*/
// prototypes assign
	tool_numisdata_order_coins.prototype.render		= tool_common.prototype.render
	tool_numisdata_order_coins.prototype.destroy	= common.prototype.destroy
	tool_numisdata_order_coins.prototype.refresh	= common.prototype.refresh
	tool_numisdata_order_coins.prototype.edit		= render_tool_numisdata_order_coins.prototype.edit



/**
* INIT
*/
tool_numisdata_order_coins.prototype.init = async function(options) {

	const self = this

	// call the generic common tool init
		const common_init = await tool_common.prototype.init.call(this, options);

	try {

		// set the self specific vars not defined by the generic init (in tool_common)
			self.langs			= page_globals.dedalo_projects_default_langs
			self.source_lang	= self.caller && self.caller.lang
				? self.caller.lang
				: null
			self.target_lang	= null

	} catch (error) {
		self.error = error
		console.error(error)
	}


	return common_init
}//end init



/**
* BUILD
*/
tool_numisdata_order_coins.prototype.build = async function(autoload=false) {

	const self = this

	// call generic common tool build
		const common_build = await tool_common.prototype.build.call(this, autoload);

	try {
		const roles = [
			'coins',
			'ordered_coins',
		];
		const roles_length = roles.length
		for (let i = 0; i < roles_length; i++) {
			const role = roles[i]

			// fix media_component for convenience
			const ddo = self.tool_config.ddo_map.find(el => el.role===role)
			if (!ddo) {
				console.warn(`Warning: \n\tThe role '${role}' it's not defined in Ontology and will be ignored`);
				continue;
			}
			self[role] = self.ar_instances.find(el => el.tipo===ddo.tipo)

			if(role === 'ordered_coins'){
				// add events to assign drop event when the portal change or external window close
				self.ordered_coins.events_tokens.push(
					event_manager.subscribe('window_bur_'+ self.ordered_coins.id, assing_drop)
				)
				self.ordered_coins.events_tokens.push(
					event_manager.subscribe('add_row_'+ self.ordered_coins.id, assing_drop)
				)

				function assing_drop(options) {

					render_tool_numisdata_order_coins.prototype.drop({
						self : self
					})
				}
			}
		}

		// relation_list. load_relation_list. Get the relation list.
			// This is used to build a select element to allow
			// user select the top_section_tipo and top_section_id of current transcription
			// self.relation_list = await self.load_relation_list()

	} catch (error) {
		self.error = error
		console.error(error)
	}


	return common_build
}//end build_custom



/**
* ASSIGN_ELEMENT
* Set the original and copy properties to discard component
* @param locator object
* @param ar_copies array of nodes
* @return change object api_response
*/
tool_numisdata_order_coins.prototype.assign_element = function(options){

	const self = this

	const locator	= options.locator
	const caller	= options.caller

	const changed_data = [{
		action	: 'insert',
		value	: locator
	}]
	// change_value (save data)
	const change =  caller.change_value({
		changed_data	: changed_data,
		refresh			: false
	})

	return change
}//end assign_element



/**
* SET_ORIGINAL_COPY
* Set the original and copy properties to discard component
* @param ar_original array of nodes
* @param ar_copies array of nodes
* @return object instance
*/
tool_numisdata_order_coins.prototype.set_original_copy = async function(options) {

	const self = this

	const ar_original	= options.ar_original
	const ar_copies		= options.ar_copies
	const discard_context	= self.coins.datum.context.find(item => item.tipo === 'numisdata157')

	const discard_options	= {
			model			: discard_context.model,
			mode			: discard_context.mode,
			tipo			: discard_context.tipo,
			section_tipo	: discard_context.section_tipo,
			lang			: discard_context.lang,
			section_lang	: discard_context.section_lang,
			type			: discard_context.type,
			context 		: discard_context
		}

	const ar_original_len	= ar_original.length
	for (let i = ar_original_len - 1; i >= 0; i--) {
		const original_node		= ar_original[i]
		const section_id		= original_node.section_id

		// discard
			discard_options.section_id	= section_id
			const discard_instance		= await get_instance(discard_options)
			await discard_instance.build(false)
			// force to save current input if changed
			const changed_data = [{
				action	: 'update',
				key		: 0,
				value	: {section_id: '1', section_tipo: 'numisdata341'}
			}]
			// change_value (save data)
			discard_instance.change_value({
				changed_data	: changed_data,
				refresh			: false
			})

		// reset node
			original_node.checked = false
			original_node.label.classList.add('label_original')

		// equivalents
			const equivalents_instance	= await get_instance({
				model			: 'component_relation_related',
				mode			: 'edit',
				tipo			: 'numisdata55',
				section_tipo	: discard_context.section_tipo,
				section_id		: section_id,
				lang			: 'lg_nolan',
				section_lang	: discard_context.section_lang,
				type			: discard_context.type,

			})
			await equivalents_instance.build(true)
			// force to save current input if changed
			const copy_values = ar_copies.map((el) =>
				({section_id:el.section_id, section_tipo: discard_context.section_tipo})
			)

			const equivalents_changed_data = [{
				action	: 'set_data',
				value	: copy_values
			}]
			// change_value (save data)
			equivalents_instance.change_value({
				changed_data	: equivalents_changed_data,
				refresh			: false
			})
	}//end for (let i = ar_original_len - 1; i >= 0; i--)


	const ar_copies_len	= ar_copies.length
	for (let i = ar_copies_len - 1; i >= 0; i--) {
		const copy_node		= ar_copies[i]
		const section_id	= copy_node.section_id

		// discard
			discard_options.section_id	= section_id
			const discard_instance		= await get_instance(discard_options)
			await discard_instance.build(false)
			// force to save current input if changed
			const changed_data = [{
				action	: 'update',
				key		: 0,
				value	: {section_id: '2', section_tipo: 'numisdata341'}
			}]
			// change_value (save data)
			discard_instance.change_value({
				changed_data	: changed_data,
				refresh			: false
			})

		// reset node
			copy_node.checked = false
			copy_node.label.classList.add('label_copy')
	}//end for (let i = ar_original_len - 1; i >= 0; i--)

	return true
}//end set_original_copy



// @license-end
