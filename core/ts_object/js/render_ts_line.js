// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG */
/*eslint no-undef: "error"*/



// imports
	import {ui} from '../../common/js/ui.js'
	import {dd_request_idle_callback} from '../../common/js/events.js'
	import {get_instance, get_all_instances} from '../../common/js/instances.js'
	import {get_caller_by_model} from '../../common/js/utils/util.js'
	import {render_link_children} from './view_default_edit_ts_object.js'



/**
* RENDER_TS_LINE
* Render standardized complete ts line with term ans buttons
* @param object self - ts_object instance
* @return DocumentFragment fragment
*/
export const render_ts_line = function(self) {

	// short vars
		const ar_elements			= self.data?.ar_elements || []
		const is_descriptor			= self.is_descriptor
		const indexations_container	= self.indexations_container

	// DocumentFragment
		const fragment = new DocumentFragment()

	// Empty ar_elements case
	if (ar_elements.length === 0) {
		const id_info = ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'id_info ontology',
			inner_html		: '['+ self.section_tipo +'] non-installed hierarchy',
			parent			: fragment
		})
		return fragment
	}

	// LIST_THESAURUS_ELEMENTS
	// Iterate child data switch between custom  render elements (buttons, etc)
	const ar_elements_len = ar_elements.length
	for (let j = 0; j < ar_elements_len; j++) {

		const current_element = ar_elements[j]

		const children_dataset	= {
			tipo	: current_element.tipo,
			type	: current_element.type
		}

		// element_case. component_relation_index elements dispatch by MODEL:
		// their ddo_map type is 'icon' (see section_list_thesaurus properties),
		// so matching by type made the indexations case unreachable and the U
		// button fell into the default show_component path (view 'line')
		const element_case = current_element.model==='component_relation_index'
			? 'component_relation_index'
			: current_element.type

		switch(element_case) {

			// TERM
			case ('term'): {
				const area_ontology_caller = get_caller_by_model(self, 'area_ontology')
				const render_handler = area_ontology_caller
					? render_ontology_term
					: render_term

				const term_node = render_handler({
					self			: self,
					ar_elements		: ar_elements,
					is_descriptor	: is_descriptor,
					key				: j
				})
				fragment.appendChild(term_node)
				// set pointer
				self.term_node = term_node

				// id_info (show_section)
				const term_id = (area_ontology_caller)
					? (()=>{
						// id_info. Like '[hierarchy1_246]' (Term tipo)
						// parse parts
						const regex				= /^(.*) ([a-z]{2,}) ([0-9]+)$/gm;
						const term_regex_result	= regex.exec(current_element.value)
						// term_id . like 'dd_1'
						const result = term_regex_result
							? term_regex_result[2] + term_regex_result[3]
							: self.section_tipo + self.section_id
						return result
					  })()
					: self.section_tipo +'_'+ self.section_id

				const section = self.section_tipo + ' - ' + self.section_id

				const id_info = ui.create_dom_element({
					element_type	: 'span',
					class_name		: 'id_info ontology',
					inner_html		: '['+ term_id +']',
					title			: section,
					data_set		: {
						section : section,
						term_id : '['+ term_id +']'
					},
					parent			: fragment
				})
				const mousedown_handler_id_info = (e) => {
					e.stopPropagation()
				}
				id_info.addEventListener('mousedown', mousedown_handler_id_info)
				const click_handler_id_info = (e) => {
					e.stopPropagation()
					if(SHOW_DEBUG===true) {
						if (e.metaKey && e.altKey) {
							e.preventDefault()
							console.log('/// refreshing instance (build_autoload=true, render_level=content):', self);
							self.refresh({
								build_autoload	: true,
								render_level	: 'content'
							})
							return
						}
						if (e.altKey) {
							e.preventDefault()
							console.log(`/// selected instance ${self.model}:`, self);
							return
						}
					}
				}
				id_info.addEventListener('click', click_handler_id_info)

				// button_duplicate
				if (area_ontology_caller) {
					const button_duplicate = ui.create_dom_element({
						element_type	: 'button',
						class_name		: 'duplicate',
						title			: 'Duplicate',
						parent			: fragment
					})
					// click event
					const click_handler_duplicate = async (e) => {
						e.stopPropagation()

						if (!confirm(get_label.sure || 'Sure?')) {
							return false
						}

						const section_tipo	= self.section_tipo
						const section_id	= self.section_id

						const section = await get_instance({
							model			: 'section',
							section_tipo	: section_tipo,
							section_id		: section_id
						})
						const new_section_id = await section.duplicate_section( section_id )
						if (!new_section_id) {
							return false
						}

						// parent instance
						const parent_instance = self.caller
						if (!parent_instance) {
							console.error('Unable to get parent instance from caller:', self);
							return false
						}

						// pagination. Built by value: never mutate the cached
						// parent_instance.children_data.pagination object
						const pagination = parent_instance.children_data?.pagination
							? { limit: 0, offset: 0 }
							: null

						// children_data - render_children_data from API
						const children_data = await parent_instance.get_children_data({
							pagination	: pagination,
							children	: null,
							cache		: false // Forces call API again
						})
						if (!children_data) {
							// error case
							console.warn("[ts_object.render_children] Error, children_data is null");
							return false
						}

						// refresh children container
						parent_instance.render_children({
							clean_children_container	: true,
							children_data				: children_data
						})
						.then(function(result){
							// Open editor in new window
							if (result) {
								dd_request_idle_callback(()=>{
									// hilite the new term
									const target_instance = get_all_instances().find(el => parseInt(el.section_id)===parseInt(new_section_id) && el.section_tipo===section_tipo && el.model==='ts_object')
									if (target_instance) {
										self.hilite_element( target_instance.term_node )
									}else{
										console.error('Unable to get the target instance');
									}
									// open a edit window with the new record
									self.open_record(new_section_id, section_tipo)
								})

							}
						})
					}
					button_duplicate.addEventListener('click', click_handler_duplicate)
				}

				break;
			}

			// ND BUTTON
			case ('link_children_nd'): {
				// Button for non descriptor [nd]
				const element_children_nd = ui.create_dom_element({
					element_type	: 'div',
					class_name		: 'link_children_nd default term nd unselectable',
					data_set		: children_dataset,
					text_node		: current_element.value,
					parent			: fragment
				})
				// mousedown event
				const mousedown_handler = (e) => {
					e.stopPropagation()

					element_children_nd.classList.add('loading_spinner')

					// toggle_nd
					self.toggle_nd(element_children_nd, e)
					.then(function(){
						element_children_nd.classList.remove('loading_spinner')
					})
				}
				element_children_nd.addEventListener('mousedown', mousedown_handler)
				break;
			}

			// ARROW ICON (link_children)
			case ('link_children'): {
				if (self.has_descriptor_children) {
					// button arrow link children.
					// To access it, use the pointer to self.link_children_element
					const link_children_element = render_link_children(self)
					fragment.appendChild(link_children_element)
				}else{
					self.link_children_element = null
				}
				break;
			}

			// INDEXATIONS
			case ('component_relation_index'): {
				if (!current_element.show_data) {
					const total = parseInt(current_element.count_result?.total || 0)
					if(total > 0){
						// button_show_indexations. Build button
						const button_show_indexations = ui.create_dom_element({
							element_type	: 'div',
							class_name		: 'button_show_indexations',
							data_set		: children_dataset,
							text_node		: current_element.value, // generates a span with the value like '<span>U:37</span>'
							parent			: fragment
						})
						// mousedown event
						const mousedown_handler = (e) => {
							e.stopPropagation()

							button_show_indexations.classList.add('loading_spinner')
							const uid = current_element.tipo +'_'+ self.section_tipo +'_'+ self.section_id

							const current_total = parseInt(current_element.count_result?.total || 0)

							self.show_indexations({
								uid 				: uid,
								button_obj			: button_show_indexations,
								event				: e,
								section_tipo		: self.section_tipo,
								section_id			: self.section_id,
								component_tipo		: current_element.tipo,
								target_div			: indexations_container,
								value				: null,
								total				: current_total,
								totals_group		: current_element.count_result?.totals_group,
								filter_by_locators	: [{
									section_tipo	: self.section_tipo,
									section_id		: self.section_id,
									tipo			: current_element.tipo
								}]
							})
							.then(function(){
								button_show_indexations.classList.remove('loading_spinner')
							})
						}
						button_show_indexations.addEventListener('mousedown', mousedown_handler)
					}

				}else if(current_element.show_data === 'children') {
					// recursive indexations
					const button_recursive_indexations = ui.create_dom_element({
						element_type	: 'div',
						class_name		: 'button_show_indexations',
						data_set		: children_dataset,
						text_node		: `⇣${current_element.value}`, // generates a span with the value like '<span>U:37</span>', // generates a span with the value like '<span>U:37</span>'
						parent			: fragment
					})
					// mousedown event
					const mousedown_handler = (e) => {
						e.stopPropagation()

						button_recursive_indexations.classList.add('loading_spinner')

						self.get_children_recursive({
							section_tipo	: self.section_tipo,
							section_id		: self.section_id
						})
						.then(function(children_recursive){

							self.show_indexations({
								uid 				: `${current_element.tipo}_recursive`,
								button_obj			: button_recursive_indexations,
								event				: e,
								section_tipo		: self.section_tipo,
								section_id			: self.section_id,
								component_tipo		: current_element.tipo,
								target_div			: indexations_container,
								value				: null,
								total				: null,
								totals_group		: current_element.count_result.totals_group,
								filter_by_locators	: children_recursive
							})
							.then(function(){
								button_recursive_indexations.classList.remove('loading_spinner')
							})
						})
					}
					button_recursive_indexations.addEventListener('mousedown', mousedown_handler)
				}
				break;
			}

			// IMG
			case ('img'): {
				if(current_element.value) {

					const element_img = ui.create_dom_element({
						element_type	: 'div',
						class_name		: 'term_img',
						data_set		: children_dataset,
						parent			: fragment
					})
					// mousedown handler
					const mousedown_handler = (e) => {
						e.stopPropagation()

						element_img.classList.add('loading_spinner')

						self.show_component_in_ts_object({
							tipo	: current_element.tipo,
							type	: current_element.type,
							model	: current_element.model
						})
						.then(function(){
							element_img.classList.remove('loading_spinner')
						})
					}
					element_img.addEventListener('mousedown', mousedown_handler)
					// image
					ui.create_dom_element({
						element_type	: 'img',
						src				: current_element.value,
						parent			: element_img
					})
				}
				break;
			}

			// OTHERS. Buttons for show component to edit, etc.
			default: {
				const current_value = current_element.value

				// Case common buttons and links
				const button_show_component = ui.create_dom_element({
					element_type	: 'div',
					class_name		: 'default button_show_component ' + current_element.tipo,
					data_set		: children_dataset,
					text_node		: current_value, // creates a span node with the value inside
					parent 			: fragment
				})
				// mousedown event
				const mousedown_handler = (e) => {
					e.stopPropagation()

					button_show_component.classList.add('loading_spinner')

					self.show_component_in_ts_object({
						tipo	: current_element.tipo,
						type	: current_element.type,
						model	: current_element.model
					})
					.then(()=>{
						button_show_component.classList.remove('loading_spinner')
					})
				}
				button_show_component.addEventListener('mousedown', mousedown_handler)
				break;
			}
		}//end switch(true)

		// ontology model case
		if (current_element.model_value) {
			const show_models_class = window.page_globals.show_models===true ? '' : ' hide';
			ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'model_value' + show_models_class,
				text_content	: current_element.model_value,
				parent			: fragment
			})
		}
	}//end for (var j = 0; j < ch_len; j++)


	return fragment
}//end render_ts_line



