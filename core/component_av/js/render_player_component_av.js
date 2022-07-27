/*global get_label, page_globals, SHOW_DEBUG, DEDALO_LIB_URL*/
/*eslint no-undef: "error"*/



// imports
	// import {event_manager} from '../../common/js/event_manager.js'
	import {ui} from '../../common/js/ui.js'



/**
* RENDER_PLAYER_COMPONENT_AV
* Manages the component's logic and appearance in client side
*/
export const render_player_component_av = function() {

	return true
}//end  render_player_component_av



/**
* PLAYER
* Render node for use in modes: edit, edit_in_list
* @param object options
* @return DOM node wrapper
*/
render_player_component_av.prototype.player = async function(options) {

	const self = this

	// options
		const render_level = options.render_level || 'full'

	// fix non value scenarios
		// self.data.value = (self.data.value.length<1) ? [null] : self.data.value

	// content_data
		const current_content_data = get_content_data_player(self)
		if (render_level==='content') {
			return current_content_data
		}

	// wrapper. ui build_edit returns component wrapper
		const wrapper = ui.component.build_wrapper_edit(self, {
			content_data	: current_content_data,
			label			: null
		})
		console.log('wrapper:', wrapper);

	// av_control_buttons
		if (self.video) {
			const av_control_buttons = get_av_control_buttons(self)
			wrapper.appendChild(av_control_buttons)
		}

	// add events
		//add_events(self, wrapper)


	return wrapper
}//end  player



/**
* GET_CONTENT_DATA_PLAYER
* @param instance self
* @return DOM node content_data
*/
const get_content_data_player = function(self) {

	const fragment = new DocumentFragment()

	// urls
		// posterframe
			const posterframe_url = self.data.posterframe_url
		// media
			// const video_url = self.data.video_url
			const quality	= self.quality || self.context.quality
			const datalist	= self.data.datalist
			const file_info	= datalist.find(el => el.quality===quality && el.file_exist===true)
			const video_url	= file_info
				? file_info.url
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

			// source tag
				const source	= document.createElement("source")
				source.type		= "video/mp4"
				source.src		= (self.fragment)
					? video_url + '?' + fragment_url
					: video_url

			// video tag
				const video		= document.createElement("video")
				video.poster	= posterframe_url
				video.controls	= true
				video.classList.add("posterframe")
				video.setAttribute("tabindex", 0)
				video.appendChild(source)

			// subtitles track
				const subtitles	= self.data.subtitles
				if(subtitles && subtitles.subtitles_url) {
					const subtitles_track = document.createElement('track')
					subtitles_track.type	= 'text/vtt'
					subtitles_track.label	= subtitles.lang_name
					subtitles_track.srclang	= subtitles.lang
					subtitles_track.src		= subtitles.subtitles_url
					subtitles_track.default	= true
					// Add new track to video
						video.appendChild(subtitles_track)
				}

			// append the video node to the instance
				self.video = video
				fragment.appendChild(video)
		}

	// content_data
		const content_data = ui.component.build_content_data(self)
			  content_data.appendChild(fragment)


	return content_data
}//end get_content_data_edit



