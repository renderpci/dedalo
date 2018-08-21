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
      "section_label": "Patrimonio Cultural Inmaterial"
      "component_tipo": "id",
      "component_label": "id"
    },
    {
      "section_tipo": "pci1",
      "section_label": "Patrimonio Cultural Inmaterial"
      "component_tipo": "pci32",
      "component_label": "Denominación"
    }
  ],
  "data": [
    {
      "id": {
        "section_tipo": "oh1",
        "section_id": 1
      },
      "oh14": {
        "from_component_tipo": "oh14",
        "value": "eog34"
      },
      "oh22": {
        "from_component_tipo": "oh22",
        "value": "Interview to cc"
      }
    },
    {
      "id": {
        "section_tipo": "oh1",
        "section_id": 2
      },
      "oh14": {
        "from_component_tipo": "oh14",
        "value": "eog38"
      },
      "oh22": {
        "from_component_tipo": "oh22",
        "value": "Interview to jj"
      }
    },
    {
      "id": {
        "section_tipo": "pci1",
        "section_id": 32
      },
      "pci32": {
        "from_component_tipo": "pci32",
        "value": "h-kold38"
      }
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
    this.init = function(options) {
      
      let self = this

      if(options.modo === 'button'){
        document.addEventListener("DOMContentLoaded", function(event) {
          self.build_button(options)
       });
      }

    }


    /**
    * LOAD_relation_list
    * @return 
    */
    this.load_relation_list = function(select_obj) {
      
      let self = this   

      const select_ts_section = document.getElementById('select_ts_section')
      const select_ts_lang    = document.getElementById('select_ts_lang')
      const select_ts_format  = document.getElementById('select_ts_format')

      const section_tipo  = select_ts_section.value 
      const lang      = select_ts_lang.value
      const format    = select_ts_format.value
      

      const trigger_url  = this.trigger_url
      const trigger_vars = {
        mode     : "load_relation_list",
        section_tipo : section_tipo
      }

      const wrap_obj = document.getElementById('ts_container')
          //wrap_obj.appendChild = "<div class=\"loading_content blink_me\"></div>"

      const print = document.getElementsByClassName("ts_print");
      if (typeof print[0] !== 'undefined') {
        wrap_obj.removeChild(print[0])
      }

      const loading_content   = common.create_dom_element({
                        element_type      : 'div',
                        parent            : wrap_obj,
                        class_name        : 'loading_content blink_me',
                        inner_html        : 'Building full thesaurus..'
                        })
      wrap_obj.appendChild(loading_content);

      html_page.loading_content( wrap_obj, 1 );

      let js_promise = common.get_json_data(trigger_url, trigger_vars).then(function(response) {
          if(SHOW_DEBUG===true) {
            console.log("[relation_list.load_relation_list] response",response);
          }


            
          if (response===null) {
            alert("Error on load_relation_list "+section_tipo+" record (null response). See server log for more details")
          }else{
            
            // Fix ts_data
            self.ts_data = response.result

            // Fix lang
            self.lang    = lang

            //fix format
            self.format = format

            // Render html
            self.parse_html()
          }

          html_page.loading_content( wrap_obj, 0 );     
        })

      return js_promise
    };//end load_relation_list


    /**
    * BUILD_BUTTON
    *
    */
    this.build_button = function(options){

      const relation_list_wrap = document.getElementById('inspector_relation_list_sections');
      console.log(relation_list_wrap)

      let button  = common.create_dom_element({
                      element_type      : 'span',
                      parent            : relation_list_wrap,
                      class_name        : 'css_button_generic relation_button',
                      text_node         : 'ok'
                      })

      console.log(button)
      console.log(relation_list_wrap)



    }//end build_button



}//end relation_list