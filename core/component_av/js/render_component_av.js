/*global get_label, page_globals, SHOW_DEBUG, DEDALO_LIB_URL*/
/*eslint no-undef: "error"*/



// imports
	import {event_manager} from '../../common/js/event_manager.js'
	import {ui} from '../../common/js/ui.js'



/**
* Render_component
* Manages the component's logic and apperance in client side
*/
export const render_component_av = function() {

	return true
}//end render_component_av



/**
* LIST
* Render node for use in list
* @return DOM node
*/
render_component_av.prototype.list = async function() {

	const self = this

	// Options vars
		const context 	= self.context
		const data 		= self.data

	// wrapper
		const wrapper = ui.component.build_wrapper_list(self, {
			autoload : false
		})

	// url
		const posterframe_url 	= data.posterframe_url
		const url 				= posterframe_url // (!posterframe_url || posterframe_url.length===0) ? DEDALO_LIB_URL + "/themes/default/0.jpg" : posterframe_url

	// image
		const image = ui.create_dom_element({
			element_type	: "img",
			src 			: url,
			parent 			: wrapper
		})
		ui.component.add_image_fallback(image)


	return wrapper
}//end list



/**
* EDIT
* Render node for use in modes: edit, edit_in_list
* @return DOM node wrapper
*/
render_component_av.prototype.edit = async function(options={render_level:'full'}) {

	const self = this

	// fix non value scenarios
		self.data.value = (self.data.value.length<1) ? [null] : self.data.value

	const posterframe_url = self.data.posterframe_url

	const render_level 	= options.render_level

	// content_data
		const current_content_data = await content_data_edit(self)
		if (render_level==='content') {
			return current_content_data
		}

	// wrapper. ui build_edit returns component wrapper
		const wrapper = ui.component.build_wrapper_edit(self, {
			content_data : current_content_data
		})

	// add events
		//add_events(self, wrapper)


	return wrapper
}//end edit



/**
* ADD_EVENTS
*/
const add_events = function(self, wrapper) {

	// update value, subscription to the changes: if the dom input value was changed, observers dom elements will be changed own value with the observable value
		self.events_tokens.push(
			event_manager.subscribe('update_value_'+self.id, update_value)
		)
		function update_value (changed_data) {
			//console.log("-------------- - event update_value changed_data:", changed_data);
			// change the value of the current dom element
			const changed_node = wrapper.querySelector('input[data-key="'+changed_data.key+'"]')
			changed_node.value = changed_data.value
		}

	// add element, subscription to the events
		self.events_tokens.push(
			event_manager.subscribe('add_element_'+self.id, add_element)
		)
		function add_element(changed_data) {
			//console.log("-------------- + event add_element changed_data:", changed_data);
			const inputs_container = wrapper.querySelector('.inputs_container')
			// add new dom input element
			input_element(changed_data.key, changed_data.value, inputs_container, self)
		}

	// change event, for every change the value in the imputs of the component
		wrapper.addEventListener('change', async (e) => {
			// e.stopPropagation()

			// update
			if (e.target.matches('input[type="text"].input_value')) {

				const changed_data = Object.freeze({
					action	: 'update',
					key		: JSON.parse(e.target.dataset.key),
					value	: (e.target.value.length>0) ? e.target.value : null,
				})
				self.change_value({
					changed_data : changed_data,
					refresh 	 : false
				})
				.then((save_response)=>{
					// event to update the dom elements of the instance
					event_manager.publish('update_value_'+self.id, changed_data)
				})

				return true
			}

		}, false)

	// click event [click]
		wrapper.addEventListener("click", e => {
			// e.stopPropagation()

			// insert
				if (e.target.matches('.button.add')) {

					const changed_data = Object.freeze({
						action	: 'insert',
						key		: self.data.value.length,//self.data.value.length>0 ? self.data.value.length : 1,
						value	: null
					})
					self.change_value({
						changed_data : changed_data,
						refresh 	 : false
					})
					.then((save_response)=>{
						// event to update the dom elements of the instance
						event_manager.publish('add_element_'+self.id, changed_data)
					})

					return true
				}

			// remove
				if (e.target.matches('.button.remove')) {

					// force possible input change before remove
					document.activeElement.blur()

					const changed_data = Object.freeze({
						action	: 'remove',
						key		: e.target.dataset.key,
						value	: null,
						refresh : true
					})
					self.change_value({
						changed_data : changed_data,
						label 		 : e.target.previousElementSibling.value,
						refresh 	 : true
					})
					.then(()=>{
					})

					return true
				}

			// change_mode
				if (e.target.matches('.button.close')) {

					//change mode
					self.change_mode('list', false)

					return true
				}

		})

	// keyup event
		wrapper.addEventListener("keyup", async (e) => {
			// e.stopPropagation()

			if (self.context.properties.unique && e.target.value!=='') {
				const unique = await self.is_unique(e.target.value)
				if (typeof unique!=="undefined") {
					ui.show_message(
						wrapper,
						`Warning. Duplicated value '${e.target.value}' in id: ` + unique.section_id,
						'warning'
					)
				}
			}
		})


	return true
}//end add_events



