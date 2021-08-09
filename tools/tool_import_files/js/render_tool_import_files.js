/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {event_manager} from '../../../core/common/js/event_manager.js'
	import {ui} from '../../../core/common/js/ui.js'
	import {clone, dd_console} from '../../../core/common/js/utils/index.js'



/**
* RENDER_tool_import_files
* Manages the component's logic and apperance in client side
*/
export const render_tool_import_files = function() {
	
	return true
};//end render_tool_import_files



/**
* RENDER_tool_import_files
* Render node for use like button
* @return DOM node
*/
render_tool_import_files.prototype.edit = async function(options={render_level:'full'}) {

	const self = this

	// render level
		const render_level = options.render_level || 'full'

	// content_data
		const content_data = await get_content_data_edit(self)
		if (render_level==='content') {
			return content_data
		}

	// wrapper. ui build_edit returns component wrapper
		const wrapper = await ui.tool.build_wrapper_edit(self, {
			content_data : content_data
		})

	// modal container
		const header = wrapper.querySelector('.tool_header')
		const modal  = ui.attach_to_modal(header, wrapper, null, 'big')
		modal.on_close = () => {
			self.destroy(true, true, true)
		}


	return wrapper
};//end render_tool_import_files



/**
* GET_CONTENT_DATA_EDIT
* @return DOM node content_data
*/
const get_content_data_edit = async function(self) {

	const fragment = new DocumentFragment()


	// components container
		const drop_zone = ui.create_dom_element({
			element_type	: 'div',
			class_name 		: 'drop_zone',
			parent 			: fragment
		})

	// template_container
		const template_container = ui.create_dom_element({
			element_type	: 'div',
			class_name 		: 'template_container',
			inner_html 		: `

				<div id="actions" class="row">


			      <div class="col-lg-7">
			        <!-- The fileinput-button span is used to style the file input field as button -->
			        <span class="btn btn-success fileinput-button dz-clickable">
			            <i class="glyphicon glyphicon-plus"></i>
			            <span>Add files...</span>
			        </span>
			        <button type="submit" class="btn btn-primary start">
			            <i class="glyphicon glyphicon-upload"></i>
			            <span>Start upload</span>
			        </button>
			        <button type="reset" class="btn btn-warning cancel">
			            <i class="glyphicon glyphicon-ban-circle"></i>
			            <span>Cancel upload</span>
			        </button>
			      </div>

			      <div class="col-lg-5">
			        <!-- The global file processing state -->
			        <span class="fileupload-process">
			          <div id="total-progress" class="progress progress-striped active" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0">
			            <div class="progress-bar progress-bar-success" style="width:0%;" data-dz-uploadprogress=""></div>
			          </div>
			        </span>
			      </div>

			    </div>

				<div class="table table-striped" class="files" id="previews">

				  <div id="template" class="file-row">
				    <div>
				        <span class="preview"><img data-dz-thumbnail /></span>
				    </div>
				    <div>
				        <p class="name" data-dz-name></p>
				        <strong class="error text-danger" data-dz-errormessage></strong>
				    </div>
				    <div>
				        <p class="size" data-dz-size></p>
				        <div class="progress progress-striped active" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0">
				          <div class="progress-bar progress-bar-success" style="width:0%;" data-dz-uploadprogress></div>
				        </div>
				    </div>
				    <div>
				      <button class="btn btn-primary start">
				          <i class="glyphicon glyphicon-upload"></i>
				          <span>Start</span>
				      </button>
				      <button data-dz-remove class="btn btn-warning cancel">
				          <i class="glyphicon glyphicon-ban-circle"></i>
				          <span>Cancel</span>
				      </button>
				      <button data-dz-remove class="btn btn-danger delete">
				        <i class="glyphicon glyphicon-trash"></i>
				        <span>Delete</span>
				      </button>
				    </div>
				  </div>

				</div>
		`,
			parent 			: fragment
		})


	// content_data
		const content_data = document.createElement("div")
			  content_data.classList.add("content_data", self.type)
		content_data.appendChild(fragment)


	return content_data
};//end get_content_data_edit



