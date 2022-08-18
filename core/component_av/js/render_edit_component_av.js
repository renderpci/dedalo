/*global get_label, page_globals, SHOW_DEBUG, DEDALO_LIB_URL*/
/*eslint no-undef: "error"*/



// imports
	import {event_manager} from '../../common/js/event_manager.js'
	import {ui} from '../../common/js/ui.js'
	import {open_tool} from '../../../tools/tool_common/js/tool_common.js'




/**
* RENDER_EDIT_COMPONENT_AV
* Manages the component's logic and appearance in client side
*/
export const render_edit_component_av = function() {

	return true
}//end  render_edit_component_av



/**
* EDIT
* Render node for use in modes: edit, edit_in_list
* @return DOM node wrapper
*/
render_edit_component_av.prototype.edit = async function(options) {

	const self = this

	// options
		const render_level = options.render_level || 'full'

	// content_data
		const current_content_data = get_content_data_edit(self)
		if (render_level==='content') {
			return current_content_data
		}

	// buttons
		const buttons = get_buttons(self)

	// wrapper. ui build_edit returns component wrapper
		const wrapper = ui.component.build_wrapper_edit(self, {
			content_data : current_content_data,
			buttons 	 : buttons
		})

	return wrapper
}//end  edit



/**
* GET_CONTENT_DATA_EDIT
* @return DOM node content_data
*/
const get_content_data_edit = function(self) {

	const fragment = new DocumentFragment()

	// video_container
		const video_container = ui.create_dom_element({
			element_type	: 'div',
			class_name 		: 'video_container',
			parent 			: fragment
		})

	// urls
		// posterframe
			const posterframe_url = self.data.posterframe_url
		// media url from data.datalist based on selected context quality
			const quality	= self.quality || self.context.quality
			const datalist	= self.data.datalist
			const file_info	= datalist.find(el => el.quality===quality && el.file_exist===true)
			const video_url	= file_info
				? file_info.url
				: null

		// background video_container
			if (posterframe_url) {
				const image = ui.create_dom_element({
					element_type: 'img'
				})
				// image background color
				image.addEventListener('load', set_bg_color, false)
				function set_bg_color() {
					this.removeEventListener('load', set_bg_color, false)
					ui.set_background_image(this, video_container)
					image.remove()
				}
				image.src = posterframe_url
			}


	// build_video_node
		const build_video_node = function() {

			// source tag
				const source	= document.createElement("source")
				source.type		= "video/mp4"
				source.src		= video_url

			// video tag
				const video		= document.createElement("video")
				if (posterframe_url) {
					video.poster = posterframe_url
				}
				video.controls	= true
				video.classList.add("posterframe")
				video.setAttribute("tabindex", 0)
				video.appendChild(source)

			// keyup event
				// video.addEventListener("timeupdate", async (e) => {
				// 	// e.stopPropagation()
				// 	// const frame = Math.floor(video.currentTime.toFixed(5) * 25);
				// })

			// append the video node to the instance
				self.video = video
				video_container.appendChild(video)

			// event
				// video.addEventListener('canplay', fn_canplay)
				// function fn_canplay() {
				// 	// self.main_component.video.removeEventListener('canplay', fn_play);
				// 	video.play()
				// }
		}

	// observers. Renders video node only when is visible
		if (video_url) {
			// observer. Set video node only when it is in DOM (to save browser resources)
			const observer = new IntersectionObserver(function(entries) {
				const entry = entries[1] || entries[0]
				if (entry.isIntersecting===true || entry.intersectionRatio > 0) {
					observer.disconnect();
					build_video_node()
				}
			}, { threshold: [0] });
			observer.observe(video_container);
		}else{
			// image default logo
			const posterframe = ui.create_dom_element({
				element_type	: 'img',
				class_name		: 'posterframe',
				src				: posterframe_url,
				parent			: video_container
			})
			posterframe.addEventListener('mouseup',function(evt) {
				evt.stopPropagation();

				const tool_upload = self.tools.find(el => el.model === 'tool_upload')

				// open_tool (tool_common)
					open_tool({
						tool_context	: tool_upload,
						caller			: self
					})
			})

		}

	// quality_selector
		const quality_selector = get_quality_selector(self)
		fragment.appendChild(quality_selector)

	// content_data
		const content_data = ui.component.build_content_data(self)
			  content_data.appendChild(fragment)


	return content_data
}//end  get_content_data_edit



