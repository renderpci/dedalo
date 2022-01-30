/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/


// import
	// import {event_manager} from '../../common/js/event_manager.js'
	import {common} from '../../common/js/common.js'
	import {get_instance} from '../../common/js/instances.js'
	// import {data_manager} from '../../common/js/data_manager.js'
	import {render_time_machine_list} from './render_time_machine_list.js'
	import {render_time_machine_view} from './render_time_machine_view.js'


/**
* time_machine_LIST
*
*
*
*/
export const time_machine_list = function() {

	this.id				= null

	// element properties declare
	this.model			= null
	this.type			= null
	this.tipo			= null
	this.section_tipo	= null
	this.section_id		= null
	this.mode			= null
	this.lang			= null

	this.datum			= null
	this.context		= null
	this.data			= null

	this.node			= null
	this.status			= null
	this.filter			= null

	this.rqo_config		= null
	this.rqo			= null

	return true
};//end time_machine_list



/**
* COMMON FUNCTIONS
* extend component functions from component common
*/
// prototypes assign
	time_machine_list.prototype.destroy			= common.prototype.destroy
	time_machine_list.prototype.refresh			= common.prototype.refresh
	time_machine_list.prototype.render			= common.prototype.render
	time_machine_list.prototype.edit			= render_time_machine_list.prototype.edit

/**
* INIT
* @return bool true
*/
time_machine_list.prototype.init = function(options) {

	const self = this

	// call the generic common tool init
		const common_init = common.prototype.init.call(this, options);

	// status update
	self.status = 'initiated'

	return true
};//end init



/**
* BUILD
* @return bool true
*/
time_machine_list.prototype.build = async function(autoload=true){

	const self = this

	// status update
		self.status = 'building'

	// time_machine
	// Create, build and assign the time machine service to the instance
		self.time_machine	= await get_instance({
			model			: 'time_machine',
			section_tipo	: self.section_tipo,
			section_id		: self.section_id,
			tipo			: self.section_tipo,
			mode 			: 'tm',
			lang			: page_globals.dedalo_data_nolan,
			caller			: self
		})
		self.time_machine.view = render_time_machine_view

	await self.time_machine.build(true)

	// add to self instances list
		self.ar_instances.push(self.time_machine)

			console.log("self.time_machine:",self.time_machine);
	// status update
		self.status = 'builded'

	return true
};//end build






































// var time_machine_list = new function() {

//     this.trigger_url = DEDALO_LIB_BASE_URL + '/time_machine_list/trigger.time_machine_list.php'
//     this.time_machine_list_wrap = ''


//     /**
//     * INIT
//     *
//     */
//     this.init = function(time_machine_wrap) {

//       let self = this
      
//       /* get the current button state
//        * if the button has the class "time_machine_list_button"     = off   and can process the the request to the server
//        * if the button has the class "time_machine_list_button_off" = on    and can't do anything
//       */
//       const ar_button_class_list = time_machine_wrap.classList

//       const parent_container      = time_machine_wrap.parentNode.parentNode
//       this.time_machine_list_wrap = parent_container.querySelector('#wrap_time_machine_list_sections');
//       const inspector_div_content = parent_container.querySelector('.inspector_div_content');
//       if(ar_button_class_list.contains('time_machine_list_button')){
//         ar_button_class_list.remove('time_machine_list_button')
//         ar_button_class_list.add('time_machine_list_button_off')
//         inspector_div_content.classList.remove("hide")
//         self.get_server_records(time_machine_wrap)
//       }else{
//         ar_button_class_list.remove('time_machine_list_button_off')
//         ar_button_class_list.add('time_machine_list_button')
//         inspector_div_content.classList.add("hide")
//         self.clean_the_list()
//       }
    
//     }


//     /**
//     * GET_SERVER_RECORDS
//     * create the object to find inside the server
//     * and send the promises to the load_time_machine_list_data
//     * this send in async mode the two request, 1 data, 2 count
//     */
//     this.get_server_records = function(time_machine_wrap){

//       let self = this

//       //cretate the object to request the information
//        const options = {
//         modo                : time_machine_wrap.dataset.modo,
//         tipo                : time_machine_wrap.dataset.tipo,
//         section_tipo        : time_machine_wrap.dataset.section_tipo,
//         section_id          : time_machine_wrap.dataset.section_id,
//         limit               : parseInt(time_machine_wrap.dataset.limit),
//         offset              : parseInt(time_machine_wrap.dataset.offset),
//         count               : false,
//       }

//       // clean the global cotainer and remove all previuos styles
//       const time_machine_list_wrap = this.time_machine_list_wrap;
//       if (time_machine_list_wrap){
//         time_machine_list_wrap.innerHTML=''
//         time_machine_list_wrap.removeAttribute("style")
//       }

//       const loading_content   = common.create_dom_element({
//                         element_type      : 'div',
//                         parent            : time_machine_list_wrap,
//                         class_name        : 'loading_content blink time_machine_list_waiting',
//                         inner_html        : get_label['processing_wait']
//                         })
//       time_machine_list_wrap.appendChild(loading_content);
                
//       // 1 send the request of the data
//       options.count = false;
//       self.load_time_machine_list_data(options).then(function(response){
//         // remove loading_content
//         loading_content.remove()

//         // Render the data html
//         self.parse_html(response)
//       });

//       // sent the request for count the rows
//       options.count = true;
//       self.load_time_machine_list_data(options).then(function(response){
//         const total_records_count = response.data.length;
//       // Render the paginator
//       self.parse_paginator_html(options, total_records_count);

//       });
      

//     }//end get_server_records


// }//end time_machine_list