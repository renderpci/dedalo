// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL */
/*eslint no-undef: "error"*/



// imports
	import {dd_console} from '../../common/js/utils/index.js'
	import {data_manager} from '../../common/js/data_manager.js'
	import {object_to_url_vars, open_window, download_file} from '../../common/js/utils/index.js'
	import {common, create_source} from '../../common/js/common.js'
	import {component_common} from '../../component_common/js/component_common.js'
	import {render_edit_component_av} from '../../component_av/js/render_edit_component_av.js'
	import {render_list_component_av} from '../../component_av/js/render_list_component_av.js'
	import {render_search_component_av} from '../../component_av/js/render_search_component_av.js'



	// Note about event_manager
	// the component_av is configured by properties in the ontology,
	// it has subscribed to some events that comes defined in properties as: key_up_f2, key_up_esc, click_tag_tc
	// the events need to be linked to specific text_area and it's defined in ontology.



export const component_av = function(){

	this.id

	// element properties declare
	this.model
	this.tipo
	this.section_tipo
	this.section_id
	this.mode
	this.lang

	this.section_lang
	this.context
	this.data
	this.parent
	this.node

	this.tools
	this.video
	this.quality

	this.fragment = null
}//end  component_av



/**
* COMMON FUNCTIONS
* extend component functions from component common
*/
// prototypes assign
	// lifecycle
	component_av.prototype.init					= component_common.prototype.init
	component_av.prototype.build				= component_common.prototype.build
	component_av.prototype.render				= common.prototype.render
	component_av.prototype.refresh				= common.prototype.refresh
	component_av.prototype.destroy				= common.prototype.destroy

	// change data
	component_av.prototype.save					= component_common.prototype.save
	component_av.prototype.update_data_value	= component_common.prototype.update_data_value
	component_av.prototype.update_datum			= component_common.prototype.update_datum
	component_av.prototype.change_value			= component_common.prototype.change_value
	component_av.prototype.set_changed_data		= component_common.prototype.set_changed_data
	component_av.prototype.build_rqo			= common.prototype.build_rqo

	// render
	component_av.prototype.list					= render_list_component_av.prototype.list
	component_av.prototype.tm					= render_list_component_av.prototype.list
	component_av.prototype.edit					= render_edit_component_av.prototype.edit
	component_av.prototype.search				= render_search_component_av.prototype.search

	component_av.prototype.change_mode			= component_common.prototype.change_mode



/**
* GO_TO_TIME
* the information could to come from in two ways:
* 1 from a tag, with the information in tc format (00:00:08.000), the information in this case is stored in options.tag.data
* 	usually fired by 'click_tag_tc' event
* 2 direct in seconds (8)
* the video player use seconds, if the information comes from tag it will convert this tc to seconds.
* @param object options
* Sample from component_text_area event :
* {
*  	caller : instance
*	tag : object {node_name: 'img', type: 'tc', tag_id: '[TC_00:00:00.000_TC]', state: 'n', label: '00:00:00.000', …}
*	text_editor : service_ckeditor instance
* }
* Sample from component_av direct call :
* {
*  	seconds : float 16
* }
* @return double-precision floating-point seconds
*/
component_av.prototype.go_to_time = function(options) {

	const self = this

	if (!self.video) {
		dd_console("Ignored go_to_time call. No self.video is set", 'warning', [self.tipo, self.id]);
		return false
	}

	const seconds = options.seconds
		? options.seconds
		: (options.tag && options.tag.data)
			? self.tc_to_seconds(options.tag.data)
			: 0

	self.video.currentTime = seconds;

	return seconds
}//end  go_to_time



/**
* PLAY_PAUSE
* @param int rewind_seconds = 0
* @return bool self.video.paused
*/
component_av.prototype.play_pause = function(rewind_seconds=0) {

	const self = this

	if (!self.video) {
		dd_console("Ignored play_pause call. No self.video is set", 'warning', [self.tipo, self.id]);
		return false
	}

	if (self.video.paused) {
		self.video.play();
	} else {
		self.video.pause();
		if(rewind_seconds > 0){
			self.rewind(rewind_seconds)
		}
	}

	return self.video.paused
}//end play_pause



/**
* REWIND
* @param int seconds
* @return float self.video.currentTime
*/
component_av.prototype.rewind = function(seconds) {

	const self = this
	self.video.currentTime = parseFloat(self.video.currentTime - seconds);

	return self.video.currentTime
}//end rewind



