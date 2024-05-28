// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global SHOW_DEBUG */
/*eslint no-undef: "error"*/



// imports
	import {event_manager} from '../../common/js/event_manager.js'
	import {ui} from '../../common/js/ui.js'
	import {
		clone,
		get_font_fit_size,
		// url_vars_to_object,
		object_to_url_vars,
		open_window
	} from '../../common/js/utils/index.js'
	// import {create_source, push_browser_history} from '../../common/js/common.js'
	import {open_tool} from '../../../tools/tool_common/js/tool_common.js'
	import {view_default_list_section} from './view_default_list_section.js'
	import {view_graph_list_section} from './view_graph_list_section.js'
	import {view_base_list_section} from './view_base_list_section.js'



/**
* RENDER_LIST_SECTION
* Manages the component's logic and appearance in client side
*/
export const render_list_section = function() {

	return true
}//end render_list_section



/**
* LIST
* Render node for use in list
* @param object options
* sample:
* {
*    "render_level": "full",
*    "render_mode": "list"
* }
* @return HTMLElement wrapper
*/
render_list_section.prototype.list = async function(options) {

	const self = this

	// view
		const view = self.context?.view || 'default'

	// wrapper
		switch(view) {

			// case 'mosaic':
			// 	return view_mosaic_edit_portal.render(self, options)

			case 'base':
				return view_base_list_section.render(self, options)

			case 'graph':
				return view_graph_list_section.render(self, options)

			case 'default':
			default: {
				// dynamic try
					const render_view = self.render_views.find(el => el.view===view && el.mode===self.mode)
					if (render_view) {
						const path			= render_view.path || './' + render_view.render +'.js'
						const render_method	= await import (path)
						return render_method[render_view.render].render(self, options)
					}

				return view_default_list_section.render(self, options)
			}
		}
}//end list



