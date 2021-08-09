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

      const lib_css_file_bootstrap = DEDALO_ROOT_WEB + '/tools/tool_import_files/css/bootstrap.min.css'
        load_promises.push( common.prototype.load_style(lib_css_file_bootstrap) )

      await Promise.all(load_promises).then(async function(response){
        console.log("dropzone load promise:",response);
      })

   console.log("key_dir:",key_dir);

    // Get the template HTML and remove it from the doumenthe template HTML and remove it from the document
    var previewNode = document.querySelector("#template");
    previewNode.id = "";
    var previewTemplate = previewNode.parentNode.innerHTML;
    previewNode.parentNode.removeChild(previewNode);

    var myDropzone = new Dropzone(document.body, { // Make the whole body a dropzone
      url               : DEDALO_ROOT_WEB + "/tools/tool_import_files/handle_files.php", // Set the url
      // thumbnailWidth    : 192,
      thumbnailHeight   : 96,
      parallelUploads   : 20,
      previewTemplate   : previewTemplate,
      autoQueue         : false, // Make sure the files aren't queued until manually added
      previewsContainer : "#previews", // Define the container to display the previews
      clickable         : ".fileinput-button", // Define the element that should be used as click trigger to select files.
      params            : {key_dir : key_dir}
    });

    myDropzone.on("addedfile", function(file) {
      // Hookup the start button
      file.previewElement.querySelector(".start").onclick = function() { myDropzone.enqueueFile(file); };
    });

    // Update the total progress bar
    myDropzone.on("totaluploadprogress", function(progress) {
      document.querySelector("#total-progress .progress-bar").style.width = progress + "%";
    });

    myDropzone.on("sending", function(file) {
      // Show the total progress bar when upload starts
      document.querySelector("#total-progress").style.opacity = "1";
      // And disable the start button
      file.previewElement.querySelector(".start").setAttribute("disabled", "disabled");
    });

    // Hide the total progress bar when nothing's uploading anymore
    myDropzone.on("queuecomplete", function(progress) {
      document.querySelector("#total-progress").style.opacity = "0";
    });

    // Setup the buttons for all transfers
    // The "add files" button doesn't need to be setup because the config
    // `clickable` has already been specified.
    document.querySelector("#actions .start").onclick = function() {
      myDropzone.enqueueFiles(myDropzone.getFilesWithStatus(Dropzone.ADDED));
    };
    document.querySelector("#actions .cancel").onclick = function() {
      myDropzone.removeAllFiles(true);
    };

    myDropzone.on("success", function(file, response) {

      //showing an image created by the server after upload
      this.emit('thumbnail', file, response.thumbnail_file);
      // Handle the responseText here. For example, add the text to the preview element:
      file.previewTemplate.appendChild(document.createTextNode(response.msg));
    });

    // get the images in the server (uploaded previously), and display into the dropzone
      const current_data_manager = new data_manager()

      const files = await current_data_manager.request({
        url: DEDALO_ROOT_WEB + "/tools/tool_import_files/list_files.php",
        body:{key_dir: key_dir}
      })

      // Access to the original image sizes on your server,
      // to resize them in the browser:
      const files_length = files.length

      const callback = null; // Optional callback when it's done
      const crossOrigin = null; // Added to the `img` tag for crossOrigin handling
      const resizeThumbnail = false; // Tells Dropzone whether it should resize the image first


      for (var i = 0; i < files_length; i++) {
        const current_file = files[i]
        myDropzone.displayExistingFile(current_file, current_file.url, callback, crossOrigin, resizeThumbnail);
      }


}//end init