/**
* RENDER_TERM
* Creates the term nodes like:
* <div class="list_thesaurus_element term" data-tipo="hierarchy25" data-type="term" data-section_tipo="aa1" data-section_id="1">
*  <span class="term_text">Social Anthropology</span>
*  <span class="id_info"> [aa1_1]</span>
* </div>
* @param object options
* {
*	child_data: object {ar_elements:[{}], has_descriptor_children:true, is_descriptor:true, ..}
* 	is_descriptor: bool
*	key: int
* 	self: object
* }
* @return HTMLElement term_node
*/
const render_term = function(options) {

	// options
		const self			= options.self
		const ar_elements	= options.ar_elements
		const is_descriptor	= options.is_descriptor
		const key			= options.key // int j

	// short vars
		const item	= ar_elements[key]
		const tipo	= Array.isArray(item?.tipo) ? item.tipo[0] : item.tipo

	// term_node
		const term_node = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'term'
		})
		// fix term pointer
		self.term_node = term_node

		// term_text
		const term_text_value = Array.isArray( ar_elements[key].value )
			? item.value.join(' ')
			: item.value
		const term_text = ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'term_text unselectable' + (is_descriptor ? '' : ' no_descriptor'),
			inner_html		: term_text_value,
			parent			: term_node
		})
		self.term_text = term_text
		// click event
		const click_handler = (e) => {
			e.stopPropagation()

			if(self.thesaurus_mode==='relation'){
				return // ignore relation click
			}

			term_node.classList.add('loading_spinner')

			// show_component_in_ts_object
			self.show_component_in_ts_object({
				tipo	: item.tipo,
				type	: item.type,
				model	: item.model
			})
			.then(function(){
				term_node.classList.remove('loading_spinner')
			})
		}
		term_text.addEventListener('click', click_handler)

	// element_to_hilite
		if (self.element_to_hilite) {
			if(		term_node.dataset.section_id == self.element_to_hilite.section_id
				&& 	term_node.dataset.section_tipo===self.element_to_hilite.section_tipo) {
				// hilite element
				dd_request_idle_callback(
					() => {
						self.hilite_element(term_node)
					}
				)
			}
		}


	return term_node
}//end render_term



