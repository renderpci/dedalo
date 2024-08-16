// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {ui} from '../../../common/js/ui.js'
	import {event_manager} from '../../../common/js/event_manager.js'



/**
* RENDER_LIST_STATE
* Manages the component's logic and appearance in client side
*/
export const render_list_state = function() {

	return true
}//end render_list_state



/**
* LIST
* Render node for use in modes: list, edit_in_list
* @return HTMLElement wrapper
*/
render_list_state.prototype.list = async function(options) {

	const self = this

	// content_data
		const content_data = await get_content_data_list(self)

	// wrapper. ui build_edit returns widget wrapper
		const wrapper = ui.widget.build_wrapper_edit(self, {
			// content_data : content_data
		})
		wrapper.appendChild(content_data)
		// set pointers
		wrapper.content_data = content_data


	return wrapper
}//end list



/**
* GET_CONTENT_DATA_LIST
* @return HTMLElement content_data
*/
const get_content_data_list = async function(self) {

	const fragment = new DocumentFragment()

	// values container
		const values_container = ui.create_dom_element({
			element_type	: 'ul',
			class_name		: 'values_container',
			parent			: fragment
		})

	// values
		const ipo			= self.ipo
		const ipo_length	= ipo.length

		for (let i = 0; i < ipo_length; i++) {
			const data			= self.value.filter(el => el.key===i)
			const value_element	= get_value_element(i, data, self)
			values_container.appendChild(value_element)
		}


	return fragment
}//end get_content_data_list



/**
* GET_VALUE_ELEMENT
* @return HTMLElement value_element
*/
const get_value_element = (i, data, self) => {

	// li, for every ipo will create a li node
		const value_element = ui.create_dom_element({
			element_type	: 'li',
			class_name		: 'widget_item state'
		})

		// important!, data don't has all info
		// is necessary get the langs for create the all lang nodes
		// when the component is translatable, data can't has all languages, in the data will only has the langs that has value
		// but when the component id non translatable, data has always the node reference (empty or with value)
		// const project_langs = page_globals.dedalo_projects_default_langs
		// const nolan 		= page_globals.dedalo_data_nolan
		// select the current ipo.output
		const output		= self.ipo[i].output
		// we will store the nodes to re-create the value when the components change our data and send the 'update_widget_value' event
		const ar_nodes = []
		// create a node var to fill with the information of the state when the user click in the icon
		let tooltip_node
		// every ipo has one output array with the objects for every row
		// get the output for reference of the rows
		const output_length = output.length
		for (let z = 0; z < output_length; z++) {

			const output_item = output[z]

			// Situation
				// get the total item for situation
				const situation_total = data.find(item =>  item.id === output_item.id
														&& item.column === 'situation'
														&& item.type ==='total')
				// console.log('situation_total:', situation_total.value, situation_total);

			// State
				// get the total item for state
				const state_total = data.find(item =>  item.id === output_item.id
													&& item.column === 'state'
													&& item.type ==='total')
				// console.log('state_total:', state_total.value, state_total);

				if(situation_total && (situation_total.value > 0 || state_total.value > 0)) {
					// node for the column situation
					const situation = ui.create_dom_element({
						element_type	: 'span',
						class_name		: 'state_icon ' + output_item.id,
						parent			: value_element
					})

					situation.addEventListener('click', function() {
						// delete the tool_tip node every time that user click in the icons
							if (tooltip_node) {
								tooltip_node.remove()
							}

						if (this.classList.contains('active')) {
							this.classList.remove('active')
							return
						}

						// reset and active current
							[].forEach.call(this.parentNode.children, function(child) {
								child.classList.remove('active')
							});
							this.classList.add('active')

						// tooltip_node
						tooltip_node = ui.create_dom_element({
							element_type	: 'span',
							class_name		: 'state_tooltip',
							parent			: value_element
						})
						tooltip_node.addEventListener('click', function(e){
							e.stopPropagation()

							tooltip_node.remove();

							// reset active
							[].forEach.call(situation.parentNode.children, function(child) {
								child.classList.remove('active')
							});
						})

						// get the value of specific output (situation, state ) with the totals
						const tooltip = get_value_tooltip(output_item, data, self)
						tooltip_node.appendChild(tooltip)
					})
				}
		}// end for (let o = 0; o < output.length; o++)

		self.events_tokens.push(
			event_manager.subscribe('update_widget_value_'+i+'_'+self.id, fn_update_widget_value)
		)
		function fn_update_widget_value(changed_data) {

			// get all detail nodes 'situation' and 'state' in DOM
			const detail_nodes	= ar_nodes //.filter(node => node.type === 'detail')
			const node_length	= detail_nodes.length

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

			return true
		}//end fn_update_widget_value


	return value_element
}//end get_value_element



