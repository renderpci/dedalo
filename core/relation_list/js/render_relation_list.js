/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// import
	// import {event_manager} from '../../common/js/event_manager.js'
	import {ui} from '../../common/js/ui.js'




/**
*  render_relation_list
*
*/
export const render_relation_list = function() {

	return true
};//end relation_list


/**
* EDIT
* Render node for use in edit
* @return DOM node
*/
render_relation_list.prototype.edit = async function(options={render_level:'full'}) {

	const self = this

	const render_level = options.render_level

	// content_data
	const current_content_data = await content_data(self)
	if (render_level==='content') {
		return current_content_data
	}

	// // buttons
	//  //const current_buttons = buttons(self);

	// // wrapper. ui build_edit returns component wrapper
	//  const wrapper = ui.area.build_wrapper_edit(self, {
	//    content_data : current_content_data,
	//    //buttons    : current_buttons
	//  })


	return wrapper
};//end edit




/**
* GET_CONTENT_DATA
* @return DOM node content_data
*/
const get_content_data = function(self) {

  const fragment = new DocumentFragment()


  // content_data
    const content_data = document.createElement("div")
        content_data.classList.add("content_data", self.type)
        content_data.appendChild(fragment)


  return content_data
};//end get_content_data



	/**
	* CREATE_NEW_CSS_SHEET
	* create new css file and add to the page
	* return the stylesheet that the components can change with you own needs.
	* use:
	*	// create the new stylesheet
	*	let new_CSS_sheet = common.create_new_CSS_sheet()
	*	// inset the rule into the stylesheet
	*	new_CSS_sheet.insertRule(".relation_grid{display: grid;grid-template-columns: repeat(4, 1fr);}");
	*/
	this.create_new_CSS_style_sheet = function() {
		// Create the <style> tag
		let style = document.createElement("style");

		// Add a media (and/or media query)
		// style.setAttribute("media", "screen")
		// style.setAttribute("media", "only screen and (max-width : 1024px)")

		// Add the <style> element to the page
		document.head.appendChild(style);

		return style.sheet;
	};//end create_new_CSS_sheet





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

        });
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

      // create the promise with the server request
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




