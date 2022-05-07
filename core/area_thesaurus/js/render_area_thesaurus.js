/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {event_manager} from '../../common/js/event_manager.js'
	import {data_manager} from '../../common/js/data_manager.js'
	// import {common} from '../../common/js/common.js'
	import {ui} from '../../common/js/ui.js'
	import {ts_object} from '../../ts_object/js/ts_object.js'



/**
* RENDER_AREA_THESAURUS
* Manages the area appearance in client side
*/
export const render_area_thesaurus = function() {

	return true
};//end render_area_thesaurus



/**
* LIST
* Alias of edit
* @return DOM node
*/
render_area_thesaurus.prototype.list = async function(options) {

	const self = this

	const render_level = options.render_level || 'full'

	// ts_object. Is a global page var
		// set mode. Note that ts_object is NOT an instance
		ts_object.thesaurus_mode = self.context.thesaurus_mode
		// set the initiator
		if(self.initiator){
			ts_object.initiator = self.initiator
		}

		// parse data
		const data = self.data.find(item => item.tipo==='dd100')

	// content_data
		if (render_level==='content') {

			if (data.ts_search) {

				// event_manager.when_in_dom(content_data, function(){
				// 	ts_object.parse_search_result(data.ts_search.result, null, false)
				// })

				// const observer = new IntersectionObserver(function(entries) {
				// 	const entry = entries[1] || entries[0]
				// 	if (entry.isIntersecting===true || entry.intersectionRatio > 0) {
				// 		observer.disconnect();
				// 		ts_object.parse_search_result(data.ts_search.result, null, false)
				// 	}
				// }, { threshold: [0] });
				// observer.observe(content_data);

				// event_manager.subscribe('render_'+self.id, exec_search)
				// function exec_search() {
				// 	ts_object.parse_search_result(data.ts_search.result, null, false)
				// }

				ts_object.parse_search_result(data.ts_search.result, null, false)
				// prevent to recreate content_data again
				const content_data = self.node[0].querySelector('.content_data.area')
				return content_data

			}else{

				const content_data = render_content_data(self)
				return content_data
			}
		}//end if (render_level==='content')

	const fragment = new DocumentFragment()

	// buttons
		const buttons_node = get_buttons(self);
		if(buttons_node){
			fragment.appendChild(buttons_node)
		}

	// search filter node
		if (self.filter) {
			const filter_container = ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'filter',
				parent			: fragment
			})
			self.filter_container = filter_container
			// self.filter.build().then(()=>{
			// 	self.filter.render().then(filter_wrapper =>{
			// 		filter_container.appendChild(filter_wrapper)
			// 	})
			// })
		}

	// content_data
		const content_data = render_content_data(self)
		// fragment.appendChild(content_data)

	// wrapper. ui build_edit returns component wrapper
		const wrapper =	ui.area.build_wrapper_edit(self, {
			content_data : content_data
		})
		wrapper.prepend(fragment)

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

	// ts_search case
		if (data.ts_search) {
			event_manager.subscribe('render_'+self.filter.id, exec_search)
			function exec_search() {
				ts_object.parse_search_result(data.ts_search.result, null, false)
			}
		}


	return wrapper
};//end list



/**
* EDIT
* Render node for use in edit
* @return DOM node
*/
	// render_area_thesaurus.prototype.edit = async function(options={render_level:'full'}) {

	// 	const self = this

	// 	// const render_level = options.render_level

	// 	// // content_data
	// 	// 	const content_data = await content_data(self)
	// 	// 	if (render_level==='content') {
	// 	// 		return content_data
	// 	// 	}

	// 	// // buttons
	// 	// 	//const current_buttons = buttons(self);

	// 	// // wrapper. ui build_edit returns component wrapper
	// 	// 	const wrapper =	ui.area.build_wrapper_edit(self, {
	// 	// 		content_data : content_data,
	// 	// 		//buttons 	 : current_buttons
	// 	// 	})


	// 	return wrapper
	// };//end edit



