/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/

import {common} from '../../../core/common/js/common.js'
import {data_manager} from '../../../core/common/js/data_manager.js'




// init dropzone
export const upload_manager_init = async function(options){

    const key_dir = options.key_dir

    // load dependence js/css
      const load_promises = []

      const lib_js_file = DEDALO_ROOT_WEB + '/lib/dropzone/dropzone.min.js'
        load_promises.push( common.prototype.load_script(lib_js_file) )

      const lib_css_file = DEDALO_ROOT_WEB + '/lib/dropzone/dropzone.min.css'
        load_promises.push( common.prototype.load_style(lib_css_file) )

      // const lib_css_file_bootstrap = DEDALO_ROOT_WEB + '/tools/tool_import_files/css/bootstrap.min.css'
      //   load_promises.push( common.prototype.load_style(lib_css_file_bootstrap) )

      await Promise.all(load_promises).then(async function(response){
        console.log("dropzone load promise:",response);
      })

}//end init