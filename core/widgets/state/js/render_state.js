/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {ui} from '../../../common/js/ui.js'
	import {event_manager} from '../../../common/js/event_manager.js'



/**
* RENDER_GET_ARCHIVE_WEIGHTS
* Manages the component's logic and apperance in client side
*/
export const render_state = function() {

	return true
}//end render_state



/**
* EDIT
* Render node for use in modes: edit, edit_in_list
* @return DOM node wrapper
*/
render_state.prototype.edit = async function(options) {

	const self = this

	const render_level = options.render_level

	// content_data
		const content_data = await get_content_data_edit(self)
		if (render_level==='content') {
			return content_data
		}

	// wrapper. ui build_edit returns widget wrapper
		const wrapper = ui.widget.build_wrapper_edit(self, {
			content_data : content_data
		})


	return wrapper
}//end edit



/**
* GET_CONTENT_DATA_EDIT
* @return DOM node content_data
*/
const get_content_data_edit = async function(self) {

	const fragment = new DocumentFragment()

	// values container
		const values_container = ui.create_dom_element({
			element_type	: 'ul',
			class_name 		: 'values_container',
			parent 			: fragment
		})

	// values
		const ipo 			= self.ipo
		const ipo_length 	= ipo.length

		for (let i = 0; i < ipo_length; i++) {
			const data 		= self.value.filter(item => item.key === i)
			get_value_element(i, data , values_container, self)
		}

	// content_data
		const content_data = ui.create_dom_element({
			element_type : 'div'
		})
		content_data.appendChild(fragment)


	return content_data
}//end get_content_data_edit



/**
* GET_VALUE_ELEMENT
* @return DOM node li
*/
const get_value_element = (i, data, values_container, self) => {

	// li
		const li = ui.create_dom_element({
			element_type	: 'li',
			class 			: 'state',
			parent 			: values_container
		})

		const project_langs = page_globals.dedalo_projects_default_langs
		const nolan 		= page_globals.dedalo_data_nolan

		const output		= self.ipo[i].output
		const ar_nodes = []

		for (let o = 0; o < output.length; o++) {
			const output_item = output[o]

			const container = ui.create_dom_element({
					element_type 	: 'div',
					class 			: '',
					parent 			: li
				})
				// label
					const label = ui.create_dom_element({
						element_type 	: 'div',
						class_name		: 'label',
						inner_html 		: output_item.id,
						parent 			: container
					})
				//situation
					const situation = ui.create_dom_element({
						element_type 	: 'div',
						class_name		: 'situation',
						parent 			: container
					})

					const situation_item = data.find(item => item.id === output_item.id && item.column === 'situation')
					const situation_translatable = (situation_item.lang !== nolan)
					const situation_length = situation_translatable ? project_langs.length : 1;

					for (let j = 0; j < situation_length; j++) {
						const lang = situation_translatable ? project_langs[j] : nolan
						const situation_items_data = data.find(item => item.id === output_item.id && item.column === 'situation' && item.lang === lang.value)

						const lang_label = situation_translatable ? project_langs[j].label : 'total'
						const situation_label = (situation_items_data) ? lang_label+': '+ situation_items_data.value : lang_label+': 0'

						const item_situation = ui.create_dom_element({
							element_type	: 'span',
							class_name		: 'value',
							inner_html 		: situation_label,
							parent 			: situation
						})
						ar_nodes.push({
							node 	: item_situation,
							lang 	: lang,
							id		: output_item.id,
							key 	: i,
							column	: 'situation'})
					}
				//state
					const state = ui.create_dom_element({
						element_type 	: 'div',
						class_name		: 'state',
						parent 			: container
					})
					// check if the component is translatable, with the first item in the data of the current column
					const state_item = data.find(item => item.id === output_item.id && item.column === 'state')
					// second, check if the item is translatable
					const state_translatable = (state_item.lang !== nolan)
					// if the item is translatable select the projects lang else the item is lg-nolan and only has 1 item
					const item_length = state_translatable ? project_langs.length : 1;

					for (let k = 0; k < item_length; k++) {
						// select the language of for the item 'lg-spa, lg-eng, lg-cat, etc' else select the 'lg-nolan'
						const lang = state_translatable ? project_langs[k] : nolan
						// find the data of the item with the lang
						const state_item_data = data.find(item => item.id === output_item.id && item.column === 'state' && item.lang === lang.value)

						// build the label with the lang
						const lang_label = state_translatable ? project_langs[k].label : 'total'
						const state_label = (state_item_data) ? lang_label+': '+ state_item_data.value : lang_label+': 0'

						// create the node
						const item_state = ui.create_dom_element({
							element_type	: 'span',
							class_name		: 'value',
							inner_html 		: state_label,
							parent 			: state
						})
						// save the node for reuse later
						ar_nodes.push({
							node 	: item_state,
							lang 	: lang,
							id		: output_item.id,
							key 	: i,
							column	: 'state'
						})
					}

		}


		event_manager.subscribe('update_widget_value_'+i+'_'+self.id, (changed_data) =>{
			// get the output of the current ipo
			const output = self.ipo[i].output
			//every output is a row that has 2 different colums 'situation' and 'state'
			for (let o = 0; o < output.length; o++) {

				const output_item = output[o]
				// state
				// check if the component is translatable, with the first item in the data of the current column
				const state_item = changed_data.find(item => item.id === output_item.id && item.column === 'state')
				// second check if the item is translatable
				const state_translatable = (state_item.lang !== nolan)
				// if the item is translatable select the projects lang else the item is lg-nolan and only has 1 item
				const state_length = state_translatable ? project_langs.length : 1;

				for (let j = 0; j < state_length; j++) {
					// select the language of for the item 'lg-spa, lg-eng, lg-cat, etc' else select the 'lg-nolan'
					const lang = state_translatable ? project_langs[j] : nolan
					// find the data of the item with the lang
					const state_items_data = changed_data.find(item => item.id === output_item.id && item.column === 'state' && item.lang === lang.value)
					// build the label with the lang
					const lang_label = state_translatable ? project_langs[j].label : 'total'
					const state_label = (state_items_data) ? lang_label+': '+ state_items_data.value : lang_label+': 0'

					// select the node to change the data
					const state_node = ar_nodes.find(item => item.id === output_item.id && item.column === 'state' && item.lang === lang)
					// set the new value
					state_node.node.innerHTML = state_label
				}
			}

		})

	return li
}//end get_value_element