/**
* GET_DATA_TAG
* Builds a tag object using current timecode
* @return object data_tag
*/
component_av.prototype.get_data_tag = function() {

	const self 	= this

	const tc 	= self.get_current_tc()
	const data_tag = {
		type	: 'tc',
		tag_id	: tc,
		state	: 'n',
		label	: tc,
		data	: tc
	}

	return data_tag
}//end get_data_tag



/**
* GET_CURRENT_TC
* Get current timecode
*/
component_av.prototype.get_current_tc = function() {

	const self = this

	const tc = self.time_to_tc(self.video.currentTime)

	return tc
}//end get_current_tc



/**
* TC_TO_SECONDS
* tc to seconds . convert tc like 00:12:19.878 to total seconds like 139.878
* @param string tc
* @return float total_seconds
*/
component_av.prototype.tc_to_seconds = function(tc) {

	if(Number.isInteger(tc)) {
		return tc
	}

	//var tc		= "00:09:52.432";
	const ar		= tc.split(":")
	const ar_ms		= tc.split(".")

	const hours		= parseFloat(ar[0])>0 ? parseFloat(ar[0]) : 0
	const minutes	= parseFloat(ar[1])>0 ? parseFloat(ar[1]) : 0
	const seconds	= parseFloat(ar[2])>0 ? parseFloat(ar[2]) : 0
	const mseconds	= parseFloat(ar_ms[1])>0 ? parseFloat(ar_ms[1]) : 0

	const total_seconds = parseFloat( (hours * 3600) + (minutes * 60) + seconds +'.'+ mseconds)


	return total_seconds
}//end  tc_to_seconds



/**
* TIME_TO_TC
* Get the time of the video and convert to tc
* with the 00:00:00.000 format
* @param float time
* @return string tc
*/
component_av.prototype.time_to_tc = function(time) {

	// date
		const date = (new Date())
		date.setHours(0); // reset the hours to 0
		date.setMinutes(0); // reset the minutes to 0
		date.setSeconds(0); // reset the seconds to 0
		date.setMilliseconds(time * 1000); // set the date with the time of the video in ms

	// format the tc with 09
	// current_date can be; hour, min or second
	function wrap(current_date) {
		return ((current_date < 10)
			? '0' + current_date
			: current_date);
	}
	//format the ms with 001 or 010 or 100
	function wrap_ms(ms) {
		return ((ms < 1)
			? '000'
			: (ms < 10)
				? '00' + ms
				:  (ms < 100)
					? '0' + ms
					: ms);
	}

	const hours		= wrap(date.getHours() < 13
		? date.getHours()
		: (date.getHours() - 12));
	const minutes	= wrap(date.getMinutes());
	const seconds	= wrap(date.getSeconds());
	const mseconds	= wrap_ms(date.getMilliseconds()) //fps: wrap(Math.floor(((time % 1) * frame_rate)));

	// tc
		const tc = `${hours}:${minutes}:${seconds}.${mseconds}`


	return tc
}//end time_to_tc



/**
* SET_PLAYBACK_RATE
* set the video playback to specific speed rate
* @param int rate
* @return float rate
*/
component_av.prototype.set_playback_rate = function(rate) {

	const self = this

	// no video case
		if (!self.video) {
			dd_console("Ignored rate call. No self.video is set", 'warning', [self.tipo, self.id]);
			return false
		}

	// Format number as float, precision 1
		rate = parseFloat(rate)
		rate = rate.toPrecision(1)

	// fix value
		self.video.playbackRate = rate;

	return rate
}//end set_playback_rate



/**
* OPEN_AV_PLAYER
* static method called by dd_grid_indexation
* Creates a new url with the vars needed to create a av player
* and open it in a new window
* @param object options
* @return bool
*/
export const open_av_player = async function(options) {

	// options
		const component_tipo	= options.component_tipo
		const section_id		= options.section_id
		const section_tipo		= options.section_tipo
		const tc_in_secs		= options.tc_in_secs ?? 0 // as seconds
		const tc_out_secs		= options.tc_out_secs ?? null // as seconds

	// open new window. Let page collect url params and create a new instance of component_av
		const url = DEDALO_CORE_URL + '/page/?' + object_to_url_vars({
			tipo			: component_tipo,
			section_tipo	: section_tipo,
			id				: section_id,
			mode			: 'edit',
			view			: 'viewer',
			menu			: false,
			tc_in			: tc_in_secs,
			tc_out			: tc_out_secs
		})
		open_window({
			url		: url,
			target	: 'viewer',
			width	: 1024,
			height	: 860
		})


	return true
}//end open_av_player



