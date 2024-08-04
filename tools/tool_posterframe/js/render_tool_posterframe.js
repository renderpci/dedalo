// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL, tool_posterframe */
/*eslint no-undef: "error"*/



// imports
	import {ui} from '../../../core/common/js/ui.js'



/**
* RENDER_TOOL_POSTERFRAME
* Manages the component's logic and appearance in client side
*/
export const render_tool_posterframe = function() {

	return true
}//end render_tool_posterframe



/**
* EDIT
* Render tool DOM nodes
* This function is called by render common attached in 'tool_posterframe.js'
* @param object options
* @return HTMLElement wrapper
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
		// set pointers
		wrapper.content_data = content_data

	// main_element_container
		const main_element_container = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'main_element_container'
		})
		wrapper.tool_header.after(main_element_container)
		// spinner
		const spinner = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'spinner',
			parent			: main_element_container
		})
		// rebuild it in 'player' mode to get stream info (allow navigation frame by frame)
		self.main_element.build(true)
		.then(async function(){
			setTimeout(function(){
				self.main_element.mode = 'edit'
				self.main_element.context.view = 'player'
				self.main_element.render()
				.then(function(component_node){
					main_element_container.appendChild(component_node)
					spinner.remove()
				})
			}, 10)
		})


	return wrapper
}//end edit



/**
* GET_CONTENT_DATA
* Render tool body or 'content_data'
* @param instance self
* @return HTMLElement content_data
*/
const get_content_data = async function(self) {

	const fragment = new DocumentFragment()

	// buttons_container
		const buttons_container = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'buttons_container',
			parent			: fragment
		})
		const buttons_wrapper = get_buttons(self)
		buttons_container.appendChild(buttons_wrapper)

	// content_data
		const content_data = ui.tool.build_content_data(self)
		content_data.appendChild(fragment)


	return content_data
}//end get_content_data



/**
* GET_BUTTONS
* Render buttons bellow the av player
* @param object instance self
* @return HTMLElement buttons_wrapper
*/
const get_buttons = function(self) {

	const fragment = new DocumentFragment()

	// identifying_image_block
		const identifying_image_block = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'identifying_image_block',
			parent			: fragment
		})
		if (self.main_element.model==='component_av') {
			// button_create_identifying_image
				const button_create_identifying_image = ui.create_dom_element({
					element_type	: 'button',
					class_name		: 'light create_identifying_image',
					inner_html		: get_label.create_identify_image || 'Create identifying image',
					parent			: identifying_image_block
				})
				button_create_identifying_image.addEventListener('click', async function(){
					self.node.content_data.classList.add('loading')
					const item_value	= JSON.parse(identifying_image_selector.value)
					const current_time	= self.main_element.video.currentTime
					await self.create_identifying_image(
						item_value,
						current_time
					)
					self.node.content_data.classList.remove('loading')
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
		}

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
				inner_html		: get_label.create || 'Create',
				parent			: manage_posterframe_block
			})

			const create_posterframe_handler = async (e) => {
				e.stopPropagation()

				// loading CSS add
				self.node.content_data.classList.add('loading')

				// create_posterframe
				const result = await self.create_posterframe()

				// update tool image_posterframe
				image_posterframe.src = result===true
					? self.main_element.data.posterframe_url + '?' + (new Date()).getTime()
					: page_globals.fallback_image

				// loading CSS remove
				self.node.content_data.classList.remove('loading')
			}//end create_posterframe_handler
			button_create_posterframe.addEventListener('click', create_posterframe_handler)

		// button_delete_posterframe
			const button_delete_posterframe = ui.create_dom_element({
				element_type	: 'button',
				class_name		: 'light delete delete_posterframe',
				inner_html		: get_label.delete || 'Delete',
				parent			: manage_posterframe_block
			})

			const delete_posterframe_handler = async (e) => {
				e.stopPropagation()

				// loading CSS add
				self.node.content_data.classList.add('loading')

				// delete_posterframe
				const result = await self.delete_posterframe()

				// update tool image_posterframe
				image_posterframe.src = result===true
					? page_globals.fallback_image
					: self.main_element.data.posterframe_url
						? self.main_element.data.posterframe_url + '?' + (new Date()).getTime()
						: page_globals.fallback_image

				// loading CSS remove
				self.node.content_data.classList.remove('loading')
			}//end delete_posterframe_handler
			button_delete_posterframe.addEventListener('click', delete_posterframe_handler)

		// image_posterframe
			const image_posterframe = ui.create_dom_element({
				element_type	: 'img',
				class_name		: 'image_posterframe',
				src				: self.main_element.data.posterframe_url + '?' + Math.random(),
				parent			: fragment
			})
			image_posterframe.addEventListener('error', function(e) {
				if (image_posterframe.src!==page_globals.fallback_image) {
					image_posterframe.src = page_globals.fallback_image
				}
			})
			// const token = event_manager.subscribe('render_'+self.main_element.id, fn_update_posterframe)
			// self.events_tokens.push(token)
			// function fn_update_posterframe() {
			// 	image_posterframe.src = self.main_element.data.posterframe_url + '?' + Math.random()
			// 	console.log('updated image_posterframe.src:', image_posterframe.src);
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



// @license-end