/**
* GET_AV_CONTROL_BUTTONS
* @param object instance
* @return DOM node av_control_buttons
*/
const get_av_control_buttons =  (self) =>{

	const fragment = new DocumentFragment()

	// css
		const btn_class = 'light'

	// av_begin_button. button go to begin of av
		const av_begin_button = ui.create_dom_element({
			element_type	: 'button',
			class_name		: btn_class,
			inner_html		: get_label.inicio || 'Beginning',
			parent			: fragment
		})
		av_begin_button.addEventListener("mouseup", () =>{
			self.go_to_time(0);
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
		av_play_button.addEventListener("mouseup", () =>{
			self.play_pause();
		})

	// av_smpte. Show the smpte (time code)
		const av_smpte = ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'smpte',
			parent			: fragment,
			inner_html		: self.get_current_tc()
		})
		self.video.addEventListener("timeupdate", async () =>{
			av_smpte.innerHTML = self.get_current_tc();
		})

	// av_minus_10_seg. Go to 10 secons before of the current time ( - 10 seconds )
		const av_minus_10_seg = ui.create_dom_element({
			element_type	: 'button',
			class_name		: btn_class,
			text_content	: '< 10s',
			parent			: fragment
		})
		av_minus_10_seg.addEventListener("mouseup", () =>{
			const seconds = self.video.currentTime - 10
			self.go_to_time(seconds);
		})

	// av_minus_5_seg. Go to 5 secons before of the current time ( - 5 seconds )
		const av_minus_5_seg = ui.create_dom_element({
			element_type	: 'button',
			class_name		: btn_class,
			text_content	: '< 5s',
			parent			: fragment
		})
		av_minus_5_seg.addEventListener("mouseup", () =>{
			const seconds = self.video.currentTime - 5
			self.go_to_time(seconds);
		})

	// av_minus_1_frame. Go to 1 frame before of the current time ( - 1 frame )
		// the server send the head information in the media_info streams
		// the video is the first item of the streams array
		const av_minus_1_frame = ui.create_dom_element({
			element_type	: 'button',
			class_name		: btn_class,
			text_content	: '- 1',
			parent			: fragment
		})
		av_minus_1_frame.addEventListener("mouseup", () =>{
			// get the r_frame_rate of the video stream and get the time for 1 frame
			const r_frame_rate				= self.data.media_info.streams[0].r_frame_rate
			const ar_frame_rate_opeartor	= r_frame_rate.split('/')
			const frame_rate				=  parseInt(ar_frame_rate_opeartor[0]) / parseInt(ar_frame_rate_opeartor[1])
			const time_for_frame			= 1 / frame_rate
			const seconds					= (self.video.currentTime - time_for_frame).toFixed(3)
			self.go_to_time(seconds);
		})

	// av_plus_1_frame. go to 1 frame after of the current time ( + 1 frame )
		// the server se	nd the head information in the media_info streams
		// the video is the first item of the streams array
		const av_plus_1_frame = ui.create_dom_element({
			element_type	: 'button',
			class_name		: btn_class,
			text_content	: '+ 1',
			parent			: fragment
		})
		av_plus_1_frame.addEventListener("mouseup", () =>{

			//get the r_frame_rate of the video stream and get the time for 1 frame
			const r_frame_rate				= self.data.media_info.streams[0].r_frame_rate
			const ar_frame_rate_opeartor	= r_frame_rate.split('/')
			const frame_rate				=  parseInt(ar_frame_rate_opeartor[0]) / parseInt(ar_frame_rate_opeartor[1])
			const time_for_frame			= (1 / frame_rate)
			const seconds					= (self.video.currentTime + time_for_frame).toFixed(3)

			self.go_to_time(seconds);
		})

	// av_plus_5_seg. Go to 5 secons after of the current time ( + 5 seconds )
		const av_plus_5_seg = ui.create_dom_element({
			element_type	: 'button',
			class_name		: btn_class,
			text_content	: '> 5s',
			parent			: fragment
		})
		av_plus_5_seg.addEventListener("mouseup", () =>{
			const seconds = self.video.currentTime + 5
			self.go_to_time(seconds);
		})

	// av_plus_10_seg. Go to 10 secons after of the current time ( + 10 seconds )
		const av_plus_10_seg = ui.create_dom_element({
			element_type	: 'button',
			class_name		: btn_class,
			text_content	: '> 10s',
			parent			: fragment
		})
		av_plus_10_seg.addEventListener("mouseup", () =>{
			const seconds = self.video.currentTime + 10
			self.go_to_time(seconds);
		})

	// av_control_buttons main cotainer
		const av_control_buttons = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'av_control_buttons'
		})
		av_control_buttons.appendChild(fragment)


	return av_control_buttons
}//end get_av_control_buttons



/**
* BUILD_VIDEO_HTML5
* @return dom element video
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


