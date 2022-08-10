/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL */
/*eslint no-undef: "error"*/



// imports
	import {dd_console} from '../../common/js/utils/index.js'
	// import {data_manager} from '../../common/js/data_manager.js'
	import {common} from '../../common/js/common.js'
	import {component_common} from '../../component_common/js/component_common.js'
	import {render_edit_component_av} from '../../component_av/js/render_edit_component_av.js'
	import {render_list_component_av} from '../../component_av/js/render_list_component_av.js'
	import {render_mini_component_av} from '../../component_av/js/render_mini_component_av.js'
	import {render_player_component_av} from '../../component_av/js/render_player_component_av.js'
	import {render_viewer_component_av} from '../../component_av/js/render_viewer_component_av.js'

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


	return true
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
	component_av.prototype.build_rqo			= common.prototype.build_rqo

	// render
	component_av.prototype.mini					= render_mini_component_av.prototype.mini
	component_av.prototype.list					= render_list_component_av.prototype.list
	component_av.prototype.edit					= render_edit_component_av.prototype.edit
	component_av.prototype.edit_in_list			= render_edit_component_av.prototype.edit
	component_av.prototype.search				= render_edit_component_av.prototype.search
	component_av.prototype.player				= render_player_component_av.prototype.player
	component_av.prototype.viewer				= render_viewer_component_av.prototype.viewer
	component_av.prototype.change_mode			= component_common.prototype.change_mode



/**
* GO_TO_TIME
* the information could to come from in two ways
* 1 from a tag, with the information in tc format (00:00:08.000), the information in this case is stored in options.tag.data
* 2 direct in seconds (8)
* the video player use seconds, if the information comes from tag it will convert this tc to seconds.
* @return int seconds
*/
component_av.prototype.go_to_time = function(options) {

	const self = this

	if (!self.video) {
		dd_console("Ignored go_to_time call. No self.video is set", 'warning', [self.tipo, self.id]);
		return false
	}

	// options
		const tag = options.tag

	const tag_time = tag.data
	const seconds = tag
		? self.tc_to_seconds(tag_time)
		: options

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
};// end rewind



/**
* GET_DATA_TAG
* Builds a tag object using current timecode
* @return obejct data_tag
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
component_av.prototype.get_current_tc = function(){

	const self = this

	const tc = self.time_to_tc(self.video.currentTime)

	return tc
}//end get_current_tc



/**
* TC_TO_SECONDS
* tc to seconds . convert tc like 00:12:19.878 to total seconds like 139.878
*/
component_av.prototype.tc_to_seconds = function(tc) {

	if(Number.isInteger(tc)) return tc

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

	// Format number as float, precission 1
		rate = parseFloat(rate)
		rate = rate.toPrecision(1)

	// fix value
		self.video.playbackRate = rate;

	return rate
}//end  set_playback_rate
