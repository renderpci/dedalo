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

    this.trigger_url = DEDALO_LIB_BASE_URL + '/relation_list/trigger.relation_list.php'


    /**
    * INIT
    * @return 
    */
    this.init = function(relation_wrap) {
      
      let self = this

      const options = {
        relation_list_name  : relation_wrap.dataset.relation_list_name,
        modo                : relation_wrap.dataset.modo,
        tipo                : relation_wrap.dataset.tipo,
        section_tipo        : relation_wrap.dataset.section_tipo,
        section_id          : relation_wrap.dataset.section_id,
      }
    
      //self.build_button(options)
      self.load_relation_list(options)

    }


    /**
    * LOAD_relation_list
    * @return 
    */
    this.load_relation_list = function(options) {
      
      let self = this

      const relation_list_wrap = document.getElementById('inspector_relation_list_sections');
      if (relation_list_wrap) relation_list_wrap.innerHTML=''

      const trigger_url  = this.trigger_url
      const trigger_vars = {
        mode            : "get_relation_list_json",
        modo            : options.modo,
        tipo            : options.tipo,
        section_tipo    : options.section_tipo,
        section_id      : options.section_id,
        value_resolved  : true
      }

      const loading_content   = common.create_dom_element({
                        element_type      : 'div',
                        parent            : relation_list_wrap,
                        class_name        : 'loading_content blink_me',
                        inner_html        : 'Building the relation list..'
                        })
      relation_list_wrap.appendChild(loading_content);
      html_page.loading_content( relation_list_wrap, 1 );


      let js_promise = common.get_json_data(trigger_url, trigger_vars).then(function(response) {
          if(SHOW_DEBUG===true) {
            console.log("[relation_list.load_relation_list] response",response);
          }
            
          if (response===null) {
            alert("Error on load_relation_list "+options.section_tipo+" record (null response). See server log for more details")
          }else{
            //Empty load mensaje
            relation_list_wrap.innerHTML=''
            // Render html
            self.parse_html(response.result)
          }

          html_page.loading_content( relation_list_wrap, 0 );     
        })

      return js_promise
    };//end load_relation_list



    /**
    * PARSE_HTML
    *
    */
    this.parse_html = function(main_object){

      let self = this
      
      const main_header = self.get_main_header(main_object)

    }//end parse_html


    /**
    * GET_MAIN_HEADER
    *
    */
    this.get_main_header = function(main_object){

      let self = this

      const context     = main_object.context;
      const data        = main_object.data;
      const context_id  = context.filter(main_header => main_header.component_tipo === 'id');
      // create new styleSheet
      let CSS_style_sheet = common.create_new_CSS_style_sheet();

      context_id.forEach(function(current_context){
        const current_context_colums  = context.filter(current_context_colums => current_context_colums.section_tipo === current_context.section_tipo);
        const current_data            = data.filter(current_data_header => current_data_header.section_tipo === current_context.section_tipo);
        const count_data              = current_data.filter(current_data_count => current_data_count.component_tipo === 'id');

        
        self.build_grid_html(current_context, current_context_colums, current_data, count_data, CSS_style_sheet)
      })

      //return result

    }//end get_main_header


    /**
    * GROUP_SECTIONS
    *
    */
    this.group_sections = function(){

    }//end group_sections


    /**
    * EDIT_RELATION
    *
    */
    this.edit_relation = function(object){

      const section_id = object.dataset.section_id
      const section_tipo = object.dataset.section_tipo

      if (typeof section_id=="undefined") {
       return console.error("[relation_list.edit] Error on find section_id", object);
      }

      if (typeof section_tipo=="undefined") {
        return console.error("[relation_list.edit] Error on find section_tipo", object);
      }   
      
      let url         = DEDALO_LIB_BASE_URL + '/main/?t='+section_tipo+'&id='+section_id+'&menu=no'

      let strWindowFeatures   = "menubar=no,location=yes,resizable=yes,scrollbars=yes,status=yes";

      window.open(
          url,
          "edit_window",
          strWindowFeatures
        );

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
    }//end edit_relation


    /**
    * BUILD_BUTTON
    *
    */
    this.build_grid_html = function(context, columns, data, count_data, CSS_style_sheet){

      const css_selector = 'relation_grid_'+context.section_tipo
      const columns_length = columns.length

      CSS_style_sheet.insertRule( '.'+css_selector+'{display: grid;grid-template-columns: repeat('+columns_length+', 1fr);}');

      const relation_list_wrap = document.getElementById('inspector_relation_list_sections');
      //relation_list_wrap.innerHTML ='';

      // create a grid content
      const grid  = common.create_dom_element({
                      element_type      : 'div',
                      parent            : relation_list_wrap,
                      class_name        : 'relation_list_grid',
                      })

      //create a section_header, main info header
      const header  = common.create_dom_element({
                      element_type      : 'div',
                      parent            : grid,
                      class_name        : 'relation_list_header',
                      text_node         : context.section_label
                      })

      const header_count  = common.create_dom_element({
                      element_type      : 'span',
                      parent            : header,
                      class_name        : 'relation_list_header relation_list_count',
                      text_node         : count_data.length
                      })

      //create a labels colums info header
      const data_header  = common.create_dom_element({
                element_type      : 'ul',
                parent            : grid,
                class_name        : css_selector + ' relation_list_data_header'
                })

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

      let curent_section_id = 0;
      let data_row_header = ''
      data.forEach(function(current_data){
        
        if(curent_section_id !== current_data.section_id){
          curent_section_id = current_data.section_id;
            //first row, id row
          const event_function    = [{'type':'click','name':'relation_list.edit_relation'}];
              data_row_header  = common.create_dom_element({
                  element_type            : 'ul',
                  parent                  : grid,
                  class_name              : css_selector + ' relation_list_data_row',
                  custom_function_events  : event_function,
                  data_set                : current_data
                  })
        
          const data_row  = common.create_dom_element({
                  element_type      : 'li',
                  parent            : data_row_header,
                  class_name        : 'relation_list_data_row_center',
                  text_node         : current_data.section_id
                  })
           
        }else{
          const data_row  = common.create_dom_element({
                  element_type      : 'li',
                  parent            : data_row_header,
                  //class_name        : 'relation_list_data_hearder',
                  text_node         : current_data.value
                  })
        }
      })

    }//end build_button



}//end relation_list