const create_template = function() {

	const fragment = new DocumentFragment();

	// actions
		const actions = ui.create_dom_element({
			element_type	: 'div',
			id				: 'actions',
			class_name		: 'row',
			parent			: fragment
		})

	// column_left
		const column_left = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'col-lg-7',
			parent			: actions
		})

	// button_add_files
		const button_add_files = ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'btn btn-success fileinput-button dz-clickable',
			parent			: column_left
		})
			ui.create_dom_element({
				element_type	: 'i',
				class_name		: 'glyphicon glyphicon-plus',
				parent			: button_add_files
			})
			ui.create_dom_element({
				element_type	: 'span',
				class_name		: '',
				inner_html		: get_label.add_file || 'Add files',
				parent			: button_add_files
			})

	// button_submit_files
		const button_submit_files = ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'btn btn-primary start',
			parent			: column_left
		})
			ui.create_dom_element({
				element_type	: 'i',
				class_name		: 'glyphicon glyphicon-ban-circle',
				parent			: button_submit_files
			})
			ui.create_dom_element({
				element_type	: 'span',
				class_name		: '',
				inner_html		: get_label.submit || 'Start upload',
				parent			: button_submit_files
			})

	// button_cancel_upload
		const button_cancel_upload = ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'btn btn-warning cancel',
			parent			: column_left
		})
			ui.create_dom_element({
				element_type	: 'i',
				class_name		: 'glyphicon glyphicon-ban-circle',
				parent			: button_cancel_upload
			})
			ui.create_dom_element({
				element_type	: 'span',
				class_name		: '',
				inner_html		: get_label.cancel_upload || 'Cancel upload',
				parent			: button_cancel_upload
			})

	// column_rigth
		const column_rigth = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'col-lg-5',
			parent			: actions
		})

	// The global file processing state
		const fileupload_process = ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'fileupload-process',
			parent			: column_rigth
		})
		// The global file processing state
			const global_progress_bar_active = ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'progress progress-striped active',
				parent			: fileupload_process
			})
		// The global file processing state
			const global_progress_bar_success = ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'progress-bar progress-bar-success',
				dataset 		: {"data-dz-uploadprogress" : ""},
				parent			: fileupload_process
			})

	// grid template used for rows
		const rows_grid = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'table table-striped',
			parent			: fragment
		})
		// template used for rows
			const template = ui.create_dom_element({
				id 				: 'template',
				element_type	: 'div',
				class_name		: 'file-row',
				parent			: rows_grid
			})

		// preview wrapp
			const preview_wrapp = ui.create_dom_element({
				element_type	: 'div',
				parent			: template
			})
			// preview
				const preview = ui.create_dom_element({
					element_type	: 'span',
					class_name		: 'preview',
					parent			: preview_wrapp
				})
			// image
				const preview_image = ui.create_dom_element({
					element_type	: 'img',
					dataset 		: {"data-dz-thumbnail" : null},
					parent			: preview_wrapp
				})

		// Details
			const details_wrapp = ui.create_dom_element({
				element_type	: 'div',
				parent			: template
			})
			// name
				const name = ui.create_dom_element({
					element_type	: 'span',
					class_name		: 'name',
					dataset 		: {"data-dz-name" : null},
					parent			: details_wrapp
				})
			// error
				const error = ui.create_dom_element({
					element_type	: 'span',
					class_name		: 'error text-danger',
					dataset 		: {"data-dz-errormessage" : null},
					parent			: details_wrapp
				})
			// size
				const size = ui.create_dom_element({
					element_type	: 'span',
					class_name		: 'size',
					dataset 		: {"data-dz-size" : null},
					parent			: details_wrapp
				})

		// row_progress_bar
			const row_progress_bar = ui.create_dom_element({
				element_type	: 'div',
				parent			: template
			})
			// row_progress_bar
				const row_progress_bar_active = ui.create_dom_element({
					element_type	: 'div',
					class_name		: 'progress progress-striped active',
					parent			: row_progress_bar
				})
			// row_progress_bar
				const row_progress_bar_success = ui.create_dom_element({
					element_type	: 'div',
					class_name		: 'progress-bar progress-bar-success',
					dataset 		: {"data-dz-uploadprogress" : null},
					parent			: row_progress_bar
				})

		// row_buttons
			const row_buttons = ui.create_dom_element({
				element_type	: 'div',
				parent			: template
			})

			// row_button_add_files
				const row_button_add_files = ui.create_dom_element({
					element_type	: 'span',
					class_name		: 'btn btn-success fileinput-button dz-clickable',
					parent			: row_buttons
				})
					ui.create_dom_element({
						element_type	: 'i',
						class_name		: 'glyphicon glyphicon-plus',
						parent			: row_button_add_files
					})
					ui.create_dom_element({
						element_type	: 'span',
						class_name		: '',
						inner_html		: get_label.add_file || 'Add files',
						parent			: row_button_add_files
					})

			// row_button_submit_files
				const row_button_submit_files = ui.create_dom_element({
					element_type	: 'span',
					class_name		: 'btn btn-primary start',
					parent			: row_buttons
				})
					ui.create_dom_element({
						element_type	: 'i',
						class_name		: 'glyphicon glyphicon-ban-circle',
						parent			: row_button_submit_files
					})
					ui.create_dom_element({
						element_type	: 'span',
						class_name		: '',
						inner_html		: get_label.submit || 'Start upload',
						parent			: row_button_submit_files
					})

			// row_button_cancel_upload
				const row_button_cancel_upload = ui.create_dom_element({
					element_type	: 'span',
					class_name		: 'btn btn-warning cancel',
					parent			: row_buttons
				})
					ui.create_dom_element({
						element_type	: 'i',
						class_name		: 'glyphicon glyphicon-ban-circle',
						parent			: row_button_cancel_upload
					})
					ui.create_dom_element({
						element_type	: 'span',
						class_name		: '',
						inner_html		: get_label.cancel_upload || 'Cancel upload',
						parent			: row_button_cancel_upload
					})


}//end create_template




