// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_LIB_URL*/
/*eslint no-undef: "error"*/



// imports
	import {ui} from '../../common/js/ui.js'



/**
* VIEW_PLAYER_EDIT_AV
* Manages the component's logic and appearance in client side
*/
export const view_player_edit_av = function() {

	return true
}//end view_player_edit_av



/**
* RENDER
* Render node for use in modes: edit, edit_in_list
* @param object self
* @param object options
* @return HTMLElement wrapper
*/
view_player_edit_av.render = async function(self, options) {

	// options
		const render_level = options.render_level || 'full'

	// media_streams (used to know frame rate)
		if (!self.media_streams) {
			self.media_streams = await self.get_media_streams()
		}

	// content_data
		const content_data = get_content_data_player({
			self					: self,
			with_control_buttons	: true
		})
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

	// add events
		//add_events(self, wrapper)


	return wrapper
}//end  player



/**
* GET_CONTENT_DATA_PLAYER
* @param object options
* @return HTMLElement content_data
*/
export const get_content_data_player = function(options) {

	// options
		const self					= options.self
		const with_control_buttons	= options.with_control_buttons

	const fragment = new DocumentFragment()

	// short vars
		const context		= self.context || {}
		const data			= self.data || {}
		const value			= data.value || []
		const files_info	= value[0]
			? (value[0].files_info || [])
			: []
		const quality		= self.quality || context.features.quality
		const extension		= self.context.features.extension

	// url
		// posterframe
			const posterframe_url = data.posterframe_url + '?t=' + (new Date()).getTime()

		// media
			const file_info	= files_info.find(el => el.quality===quality && el.file_exist===true && el.extension===extension)
			const video_url	= file_info && file_info.file_path
				? DEDALO_MEDIA_URL + file_info.file_path
				: null

	// player
		if (video_url) {

			// fragment
				const tc_in = (!self.fragment)
					? null
					: (self.fragment.tc_in)
						? 'vbegin='+ self.fragment.tc_in
						: 'vbegin=0';

				const tc_out = (!self.fragment)
					? null
					:(self.fragment.tc_out)
						? 'vend='+ self.fragment.tc_out
						: 'vend='+ self.video.duration;

				const fragment_url = (tc_in)
					? tc_in + '&' + tc_out
					: null

			// source node
				const source	= document.createElement('source')
				source.type		= 'video/mp4'
				source.src		= (self.fragment)
					? video_url + '?' + fragment_url
					: video_url

			// video node
				const video		= document.createElement('video')
				video.poster	= posterframe_url
				video.controls	= true
				video.classList.add('posterframe')
				video.setAttribute('tabindex', 0)
				video.appendChild(source)

			// subtitles track.
				if (tc_in) {
					// Add only if its not a fragment
					console.warn('Skip create subtitles track to fragment. tc_in: ', tc_in);
				}else{
					const subtitles	= self.data.subtitles
					if(subtitles && subtitles.subtitles_url) {

						const subtitles_track	= document.createElement('track')
						// subtitles_track.type	= 'text/vtt'
						subtitles_track.kind	= 'captions'
						subtitles_track.src		= subtitles.subtitles_url
						subtitles_track.srclang	= subtitles.lang
						subtitles_track.label	= subtitles.lang_name
						subtitles_track.default	= true
						// Add new track to video
						video.appendChild(subtitles_track)

						// update_subtitles event
						// (this event is fired, among others, by tool_transcription on update subtitles file)
						const fn_update_subtitles = (options={}) => {

							// options (non mandatory)
								const lang	= options.lang || self.lang
								const url	= options.url || subtitles.subtitles_url

							// lang_tld2
								const lang_item = page_globals.dedalo_projects_default_langs.find(
									el => el.value===lang
								)
								const lang_tld2 = lang_item ? lang_item.tld2 : null
								if (!lang_tld2) {
									console.log(
										'Unable to find lang in page_globals:',
										options.lang,
										page_globals.dedalo_projects_default_langs
									);
									return
								}

							// URL src replace
								const new_url = subtitles_track.srclang!==lang_tld2
									? url.replace(/(lg-[a-z]{2,})/, lang)
									: subtitles_track.src
								const non_cache_url = new_url.split('?')[0] + '?t=' + (new Date()).getTime()
								// apply source url
								subtitles_track.src	= non_cache_url

							// lang info update
								if (subtitles_track.srclang!==lang_tld2) {
									subtitles_track.srclang	= lang_tld2
									subtitles_track.label	= lang_item.label
								}

							if(SHOW_DEBUG===true) {
								console.log('Changed subtitles track src:', lang_tld2, subtitles_track.src);
							}
						}
						self.events_tokens.push(
							event_manager.subscribe('updated_subtitles_file_' + self.id, fn_update_subtitles)
						)
					}
				}

			// append the video node to the instance
				self.video = video
				fragment.appendChild(video)
		}

	// av_control_buttons
		if (with_control_buttons && self.video) {
			const av_control_buttons = get_av_control_buttons(self)
			fragment.appendChild(av_control_buttons)
		}

	// content_data
		const content_data = ui.component.build_content_data(self)
			  content_data.appendChild(fragment)


	return content_data
}//end get_content_data_edit



