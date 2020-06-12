/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {data_manager} from '../../common/js/data_manager.js'
	import {common,create_source} from '../../common/js/common.js'
	import {component_common} from '../../component_common/js/component_common.js'
	import {render_component_av} from '../../component_av/js/render_component_av.js'



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


	return true
}//end component_av



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
	component_av.prototype.build_dd_request		= common.prototype.build_dd_request

	// render
	component_av.prototype.list					= render_component_av.prototype.list
	component_av.prototype.edit					= render_component_av.prototype.edit
	component_av.prototype.edit_in_list			= render_component_av.prototype.edit
	component_av.prototype.search				= render_component_av.prototype.search
	component_av.prototype.change_mode			= component_common.prototype.change_mode



/**
* GO_TO_TIME
* @return int seconds
*/
component_av.prototype.go_to_time = function(options){

	const self = this

	const tag_time = options.tag.dataset.data
	const seconds  = self.tc_to_seconds(tag_time)

	self.video.currentTime = seconds;

	return seconds
}//end go_to_time



/**
* PLAY_PAUSE
*/
component_av.prototype.play_pause = function(){

	const self = this

	if (self.video.paused) {
		self.video.play();
	} else {
		self.video.pause();
	}

	return self.video.currentTime
}// end play_pause



/**
* GET_DATA_TAG
* Send the data_tag to the text_area when it need create a new tag
*/
component_av.prototype.get_data_tag = function(){

	const self 	= this

	const tc 	= self.get_current_tc()
	const data_tag = {
		type 	: 'tc',
		tag_id 	: tc,
		state 	: 'n',
		label 	: tc,
		data 	: tc
	}

	return data_tag
}// end get_data_tag



/**
* GET_CURRENT_TC
* Send the data_tag to the text_area when it need create a new tag
*/
component_av.prototype.get_current_tc = function(){

	const self = this

	const tc = self.time_to_tc(self.video.currentTime)

	return tc
}// end get_current_tc



/**
* TC_TO_SECONDS
* tc to seconds . convert tc like 00:12:19.878 to total seconds like 139.878
*/
component_av.prototype.tc_to_seconds = function(tc) {

	if(Number.isInteger(tc)) return tc

	//var tc = "00:09:52.432";
	const ar 		= tc.split(":")
	const ar_ms 	= tc.split(".")

	const hours 	= parseFloat(ar[0])>0 ? parseFloat(ar[0]) : 0
	const minutes 	= parseFloat(ar[1])>0 ? parseFloat(ar[1]) : 0
	const seconds 	= parseFloat(ar[2])>0 ? parseFloat(ar[2]) : 0
	const mseconds 	= parseFloat(ar_ms[1])>0 ? parseFloat(ar_ms[1]) : 0


	const total_seconds = parseFloat( (hours * 3600) + (minutes * 60) + seconds +'.'+ mseconds)

	return total_seconds ;
}//end tc_to_seconds



/**
* TIME_TO_TC
* get the time of the video and convert to tc
* with the 00:00:00.000 format
*/
component_av.prototype.time_to_tc = function(time) {

	// const seconds = (typeof frames !== 'number' ? this.video.currentseconds : frames)
	const date = (new Date())

	date.setHours(0); // reset the hours to 0
	date.setMinutes(0); // reset the minutes to 0
	date.setSeconds(0); // reset the seconds to 0
	date.setMilliseconds(time * 1000); // set the date with the time of the video

	function wrap(n) { return ((n < 10) ? '0' + n : n);}
	function wrap_ms(n) { return ((n < 1) ? '000' : (n < 10) ? '00' + n :  (n < 100) ? '0' + n : n);}

	const hours 	= wrap(date.getHours() < 13 ? date.getHours() : (date.getHours() - 12));
	const minutes 	= wrap(date.getMinutes());
	const seconds 	= wrap(date.getSeconds());
	const mseconds 	= wrap_ms(date.getMilliseconds()) //fps: wrap(Math.floor(((time % 1) * frame_rate)));

	const tc    = hours+':'+minutes+':'+seconds+'.'+mseconds;

	return tc
}//end time_to_tc