/**
* GET_BUTTONS
* @param object instance
* @return DOM node buttons_container
*/
const get_buttons = (self) => {

	const fragment = new DocumentFragment()

	// prevent show buttons inside a tool
		if (self.caller && self.caller.type==='tool') {
			return fragment
		}

	// button full_screen
		const button_full_screen = ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'button full_screen',
			parent			: fragment
		})
		button_full_screen.addEventListener("mouseup", () =>{
			self.node.classList.toggle('fullscreen')
			const fullscreen_state = self.node.classList.contains('fullscreen') ? true : false
			event_manager.publish('full_screen_'+self.id, fullscreen_state)
		})


	// buttons tools
		ui.add_tools(self, fragment)

	// des
		// const button_info = ui.create_dom_element({
		// 	element_type	: 'span',
		// 	class_name 		: 'button full_screen',
		// 	parent 			: fragment
		// })
		// button_info.addEventListener("mouseup", async (e) =>{

		// 	const player_av = await instances.get_instance({
		// 		model 			: 'component_av',
		// 		section_tipo	: self.section_tipo,
		// 		section_id		: self.section_id,
		// 		tipo			: self.tipo,
		// 		context			: {},
		// 		mode 			: 'player'
		// 	})

		// 	await player_av.build(true)

		// 	player_av.fragment = {tc_in: 3, tc_out: 5}

		// 	const node = await player_av.render()

		// 	// cotainer, for every ipo will create a li node
		// 		const cotainer = ui.create_dom_element({
		// 			element_type	: 'div'
		// 		})

		// 		self.node[0].appendChild(node)
		// })

	// buttons container
		const buttons_container = ui.component.build_buttons_container(self)
			// buttons_container.appendChild(fragment)

	// buttons_fold (allow sticky position on large components)
		const buttons_fold = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'buttons_fold',
			parent			: buttons_container
		})
		buttons_fold.appendChild(fragment)


	return buttons_container
}//end  get_buttons



/**
* GET_QUALITY_SELECTOR
* @return DOM node select
*/
const get_quality_selector = (self) => {

	// short vars
		const data		= self.data
		const quality	= self.quality || self.context.quality

		const fragment = new DocumentFragment()

	// create the quality selector
		const quality_selector = ui.create_dom_element({
			element_type	: 'select',
			class_name		: 'quality_selector',
			parent			: fragment
		})
		quality_selector.addEventListener("change", (e) =>{
			const src = e.target.value
			self.video.src = src
			// event_manager.publish('image_quality_change_'+self.id, img_src)
			console.log("src:",src);
		})

		const quality_list		= data.datalist.filter(el => el.file_exist===true)
		const quality_list_len	= quality_list.length
		for (let i = 0; i < quality_list_len; i++) {
			// create the node with the all qualities sended by server
			const value = (typeof quality_list[i].url==="undefined")
				? '' // DEDALO_CORE_URL + "/themes/default/0.jpg"
				: quality_list[i].url

			const select_option = ui.create_dom_element({
				element_type	: 'option',
				value			: value,
				text_node		: quality_list[i].quality,
				parent			: quality_selector
			})
			//set the default quality_list to config variable dedalo_image_quality_default
			select_option.selected = quality_list[i].quality===quality ? true : false
		}


	return quality_selector
}//end get_quality_selector



