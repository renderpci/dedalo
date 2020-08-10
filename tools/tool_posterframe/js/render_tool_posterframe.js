/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {event_manager} from '../../../core/common/js/event_manager.js'
	import {ui} from '../../../core/common/js/ui.js'



/**
* RENDER_TOOL_POSTERFRAME
* Manages the component's logic and apperance in client side
*/
export const render_tool_posterframe = function() {
	
	return true
};//end render_tool_posterframe



/**
* RENDER_TOOL_POSTERFRAME
* Render node for use like button
* @return DOM node
*/
render_tool_posterframe.prototype.edit = async function (options={render_level:'full'}) {

	const self = this

	const render_level 	= options.render_level

	// content_data
		const current_content_data = await content_data_edit(self)
		if (render_level==='content') {
			return current_content_data
		}

	// wrapper. ui build_edit returns component wrapper
		const wrapper = await ui.tool.build_wrapper_edit(self, {
			content_data : current_content_data
		})

	// fix wrapper
		self.wrapper = wrapper

	// modal container
		const header = wrapper.querySelector('.tool_header')
		const modal  = ui.attach_to_modal(header, wrapper, null)
		modal.on_close = () => {
			self.destroy(true, true, true)
		}


	return wrapper
};//end render_tool_tc



/**
* CONTENT_DATA_EDIT
* @return DOM node content_data
*/
const content_data_edit = async function(self) {

	const fragment = new DocumentFragment()

	// components container
		const components_container = ui.create_dom_element({
			element_type	: 'div',
			class_name 		: 'components_container',
			parent 			: fragment
		})

	// player av
		const wrap_component_container = ui.create_dom_element({
			element_type	: 'div',
			class_name 		: 'wrap_edit_video',
			parent 			: components_container
		})

		// Video container
		const video_container = ui.create_dom_element({
			element_type	: 'div',
			class_name 		: 'video_container',
			parent 			: wrap_component_container
		})

	// source tag
		const source = document.createElement("source")
			  source.src  = self.caller.data.video_url
			  source.type = "video/mp4"

	// video tag
		const video = document.createElement("video")
				video.poster = self.caller.data.posterframe_url
				video.controls = true
				video.classList.add("posterframe")
				video.setAttribute("tabindex", 0)
				video.appendChild(source)

	// keyup event
		video.addEventListener("timeupdate", async (e) => {
			// e.stopPropagation()


			// const frame = Math.floor(video.currentTime.toFixed(5) * 25);
			// console.log("aqui:",frame);
		})

	// append the video node to the instance
	self.video = video
	video_container.appendChild(video)

	//********

	// Video controls container
		const video_controls_container = ui.create_dom_element({
			//id				: 'video_controls',
			element_type 	: 'div',
			class_name 		: 'posterframe_container',
			parent 		 	: wrap_component_container
		})

	//adding buttons
		add_button(self, video_controls_container, "Play", "av_player_btn")

		const tc_div = ui.create_dom_element({
			id              : 'TCdiv',
			element_type	: 'span',
			class_name 		: 'video_container',
			text_content	: '00:00:00.000',
			parent 			: video_controls_container
		})

		add_button(self, video_controls_container, "< 10 seg", "av_player_btn")
		add_button(self, video_controls_container, "< 5 seg", "av_player_btn")
		add_button(self, video_controls_container, "- 1", "av_player_btn")
		add_button(self, video_controls_container, "+ 1", "av_player_btn")
		add_button(self, video_controls_container, "5 seg >", "av_player_btn")
		add_button(self, video_controls_container, "10 seg >", "av_player_btn")


	// Posterframe options
		const posterframe_options = ui.create_dom_element({
			element_type	: 'div',
			class_name 		: 'posterframe_container',
			parent 			: components_container
		})

		add_button(self, posterframe_options, "Create identifyying image")

		const posterframe_select = ui.create_dom_element({
			element_type	: 'select',
			text_content	: 'xxxxxx',
			parent 			: posterframe_options
		})

		const posterframe_img = ui.create_dom_element({
			element_type	: 'span',
			class_name 		: 'video_container',
			//style			: "background-image:url('IMG_URL')".replace('IMG_URL', posterframe_url),
			parent 			: posterframe_options
		})

		posterframe_img.style.backgroundImage = "url('/dedalo_v6/media/media_development/av/posterframe/rsc35_rsc167_1.jpg')"

		add_button(self, posterframe_options, "Make Posterframe")

		const button_delete_posterframe = ui.create_dom_element({
				element_type	: 'span',
				class_name 		: 'button remove',
				parent 			: posterframe_options
			})

		button_delete_posterframe.addEventListener("click", () => {

			self.button_click('Delete Posterframe', button_delete_posterframe)

		})

	// content_data
		const content_data = document.createElement("div")
			  content_data.classList.add("content_data", self.type)
		content_data.appendChild(fragment)


	return content_data
};//end content_data_edit



/**
* ADD_BUTTON
*/
export const add_button = async (self, component_container, value, class_name = "secondary button_preview") => {
	// apply button
		const new_button = ui.create_dom_element({
			element_type 	: 'button',
			class_name 		: class_name, //'css_button_generic css_av_video_controls_rew av_player_btn',
			text_content 	: get_label[value] || value,
			parent 			: component_container
		})

		new_button.addEventListener("click", () => {

			//component_container.classList.add("loading")

			//TODO - implement different cases depending on the value of the clicked button
			self.button_click(value, new_button)

			//component_container.classList.remove("loading")
		})

	return true
};//end add_button