/**
* DOWNLOAD_AV_FRAGMENT
* static method called by dd_grid_indexation
* Request to the API the creation of an av fragment and
* force download the result URL of the created file
* @param object options
* @return promise
* 	Resolve api_response
*/
export const download_av_fragment = async function(options) {

	// options
		const tipo			= options.tipo
		const section_tipo	= options.section_tipo
		const section_id	= options.section_id
		const tag_id		= options.tag_id
		const lang			= options.lang
		const quality		= options.quality
		const tc_in_secs	= options.tc_in_secs || 0 // as seconds
		const tc_out_secs	= options.tc_out_secs || null // as seconds
		const watermark		= options.watermark!==undefined ? options.watermark : false
		const button_caller = options.button_caller

		if (button_caller) {
			button_caller.classList.add('loading')
		}

	/*
		// trigger url
			const trigger_url = null

		// watermark
			const watermark = null

		// url
			const url_vars = {
				mode			: 'download_file',
				quality			: quality,
				tipo			: tipo,
				section_tipo	: section_tipo,
				section_id		: section_id,
				tc_in			: tc_in,
				tc_out			: tc_out,
				watermark		: watermark
			}
			const pairs = []
			for (const key in url_vars) {
				pairs.push( key+'='+url_vars[key] )
			}
			const url = self.trigger_url + '?' + pairs.join('&')
			*/

	return new Promise(function(resolve){

		data_manager.request({
			body : {
				action	: 'download_fragment',
				dd_api	: 'dd_component_av_api',
				source	: {
					tipo			: tipo,
					section_tipo	: section_tipo,
					section_id		: section_id,
					tag_id			: tag_id,
					lang			: lang
				},
				options : {
					quality		: quality,
					tc_in_secs	: tc_in_secs,
					tc_out_secs	: tc_out_secs,
					watermark	: watermark
				}
			}
		})
		.then(async function(api_response){

			if (button_caller) {
				button_caller.classList.remove('loading')
			}

			if (api_response.result===false) {

				// error case
				const msg = api_response.msg || 'Error on create fragment'
				console.error(msg)
				alert(msg);

			}else{

				// success case

				const url		= api_response.result;
				const file_name	= `dedalo_download_${quality}_` + url.substring(url.lastIndexOf('/')+1);

				download_file({
					url			: url,
					file_name	: file_name
				})
			}

			resolve(api_response)
		})
	})
}//end download_av_fragment



/**
* GET_MEDIA_STREAMS
* 	Get media_streams info from default quality file calling API
* @return promise
* 	resolve object|null
*/
component_av.prototype.get_media_streams = function() {

	const self = this

	return new Promise(function(resolve){

		data_manager.request({
			body : {
				action	: 'get_media_streams',
				dd_api	: 'dd_component_av_api',
				source	: {
					tipo			: self.tipo,
					section_tipo	: self.section_tipo,
					section_id		: self.section_id,
					lang			: self.lang
				},
				options : {
					// quality	: quality
				}
			}
		})
		.then(async function(api_response) {
			if(SHOW_DEBUG===true) {
				console.log('))) get_media_streams api_response:', api_response);
			}

			if (api_response.result===false) {

				// error case

				const msg = api_response.msg || 'Error on get_media_streams'
				console.error(msg)

				resolve(null)

			}else{

				// success case

				const media_streams	= api_response.result

				resolve(media_streams)
			}
		})
	})
}//end get_media_streams



/**
* CREATE_POSTERFRAME
* Creates a new posterframe file from current_view overwriting old file if exists
* @param object viewer
* @return bool
*/
component_av.prototype.create_posterframe = async function() {

	const self = this

	// move_file_to_dir
		const rqo = {
			dd_api	: 'dd_component_av_api',
			action	: 'create_posterframe',
			source	: create_source(self),
			options	: {
				current_time : self.video?.currentTime || 0
			}
		}

	// call to the API, fetch data and get response
		const api_response = await data_manager.request({
			body : rqo
		})

	// debug
		if(SHOW_DEVELOPER===true) {
			dd_console("-> create_posterframe API response:",'DEBUG', api_response);
		}


	return api_response.result
}//end create_posterframe



/**
* DELETE_POSTERFRAME
* Deletes existing posterframe file
* @return bool
*/
component_av.prototype.delete_posterframe = async function() {

	const self = this

	// move_file_to_dir
		const rqo = {
			dd_api	: 'dd_component_av_api',
			action	: 'delete_posterframe',
			source	: create_source(self),
			options	: {}
		}

	// call to the API, fetch data and get response
		const api_response = await data_manager.request({
			body : rqo
		})

	// debug
		if(SHOW_DEVELOPER===true) {
			dd_console("-> delete_posterframe API response:",'DEBUG', api_response);
		}


	return api_response.result
}//end delete_posterframe



// @license-end
