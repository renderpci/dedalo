/*

# FORMAT OF THE JSON GET FROM SERVER
# the @context is the header of the list, with the columns resolution
# the data is the rows of the list
# it can mix some different columns (number, types, name of columns) procedent of different sections

{
	"context": [{
			"date": "Time",
			"mod_user_name": "modified",
			"component_label": "Where",
			"lang_label": "language",
			"value": "What"
	}],
	"data": [{
		"date"				: "25-09-2018 19:06:55",
		"userID				: "-1",
		"mod_user_name		: "Admin debuger",
		"id_time_machine	: "1379170",
		"tipo				: "mdcat768", //change to component_tipo when the tipo go out
		"component_label	: "Georreferenciación",
		"parent				: "1", //change to section_id when the parent go out
		"section_tipo		: "mdcat757",
		"lang				: "lg-nolan",
		"lang_label			: null,
		"value				: "alt : 16<br>lat : 39.47516051218389<br>lon : -0.65..",
		"tool_name			: "tool_time_machine"
	}]
}
*/

// import
	// import {event_manager} from '../../common/js/event_manager.js'
	import {common} from '../../common/js/common.js'
	import {render_relation_list} from './render_relation_list.js'
	import {data_manager} from '../../common/js/data_manager.js'


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
	time_machine_list.prototype.edit			= render_time_machine_list.prototype.edit
	time_machine_list.prototype.render			= common.prototype.render
	time_machine_list.prototype.refresh			= common.prototype.refresh
	time_machine_list.prototype.build_rqo_show	= common.prototype.build_rqo_show


/**
* INIT
* @return bool true
*/
time_machine_list.prototype.init = function(options) {

	const self = this

	self.id				= 'time_machine_list_' + options.tipo
	self.model			= 'time_machine_list'
	self.section_tipo	= options.section_tipo
	self.section_id		= options.section_id
	self.tipo			= options.tipo
	self.mode			= 'edit'
	self.node			= []
	self.context 		= {}
	self.limit			= options.limit || 10
	self.offset			= options.offset || 0
	self.total			= options.total || null

	// status update
	self.status = 'initiated'

	return true
};//end init



/**
* BUILD
* @return bool true
*/
relation_list.prototype.build = async function(autoload=true){

	const self = this

	// status update
		self.status = 'building'

	// self.datum. On building, if datum is not created, creation is needed
		self.datum = self.datum || {
			data	: [],
			context	: []
		}
		self.data = self.data || {}

	const current_data_manager = new data_manager()

	// source
		const source = {
			section_tipo	: self.section_tipo,
			section_id		: self.section_id,
			tipo			: self.tipo,
			mode			: self.mode,
			model 			: self.model
		}
	// sqo, use the "related" mode to get related sections that call to the current record (current section_tipo and section_id)
		const sqo = {
			section_tipo		: ['all'],
			mode				: 'related',
			limit				: self.limit,
			offset				: self.offset,
			full_count			: self.full_count,
			filter_by_locators	: [{
				section_tipo	: self.section_tipo,
				section_id		: self.section_id
			}]
		}
	// rqo, use the 'get_realtion_list' action from the API
		const rqo = {
			action	: 'get_relation_list',
			source	: source,
			sqo		: sqo
		}
		self.rqo = rqo

	// load data if not yet received as an option
		if (autoload===true) {

			const api_response = await current_data_manager.request({body:self.rqo})
				// console.log("RELATION_LIST api_response:", self.id, api_response);

			// set the result to the datum
				self.datum = api_response.result
		}

	// total
	// if the total is calculated and stored previously, don't calculate again.
	// total is the sum of all related sections to this record and don't change with the pagination.
		if(!self.total){

			//sqo, use the related mode to get all sections that call to the current record
			// is created new sqo because the sqo of the instance has offset and limit and total need to be the sum of all related sections
			const sqo_count = {
				section_tipo		: ['all'],
				mode				: 'related',
				filter_by_locators	: [{
					section_tipo	: self.section_tipo,
					section_id		: self.section_id
				}]
			}
			//rqo, use the 'count' action of the API
			const rqo_count = {
					action	: 'count',
					sqo		: sqo_count
			}

			const current_data_manager_count = new data_manager()
			// set the response to the self.total
			self.total = await current_data_manager_count.request({body:rqo_count}).then(function(response){
				if(response.result !== false){
					return response.result.total
				}
			})
		}

	// status update
		self.status = 'builded'

	return true
};//end build






































var time_machine_list = new function() {

    this.trigger_url = DEDALO_LIB_BASE_URL + '/time_machine_list/trigger.time_machine_list.php'
    this.time_machine_list_wrap = ''


    /**
    * INIT
    * 
    */
    this.init = function(time_machine_wrap) {

      let self = this
      
      /* get the current button state 
       * if the button has the class "time_machine_list_button"     = off   and can process the the request to the server
       * if the button has the class "time_machine_list_button_off" = on    and can't do anything 
      */
      const ar_button_class_list = time_machine_wrap.classList

      const parent_container      = time_machine_wrap.parentNode.parentNode
      this.time_machine_list_wrap = parent_container.querySelector('#wrap_time_machine_list_sections');
      const inspector_div_content = parent_container.querySelector('.inspector_div_content');
      if(ar_button_class_list.contains('time_machine_list_button')){
        ar_button_class_list.remove('time_machine_list_button')
        ar_button_class_list.add('time_machine_list_button_off')
        inspector_div_content.classList.remove("hide")
        self.get_server_records(time_machine_wrap)        
      }else{
        ar_button_class_list.remove('time_machine_list_button_off')
        ar_button_class_list.add('time_machine_list_button')
        inspector_div_content.classList.add("hide")
        self.clean_the_list()
      }     
    
    }


    /**
    * GET_SERVER_RECORDS
    * create the object to find inside the server
    * and send the promises to the load_time_machine_list_data
    * this send in async mode the two request, 1 data, 2 count
    */
    this.get_server_records = function(time_machine_wrap){

      let self = this

      //cretate the object to request the information
       const options = {
        modo                : time_machine_wrap.dataset.modo,
        tipo                : time_machine_wrap.dataset.tipo,
        section_tipo        : time_machine_wrap.dataset.section_tipo,
        section_id          : time_machine_wrap.dataset.section_id,
        limit               : parseInt(time_machine_wrap.dataset.limit),
        offset              : parseInt(time_machine_wrap.dataset.offset),
        count               : false,
      }

      // clean the global cotainer and remove all previuos styles
      const time_machine_list_wrap = this.time_machine_list_wrap;
      if (time_machine_list_wrap){
        time_machine_list_wrap.innerHTML=''
        time_machine_list_wrap.removeAttribute("style")
      }

      const loading_content   = common.create_dom_element({
                        element_type      : 'div',
                        parent            : time_machine_list_wrap,
                        class_name        : 'loading_content blink time_machine_list_waiting',
                        inner_html        : get_label['processing_wait']
                        })
      time_machine_list_wrap.appendChild(loading_content);
                
      // 1 send the request of the data
      options.count = false;
      self.load_time_machine_list_data(options).then(function(response){
        // remove loading_content
        loading_content.remove()

        // Render the data html
        self.parse_html(response)
      });

      // sent the request for count the rows
      options.count = true;
      self.load_time_machine_list_data(options).then(function(response){
        const total_records_count = response.data.length;
      // Render the paginator 
      self.parse_paginator_html(options, total_records_count);

      });      
      

    }//end get_server_records


}//end time_machine_list