/**
* GET_VALUE_TOOLTIP
* @return DOM DocumentFragment
*/
const get_value_tooltip = (output_item, data, self) => {

	const fragment = new DocumentFragment()

	// short vars
		const project_langs	= page_globals.dedalo_projects_default_langs
		const nolan			= page_globals.dedalo_data_nolan

	// row container
		const container = ui.create_dom_element({
			element_type	: 'div',
			class_name		: '',
			parent			: fragment
		})

		// label for the row
		ui.create_dom_element({
			element_type	: 'label',
			class_name		: 'output_label',
			inner_html		: get_label[output_item.label] || output_item.id,
			parent			: container
		})

	// Situation
		// check if the component is translatable, with the first item in the data of the current column
		const situation_item = data.find(item => item.id === output_item.id && item.column === 'situation')
		// check if the item is translatable
		const situation_translatable = (situation_item.lang !== nolan)
		// if the item is translatable select the all projects langs, else the item will be lg-nolan and only will has 1 item
		const situation_length = situation_translatable ? project_langs.length : 1;
		// get the total item for situation
		const situation_total = data.find(item =>  item.id === output_item.id
												&& item.column === 'situation'
												&& item.type ==='total')

		// node for the column situation
		const situation = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'situation',
			parent			: container
		})
			// total
			const situation_total_node = ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'total',
				parent			: situation
			})
			// create the node with the total value
			const situation_total_value = ui.create_dom_element({
				element_type	: 'span',
				class_name		: 'value',
				inner_html		: situation_total.value+'%',
				parent			: situation_total_node
			})

		// detail node with all languages
		const situation_detail = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'detail',
			parent			: situation
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
				inner_html		: (situation_translatable) ? project_langs[j].label+': ' : 'total :',
				parent			: situation_detail
			})
			// create the node with the value
			const item_situation = ui.create_dom_element({
				element_type	: 'span',
				class_name		: 'value',
				inner_html		: (situation_items_data) ? situation_items_data.value+'%' : '0%',
				parent			: situation_detail
			})
			// build the label with the list name
			const datalist_item = (situation_items_data && situation_items_data.locator)
				? self.datalist.find(item => item.value.section_tipo === situation_items_data.locator.section_tipo
										  && item.value.section_id === situation_items_data.locator.section_id)
				: {label: ''}

			// label_list_situation
			ui.create_dom_element({
				element_type	: 'label',
				inner_html		: datalist_item ? datalist_item.label : '',
				parent			: situation_detail
			})
		} // end for (let j = 0; j < situation_length; j++)
	// State
		// check if the component is translatable, with the first item in the data of the current column
		const state_item = data.find(item => item.id === output_item.id && item.column === 'state')
		// second, check if the item is translatable
		const state_translatable = (state_item.lang !== nolan)
		// if the item is translatable select the projects lang else the item is lg-nolan and only has 1 item
		const item_length = state_translatable ? project_langs.length : 1;

		const state_total = data.find(item =>  item.id === output_item.id
											&& item.column === 'state'
											&& item.type ==='total')

		// node for state column
			const state = ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'state',
				parent			: container
			})
			// total
			const total_node = ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'total',
				parent			: state
			})
			// create the node with the value
			const total_value = ui.create_dom_element({
				element_type	: 'span',
				class_name		: 'value',
				inner_html		: state_total.value+'%',
				parent			: total_node
			})

			// detail with all languages
			const detail = ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'detail',
				parent			: state
			})

		for (let k = 0; k < item_length; k++) {
			// select the language of for the item 'lg-spa, lg-eng, lg-cat, etc' else select the 'lg-nolan'
			const lang = state_translatable ? project_langs[k].value : nolan
			// find the data of the item with the lang
			const state_item_data = data.find(item =>  item.id === output_item.id
													&& item.column === 'state'
													&& item.lang === lang
													&& item.type ==='detail')

			// label_state. build the label with the lang
			ui.create_dom_element({
				element_type	: 'label',
				inner_html		: (state_translatable) ? project_langs[k].label+': ' : 'total :',
				parent			: detail
			})

			// item_state. create the node with the value
			ui.create_dom_element({
				element_type	: 'span',
				class_name		: 'value',
				inner_html		: (state_item_data) ? state_item_data.value+'%' : '0%',
				parent			: detail
			})

			// build the label with the list name
			const datalist_item_status = (state_item_data && state_item_data.locator)
				? self.datalist.find(item => item.value.section_tipo === state_item_data.locator.section_tipo
										  && item.value.section_id === state_item_data.locator.section_id)
				: {label: ''}

			// label_list_state
			ui.create_dom_element({
				element_type	: 'label',
				inner_html		: datalist_item_status ? datalist_item_status.label : '',
				parent			: detail
			})
		}// end for (let k = 0; k < item_length; k++)


	return fragment
}//end get_value_tooltip



// @license-end