/**
* CONTENT_DATA_EDIT
* @return DOM node content_data
*/
const content_data_edit = async function(self) {

	const fragment = new DocumentFragment()

	// url
		const posterframe_url 	= self.data.posterframe_url
		//const url 			= (!posterframe_url || posterframe_url.length===0) ? DEDALO_LIB_URL + "/themes/default/0.jpg" : posterframe_url
		const video_url 		= self.data.video_url

	// image
		// const image = ui.create_dom_element({
		// 	element_type	: "img",
		// 	src 			: url,
		// 	class_name 		: 'posterframe',
		// 	parent 			: fragment
		// })
		// //image.style.backgroundImage = "url("+posterframe_url+")"
		// // image.addEventListener("click", (e)=>{
		// // 	e.preventDefault()
		// // 	e.stopPropagation()
		// // }, true)
		// image.setAttribute("tabindex", 0)

		// const video = build_video_html5({
		// 	poster 	: posterframe_url,
		// 	src 	: [video_url],
		// 	class  	: 'posterframe'
		// })

		const source = document.createElement("source")
			  source.src  = video_url
			  source.type = "video/mp4"

		const video = document.createElement("video")
			  video.poster = posterframe_url
			  video.controls = true
			  video.classList.add("posterframe")
			  video.setAttribute("tabindex", 0)

		video.appendChild(source)

		// <video id="mediaplayer" width="250" poster="<?php echo __WEB_TEMPLATE_WEB__ ?>/assets/images/intro_posterframe.jpg">
		// 	<source src="<?php echo $video_url ?>" type="video/mp4">
		// </video>


		fragment.appendChild(video)


	// content_data
		const content_data = document.createElement("div")
			  content_data.classList.add("content_data", self.type)
		content_data.appendChild(fragment)


	return content_data
}//end content_data_edit



