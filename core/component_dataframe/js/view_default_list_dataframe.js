// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, DEDALO_CORE_URL, Promise */
/*eslint no-undef: "error"*/



// imports
	import {ui} from '../../common/js/ui.js'
	import {get_instance} from '../../common/js/instances.js'



/**
* VIEW_DEFAULT_LIST_DATAFRAME
* Manage the components logic and appearance in client side
*/
export const view_default_list_dataframe = function() {

	return true
}//end view_default_list_dataframe



/**
* RENDER
* Manages the component's logic and appearance in client side
* @param object self
* @param object options
* @return promise
* 	DOM node wrapper
*/
view_default_list_dataframe.render = async function(self, options) {

	// options
		const render_level = options.render_level || 'full'

	// content_data
		const content_data = get_content_data(self)
		if (render_level==='content') {
			return content_data
		}

	// wrapper. ui build_edit returns component wrapper
		const wrapper = ui.component.build_wrapper_edit(self, {
			content_data	: content_data,
			label			: null
		})
		// set pointers
		wrapper.content_data = content_data


	return wrapper
}//end render



/**
* GET_CONTENT_DATA
* @param object self
* @return HTMLElement content_data
*/
const get_content_data = function(self) {

	// content_data
		const content_data = ui.component.build_content_data(self)

	// content_value. render content_value node
		const content_value = render_content_value({
			self : self
		})
		content_data.appendChild(content_value)


	return content_data
}//end get_content_data



/**
* RENDER_CONTENT_VALUE
* @param object options
* {
* 	self : object instance
* }
* @return HTMLElement content_value
*/
const render_content_value = function(options) {

	// options
		const self	= options.self

	// short vars
		const data	= self.data || {}
		const value	= data.value || []
		const default_bk_color = '#006ed2';

	// content_value
		const content_value = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'content_value'
		})

	// button_activate
		const button_activate = ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'button activate',
			text_content 	:  self.properties.label || '?',
			parent			: content_value
		})
		button_activate.addEventListener('mousedown', fn_mousedown)
		function fn_mousedown(e) {
			e.stopPropagation()

			// debug selecting instance case
			if (e.altKey) {
				return
			}

			if(value.length<1) {

				// hide self button
				button_activate.classList.add('hide')

				// show add button
				button_new.classList.remove('hide')

				// restore class after time interval
				setTimeout(function(){
					[button_activate,button_new].map(el => {
						el.classList.toggle('hide')
					})
				}, 5000)

			}else{

				// open modal
				open_target_section(self)
			}
		}//end fn_mousedown

		if(value.length >= 1) {

			const rating_data = self.get_rating()
			if(rating_data && rating_data.value){

				const rating_value = rating_data.value[0]
				const rating = (rating_value)
					? rating_data.datalist.find(el => el.section_id === rating_value.section_id )
					: {
						hide:[{
							literal: default_bk_color // gray/blue when the datalist is empty (the rating is not set)
						}]
					}

				// update background color
					const bg_color = rating.hide[0].literal || default_bk_color
					button_activate.style.backgroundColor = bg_color

				// update text color based on background
					const text_color = ui.get_text_color(bg_color)
					button_activate.style.color = text_color
			}
		}

	// button_new
		const button_new = ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'button add icon hide',
			title			: get_label.new || 'New',
			parent			: content_value
		})
		button_new.addEventListener('click', function (e) {
			e.stopPropagation()

			self.create_new_section({
				data : data
			})
			.then(function() {

				// open modal
				open_target_section(self)
			})
		})


	return content_value
}//end render_content_value



/**
* OPEN_TARGET_SECTION
* Create the target section and open it in a modal
* @param object self
*/
const open_target_section = async function (self) {

	// last_value. Get the last value of the portal to open the new section
		const last_value	= self.data.value[self.data.value.length-1]
		const section_tipo	= last_value.section_tipo
		const section_id	= last_value.section_id

	// body
		const body = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'body block',
			style			: {
				height : '34rem'
			}
		})

	// header
		const header = self.target_section[0].label

	// footer
		const footer_container = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'content center'
		})
		// button_delete
			const button_delete = ui.create_dom_element({
				element_type	: 'button',
				class_name		: 'delete icon danger',
				inner_html		: get_label.delete || 'Delete',
				parent			: footer_container
			})
			button_delete.addEventListener('click', async function (e) {
				e.stopPropagation()

				// stop if the user don't confirm
				if (!confirm(get_label.sure)) {
					return
				}

				footer_container.classList.add('loading')

				// hard_delete
					// const hard_delete = (self.context.properties.hard_delete)
					// 	? self.context.properties.hard_delete
					// 	: false

					// if(hard_delete){
					// 	self.delete_linked_record({
					// 		section_id : section_id,
					// 		section_tipo : section_tipo,
					// 	})
					// }

				// soft delete (default)
					self.unlink_record({
						paginated_key	: 0,
						row_key			: false,
						section_id		: section_id
					})

				// close modal
					modal.close()

				footer_container.classList.remove('loading')
			})

	// modal. Create a modal to attach the section node
		const modal = ui.attach_to_modal({
			header		: header,
			body		: body,
			footer		: footer_container,
			callback : () => {
				ui.load_item_with_spinner({
					container	: body,
					label		: 'section',
					callback	: async () => {

						// section. Create the target section instance
						const section = await get_instance({
							model			: 'section',
							mode			: 'edit',
							tipo			: section_tipo,
							section_tipo	: section_tipo,
							section_id		: section_id,
							inspector		: false,
							session_save	: false,
							session_key		: 'section_' + section_tipo + '_' + self.tipo
						})
						await section.build(true)
						const section_node = await section.render()

						return section_node
					}
				})
			}
		})
		modal.on_close = function(){
			self.refresh({
				build_autoload : true
			})
		}
}//end open_target_section



// @license-end
