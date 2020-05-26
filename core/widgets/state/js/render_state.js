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

	// li, for every ipo will create a li node
		const li = ui.create_dom_element({
			element_type	: 'li',
			class_name		: 'state',
			parent 			: values_container
		})
		// first row with the header labels
		const header = ui.create_dom_element({
				element_type 	: 'div',
				inner_html		: '',
				parent 			: li
			})
			// group_name_column
				const group_name_column = ui.create_dom_element({
					element_type 	: 'label',
					inner_html 		: '',
					parent 			: header
				})
			// label_situation
				const label_situation = ui.create_dom_element({
					element_type 	: 'label',
					inner_html 		: get_label['situation'] || 'situation',
					parent 			: header
				})
			// label_state
				const label_state = ui.create_dom_element({
					element_type 	: 'label',
					inner_html 		: get_label['state'] || 'state',
					parent 			: header
				})
		// important!, data don't has all info
		// is neccesary get the langs for create the all lang nodes
		// when the component is traslatable, data can't has all languages, in the data will only has the langs that has value
		// but when the component id non translatable, data has always the node reference (empty or with value)
		const project_langs = page_globals.dedalo_projects_default_langs
		const nolan 		= page_globals.dedalo_data_nolan
		// select the current ipo.output
		const output		= self.ipo[i].output
		// we will store the nodes to re-create the value when the components change our data and send the 'update_widget_value' event
		const ar_nodes = []

		// every ipo has one output array wiht the objects for every row
		// get the output for reference of the rows
		for (let o = 0; o < output.length; o++) {
			const output_item = output[o]
			// row container
			const container = ui.create_dom_element({
					element_type 	: 'div',
					class_name		: '',
					parent 			: li
				})
				// label for the row
				const label = ui.create_dom_element({
					element_type 	: 'label',
					inner_html 		: output_item.id,
					parent 			: container
				})
			// Situation
				// check if the component is translatable, with the first item in the data of the current column
				const situation_item = data.find(item => item.id === output_item.id && item.column === 'situation')
				// check if the item is translatable
				const situation_translatable = (situation_item.lang !== nolan)
				// if the item is translatable select the all projects langs, else the item will be lg-nolan and only will has 1 item
				const situation_length = situation_translatable ? project_langs.length : 1;
				// get the total item for situation
				const situation_total = data.find(item => item.id === output_item.id
														&& item.column === 'situation'
														&& item.type ==='total')
				// node for the colum situation
				const situation = ui.create_dom_element({
					element_type 	: 'div',
					class_name		: 'situation',
					parent 			: container
				})
					// total
					const situation_total_node = ui.create_dom_element({
						element_type 	: 'div',
						class_name		: 'total',
						parent 			: situation
					})
					// create the node with the total value
					const situation_total_value = ui.create_dom_element({
							element_type	: 'span',
							class_name		: 'value',
							inner_html 		: situation_total.value+'%',
							parent 			: situation_total_node
						})
					// save the node for reuse later in 'update_widget_value' event
					ar_nodes.push({
						node_value 	: situation_total_value,
						type 		: 'total',
						value 		: situation_total.value,
						lang 		: nolan,
						id			: output_item.id,
						key 		: i,
						column		: 'situation'
					})

				// detail node with all languages
				const situation_detail = ui.create_dom_element({
					element_type 	: 'div',
					class_name		: 'detail',
					parent 			: situation
				})
				// situation detail
				for (let j = 0; j < situation_length; j++) {
					// select the language of for the item 'lg-spa, lg-eng, lg-cat, etc' else select the 'lg-nolan'
					const lang = situation_translatable ? project_langs[j].value : nolan
					const situation_items_data = data.find(item => item.id === output_item.id
																&& item.column === 'situation'
																&& item.lang === lang
																&& item.type ==='detail')
					// build the label with the lang name
					const label_situation = ui.create_dom_element({
						element_type	: 'label',
						inner_html 		: (situation_translatable) ? project_langs[j].label+': ' : 'total :',
						parent 			: situation_detail
					})
					// create the node with the value
					const item_situation = ui.create_dom_element({
						element_type	: 'span',
						class_name		: 'value',
						inner_html 		: (situation_items_data) ? situation_items_data.value+'%' : '0%',
						parent 			: situation_detail
					})
					// build the label with the list name
					const datalist_item = (situation_items_data && situation_items_data.locator)
						? self.datalist.find(item => item.value.section_tipo === situation_items_data.locator.section_tipo
												&& item.value.section_id === situation_items_data.locator.section_id)
						: {label: ''}

					const label_list_situation = ui.create_dom_element({
						element_type	: 'label',
						inner_html 		: datalist_item.label,
						parent 			: situation_detail
					})
					// save the node for reuse later in 'update_widget_value' event
					ar_nodes.push({
						node_value 			: item_situation,
						node_label_list 	: label_list_situation,
						type 				: 'detail',
						value 				: (situation_items_data) ? situation_items_data.value : 0,
						lang 				: lang,
						id					: output_item.id,
						key 				: i,
						column				: 'situation'})
				} // end for (let j = 0; j < situation_length; j++)
			// State
				// check if the component is translatable, with the first item in the data of the current column
				const state_item = data.find(item => item.id === output_item.id && item.column === 'state')
				// second, check if the item is translatable
				const state_translatable = (state_item.lang !== nolan)
				// if the item is translatable select the projects lang else the item is lg-nolan and only has 1 item
				const item_length = state_translatable ? project_langs.length : 1;

				const state_total = data.find(item => item.id === output_item.id
													&& item.column === 'state'
													&& item.type ==='total')

				// node for state colum
				const state = ui.create_dom_element({
					element_type 	: 'div',
					class_name		: 'state',
					parent 			: container
				})
					// total
					const total_node = ui.create_dom_element({
						element_type 	: 'div',
						class_name		: 'total',
						parent 			: state
					})
					// create the node with the value
					const total_value = ui.create_dom_element({
						element_type	: 'span',
						class_name		: 'value',
						inner_html 		: state_total.value+'%',
						parent 			: total_node
					})
					// save the node for reuse later in 'update_widget_value' event
					ar_nodes.push({
						node_value 	: total_value,
						type 		: 'total',
						value 		: state_total.value,
						lang 		: nolan,
						id			: output_item.id,
						key 		: i,
						column		: 'state'
					})

					// detail with all languages
					const detail = ui.create_dom_element({
						element_type 	: 'div',
						class_name		: 'detail',
						parent 			: state
					})

				for (let k = 0; k < item_length; k++) {
					// select the language of for the item 'lg-spa, lg-eng, lg-cat, etc' else select the 'lg-nolan'
					const lang = state_translatable ? project_langs[k].value : nolan
					// find the data of the item with the lang
					const state_item_data = data.find(item => item.id === output_item.id
															&& item.column === 'state'
															&& item.lang === lang
															&& item.type ==='detail')

					// build the label with the lang
					const label_state = ui.create_dom_element({
						element_type	: 'label',
						inner_html 		: (state_translatable) ? project_langs[k].label+': ' : 'total :',
						parent 			: detail
					})

					// create the node with the value
					const item_state = ui.create_dom_element({
						element_type	: 'span',
						class_name		: 'value',
						inner_html 		: (state_item_data) ? state_item_data.value+'%' : '0%',
						parent 			: detail
					})
					// build the label with the list name
					const datalist_item_status = (state_item_data && state_item_data.locator)
						? self.datalist.find(item => item.value.section_tipo === state_item_data.locator.section_tipo
												&& item.value.section_id === state_item_data.locator.section_id)
						: {label: ''}

					const label_list_state = ui.create_dom_element({
						element_type	: 'label',
						inner_html 		: datalist_item_status.label,
						parent 			: detail
					})
					// save the node for reuse later in the event 'update_widget_value'
					ar_nodes.push({
						node_value 			: item_state,
						node_label_list 	: label_list_state,
						type 				: 'detail',
						value 				: (state_item_data) ? state_item_data.value : 0,
						lang 				: lang,
						id					: output_item.id,
						key 				: i,
						column				: 'state'
					})
				}// end for (let k = 0; k < item_length; k++)
		}// end for (let o = 0; o < output.length; o++)

		event_manager.subscribe('update_widget_value_'+i+'_'+self.id, (changed_data) =>{
			// get all detail nodes 'situation' and 'state' in DOM
			const detail_nodes = ar_nodes //.filter(node => node.type === 'detail')
			const node_length = detail_nodes.length

			for (let o = node_length - 1; o >= 0; o--) {
				const node = detail_nodes[o]
				// find if the node has new data
				const new_data = changed_data.find(item => item.id === node.id
														&& item.column === node.column
														&& item.lang === node.lang
														&& item.key === i
														&& item.type === node.type
													)
				// set the new value
				if(new_data){
					node.node_value.innerHTML = new_data.value +'%'
					if(node.type==='detail'){
						const datalist_item = (new_data.locator)
							? self.datalist.find(item => item.value.section_tipo === new_data.locator.section_tipo
													&& item.value.section_id === new_data.locator.section_id)
							: {label: ''}

						node.node_label_list.innerHTML = datalist_item.label
					}

				}else{
					node.node_value.innerHTML = '0%'
					if(node.type==='detail'){
						node.node_label_list.innerHTML = ''
					}
				}// end if(new_data){
			}// end for (let o = node_length - 1; o >= 0; o--)
		})// end event_manager.subscribe('update_widget_value_'

	return li
}//end get_value_element
