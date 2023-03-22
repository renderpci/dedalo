/*global SHOW_DEBUG */
/*eslint no-undef: "error"*/



// imports
	import {event_manager} from '../../common/js/event_manager.js'
	import {ui} from '../../common/js/ui.js'
	import {open_tool} from '../../../tools/tool_common/js/tool_common.js'
	import {clone, get_font_fit_size} from '../../common/js/utils/index.js'
	import {view_default_list_section} from './view_default_list_section.js'



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
* @return HTMLElement wrapper
*/
render_list_section.prototype.list = async function(options) {

	const self = this

	// view
		const view	= self.context.view

	// wrapper
		switch(view) {

			// case 'mosaic':
			// 	return view_mosaic_edit_portal.render(self, options)
			// 	break;

			default:
				// dynamic try
					const render_view = self.render_views.find(el => el.view === view && el.mode === self.mode)
					if (render_view) {
						const path			= render_view.path || './' + render_view.render +'.js'
						const render_method	= await import (path)
						return render_method[render_view.render].render(self, options)
					}

				return view_default_list_section.render(self, options)
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
		const base_size = 1.25 // defined as --font_size: 1.25rem; into CSS (list.less)
		const font_size	= get_font_fit_size(section_id, base_size, 4)
		if (font_size!==base_size) {
			section_id_node.style.setProperty('--font_size', `${font_size}rem`);
		}

	// buttons
		switch(true){

			// initiator. is a url var used in iframe containing section list to link to opener portal
			case (self.initiator && self.initiator.indexOf('component_')!==-1):

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
				break

			// case (self.initiator && self.initiator.indexOf('tool_time_machine')!==-1):
				// 	// button time machine preview (eye)
				// 		const button_edit = ui.create_dom_element({
				// 			element_type	: 'button',
				// 			class_name		: 'button_edit',
				// 			parent			: fragment
				// 		})
				// 		button_edit.addEventListener("click", function(){
				// 			// publish event
				// 			event_manager.publish('tm_edit_record', {
				// 				tipo		: section_tipo,
				// 				section_id	: section_id,
				// 				matrix_id	: matrix_id,
				// 				date		: modification_date || null,
				// 				mode		: 'tm'
				// 			})
				// 		})
				// 		button_edit.appendChild(section_id_node)
				// 		// eye_icon
				// 			ui.create_dom_element({
				// 				element_type	: 'span',
				// 				class_name		: 'button eye icon',
				// 				parent			: button_edit
				// 			})
				// 	break

			case (self.config && self.config.source_model==='section_tool'):

				// edit button (pen)
					if (self.permissions>1) {
						// const text_edit_button = ui.create_dom_element({
						// 	element_type	: 'div',
						// 	class_name		: 'self.config.tool_context.name',
						// 	inner_html 		: ' ' + self.config.tool_context.label,
						// 	parent			: fragment
						// })

						const button_edit = ui.create_dom_element({
							element_type	: 'button',
							class_name		: 'button_edit list_'+ self.config.tool_context.name,
							parent			: fragment
						})
						button_edit.addEventListener("click", function(e){
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

							// const tool_icon = ui.create_dom_element({
							// 	element_type	: 'img',
							// 	class_name		: self.config.tool_context.name,
							// 	src 			: self.config.tool_context.icon,
							// 	parent			: button_edit
							// })

						// edit_icon
							ui.create_dom_element({
								element_type	: 'span',
								class_name		: 'button edit icon',
								parent			: button_edit
							})
					}
				break;

			case (self.tipo==='dd542') :

				// activity case

				const button_edit = ui.create_dom_element({
					element_type	: 'div',
					class_name		: 'section_id_container',
					parent			: fragment
				})

				button_edit.appendChild(section_id_node)
				break;

			default:

				// button_edit (pen)
					if (permissions>1) {
						// button_edit
							const button_edit = ui.create_dom_element({
								element_type	: 'button',
								class_name		: 'button_edit',
								parent			: fragment
							})
							button_edit.addEventListener('click', function(){

								// sqo. Note that sqo will be used as request_config.sqo on navigate
									const sqo = clone(self.request_config_object.sqo)
									// set updated filter
									sqo.filter = self.rqo.sqo.filter
									// reset pagination
									sqo.limit	= 1
									sqo.offset	= paginated_key

								// source
									const source = {
										action			: 'search',
										model			: self.model, // 'section'
										tipo			: section_tipo,
										section_tipo	: section_tipo,
										// section_id	: section_id, // (!) enabling affect local db stored rqo's
										mode			: 'edit',
										lang			: self.lang
									}

								// user_navigation
									const user_navigation_rqo = {
										caller_id	: self.id,
										source		: source,
										sqo			: sqo
									}
									// page js is observing this event
									event_manager.publish('user_navigation', user_navigation_rqo)
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
					const button_delete = self.context.buttons
						? self.context.buttons.find(el => el.model==='button_delete')
						: null
					if (button_delete) {
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


	return fragment
}//end render_column_id
