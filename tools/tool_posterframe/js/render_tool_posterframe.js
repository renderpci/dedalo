/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL, tool_posterframe */
/*eslint no-undef: "error"*/



// imports
	// import {event_manager} from '../../../core/common/js/event_manager.js'
	import {ui} from '../../../core/common/js/ui.js'



/**
* RENDER_TOOL_POSTERFRAME
* Manages the component's logic and appearance in client side
*/
export const render_tool_posterframe = function() {

	return true
};//end render_tool_posterframe



/**
* EDIT
* Render tool DOM nodes
* This function is called by render common attached in 'tool_posterframe.js'
* @param object options
* @return DOM node
*/
render_tool_posterframe.prototype.edit = async function(options) {

	const self = this

	// options
		const render_level = options.render_level || 'full'

	// content_data
		const content_data = await get_content_data(self)
		if (render_level==='content') {
			return content_data
		}

	// wrapper. ui build_edit returns a standard built tool wrapper
		const wrapper = ui.tool.build_wrapper_edit(self, {
			content_data : content_data
		})

	// main_element_container
		const main_element_container = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'main_element_container',
			// parent		: wrapper
		})
		wrapper.tool_header.after(main_element_container)
		// spinner
		const spinner = ui.create_dom_element({
			element_type	: 'div',
			class_name		: "spinner",
			parent			: main_element_container
		})
		// rebuild it in 'player' mode to get stream info (allow navidation frame by frame)
		self.main_element.mode = 'player'
		self.main_element.build(true)
		.then(async function(){
			setTimeout(function(){
				self.main_element.render()
				.then(function(component_node){
					main_element_container.appendChild(component_node)
					spinner.remove()
				})
			}, 10)

		})

	// modal container
		// if (!window.opener) {
		// 	const header	= wrapper.tool_header // is created by ui.tool.build_wrapper_edit
		// 	const modal		= ui.attach_to_modal(header, wrapper, null)
		// 	modal.on_close	= () => {
		// 		self.caller.refresh()
		// 		// when closing the modal, common destroy is called to remove tool and elements instances
		// 		self.destroy(true, true, true)
		// 	}
		// }


	return wrapper
};//end edit



/**
* GET_CONTENT_DATA
* Render tool body or 'content_data'
* @param instance self
* @return DOM node content_data
*/
const get_content_data = async function(self) {

	const fragment = new DocumentFragment()

	// main_element_container
		// const main_element_container = ui.create_dom_element({
		// 	element_type	: 'div',
		// 	class_name		: 'main_element_container',
		// 	parent			: fragment
		// })
		// // temporal image to show while main_element is rebuilt and rendered
		// const main_element_image = ui.create_dom_element({
		// 	element_type	: 'img',
		// 	src				: self.main_element.data.posterframe_url,
		// 	parent			: main_element_container
		// })
		// // rebuild it in 'player' mode to get stream info (allow navidation frame by frame)
		// self.main_element.mode = 'player'
		// self.main_element.build(true)
		// .then(async function(){
		// 	const component_node = await self.main_element.render()
		// 	main_element_image.remove()
		// 	main_element_container.appendChild(component_node)
		// })

	// buttons_container
		const buttons_container = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'buttons_container',
			parent			: fragment
		})
		const buttons_wrapper = get_buttons(self)
		buttons_container.appendChild(buttons_wrapper)

	// content_data
		const content_data = ui.create_dom_element({
			element_type	: 'div'
		})
		content_data.appendChild(fragment)


	return content_data
};//end get_content_data



/**
* GET_BUTTONS
* @param object instance self
* @return DOM node buttons_wrapper
*/
const get_buttons = function(self) {

	const fragment = new DocumentFragment()

	// identifying_image_block
		const identifying_image_block = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'identifying_image_block',
			parent			: fragment
		})

		// button_create_identifying_image
			const button_create_identifying_image = ui.create_dom_element({
				element_type	: 'button',
				class_name		: 'light create_identifying_image',
				inner_html		: get_label.crear_imagen_identificativa || 'Create identifying image',
				parent			: identifying_image_block
			})
			button_create_identifying_image.addEventListener("click", async function(){
				identifying_image_block.classList.add('loading')
				const item_value	= JSON.parse(identifying_image_selector.value)
				const current_time	= self.main_element.video.currentTime
				await self.create_identifying_image(item_value, current_time)
				identifying_image_block.classList.remove('loading')
			})

		// identifying_image_selector
			const identifying_image_selector = ui.create_dom_element({
				element_type	: 'select',
				class_name		: 'identifying_image_selector',
				parent			: identifying_image_block
			})
			// options
			self.get_ar_identifying_image()
			.then(function(ar_identifying_image){

				const ar_identifying_image_length = ar_identifying_image.length
				for (let i = 0; i < ar_identifying_image_length; i++) {

					const item = ar_identifying_image[i]
					// option
					ui.create_dom_element({
						element_type	: 'option',
						value			: JSON.stringify(item),
						inner_html		: item.label + ' - ' + item.section_id,
						parent			: identifying_image_selector
					})
				}
			})

	// manage_posterframe_block
		const manage_posterframe_block = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'manage_posterframe_block',
			parent			: fragment
		})

		// button_create_posterframe
			const button_create_posterframe = ui.create_dom_element({
				element_type	: 'button',
				class_name		: 'warning gear create_posterframe',
				inner_html		: get_label.crear || 'Create',
				parent			: manage_posterframe_block
			})
			button_create_posterframe.addEventListener("click", async function(){
				image_posterframe.classList.add('loading')
				const current_time = self.main_element.video.currentTime
				await self.create_posterframe(current_time)
				if (self.main_element.data.posterframe_url===page_globals.fallback_image) {
					// initial no posterframe case
					await self.main_element.refresh()
				}
				image_posterframe.src = self.main_element.data.posterframe_url + '?' + Math.random()
				image_posterframe.classList.remove('loading')
			})

		// button_delete_posterframe
			const button_delete_posterframe = ui.create_dom_element({
				element_type	: 'button',
				class_name		: 'light delete delete_posterframe',
				inner_html		: get_label.borrar || 'Delete',
				parent			: manage_posterframe_block
			})
			button_delete_posterframe.addEventListener("click", async function(){
				image_posterframe.classList.add('loading')
				const deleted = await self.delete_posterframe()
				image_posterframe.src = deleted===true
					? page_globals.fallback_image
					: self.main_element.data.posterframe_url + '?' + Math.random()
				image_posterframe.classList.remove('loading')
			})

		// image_posterframe
			const image_posterframe = ui.create_dom_element({
				element_type	: 'img',
				class_name		: 'image_posterframe',
				src				: self.main_element.data.posterframe_url + '?' + Math.random(),
				parent			: fragment
			})
			// const token = event_manager.subscribe('render_'+self.main_element.id, fn_update_posterframe)
			// self.events_tokens.push(token)
			// function fn_update_posterframe() {
			// 	image_posterframe.src = self.main_element.data.posterframe_url + '?' + Math.random()
			// 	console.log("updated image_posterframe.src:", image_posterframe.src);
			// 	event_manager.unsubscribe(token)
			// }


	// buttons_wrapper
		const buttons_wrapper = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'buttons_wrapper'
		})
		buttons_wrapper.appendChild(fragment)


	return buttons_wrapper
}//end get_buttons



