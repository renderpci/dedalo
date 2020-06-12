// imports
	import {common} from '../../common/js/common.js'
	import {component_common} from '../../component_common/js/component_common.js'
	import {render_component_iri} from '../../component_iri/js/render_component_iri.js'



export const component_iri = function(){


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

	return true
}//end component_iri



/**
* COMMON FUNCTIONS
* extend component functions from component common
*/
// prototypes assign
	// lifecycle
	component_iri.prototype.init				= component_common.prototype.init
	component_iri.prototype.build				= component_common.prototype.build
	component_iri.prototype.render				= common.prototype.render
	component_iri.prototype.refresh				= common.prototype.refresh
	component_iri.prototype.destroy				= common.prototype.destroy

	// change data
	component_iri.prototype.save				= component_common.prototype.save
	component_iri.prototype.update_data_value	= component_common.prototype.update_data_value
	component_iri.prototype.update_datum		= component_common.prototype.update_datum
	component_iri.prototype.change_value		= component_common.prototype.change_value
	component_iri.prototype.build_dd_request	= common.prototype.build_dd_request

	// render
	component_iri.prototype.list				= render_component_iri.prototype.list
	component_iri.prototype.edit				= render_component_iri.prototype.edit
	component_iri.prototype.edit_in_list		= render_component_iri.prototype.edit
	component_iri.prototype.tm					= render_component_iri.prototype.edit
	component_iri.prototype.search				= render_component_iri.prototype.search
	component_iri.prototype.change_mode			= component_common.prototype.change_mode



// /**
// * BUILD
// */
// component_iri.prototype.build = function() {

// 	return true
// }//end build



/**
* OPEN IRI
*/
component_iri.prototype.open_iri = function(component_obj) {

	const iri = component_obj.parentNode.querySelector('input[type="url"]').value

	if(iri.length <= 0){
		return false
	}
	window.open(iri, '_blank')

	return true
}//end open_iri



/**
* SET_VALUE
* @return

render_component_iri.prototype.set_value = function() {

	const self = this
	const node = self.node

	// inputs
	//const li_nodes = wrapper_obj.getElementsByTagName("li");
	const li_nodes = node.querySelectorAll('li');
		console.log("prueba:","prueba");
	//var" parent_ul 	= component_obj.parentNode.parentNode;
	//let li_nodes 	= parent_ul.childNodes;
	const len = li_nodes.length

		const ar_value = []
		for (let i = 0; i < len; i++) {
			const title_value 	= li_nodes[i].querySelector('input[type="text"]').value
			const iri_value 	= li_nodes[i].querySelector('input[type="url"]').value
			if(title_value.length > 0 || iri_value.length > 0 ){
				ar_value.push({
					iri 	: iri_value,
					title	: title_value
					})
			}
		}

	//set value in data isntance
		self.data.value = ar_value

	return true

};//end set_value*/



/**
* SET_VALUE
* @return
*/
component_iri.prototype.set_value = function(node, key) {

	const li_nodes 		= node.querySelectorAll('li');
	const title_value 	= li_nodes[key].querySelector('input[type="text"]').value
	const iri_value 	= li_nodes[key].querySelector('input[type="url"]').value


	const value = (title_value.length > 0 || iri_value.length > 0) ? {iri 	: iri_value, title	: title_value}: null

	return value
}//end set_value