/**
* BUILD_VIDEO_HTML5
* @return DOM node video
*/
	// const build_video_html5 = function(request_options) {

	// 	const self = this

	// 	// options
	// 		const options = {
	// 			// video type. (array) default ["video/mp4"]
	// 			type 	 : ["video/mp4"],
	// 			// video src. (array)
	// 			src  	 : [""],
	// 			// id. dom element video id (string) default "video_html5"
	// 			id 		 : "video_html5",
	// 			// controls. video control property (boolean) default true
	// 			controls : true,
	// 			// play (boolean). play video on ready. default false
	// 			play : false,
	// 			// poster image. (string) url of posterframe image
	// 			poster 	 : "",
	// 			// class css. video additional css classes
	// 			class 	 : "",
	// 			// preload (string) video element attribute preload
	// 			preload  : "auto",
	// 			// height (integer) video element attribute. default null
	// 			height 	 : null,
	// 			// width (integer) video element attribute. default null
	// 			width 	 : null,
	// 			// tcin_secs (integer). default null
	// 			tcin_secs  : 0,
	// 			// tcout_secs (integer). default null
	// 			tcout_secs : null,
	// 			// ar_subtitles (array). array of objects with subtitles full info. default null
	// 			ar_subtitles : null,
	// 			// ar_restricted_fragments. (array) default null
	// 			ar_restricted_fragments : null
	// 		}

	// 		// apply options
	// 		for (var key in request_options) {
	// 			if (request_options.hasOwnProperty(key)) {
	// 				options[key] = request_options[key]
	// 			}
	// 		}
	// 		// debug
	// 		if(SHOW_DEBUG===true) {
	// 			console.log("[common.build_video_html5] options",options)
	// 		}

	// 	// video handler events
	// 		const handler_events = {
	// 			loadedmetadata 	: {},
	// 			timeupdate 		: {},
	// 			contextmenu 	: {}
	// 		}

	// 	// html5 video. dom element html5 video
	// 		const video 				= document.createElement("video")
	// 			  video.id 				= options.id
	// 			  video.controls 		= options.controls
	// 			  video.poster 			= options.poster
	// 			  video.className 		= options.class
	// 			  video.preload 		= options.preload
	// 			  video.controlsList 	= "nodownload"
	// 			  video.dataset.setup 	= '{}'

	// 			  if (options.height) {
	// 				video.height = options.height
	// 			  }
	// 			  if (options.width) {
	// 				video.width = options.width
	// 			  }
	// 			  options.play = true
	// 			  if (options.play && options.play===true) {

	// 				handler_events.loadedmetadata.play = (e) => {
	// 			  		try {
	// 						//video.play()
	// 					}catch(error){
	// 				  		console.warn("Error on video play:",error);
	// 				  	}
	// 				}
	// 			  }

	// 		// src. video sources
	// 			for (let i = 0; i < options.src.length; i++) {
	// 				let source 		= document.createElement("source")
	// 					source.src  = options.src[i]
	// 					source.type = options.type[i]
	// 				video.appendChild(source)
	// 			}

	// 		// restricted fragments. Set ar_restricted_fragments on build player to activate skip restricted fragments
	// 			if (options.ar_restricted_fragments) {
	// 				const ar_restricted_fragments = options.ar_restricted_fragments
	// 				const tcin_secs 			  = options.tcin_secs
	// 				if (typeof ar_restricted_fragments!=="undefined" && ar_restricted_fragments.length>0) {
	// 					handler_events.timeupdate.skip_restricted = () => {
	// 						self.skip_restricted(video, ar_restricted_fragments, tcin_secs)
	// 					}
	// 				}
	// 			}

	// 		// subtitles
	// 			if (options.ar_subtitles) {
	// 				const subtitles_tracks = []
	// 				for (let i = 0; i < options.ar_subtitles.length; i++) {

	// 					let subtitle_obj = options.ar_subtitles[i]

	// 					if (subtitle_obj.src===undefined) {
	// 						console.warn("Invalid subtitle object:",subtitle_obj);
	// 						continue
	// 					}

	// 					// Build track
	// 					let track = document.createElement("track")
	// 						track.kind 		= "captions" // subtitles | captions
	// 						track.src 		= subtitle_obj.src
	// 						track.srclang 	= subtitle_obj.srclang
	// 						track.label 	= subtitle_obj.label
	// 						if (subtitle_obj.default && subtitle_obj.default===true) {
	// 							track.default = true
	// 							track.addEventListener("load", function() {
	// 							   this.mode = "showing";
	// 							   video.textTracks[0].mode = "showing"; // thanks Firefox
	// 							});
	// 						}
	// 					// add track
	// 					subtitles_tracks.push(track)
	// 				}//end for (var i = 0; i < options.ar_subtitles.length; i++)

	// 				handler_events.loadedmetadata.add_subtitles_tracks = () => {
	// 					for (let i = 0; i < subtitles_tracks.length; i++) {
	// 						// add to video
	// 						video.appendChild(subtitles_tracks[i]);
	// 						//console.log("added subtitle track:",subtitles_tracks[i]);
	// 					}
	// 				}
	// 			}

	// 		// msj no html5
	// 			const msg_no_js = document.createElement("p")
	// 				  msg_no_js.className = "vjs-no-js"
	// 			const msj_text = document.createTextNode("To view this video please enable JavaScript, and consider upgrading to a web browser that supports HTML5 video")
	// 				  msg_no_js.appendChild(msj_text)
	// 			video.appendChild(msg_no_js)

	// 		// disable_context_menu - (TEMPORAL DISABLED !)
	// 			// handler_events.contextmenu.disable_context_menu = (e) => {
	// 			// 	e.preventDefault();
	// 			// }



	// 		// REGISTER_EVENTS
	// 		const register_events = function(handler_object, handler_events) {

	// 			for (let event_name in handler_events) {
	// 				// add event
	// 				const event_functions = handler_events[event_name]
	// 				handler_object.addEventListener(event_name, function(e) {
	// 					for (let key in event_functions) {
	// 						event_functions[key](e)
	// 					}
	// 				})
	// 			}

	// 			return true
	// 		}

	// 		// video events	register
	// 			register_events(video, handler_events)


	// 	return video
	// }//end  build_video_html5