/**
* BUILD_VIDEO_HTML5
* @return dom element vide
*//*
const build_video_html5 = function(request_options) {

	const self = this

	// options
		const options = {
			// video type. (array) default ["video/mp4"]
			type 	 : ["video/mp4"],
			// video src. (array)
			src  	 : [""],
			// id. dom element video id (string) default "video_html5"
			id 		 : "video_html5",
			// controls. video control property (boolean) default true
			controls : true,
			// play (boolean). play video on ready. default false
			play : false,
			// poster image. (string) url of posterframe image
			poster 	 : "",
			// class css. video aditional css classes
			class 	 : "",
			// preload (string) video element attribute preload
			preload  : "auto",
			// height (integer) video element attribute. default null
			height 	 : null,
			// width (integer) video element attribute. default null
			width 	 : null,
			// tcin_secs (integer). default null
			tcin_secs  : 0,
			// tcout_secs (integer). default null
			tcout_secs : null,
			// ar_subtitles (array). array of objects with subtitles full info. default null
			ar_subtitles : null,
			// ar_restricted_fragments. (array) default null
			ar_restricted_fragments : null
		}

		// apply options
		for (var key in request_options) {
			if (request_options.hasOwnProperty(key)) {
				options[key] = request_options[key]
			}
		}
		// debug
		if(SHOW_DEBUG===true) {
			console.log("[common.build_video_html5] options",options)
		}

	// video handler events
		const handler_events = {
			loadedmetadata 	: {},
			timeupdate 		: {},
			contextmenu 	: {}
		}

	// html5 video. dom element html5 video
		const video 				= document.createElement("video")
			  video.id 				= options.id
			  video.controls 		= options.controls
			  video.poster 			= options.poster
			  video.className 		= options.class
			  video.preload 		= options.preload
			  video.controlsList 	= "nodownload"
			  video.dataset.setup 	= '{}'

			  if (options.height) {
				video.height = options.height
			  }
			  if (options.width) {
				video.width = options.width
			  }
			  options.play = true
			  if (options.play && options.play===true) {

				handler_events.loadedmetadata.play = (e) => {
			  		try {
						//video.play()
					}catch(error){
				  		console.warn("Error on video play:",error);
				  	}
				}
			  }

		// src. video sources
			for (let i = 0; i < options.src.length; i++) {
				let source 		= document.createElement("source")
					source.src  = options.src[i]
					source.type = options.type[i]
				video.appendChild(source)
			}

		// restricted fragments. Set ar_restricted_fragments on build player to activate skip restricted fragments
			if (options.ar_restricted_fragments) {
				const ar_restricted_fragments = options.ar_restricted_fragments
				const tcin_secs 			  = options.tcin_secs
				if (typeof ar_restricted_fragments!=="undefined" && ar_restricted_fragments.length>0) {
					handler_events.timeupdate.skip_restricted = () => {
						self.skip_restricted(video, ar_restricted_fragments, tcin_secs)
					}
				}
			}

		// subtitles
			if (options.ar_subtitles) {
				const subtitles_tracks = []
				for (let i = 0; i < options.ar_subtitles.length; i++) {

					let subtitle_obj = options.ar_subtitles[i]

					if (subtitle_obj.src===undefined) {
						console.warn("Invalid subtitle object:",subtitle_obj);
						continue
					}

					// Build track
					let track = document.createElement("track")
						track.kind 		= "captions" // subtitles | captions
						track.src 		= subtitle_obj.src
						track.srclang 	= subtitle_obj.srclang
						track.label 	= subtitle_obj.label
						if (subtitle_obj.default && subtitle_obj.default===true) {
							track.default = true
							track.addEventListener("load", function() {
							   this.mode = "showing";
							   video.textTracks[0].mode = "showing"; // thanks Firefox
							});
						}
					// add track
					subtitles_tracks.push(track)
				}//end for (var i = 0; i < options.ar_subtitles.length; i++)

				handler_events.loadedmetadata.add_subtitles_tracks = () => {
					for (let i = 0; i < subtitles_tracks.length; i++) {
						// add to video
						video.appendChild(subtitles_tracks[i]);
						//console.log("added subtitle track:",subtitles_tracks[i]);
					}
				}
			}

		// msj no html5
			const msg_no_js = document.createElement("p")
				  msg_no_js.className = "vjs-no-js"
			const msj_text = document.createTextNode("To view this video please enable JavaScript, and consider upgrading to a web browser that supports HTML5 video")
				  msg_no_js.appendChild(msj_text)
			video.appendChild(msg_no_js)

		// disable_context_menu - (TEMPORAL DISABLED !)
			// handler_events.contextmenu.disable_context_menu = (e) => {
			// 	e.preventDefault();
			// }



		// REGISTER_EVENTS
		const register_events = function(handler_object, handler_events) {

			for (let event_name in handler_events) {
				// add event
				const event_functions = handler_events[event_name]
				handler_object.addEventListener(event_name, function(e) {
					for (let key in event_functions) {
						event_functions[key](e)
					}
				})
			}

			return true
		}

		// video events	register
			register_events(video, handler_events)


	return video
}//end build_video_html5
*/


