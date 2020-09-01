/*

# FORMAT OF THE JSON GET FROM SERVER
# the @context is the header of the list, with the columns resolution
# the data is the rows of the list
# it can mix some different columns (number, types, name of columns) procedent of different sections

{
  "@context": [
    {
      "section_tipo": "oh1",
      "section_label": "Historia Oral",
      "component_tipo": "id",
      "component_label": "id"
    },
    {
      "section_tipo": "oh1",
      "section_label": "Historia Oral",
      "component_tipo": "oh14",
      "component_label": "codigo"
    },
    {
      "section_tipo": "oh1",
      "section_label": "Historia Oral",
      "component_tipo": "oh22",
      "component_label": "titulo"
    },
    {
      "section_tipo": "pci1",
      "section_label": "Patrimonio Cultural Inmaterial",
      "component_tipo": "id",
      "component_label": "id"
    },
    {
      "section_tipo": "pci1",
      "section_label": "Patrimonio Cultural Inmaterial",
      "component_tipo": "pci32",
      "component_label": "Denominación"
    }
  ],
  "data": [
    {
      "section_tipo": "oh1",
      "section_id": 1
    },
    {
      "from_component_tipo": "oh14",
      "value": "eog34"
    },
    {
      "from_component_tipo": "oh22",
      "value": "Interview to cc"
    },
    {
      "section_tipo": "oh1",
      "section_id": 2
    },
    {
      "from_component_tipo": "oh14",
      "value": "eog38"
    },
    {
      "from_component_tipo": "oh22",
      "value": "Interview to jj"
    },
    {
      "section_tipo": "pci1",
      "section_id": 32
    },
    {
      "from_component_tipo": "pci32",
      "value": "h-kold38"
    }
  ]
}
*/