/**
* RENDER_COLUMN_ID
* Custom render to generate the section list column id.
* Is called as callback from section_record
* @param object options
* @return DOM DocumentFragment
*/
export const render_column_id = function(options) {

	// options
		const self			= options.caller // object instance, usually section or portal
		const section_id	= options.section_id
		const section_tipo	= options.section_tipo
		const paginated_key	= options.paginated_key // int . Current item paginated_key in all result

	// permissions
		const permissions = self.permissions

	// show_interface
		const show_interface = self.show_interface || {}

	// DocumentFragment
		const fragment = new DocumentFragment()

	// section_id
		const section_id_node = ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'section_id',
			text_content	: section_id
		})
		if(SHOW_DEBUG===true) {
			section_id_node.title = 'paginated_key: ' + paginated_key
		}
		// adjust the font size to fit it into the column
		// @see https://www.freecodecamp.org/news/learn-css-units-em-rem-vh-vw-with-code-examples/#what-are-vw-units
		const base_size	= 1.25 // defined as --font_size: 1.25rem; into CSS (list.less)
		const font_size	= get_font_fit_size(section_id, base_size, 4)
		if (font_size!==base_size) {
			section_id_node.style.setProperty('--font_size', `${font_size}rem`);
		}

	// buttons
		switch(true){

			// initiator. is a url var used in iframe containing section list to link to opener portal
			case (self.initiator && self.initiator.indexOf('component_')!==-1): {

				// link_button. component portal caller (link)
					const link_button = ui.create_dom_element({
						element_type	: 'button',
						class_name		: 'link_button',
						parent			: fragment
					})
					link_button.addEventListener('click', function(e) {
						e.stopPropagation()

						const top_window = window.parent
						if (!top_window.event_manager) {
							console.error('Unable to get top_window event_manager:', top_window);
							return
						}

						// top window event
						top_window.event_manager.publish('initiator_link_' + self.initiator, {
							section_tipo	: section_tipo,
							section_id		: section_id
						})
					})
					link_button.appendChild(section_id_node)
					// link_icon
					ui.create_dom_element({
						element_type	: 'span',
						class_name		: 'button link icon',
						parent			: link_button
					})

				// button_edit
					// const button_edit = ui.create_dom_element({
					// 	element_type	: 'button',
					// 	class_name		: 'button_edit',
					// 	parent			: fragment
					// })
					// button_edit.addEventListener('click', async function(){
					// 	// navigate link
					// 		// const user_navigation_options = {
					// 		// 	tipo		: section_tipo,
					// 		// 	section_id	: section_id,
					// 		// 	model		: self.model,
					// 		// 	mode		: 'edit'
					// 		// }
					// 		const user_navigation_rqo = {
					// 			caller_id	: self.id,
					// 			source		: {
					// 				action			: 'search',
					// 				model			: 'section',
					// 				tipo			: section_tipo,
					// 				section_tipo	: section_tipo,
					// 				mode			: 'edit',
					// 				lang			: self.lang
					// 			},
					// 			sqo : {
					// 				section_tipo		: [{tipo : section_tipo}],
					// 				limit				: 1,
					// 				offset				: 0,
					// 				filter_by_locators	: [{
					// 					section_tipo : section_tipo,
					// 					section_id : section_id
					// 				}]
					// 			}
					// 		}

					// 		if(SHOW_DEBUG===true) {
					// 			console.log("// section_record build_id_column user_navigation_rqo initiator component:", user_navigation_rqo);
					// 		}
					// 		event_manager.publish('user_navigation', user_navigation_rqo)

					// 	// detail_section
					// 		// ( async () => {
					// 		// 	const options = {
					// 		// 		model 			: 'section',
					// 		// 		type			: 'section',
					// 		// 		tipo			: self.section_tipo,
					// 		// 		section_tipo  	: self.section_tipo,
					// 		// 		section_id 		: self.section_id,
					// 		// 		mode 			: 'edit',
					// 		// 		lang 			: page_globals.dedalo_data_lang
					// 		// 	}
					// 		// 	const page_element_call	= await data_manager.get_page_element(options)
					// 		// 	const page_element		= page_element_call.result

					// 		// 	// detail_section instance. Create target section page element and instance
					// 		// 		const detail_section = await get_instance(page_element)

					// 		// 		// set self as detail_section caller (!)
					// 		// 			detail_section.caller = initiator

					// 		// 		// load data and render wrapper
					// 		// 			await detail_section.build(true)
					// 		// 			const detail_section_wrapper = await detail_section.render()

					// 		// 	// modal container (header, body, footer, size)
					// 		// 		const header = ui.create_dom_element({
					// 		// 			element_type	: 'div',
					// 		// 			text_content 	: detail_section.label
					// 		// 		})
					// 		// 		const modal = ui.attach_to_modal(header, detail_section_wrapper, null, 'big')
					// 		// 		modal.on_close = () => {
					// 		// 			detail_section.destroy(true, true, true)
					// 		// 		}
					// 		// })()

					// 	// iframe
					// 		// ( async () => {
					// 		// 	const iframe = ui.create_dom_element({
					// 		// 		element_type	: 'iframe',
					// 		// 		src 			: DEDALO_CORE_URL + '/page/?tipo=' + self.section_tipo + '&section_id=' + self.section_id + '&mode=edit'
					// 		// 	})
					// 		// 	// modal container (header, body, footer, size)
					// 		// 		const header = ui.create_dom_element({
					// 		// 			element_type	: 'div',
					// 		// 			text_content 	: detail_section.label
					// 		// 		})
					// 		// 		const modal = ui.attach_to_modal(header, iframe, null, 'big')
					// 		// 		modal.on_close = () => {
					// 		// 			detail_section.destroy(true, true, true)
					// 		// 	}
					// 		// })()
					// })
					// button_edit.appendChild(section_id_node)
					// // edit_icon
					// 	ui.create_dom_element({
					// 		element_type	: 'span',
					// 		class_name		: 'button edit icon',
					// 		parent			: button_edit
					// 	})
				break;
			}

			case (self.config && self.config.source_model==='section_tool'): {

				// button_edit (pen)
				if (self.permissions>1) {

					const button_edit = ui.create_dom_element({
						element_type	: 'button',
						class_name		: 'button_edit list_'+ self.config.tool_context.name,
						parent			: fragment
					})
					button_edit.addEventListener('click', function(e){
						e.stopPropagation();

						// tool_context
							const tool_context = self.config.tool_context

						// section_id_selected (!) Important to allow parse 'self' values
							self.section_id_selected = section_id

						// parse ddo_map section_id. (!) Unnecessary. To be done at tool_common init
							// tool_context.tool_config.ddo_map.map(el => {
							// 	if (el.section_id==='self') {
							// 		el.section_id = section_id
							// 	}
							// })

						// open_tool (tool_common)
							open_tool({
								tool_context	: tool_context,
								caller			: self
							})
					})
					button_edit.appendChild(section_id_node)
					// edit_icon
					ui.create_dom_element({
						element_type	: 'span',
						class_name		: 'button edit icon',
						parent			: button_edit
					})
				}
				break;
			}

			case (self.tipo==='dd542'): {

				// activity case

				const button_edit = ui.create_dom_element({
					element_type	: 'div',
					class_name		: 'section_id_container',
					parent			: fragment
				})

				button_edit.appendChild(section_id_node)
				break;
			}

			default: {

				// button_edit (pen)
					if (permissions>1) {

						// button_edit
							const button_edit = ui.create_dom_element({
								element_type	: 'button',
								class_name		: 'button_edit',
								parent			: fragment
							})
							// open_window action
							button_edit.open_window = (features) => {

								// open a new window
								const url = DEDALO_CORE_URL + '/page/?' + object_to_url_vars({
									tipo			: section_tipo,
									section_tipo	: section_tipo,
									id				: section_id,
									mode			: 'edit',
									session_save	: false, // prevent to overwrite current section session
									menu			: true
								})
								open_window({
									url			: url,
									name		: 'record_view_' + section_id,
									features	: features || null,
									on_blur : () => {
										// refresh current instance
										self.refresh({
											build_autoload : true
										})
									}
								})
							}//end open_window
							// navigate action
							button_edit.navigate = () => {

								// MODE USING PAGE USER_NAVIGATION
								// sqo. Note that sqo will be used as request_config.sqo on navigate
									const sqo = clone(self.request_config_object.sqo)
									// set updated filter
									sqo.filter = self.rqo.sqo.filter
									// reset pagination
									sqo.limit	= 1
									sqo.offset	= paginated_key

								// source
									const source = {
										action				: 'search',
										model				: self.model, // 'section'
										tipo				: section_tipo,
										section_tipo		: section_tipo,
										// section_id		: section_id, // (!) enabling affect local db stored rqo's
										section_id_selected	: section_id,
										mode				: 'edit',
										lang				: self.lang
									}

								// user_navigation
									const user_navigation_rqo = {
										caller_id	: self.id,
										source		: source,
										sqo			: sqo
									}
									// page js is observing this event
									event_manager.publish('user_navigation', user_navigation_rqo)
							}//end navigate

							// contextmenu event
							// Prevent to show the context menu
							// open new window with the content
							// if user has alt pressed, open new tab
							button_edit.addEventListener('contextmenu', (e) => {
								e.stopPropagation()
								e.preventDefault();
								console.log('e:', e);

								// if alt is pressed open new tab instead new window
								const features = e.altKey===true
									? 'new_tab'
									: null

								// function to execute. see definition in common.set_context_vars
								// values: string navigate|open_window
								const fn = show_interface.button_edit_options?.action_contextmenu || 'open_window'
								if (typeof button_edit[fn]==='function') {
									return button_edit[fn](features)
								}
							})
							// mousedown event
							button_edit.addEventListener('mousedown', (e) => {
								e.stopPropagation()

								// if the user click with right mouse button, stop here
								if (e.which == 3 || e.altKey===true) {
									return
								}

								// function to execute. see definition in common.set_context_vars
								// values: string navigate|open_window
								const fn = show_interface.button_edit_options?.action_mousedown || 'navigate'
								if (typeof button_edit[fn]==='function') {
									return button_edit[fn]()
								}

								/* MODE USING SECTION change_mode
									// menu. Get from caller page
										const menu = self.caller && self.caller.ar_instances
											? self.caller.ar_instances.find(el => el.model==='menu')
											: null;
									// change section mode. Creates a new instance and replace DOM node wrapper
										self.change_mode({
											mode : 'edit'
										})
										.then(function(new_instance){

											async function section_label_on_click(e) {
												e.stopPropagation();

												new_instance.change_mode({
													mode : 'list'
												})
												.then(function(list_instance){

													// update_section_label value
													menu.update_section_label({
														value					: list_instance.label,
														mode					: 'list',
														section_label_on_click	: null
													})

													// update browser url and navigation history
													const source	= create_source(list_instance, null)
													const sqo		= list_instance.request_config_object.sqo
													const title		= list_instance.id
													// url search. Append section_id if exists
													const url_vars = url_vars_to_object({
														tipo : list_instance.tipo,
														mode : list_instance.mode
													})
													const url = '?' + object_to_url_vars(url_vars)
													// browser navigation update
													push_browser_history({
														source	: source,
														sqo		: sqo,
														title	: title,
														url		: url
													})
												})
											}//end section_label_on_click

											// update_section_label value
												menu.update_section_label({
													value					: new_instance.label,
													mode					: new_instance.mode,
													section_label_on_click	: section_label_on_click
												})

											// update browser url and navigation history
												const source	= create_source(new_instance, null)
												const sqo		= new_instance.request_config_object.sqo
												const title		= new_instance.id
												// url search. Append section_id if exists
												const url_vars = url_vars_to_object({
													tipo : new_instance.tipo,
													mode : new_instance.mode
												})
												const url = '?' + object_to_url_vars(url_vars)
												// browser navigation update
												push_browser_history({
													source	: source,
													sqo		: sqo,
													title	: title,
													url		: url
												})
										})//end then
										*/
							})
							button_edit.appendChild(section_id_node)

						// edit_icon
							ui.create_dom_element({
								element_type	: 'span',
								class_name		: 'button edit icon',
								parent			: button_edit
							})
					}

				// button_delete (trash can)
					const button_delete = self.context.buttons && self.context.buttons.length
						? self.context.buttons.find(el => el.model==='button_delete')
						: null
					if (button_delete, self.show_interface.button_delete===true) {
						// delete_button
							const delete_button = ui.create_dom_element({
								element_type	: 'button',
								class_name		: 'button_delete',
								parent			: fragment
							})
							delete_button.addEventListener('click', function(e){
								e.stopPropagation()

								// fire delete_section event, see section.init
								event_manager.publish('delete_section_' + options.caller.id, {
									section_tipo	: section_tipo,
									section_id		: section_id,
									caller			: options.caller, // section
									sqo				: {
										section_tipo		: [section_tipo],
										filter_by_locators	: [{
											section_tipo	: section_tipo,
											section_id		: section_id
										}],
										limit				: 1
									}
								})
							})
						// delete_icon
							ui.create_dom_element({
								element_type	: 'span',
								class_name		: 'button delete_light icon',
								parent			: delete_button
							})
					}
				break;
			}
		}


	return fragment
}//end render_column_id



// @license-end