/**
* GET_AV_CONTROL_BUTTONS
* @param object self
* @return HTMLElement av_control_buttons
*/
const get_av_control_buttons = (self) => {

	const fragment = new DocumentFragment()

	// css
		const btn_class = 'light'

	// av_begin_button. button go to begin of av
		const av_begin_button = ui.create_dom_element({
			element_type	: 'button',
			class_name		: btn_class,
			inner_html		: get_label.beginning || 'Beginning',
			parent			: fragment
		})
		av_begin_button.addEventListener('mouseup', () =>{
			const seconds = 0
			self.go_to_time({
				seconds : seconds
			});
		})

	// av_play_button. play / pause media
		const av_play_button = ui.create_dom_element({
			element_type	: 'button',
			class_name		: btn_class + ' play',
			// text_content	: get_label.play || 'Play',
			parent			: fragment
		})
		//listen the av state
		self.video.addEventListener('pause', async () =>{
			av_play_button.classList.remove('pause')
			av_play_button.classList.add('play')
		})
		self.video.addEventListener('play', async () =>{
			av_play_button.classList.remove('play')
			av_play_button.classList.add('pause')
		})
		// change the state of the av
		av_play_button.addEventListener('mouseup', () =>{
			self.play_pause();
		})

	// av_smpte. Show the SMPTE (time code)
		const av_smpte = ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'smpte',
			parent			: fragment,
			inner_html		: self.get_current_tc()
		})
		self.video.addEventListener('timeupdate', async () =>{
			av_smpte.innerHTML = self.get_current_tc();
		})

	// av_minus_10_seg. Go to 10 seconds before of the current time ( - 10 seconds )
		const av_minus_10_seg = ui.create_dom_element({
			element_type	: 'button',
			class_name		: btn_class,
			text_content	: '< 10s',
			parent			: fragment
		})
		av_minus_10_seg.addEventListener('mouseup', () =>{
			const seconds = self.video.currentTime - 10
			self.go_to_time({
				seconds : seconds
			});
		})

	// av_minus_5_seg. Go to 5 seconds before of the current time ( - 5 seconds )
		const av_minus_5_seg = ui.create_dom_element({
			element_type	: 'button',
			class_name		: btn_class,
			text_content	: '< 5s',
			parent			: fragment
		})
		av_minus_5_seg.addEventListener('mouseup', () =>{
			const seconds = self.video.currentTime - 5
			self.go_to_time({
				seconds : seconds
			});
		})

	// move_frame function
		const move_frame = (e) => {
			e.stopPropagation()

			const media_stream = self.media_streams[0] || null
			if (!media_stream) {
				console.error('Error getting media_stream:', self.media_streams);
				return
			}

			const direction = e.target.direction

			// get the r_frame_rate of the video stream and get the time for 1 frame
			const r_frame_rate				= media_stream.r_frame_rate
			const ar_frame_rate_operator	= r_frame_rate.split('/')
			const frame_rate				=  parseInt(ar_frame_rate_operator[0]) / parseInt(ar_frame_rate_operator[1])
			const time_for_frame			= 1 / frame_rate
			const seconds					= (direction==='forward')
				? (self.video.currentTime + time_for_frame).toFixed(3)
				: (self.video.currentTime - time_for_frame).toFixed(3)
			self.go_to_time({
				seconds : seconds
			});
		}//end move_frame

	// av_minus_1_frame. Go to 1 frame before of the current time ( - 1 frame )
		// the server send the head information in the media_info streams
		// the video is the first item of the streams array
		const av_minus_1_frame = ui.create_dom_element({
			element_type	: 'button',
			class_name		: btn_class,
			text_content	: '- 1',
			parent			: fragment
		})
		av_minus_1_frame.direction = 'backward'
		av_minus_1_frame.addEventListener('mouseup', move_frame)

	// av_plus_1_frame. go to 1 frame after of the current time ( + 1 frame )
		// the server send the head information in the media_info streams
		// the video is the first item of the streams array
		const av_plus_1_frame = ui.create_dom_element({
			element_type	: 'button',
			class_name		: btn_class,
			text_content	: '+ 1',
			parent			: fragment
		})
		av_plus_1_frame.direction = 'forward'
		av_plus_1_frame.addEventListener('mouseup', move_frame)

	// av_plus_5_seg. Go to 5 seconds after of the current time ( + 5 seconds )
		const av_plus_5_seg = ui.create_dom_element({
			element_type	: 'button',
			class_name		: btn_class,
			text_content	: '> 5s',
			parent			: fragment
		})
		av_plus_5_seg.addEventListener('mouseup', (e) =>{
			e.stopPropagation()

			const seconds = self.video.currentTime + 5
			self.go_to_time({
				seconds : seconds
			});
		})

	// av_plus_10_seg. Go to 10 seconds after of the current time ( + 10 seconds )
		const av_plus_10_seg = ui.create_dom_element({
			element_type	: 'button',
			class_name		: btn_class,
			text_content	: '> 10s',
			parent			: fragment
		})
		av_plus_10_seg.addEventListener('mouseup', () =>{
			const seconds = self.video.currentTime + 10
			self.go_to_time({
				seconds : seconds
			});
		})

	// av_control_buttons main container
		const av_control_buttons = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'av_control_buttons'
		})
		av_control_buttons.appendChild(fragment)


	return av_control_buttons
}//end get_av_control_buttons



/**
* BUILD_VIDEO_HTML5
* @return DOM element video
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



// @license-end