/**
* RENDER_ONTOLOGY_TERM
* Creates the term nodes like:
* <div class="list_thesaurus_element term" data-tipo="hierarchy25" data-type="term" data-section_tipo="aa1" data-section_id="1">
*  <span class="term_text">Social Anthropology</span>
*  <span class="id_info"> [aa1_1]</span>
* </div>
* @param object options
* {
*	child_data: object {ar_elements:[{}], has_descriptor_children:true, is_descriptor:true, ..}
* 	is_descriptor: bool
*	key: int
* 	self: object
* }
* @return HTMLElement term_node
*/
const render_ontology_term = function(options) {

	// options
		const self			= options.self
		const ar_elements	= options.ar_elements
		const is_descriptor	= options.is_descriptor
		const key			= options.key // int j

	// short vars
		const section_tipo	= self.section_tipo
		const section_id	= self.section_id
		const ts_id			= self.ts_id
		const item			= ar_elements[key]

	// children_dataset
		const children_dataset	= {
			section_tipo	: section_tipo,
			section_id		: section_id,
			tipo			: item.tipo[0],
			type			: item.type
		}

	// parse parts
		const regex				= /^(.*) ([a-z]{2,}) ([0-9]+)$/gm;
		const term_regex_result	= regex.exec(item.value)
		// term_text
		const term_text = term_regex_result
			? term_regex_result[1]
			: item.value || ts_id

	// term_node
		const term_node = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'term',
			data_set		: children_dataset
		})
		// fix term pointer
		self.term_node = term_node

	// term_text
		const term_text_node = ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'term_text' + (is_descriptor ? '' : ' no_descriptor'),
			inner_html		: term_text,
			parent			: term_node
		})
		// click event
		const click_handler = (e) => {
			e.stopPropagation()

			if(self.thesaurus_mode==='relation'){
				return // ignore relation click
			}

			term_node.classList.add('loading_spinner')

			// Only first item (term) is used
			const tipo = Array.isArray(item.tipo) ? item.tipo[0] : item.tipo

			// show_component_in_ts_object
			self.show_component_in_ts_object({
				tipo	: tipo,
				type	: item.type,
				model	: item.model
			})
			.then(function(){
				term_node.classList.remove('loading_spinner')
			})
		}
		term_text_node.addEventListener('click', click_handler)
		// fix term pointer
		self.term_text = term_text_node

	// element_to_hilite
		if (self.element_to_hilite) {
			if(		term_node.dataset.section_id == self.element_to_hilite.section_id
				&& 	term_node.dataset.section_tipo===self.element_to_hilite.section_tipo) {
				// hilite element
				dd_request_idle_callback(
					() => {
						self.hilite_element(term_node)
					}
				)
			}
		}


	return term_node
}//end render_ontology_term



// @license-end
