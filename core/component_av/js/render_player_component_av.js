/*global get_label, page_globals, SHOW_DEBUG, DEDALO_LIB_URL*/
/*eslint no-undef: "error"*/



// imports
	import {event_manager} from '../../common/js/event_manager.js'
	import {ui} from '../../common/js/ui.js'



/**
* RENDER_PLAYER_COMPONENT_AV
* Manages the component's logic and appearance in client side
*/
export const render_player_component_av = function() {

	return true
};//end  render_player_component_av


/**
* EDIT
* Render node for use in modes: edit, edit_in_list
* @return DOM node wrapper
*/
render_player_component_av.prototype.player = async function(options={render_level:'full'}) {

	const self = this

	// fix non value scenarios
		self.data.value = (self.data.value.length<1) ? [null] : self.data.value

	// render_level
		const render_level = options.render_level

	// content_data
		const current_content_data = await get_content_data_player(self)
		if (render_level==='content') {
			return current_content_data
		}

	// buttons
		const buttons = get_buttons(self)

	// av_control_buttons
		const av_control_buttons = get_av_control_buttons(self)

	// wrapper. ui build_edit returns component wrapper
		const wrapper = ui.component.build_wrapper_edit(self, {
			content_data : current_content_data,
			buttons 	 : buttons
		})

		wrapper.appendChild(av_control_buttons)

	// add events
		//add_events(self, wrapper)


	return wrapper
};//end  player



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

	// click event [click]
		wrapper.addEventListener("click", e => {
			// e.stopPropagation()

			// change_mode
				if (e.target.matches('.button.close')) {

					//change mode
					self.change_mode('list', false)

					return true
				}

		})


	return true
};//end  add_events



/**
* GET_CONTENT_DATA_EDIT
* @return DOM node content_data
*/
const get_content_data_player = async function(self) {


	const fragment = new DocumentFragment()

	// urls
		// posterframe
		const posterframe_url	= self.data.posterframe_url
		// media
		const video_url			= self.data.video_url

	if (video_url) {
		// source tag
			const source = document.createElement("source")
			source.type = "video/mp4"
			source.src  = video_url

		// video tag
			const video = document.createElement("video")
			video.poster	= posterframe_url
			video.controls	= true
			video.classList.add("posterframe")
			video.setAttribute("tabindex", 0)
			video.appendChild(source)
	

		// timeupdate event
			//video.addEventListener("timeupdate", async (e) => {
				// e.stopPropagation()

				// const frame = Math.floor(video.currentTime.toFixed(5) * 25);
				// console.log("aqui:",frame);
			//})

		// append the video node to the instance
			self.video = video
			fragment.appendChild(video)
	}

	// content_data
		const content_data = document.createElement("div")
			  content_data.appendChild(fragment)


	return content_data
};//end  get_content_data_edit



/**
* GET_BUTTONS
* @param object instance
* @return DOM node buttons_container
*/
const get_buttons = (self) => {

	const mode 			= self.mode

	const fragment = new DocumentFragment()

	// button full_screen
		const button_full_screen = ui.create_dom_element({
			element_type	: 'span',
			class_name 		: 'button full_screen',
			parent 			: fragment
		})
		button_full_screen.addEventListener("mouseup", (e) =>{
			self.node[0].classList.toggle('fullscreen')
			const fullscreen_state = self.node[0].classList.contains('fullscreen') ? true : false
			event_manager.publish('full_screen_'+self.id, fullscreen_state)
		})

		const button_info = ui.create_dom_element({
			element_type	: 'span',
			class_name 		: 'button full_screen',
			parent 			: fragment
		})
		button_info.addEventListener("mouseup", (e) =>{


			
		})
	// buttons container
		const buttons_container = ui.component.build_buttons_container(self)
		buttons_container.appendChild(fragment)


	return buttons_container
};//end  get_buttons


/**
* GET_AV_CONTROL_BUTTONS
* @param object instance
* @return DOM node av_control_buttons
*/
const get_av_control_buttons =  (self) =>{

	const fragment = new DocumentFragment()


	const av_begin = ui.create_dom_element({
			element_type	: 'span',
			class_name 		: 'button av_player_btn',
			parent 			: fragment
		})
		av_begin.addEventListener("mouseup", (e) =>{
			self.go_to_time(0);
		})

	const av_play = ui.create_dom_element({
			element_type	: 'span',
			class_name 		: 'button av_player_btn',
			parent 			: fragment
		})
		av_play.addEventListener("mouseup", (e) =>{
			self.play_pause();
		})

	const av_smpte = ui.create_dom_element({
			element_type	: 'span',
			class_name 		: ' av_player_smpte',
			parent 			: fragment,
			inner_html 		: self.get_current_tc()
		})
		self.video.addEventListener("timeupdate", async (e) =>{
			av_smpte.innerHTML = self.get_current_tc();
		})

	const av_minus_10 = ui.create_dom_element({
			element_type	: 'span',
			class_name 		: 'button av_player_btn',
			parent 			: fragment
		})
		av_minus_10.addEventListener("mouseup", (e) =>{
			const seconds = self.video.currentTime - 10
			self.go_to_time(seconds);
		})

	const av_minus_5 = ui.create_dom_element({
			element_type	: 'span',
			class_name 		: 'button av_player_btn',
			parent 			: fragment
		})
		av_minus_5.addEventListener("mouseup", (e) =>{
			const seconds = self.video.currentTime - 5
			self.go_to_time(seconds);
		})

	const av_plus_10 = ui.create_dom_element({
			element_type	: 'span',
			class_name 		: 'button av_player_btn',
			parent 			: fragment
		})
		av_plus_10.addEventListener("mouseup", (e) =>{
			const seconds = self.video.currentTime + 10
			self.go_to_time(seconds);
		})

	const av_plus_5 = ui.create_dom_element({
			element_type	: 'span',
			class_name 		: 'button av_player_btn',
			parent 			: fragment
		})
		av_plus_5.addEventListener("mouseup", (e) =>{
			const seconds = self.video.currentTime + 5
			self.go_to_time(seconds);
		})



	const av_control_buttons = fragment

	return av_control_buttons
};//end get_av_control_buttons



/**
* BUILD_VIDEO_HTML5
* @return dom element video
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
			// class css. video additional css classes
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
};//end  build_video_html5
*/