/**
* RENDER_CONTENT_DATA
* @return DOM node content_data
*/
const render_content_data = function(self) {

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
			id				: 'thesaurus_list_wrapper',
			element_type	: 'ul',
			parent			: fragment
		})

	// elements
		const data				= self.data.find(item => item.tipo==='dd100')
		const ts_nodes			= data.value
		const typology_nodes	= ts_nodes.filter(node => node.type==='typology' )
		const typology_length	= typology_nodes.length
		const hierarchy_nodes	= ts_nodes.filter(node => node.type==='hierarchy')

	// sort typologies by order field
		typology_nodes.sort((a, b) => parseFloat(a.order) - parseFloat(b.order));

	// iterate typology_nodes
		for (let i = 0; i < typology_length; i++) {

			// li
				const li = ui.create_dom_element({
					element_type : 'li',
					parent 		 : ul,
				})
			// typology_header
				const typology_header = ui.create_dom_element({
					element_type	: 'div',
					class_name		:'typology_name',
					dataset			: {
						state		: 'show',
						section_id	: typology_nodes[i].section_id
					},
					inner_html		: typology_nodes[i].label,
					parent			: li
				})
			// hierarchy sections
				const hierarchy_sections = hierarchy_nodes.filter(node => node.typology_section_id===typology_nodes[i].section_id)

			//sort hierarchy_nodes by alphabetic
				hierarchy_sections.sort((a, b) => new Intl.Collator().compare(a.target_section_name, b.target_section_name));
				const hierarchy_sections_length = hierarchy_sections.length

				for (let j = 0; j < hierarchy_sections_length; j++) {

					// hierarchy wrapper
						const hierarchy_wrapper = ui.create_dom_element({
							element_type	: 'div',
							class_name		: 'wrap_ts_object hierarchy_root_node',
							dataset			: {
												node_type			: 'hierarchy_node',
												section_tipo		: hierarchy_sections[j].section_tipo,
												section_id			: hierarchy_sections[j].section_id,
												target_section_tipo	: hierarchy_sections[j].target_section_tipo,
											 },
							parent			: li
						})

					// hierarchy elements container
						const elements_contanier = ui.create_dom_element({
							element_type	: 'div',
							class_name		:'elements_contanier',
							parent			: hierarchy_wrapper

						})
						// hierarchy link_children
							const link_children = ui.create_dom_element({
								element_type	: 'div',
								class_name		:'list_thesaurus_element',
								id				: hierarchy_sections[j].section_tipo+'_'+hierarchy_sections[j].section_id+'_root',
								dataset			: {
													tipo	: hierarchy_sections[j].children_tipo,
													type 	: 'link_children'
												 },
								parent			: elements_contanier
							})
					// hierarchy children_container
							const children_container = ui.create_dom_element({
								element_type	: 'div',
								class_name		:'children_container',
								dataset			: {
													section_id	: hierarchy_sections[j].section_id,
													role		: 'children_container'
												 },
								parent			: hierarchy_wrapper
							})

					// ts_object render
						ts_object.get_children(link_children)
				}
		}//end for (let i = 0; i < typology_length; i++)

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
};//end render_content_data



/**
* BUILD_WIDGET
*/
const build_widget = (item, self) => {

	const container = ui.create_dom_element({
		id				: item.id,
		element_type	: 'div',
		dataset			: {},
		class_name		: "widget_container"
	})

	// label
		const label = ui.create_dom_element({
			element_type	: 'div',
			class_name		: "widget_label",
			parent			: container,
			inner_html		: item.label || ''
		})
		label.addEventListener("dblclick", function(e){
			const body = e.target.nextElementSibling
			body.classList.contains("display_none") ? body.classList.remove("display_none") : body.classList.add("display_none")
		})

	// body
		const body = ui.create_dom_element({
			element_type	: 'div',
			class_name		: "widget_body",
			parent			: container
		})

		// item info
		if (item.info) {
			const widget_info = ui.create_dom_element({
				element_type	: 'div',
				class_name		: "link",
				parent			: body,
				inner_html		: item.info || ''
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
							dd_api	: item.trigger.dd_api,
							action	: item.trigger.action,
							options	: item.trigger.options
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
				element_type	: 'div',
				class_name		: "body_info",
				parent			: body,
				inner_html		: item.body || ''
			})
		// body response
			const body_response = ui.create_dom_element({
				element_type	: 'div',
				class_name		: "body_response",
				parent			: body
			})

	// run widget scripts
		if(item.run) {
			for (let i = 0; i < item.run.length; i++) {

				const func			= item.run[i].fn
				const func_options	= item.run[i].options

				const js_promise = self[func].apply(self, [{
					...item,
					...func_options,
					body_response  : body_response,
					print_response : print_response
				}])
			}
		}


	return container
};//end  build_widget



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
};//end print_response



/**
* GET_BUTTONS
* @return DOM node fragment
*/
const get_buttons = function(self) {

	const ar_buttons = self.context.buttons

	if(!ar_buttons) return null;

	const fragment = new DocumentFragment()

	// buttons node
		const buttons_wrapper = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'buttons',
			parent			: fragment
		})

		// filter button (search) . Show and hide all search elements
			const filter_button	= ui.create_dom_element({
				element_type	: 'button',
				class_name		: 'warning search',
				inner_html		: get_label.buscar || 'Search',
				parent			: buttons_wrapper
			})
			filter_button.addEventListener("click", function() {
				event_manager.publish('toggle_search_panel', this)
			})
			// ui.create_dom_element({
			// 	element_type	: 'span',
			// 	class_name		: 'button white search',
			// 	parent			: filter_button
			// })
			// filter_button.insertAdjacentHTML('beforeend', get_label.buscar)

		const ar_buttons_length = ar_buttons.length;
		for (let i = 0; i < ar_buttons_length; i++) {

			const current_button = ar_buttons[i]

			if(current_button.model==='button_delete') continue

			// button node
				const class_name	= 'warning ' + current_button.model
				const button_node	= ui.create_dom_element({
					element_type	: 'button',
					class_name		: class_name,
					inner_html		: current_button.label,
					parent			: buttons_wrapper
				})
				button_node.addEventListener('click', (e) => {
					e.stopPropagation()

					switch(current_button.model){
						case 'button_new':
							event_manager.publish('new_section_' + self.id)
							break;
						case 'button_import':
							tool_common.open_tool({
								tool_context	: current_button.tools[0],
								caller			: self
							})
							break;
						default:
							event_manager.publish('click_' + current_button.model)
							break;
					}
				})
		}//end for (let i = 0; i < ar_buttons_length; i++)

	// tools
		ui.add_tools(self, buttons_wrapper)

	return fragment
};//end get_buttons


