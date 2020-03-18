// imports
	import {event_manager} from '../../common/js/event_manager.js'
	import {data_manager} from '../../common/js/data_manager.js'
	// import {common} from '../../common/js/common.js'
	import {ui} from '../../common/js/ui.js'
	import {ts_object} from '../../ts_object/js/ts_object.js'



/**
* RENDER_AREA_THESAURUS
* Manages the area apperance in client side
*/
export const render_area_thesaurus = function() {

	return true
}//end render_area_thesaurus



/**
* LIST
* Alias of edit
* @return DOM node
*/
render_area_thesaurus.prototype.list = async function(options={render_level:'full'}) {

	const self = this

	const render_level = options.render_level

	// content_data
		const current_content_data = await content_data(self)
		if (render_level==='content') {
			return current_content_data
		}

	const fragment = new DocumentFragment()

	// search filter node
		const filter = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'filter',
			parent 			: fragment
		})
		await self.filter.render().then(filter_wrapper =>{
			filter.appendChild(filter_wrapper)
		})

	// buttons
		//const current_buttons = await buttons(self);

	// wrapper. ui build_edit returns component wrapper
		const wrapper =	ui.area.build_wrapper_edit(self, {
			content_data : current_content_data,
			//buttons 	 : current_buttons
		})
		wrapper.appendChild(fragment)
	
	// change the mode of the thesaurus
	// when the user do click publish the tipo to go and set the mode in list
	// the action can be executed mainly in page, but it can be used for any instance.

	// swicht_term_model 
		const swicht_term_model = ui.create_dom_element({
			element_type 	: 'div',
			class_name		:'swicht_term_model',
			inner_html		: 'term',
			parent 		 	: wrapper,
		})

		swicht_term_model.addEventListener("click", e => {
			self.build_options.terms_are_model = self.build_options.terms_are_model ? false : true
			self.refresh()
		})


	return wrapper
}//end list



/**
* EDIT
* Render node for use in edit
* @return DOM node
*/
render_area_thesaurus.prototype.edit = async function(options={render_level:'full'}) {

	const self = this

	// const render_level = options.render_level

	// // content_data
	// 	const current_content_data = await content_data(self)
	// 	if (render_level==='content') {
	// 		return current_content_data
	// 	}

	// // buttons
	// 	//const current_buttons = await buttons(self);

	// // wrapper. ui build_edit returns component wrapper
	// 	const wrapper =	ui.area.build_wrapper_edit(self, {
	// 		content_data : current_content_data,
	// 		//buttons 	 : current_buttons
	// 	})


	return wrapper
}//end edit



/**
* CONTENT_DATA
* @return DOM node content_data
*/
const content_data = async function(self) {

	const fragment = new DocumentFragment()

	// widgets
		// const widgets_lenght = self.widgets.length
		// for (let i = 0; i < widgets_lenght; i++) {

		// 	const widget = self.widgets[i]

		// 	const widget_dom = build_widget(widget, self);
		// 	fragment.appendChild(widget_dom)
		// }	

	// container for list
		const ul = ui.create_dom_element({
			id 			 : 'thesaurus_list_wrapper',
			element_type : 'ul',
			parent 		 : fragment,
		})

	// elements
		const data 				= self.data.find(item => item.tipo === 'dd100')	
		const ts_nodes  		= data.value
		const typology_nodes 	= ts_nodes.filter(node => node.type === 'typology' )
		const typology_length 	= typology_nodes.length
		const hierarchy_nodes 	= ts_nodes.filter(node => node.type === 'hierarchy')

	//sort typologies by order field
		typology_nodes.sort((a, b) => parseFloat(a.order) - parseFloat(b.order));


		

		for (let i = 0; i < typology_length; i++) {

			// li
				const li = ui.create_dom_element({
					element_type : 'li',
					parent 		 : ul,
				})
			// typology_header 
				const typology_header = ui.create_dom_element({
					element_type 	: 'div',
					parent 		 	: li,
					class_name		:'typology_name',
					dataset			: {
										state		: 'show',
										section_id 	: typology_nodes[i].section_id
									  },
					inner_html		: typology_nodes[i].label,
					parent 			: li
				})
			// hierarchy sections
				const hierarchy_sections = hierarchy_nodes.filter(node => node.typology_section_id === typology_nodes[i].section_id)

			//sort hierarchy_nodes by alfabetic
				hierarchy_sections.sort((a, b) => new Intl.Collator().compare(a.target_section_name, b.target_section_name));
				const hierarchy_sections_length = hierarchy_sections.length

				for (let j = 0; j < hierarchy_sections_length; j++) {
					hierarchy_sections[j]

					// hierarchy wrapper 
						const hierarchy_wrapper = ui.create_dom_element({
							element_type 	: 'div',							
							class_name		: 'wrap_ts_object hierarchy_root_node',
							dataset			: {
												node_type			: 'hierarchy_node',
												section_tipo 		: hierarchy_sections[j].section_tipo,
												section_id 			: hierarchy_sections[j].section_id,
												target_section_tipo : hierarchy_sections[j].target_section_tipo,
											 },
							parent 		 	: li,
						})
					
					// hierarchy elements container
						const elements_contanier = ui.create_dom_element({
							element_type 	: 'div',
							class_name		:'elements_contanier',
							parent 		 	: hierarchy_wrapper,
							
						})
						// hierarchy link_children 
							const link_children = ui.create_dom_element({
								element_type 	: 'div',							
								class_name		:'list_thesaurus_element',
								id 				: hierarchy_sections[j].section_tipo+'_'+hierarchy_sections[j].section_id+'_root',
								dataset			: {
													tipo	: hierarchy_sections[j].children_tipo,
													type 	: 'link_children'
												 },
								parent 		 	: elements_contanier,
							})
					// hierarchy children_container 
							const children_container = ui.create_dom_element({
								element_type 	: 'div',							
								class_name		:'children_container',
								dataset			: {
													section_id	: hierarchy_sections[j].section_id,
													role 		: 'children_container'
												 },
								parent 		 	: hierarchy_wrapper,
							})

					// ts_object render
						ts_object.get_children(link_children)
				}
		}

		// ts_object



			// const hierarchy_root_nodes   = hierarchy_nodes.map(node => node.section_tipo+'_'+node.section_id+'_root')
			// const hierarchy_nodes_length = hierarchy_root_nodes.length
			// for (let i = 0; i < hierarchy_nodes_length; i++) {		
			
			// 	const root_node_id = hierarchy_root_nodes[i]				
				
			// 	// Launch ajax call promise
			// 		ts_object.get_children(root_node_id)			
			// }


	// for (let i = 0; i < typology_length; i++) {
	// 	const current_typology = typology_nodes[i]
	// 	const ul = ui.create_dom_element({
	// 		class_name 	 : "tipology_name",
	// 		element_type : 'div',
	// 		parent 		 : li,
	// 	})
	// }

	// content_data
		const content_data = document.createElement("div")
			  content_data.classList.add("content_data", self.type)
			  content_data.appendChild(fragment)


	return content_data
}//end content_data