/**
* RELATION_LIST
*
*
*
*/
var relation_list = new function() {

    this.trigger_url = DEDALO_CORE_URL + '/relation_list/trigger.relation_list.php'
    this.relation_list_wrap = ''


    /**
    * INIT
    *
    */
    this.init = function(relation_wrap) {
        
      let self = this

      /* get the current button state
       * if the button has the class "relation_list_button"     = off   and can process the the request to the server
       * if the button has the class "relation_list_button_off" = on    and can't do anything
      */
      const ar_button_class_list = relation_wrap.classList

      const parent_container   = relation_wrap.parentNode.parentNode
      this.relation_list_wrap = parent_container.querySelector('#wrap_relation_list_sections');

      if(ar_button_class_list.contains('relation_list_button')){
        ar_button_class_list.remove('relation_list_button')
        ar_button_class_list.add('relation_list_button_off')
        self.get_server_records(relation_wrap)
      }else{
        ar_button_class_list.remove('relation_list_button_off')
        ar_button_class_list.add('relation_list_button')
        self.clean_the_list()
      }

    };//end init


    /**
    * GET_SERVER_RECORDS
    * create the object to find inside the server
    * and send the promises to the load_relation_list_data
    * this send in async mode the two request, 1 data, 2 count
    */
    this.get_server_records = function(relation_wrap){

      let self = this

      //cretate the object to request the information
       const options = {
        modo                : relation_wrap.dataset.modo,
        tipo                : relation_wrap.dataset.tipo,
        section_tipo        : relation_wrap.dataset.section_tipo,
        section_id          : relation_wrap.dataset.section_id,
        limit               : parseInt(relation_wrap.dataset.limit),
        offset              : parseInt(relation_wrap.dataset.offset),
        count               : false,
      }

      // clean the global cotainer and remove all previuos styles
      const relation_list_wrap = this.relation_list_wrap;
      if (relation_list_wrap){
        relation_list_wrap.innerHTML=''
        relation_list_wrap.removeAttribute("style")
      }

      const loading_content   = common.create_dom_element({
                        element_type      : 'div',
                        parent            : relation_list_wrap,
                        class_name        : 'loading_content blink relation_list_waiting',
                        inner_html        : get_label['processing_wait']
                        })
      relation_list_wrap.appendChild(loading_content);

      // 1 send the request of the data
      options.count = false;
      self.load_relation_list_data(options).then(function(response){
        // remove loading_content
        loading_content.remove()

        // Render the data html
        self.parse_html(response)
      });

      // sent the request for count the rows
      options.count = true;
      self.load_relation_list_data(options).then(function(response){
        const total_records_count = response.reduce(
              (accumulator, currentValue) => accumulator + parseInt( currentValue.count), 0
          );
          // Render the paginator
          self.parse_paginator_html(options, total_records_count);
      });

    };//end get_server_records



    /**
    * PARSE_HTML
    * process the JSON recived
    */
    this.parse_html = function(main_object){

      let self = this

      // get the context and the data information of the JSON recived
      const context     = main_object.context;
      const data        = main_object.data;
      const context_id  = context.filter(main_header => main_header.component_tipo === 'id');
      // create new styleSheet
      let CSS_style_sheet = common.create_new_CSS_style_sheet();

      // loop of the different section_tipo inside the context to build the specific list for every section_tipo
      context_id.forEach(function(current_context){
        const current_context_colums  = context.filter(current_context_colums => current_context_colums.section_tipo === current_context.section_tipo);
        const current_data            = data.filter(current_data_header => current_data_header.section_tipo === current_context.section_tipo);
        const count_data              = current_data.filter(current_data_count => current_data_count.component_tipo === 'id');

        // render the list html for current section_tipo
        self.build_grid_html(current_context, current_context_colums, current_data, count_data, CSS_style_sheet)
      })

    };//end parse_html



    /**
    * BUILD_GRID_HTML
    * build the relation list html with the section selected
    */
    this.build_grid_html = function(context, columns, data, count_data, CSS_style_sheet){

      // create the css selector for the variable gid style
      const css_selector = 'relation_grid_'+context.section_tipo
      const columns_length = columns.length -1

      // create the CSS_style_sheet with the variable grid colums, every section can has different number of columns
      CSS_style_sheet.insertRule( '.'+css_selector+'{display: grid;grid-template-columns: 60px repeat('+columns_length+', 1fr);}');

      //get the parent node of the list
      const relation_list_wrap  = this.relation_list_wrap;
      //relation_list_wrap.innerHTML ='';

      /* 1 Create the grid container */
      // create a grid content
      const grid  = common.create_dom_element({
                      element_type      : 'div',
                      parent            : relation_list_wrap,
                      class_name        : 'relation_list_grid',
                      })


      /* 2 Create the header */
      //create a section_header, main info header, section name and counter
      const header  = common.create_dom_element({
                      element_type      : 'div',
                      parent            : grid,
                      class_name        : 'relation_list_header',
                      text_node         : context.section_label
                      })

      //create the counter
      const header_count  = common.create_dom_element({
                      element_type      : 'span',
                      parent            : header,
                      class_name        : 'relation_list_header relation_list_count',
                      text_node         : count_data.length
                      })

      //create the columns labels container
      const data_header  = common.create_dom_element({
                element_type      : 'ul',
                parent            : grid,
                class_name        : css_selector + ' relation_list_data_header'
                })

       //create a labels colums info header, the name of the componets of the related sections
      columns.forEach(function(column){
        let class_name =''
        if(column.component_label === 'id'){
           class_name = 'relation_list_data_row_center'
        }

        const data_header_label  = common.create_dom_element({
                element_type      : 'li',
                parent            : data_header,
                class_name        : class_name,
                text_node         : column.component_label
                })
      })

     /* 3 Create the rows with the data */
      let curent_section_id = 0;
      let data_row_header = ''
      data.forEach(function(current_data){

        //check if the columns id the first column for create the ul node and the first id column
        if(curent_section_id !== current_data.section_id){
          curent_section_id = current_data.section_id;

            //first row, id row, the ul is the container for all row
          const event_function    = [{'type':'click','name':'relation_list.edit_relation'}];
              data_row_header  = common.create_dom_element({
                  element_type            : 'ul',
                  parent                  : grid,
                  class_name              : css_selector + ' relation_list_data_row',
                  custom_function_events  : event_function,
                  data_set                : current_data
                  })

          //the id information
          const data_row  = common.create_dom_element({
                  element_type      : 'li',
                  parent            : data_row_header,
                  class_name        : 'relation_list_data_row_center',
                  text_node         : current_data.section_id
                  })

        }else{
          // the information colums of the components of the section
          const data_row  = common.create_dom_element({
                  element_type      : 'li',
                  parent            : data_row_header,
                  //class_name        : 'relation_list_data_hearder',
                  text_node         : current_data.value
                  })
        }
      })

    };//end build_grid_html


    /**
    * PARSE_PAGINATOR_HTML
    * build the paginator html
    */
    this.parse_paginator_html = function(options, total_records_count){

      let self = this

      //set the total_records_count into the options object
      options['total_records_count'] = total_records_count

      //get the global container
      const relation_list_wrap = this.relation_list_wrap;

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
                      class_name        : 'relation_list_paginator',
                      text_node         : get_label['total']+ ': ' + total_records_count
                      })
      //insert the paginator in the first position in the global container, the paginator need to be the first, at top of the list
      relation_list_wrap.insertBefore(paginator, relation_list_wrap.firstChild);


      // create a paginator previous button
      const paginator_buttons = common.create_dom_element({
                            element_type      : 'span',
                            class_name        : 'relation_list_paginator_buttons',
                            parent            : paginator,
                            data_set          : options
                            })


      // create a paginator current record
      const currrent_record   = common.create_dom_element({
                            element_type      : 'span',
                            class_name        : 'relation_list_paginator_current',
                            parent            : paginator_buttons,
                            text_node         : get_label['page']+ ': ' +current_page
                            })

      //check if current page is the first of the final page to change the css of the buttons (swich on or off)
      let css_previous_offset =''
      let css_netx_offset =''
      if(current_offset == 0){
         css_previous_offset = 'relation_list_paginator_offset_off';
        }

      if(current_page >= final_page){
        css_netx_offset = 'relation_list_paginator_offset_off';
      }

      // create the event to go to the previous record
      const event_previous  = [{'type':'click','name':'relation_list.previous_records'}];
      // create a paginator previous button
      const previous_button = common.create_dom_element({
                            element_type      : 'span',
                            class_name        : 'icon_bs relation_list_paginator_previous ' + css_previous_offset,
                            parent            : paginator_buttons,
                            custom_function_events  : event_previous,
                            })

      // create the event to go to the next record
      const event_next    = [{'type':'click','name':'relation_list.next_records'}];
      // create a paginator next button
      const next_button   = common.create_dom_element({
                            element_type      : 'span',
                            class_name        : 'icon_bs relation_list_paginator_next ' + css_netx_offset,
                            parent            : paginator_buttons,
                            custom_function_events  : event_next,
                            })



    };//end parse_paginator_html


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
          relation_list.get_server_records(object_paginator)
      }
    };//end previous_records


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
          relation_list.get_server_records(object_paginator)
        }
    };//end next_records



    /**
    * EDIT_RELATION
    * Open the relation section selected by the user in the list
    */
    this.edit_relation = function(object){

      //get the locator of the related secion
      const section_id = object.dataset.section_id
      const section_tipo = object.dataset.section_tipo

      if (typeof section_id=="undefined") {
       return console.error("[relation_list.edit] Error on find section_id", object);
      }

      if (typeof section_tipo=="undefined") {
        return console.error("[relation_list.edit] Error on find section_tipo", object);
      }

      // build the url of the related section
      let url         = DEDALO_CORE_URL + '/main/?t='+section_tipo+'&id='+section_id+'&menu=no'

      // set the window options
      let strWindowFeatures   = "menubar=no,location=yes,resizable=yes,scrollbars=yes,status=yes";

      // window open the related section
      window.open(
          url,
          "edit_relation_window",
          strWindowFeatures
        );

      // FUTURE IMPLEMENTATION, WHEN THE USER CLOSE THE WINDOW THE RELATION_LIST WILL BE UPDATED.
     /* if(ts_object.edit_window === null || ts_object.edit_window.closed) { //  || edit_window.location.href!=url || ts_object.edit_window.closed

        ts_object.edit_window = window.open(
          url,
          "edit_window",
          strWindowFeatures
        );
        ts_object.edit_window.addEventListener("beforeunload", function(e){
          // Refresh element after close edit window
          //console.log("Edit window is closed for record "+section_id +". Calling refresh_element section_tipo:"+section_tipo+" section_id:"+section_id);
          ts_object.refresh_element(section_tipo, section_id)

        }, false);
      }
      */
    };//end edit_relation



    /**
    * LOAD_RELATION_LIST_DATA
    * @return
    */
    this.load_relation_list_data = function(options) {

      let self = this

      //build the server variable to send to the trigger
      const trigger_url  = this.trigger_url
      const trigger_vars = {
        mode            : "get_relation_list_json",
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
            console.log("[relation_list.load_relation_list_data] response",response);
          }

          if (response===null) {
            alert("Error on load_relation_list_data "+options.section_tipo+" record (null response). See server log for more details")
          }else{

            if(response.result === false){

              self.show_empty_result()

            }else{
             // return the JSON data
             return response.result
            }

          }

          html_page.loading_content( relation_list_wrap, 0 );
        })

      return js_promise
    };//end load_relation_list_data



    /**
    * CLEAN_THE_LIST
    * remove the all previous inforamtion inside the global container
    */
    this.clean_the_list = function(){

      const relation_list_wrap = this.relation_list_wrap
      if (relation_list_wrap){
        relation_list_wrap.innerHTML=''
        relation_list_wrap.style.visibility = 'none'
      }
    };//end clean_the_list


    /**
    * SHOW_EMPTY_RESULT
    *
    */
    this.show_empty_result = function(){

      console.log('empty')

    };//end show_empty_result



};//end relation_list
