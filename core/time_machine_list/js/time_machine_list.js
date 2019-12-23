/*

# FORMAT OF THE JSON GET FROM SERVER
# the @context is the header of the list, with the columns resolution
# the data is the rows of the list
# it can mix some different columns (number, types, name of columns) procedent of different sections

{
  "@context": [
    {
      "date": "Time",
      "mod_user_name": "modified",
      "component_label": "Where",
      "lang_label": "language",
      "value": "What"
    }
  ],
  "data": [{
        "date"          : "25-09-2018 19:06:55",
        "userID         : "-1",
        "mod_user_name  : "Admin debuger",
        "id_time_machine: "1379170",
        "tipo           : "mdcat768", //change to component_tipo when the tipo go out
        "component_label: "Georreferenciación",
        "parent         : "1", //change to section_id when the parent go out
        "section_tipo   : "mdcat757",
        "lang           : "lg-nolan",
        "lang_label     : null,
        "value          : "alt : 16<br>lat : 39.47516051218389<br>lon : -0.65..",
        "tool_name      : "tool_time_machine"
  }

  ]
}
*/

/**
* time_machine_LIST
*
*
*
*/

"use strict"

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

      const parent_container   = time_machine_wrap.parentNode.parentNode
      this.time_machine_list_wrap = parent_container.querySelector('#wrap_time_machine_list_sections');
      if(ar_button_class_list.contains('time_machine_list_button')){
        ar_button_class_list.remove('time_machine_list_button')
        ar_button_class_list.add('time_machine_list_button_off')
        self.get_server_records(time_machine_wrap)
      }else{
        ar_button_class_list.remove('time_machine_list_button_off')
        ar_button_class_list.add('time_machine_list_button')
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



    /**
    * PARSE_HTML
    * process the JSON recived 
    */
    this.parse_html = function(main_object){

      let self = this

      // get the data information of the JSON recived
      const context     = main_object.context;
      const data        = main_object.data;

      // create new styleSheet
      let CSS_style_sheet = common.create_new_CSS_style_sheet();

      // render the list html for current section_tipo
      self.build_grid_html(context, data, CSS_style_sheet)

    }//end parse_html



    /**
    * BUILD_GRID_HTML
    * build the relation list html with the section selected
    */
    this.build_grid_html = function(columns, data, CSS_style_sheet){

      //get the parent node of the list
      const time_machine_list_wrap  = this.time_machine_list_wrap;
      //time_machine_list_wrap.innerHTML ='';

      /* 1 Create the grid container */
      // create a grid content
      const grid  = common.create_dom_element({
                      element_type      : 'div',
                      parent            : time_machine_list_wrap,
                      class_name        : 'time_machine_list_grid',
                      })

      
      /* 2 Create the header */
      //create the columns labels container
      const data_header  = common.create_dom_element({
                element_type      : 'ul',
                parent            : grid,
                class_name        : 'time_machine_grid time_machine_list_data_header'
                })

       //create a labels colums info header, the name of the componets of the related sections
      columns.forEach(function(column){
        const class_name =''
        const data_header_date  = common.create_dom_element({
                element_type      : 'li',
                parent            : data_header,
                class_name        : class_name,
                text_node         : column.date
                })
        const data_header_mod_user_name  = common.create_dom_element({
                element_type      : 'li',
                parent            : data_header,
                class_name        : class_name,
                text_node         : column.mod_user_name
                })
        const data_header_component_label  = common.create_dom_element({
                element_type      : 'li',
                parent            : data_header,
                class_name        : class_name,
                text_node         : column.component_label
                })
        const data_header_value  = common.create_dom_element({
                element_type      : 'li',
                parent            : data_header,
                class_name        : class_name,
                text_node         : column.value
                })
      })
    
     /* 3 Create the rows with the data */    
      let curent_section_id = 0;
      let data_row_header = ''
      data.forEach(function(current_data){
        
      //check if the columns id the first column for create the ul node and the first id column
       
          //first row, the ul is the container for all row
          const event_function    = [{'type':'click','name':'tool_common.open_tool_time_machine'}];
              data_row_header  = common.create_dom_element({
                  element_type            : 'ul',
                  parent                  : grid,
                  class_name              : 'time_machine_grid time_machine_list_data_row',
                  custom_function_events  : event_function,
                  data_set                : current_data
                  })

          // the information colums of the components of the section
          const data_row_date  = common.create_dom_element({
                  element_type      : 'li',
                  parent            : data_row_header,
                  //class_name        : 'time_machine_list_data_hearder',
                  text_node         : current_data.date
                  })

          // the information colums of the components of the section
          const data_row_mod_user_name  = common.create_dom_element({
                  element_type      : 'li',
                  parent            : data_row_header,
                  //class_name        : 'time_machine_list_data_hearder',
                  text_node         : current_data.mod_user_name
                  })
          // the information colums of the components of the section

          let data_row_component_label_value = current_data.component_label;
          if(current_data.lang_label !== null){ 
              data_row_component_label_value = data_row_component_label_value + " - " + current_data.lang_label
            }

          const data_row_component_label  = common.create_dom_element({
                  element_type      : 'li',
                  parent            : data_row_header,
                  //class_name        : 'time_machine_list_data_hearder',
                  text_node         : data_row_component_label_value
                  })         

          // the information colums of the components of the section
          const data_row_value  = common.create_dom_element({
                  element_type      : 'li',
                  parent            : data_row_header,
                  //class_name        : 'time_machine_list_data_hearder',
                  text_node         : current_data.value
                  })
        })
      

    }//end build_grid_html


    /**
    * PARSE_PAGINATOR_HTML
    * build the paginator html
    */
    this.parse_paginator_html = function(options, total_records_count){
        
      let self = this

      //set the total_records_count into the options object
      options['total_records_count'] = total_records_count

      //get the global container
      const time_machine_list_wrap = this.time_machine_list_wrap;

      //get the current limit and offset of the list
      const current_offset = parseInt(options.offset);
      const current_limit = parseInt(options.limit)
      const current_total = parseInt(options.total_records_count)

      //calculate the current page (offset + limit)/limit and the last page that paginator can show with the current configuration
      const current_page   = (current_offset + current_limit)/current_limit
      const final_page     = Math.floor(current_total/current_limit) + 1

      // create a paginator content
      const paginator  = common.create_dom_element({
                      element_type      : 'div',
                      class_name        : 'time_machine_list_paginator',
                      text_node         : get_label['total']+ ': ' + total_records_count
                      })
      //insert the paginator in the first position in the global container, the paginator need to be the first, at top of the list
      time_machine_list_wrap.insertBefore(paginator, time_machine_list_wrap.firstChild);


      // create a paginator previous button
      const paginator_buttons = common.create_dom_element({
                            element_type      : 'span',
                            class_name        : 'time_machine_list_paginator_buttons',
                            parent            : paginator,
                            data_set          : options
                            })
      

      // create a paginator current record
      const currrent_record   = common.create_dom_element({
                            element_type      : 'span',
                            class_name        : 'time_machine_list_paginator_current',
                            parent            : paginator_buttons,
                            text_node         : get_label['page']+ ': ' +current_page
                            })

      //check if current page is the first of the final page to change the css of the buttons (swich on or off)
      let css_previous_offset =''
      let css_netx_offset =''
      if(current_offset == 0){
         css_previous_offset = 'time_machine_list_paginator_offset_off';
        }

      if(current_page >= final_page){
        css_netx_offset = 'time_machine_list_paginator_offset_off';
      }

      // create the event to go to the previous record
      const event_previous  = [{'type':'click','name':'time_machine_list.previous_records'}];
      // create a paginator previous button
      const previous_button = common.create_dom_element({
                            element_type      : 'span',
                            class_name        : 'icon_bs time_machine_list_paginator_previous ' + css_previous_offset,
                            parent            : paginator_buttons,
                            custom_function_events  : event_previous,
                            })

      // create the event to go to the next record
      const event_next    = [{'type':'click','name':'time_machine_list.next_records'}];
      // create a paginator next button
      const next_button   = common.create_dom_element({
                            element_type      : 'span',
                            class_name        : 'icon_bs time_machine_list_paginator_next ' + css_netx_offset,
                            parent            : paginator_buttons,
                             custom_function_events  : event_next,
                            })



    }//end parse_paginator_html


    /**
    * PREVIOUS_RECORDS
    * build the previous button in the paginator
    */
    this.previous_records = function(object){

      let self = this
      //get the paginator and get the offset, limit and total of records found
      let object_paginator = object.parentNode;
      const current_offset = parseInt(object_paginator.dataset.offset) ;
      const current_limit  = parseInt(object_paginator.dataset.limit);
      const current_total = parseInt(object_paginator.dataset.total_records_count);

      // if the paginator is NOT in the first page the button can navegate to the previous page
      if( current_offset >= 1){
          object_paginator.dataset.offset = current_offset - current_limit
          time_machine_list.get_server_records(object_paginator)
      }      
    }//end previous_records


    /**
    * NEXT_RECORDS
    * build the next button in the paginator
    */
    this.next_records = function(object){
   
      let self = this
      //get the paginator and get the offset, limit and total of records found
      let object_paginator = object.parentNode;
      const current_offset = parseInt(object_paginator.dataset.offset);
      const current_limit  = parseInt(object_paginator.dataset.limit)
      const current_total  = parseInt(object_paginator.dataset.total_records_count)

      // calculate the current and the final page
      const current_page   = (current_offset + current_limit)/current_limit
      const final_page     = Math.floor(current_total/current_limit) + 1

       // if the paginator is NOT in the last page the button can navegate to the next page
      if(current_page < final_page){
          object_paginator.dataset.offset = current_offset + current_limit
          time_machine_list.get_server_records(object_paginator)
      }
    }//end next_records


    /**
    * LOAD_time_machine_LIST_DATA
    * @return 
    */
    this.load_time_machine_list_data = function(options) {
      
      let self = this

      const time_machine_list_wrap = this.time_machine_list_wrap

      //build the server variable to send to the trigger
      const trigger_url  = this.trigger_url
      const trigger_vars = {
        mode            : "get_time_machine_list_json",
        modo            : options.modo,
        tipo            : options.tipo,
        section_tipo    : options.section_tipo,
        section_id      : options.section_id,
        value_resolved  : true,
        limit           : options.limit,
        offset          : options.offset,
        count           : options.count,
      }

      // create the promise witht the server request
      let js_promise = common.get_json_data(trigger_url, trigger_vars).then(function(response) {
          if(SHOW_DEBUG===true) {
            console.log("[time_machine_list.load_time_machine_list_data] response",response);
          }
            
          if (response===null) {
            alert("Error on load_time_machine_list_data "+options.section_tipo+" record (null response). See server log for more details")
          }else{
            
            if(response.result === false){

              self.show_empty_result()

            }else{
             // return the JSON data
             return response.result
            }
            
          }

          html_page.loading_content( time_machine_list_wrap, 0 );
        })

      return js_promise
    };//end load_time_machine_list_data



    /**
    * CLEAN_THE_LIST
    * remove the all previous inforamtion inside the global container
    */
    this.clean_the_list = function(){
      const time_machine_list_wrap = this.time_machine_list_wrap
      if (time_machine_list_wrap){
        time_machine_list_wrap.innerHTML=''
        time_machine_list_wrap.style.visibility = 'none'
      } 
    }//end clean_the_list


    /**
    * SHOW_EMPTY_RESULT
    *
    */
    this.show_empty_result = function(){

      console.log('empty')

    }//end show_empty_result



}//end time_machine_list