/**
* BUILD_WIDGET
*/
const build_widget = (item, self) => {

	const container = ui.create_dom_element({
		id 			 : item.id,
		element_type : 'div',
		dataset 	 : {},
		class_name 	 : "widget_container"
	})

	// label
		const label = ui.create_dom_element({
			element_type : 'div',
			class_name 	 : "widget_label",
			parent 		 : container,
			inner_html	 : item.label || ''
		}).addEventListener("dblclick", function(e){
			const body = e.target.nextElementSibling
			body.classList.contains("display_none") ? body.classList.remove("display_none") : body.classList.add("display_none")
		})


	// body
		const body = ui.create_dom_element({
			element_type : 'div',
			class_name 	 : "widget_body",
			parent 		 : container
		})

		// item info
		if (item.info) {
			const widget_info = ui.create_dom_element({
				element_type : 'div',
				class_name 	 : "link",
				parent 		 : body,
				inner_html	 : item.info || ''
			})

			// action
				widget_info.addEventListener('mouseup',  async function(e){
					e.stopPropagation()

					// confirm optional
						if (item.confirm && !confirm(item.confirm)) {
							return false
						}

					widget_info.classList.add("lock")
					body_response.classList.add("preload")

					// data_manager
					const api_response = await data_manager.prototype.request({
						body : {
							dd_api		: item.trigger.dd_api,
							action 		: item.trigger.action,
							options 	: item.trigger.options
						}
					})
					// console.log("api_response:",api_response);

					print_response(body_response, api_response)

					widget_info.classList.remove("lock")
					body_response.classList.remove("preload")
				})
		}//end if (item.info) {

		// body info
		const body_info = ui.create_dom_element({
			element_type : 'div',
			class_name 	 : "body_info",
			parent 		 : body,
			inner_html	 : item.body || ''
		})

		const body_response = ui.create_dom_element({
			element_type : 'div',
			class_name 	 : "body_response",
			parent 		 : body,
		})

	// run widget scripts
		if(item.run) {
			//event_manager.subscribe('render_page', (page_wrapper) => {

				for (let i = 0; i < item.run.length; i++) {

					const func 			= item.run[i].fn
					const func_options  = item.run[i].options

					const js_promise = self[func].apply(self, [{
						...item,
						...func_options,
						body_response  : body_response,
						print_response : print_response
					}])
				}
			//})
		}


	return container
}//end build_widget



/**
* PRINT_RESPONSE
*/
const print_response = (container, api_response) => {

	// clean container
		while (container.firstChild) {
			container.removeChild(container.firstChild);
		}

	// clean (eraser)
		const eraser = ui.create_dom_element({
			element_type : 'span',
			class_name 	 : "clean",
			parent 		 : container
		})
		eraser.addEventListener("mouseup", function(e){
			e.stopPropagation();

			while (container.firstChild) {
				container.removeChild(container.firstChild);
			}
		})

	// msg
		const msg = ui.create_dom_element({
			element_type : 'div',
			class_name 	 : "",
			parent 		 : container,
			inner_html 	 : api_response.msg
		})

	// json response result
		const result = ui.create_dom_element({
			element_type : 'pre',
			class_name 	 : "",
			parent 		 : container,
			inner_html 	 : JSON.stringify(api_response, null, " ").replace(/\\n/g, "<br>")
		})

	container.classList.remove("preload")

	return container
}//end print_response



/**
* BUTTONS
* @return DOM node buttons
*/
const buttons = async function(self) {

	const buttons = []

	/*
	// button register tools
		const button_register_tools = ui.button.build_button({
			class_name 	: "button_register",
			label 		: "Register tools"
		})
		button_register_tools.addEventListener('mouseup', async (e) => {
			e.stopPropagation()
			//alert("Click here! ")

			// data_manager
			const api_response = await data_manager.prototype.request({
				body : {
					action 		: 'trigger',
					class_name 	: 'ontology',
					method 		: 'import_tools',
					options 	: {}
				}
			})
			console.log("+++ api_response:",api_response);
		})
		buttons.push(button_register_tools)
		*/

	return buttons
}//end buttons


