// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, DEDALO_CORE_URL, Dropzone */
/*eslint no-undef: "error"*/



// imports
	import {event_manager} from '../../../common/js/event_manager.js'
	import {ui} from '../../../common/js/ui.js'
	import {data_manager} from '../../../common/js/data_manager.js'
	import {create_source} from '../../../common/js/common.js'




/**
* RENDER_EDIT_SERVICE_dropzone
* Manages the service's logic and appearance in client side
*/
export const render_edit_service_dropzone = function() {

	return true
}//end render_edit_service_dropzone



/**
* EDIT
* Render node for use like button
* @param object options
* @return HTMLElement wrapper
*/
render_edit_service_dropzone.prototype.edit = async function (options) {

	const self = this

	// options
		const render_level = options.render_level || 'full'

	// content_data
		const content_data = await get_content_data(self)
		if (render_level==='content') {
			return content_data
		}

	// wrapper
		const wrapper = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'service_dropzone'
		})
		wrapper.appendChild(content_data)
		// set pointers
		wrapper.content_data = content_data


	return wrapper
}//end edit



/**
* GET_CONTENT_DATA
* @param object self
* @return HTMLElement content_data
*/
export const get_content_data = async function(self) {

	// content_data
		const content_data = document.createElement('div')
			  content_data.classList.add('content_data')

	// info: About caller, allowed extensions, max file size, upload directory, etc.
		// button_info
			const button_info = ui.create_dom_element({
				element_type	: 'span',
				class_name		: 'button info',
				parent			: content_data
			})
			button_info.addEventListener('click', function(e){
				e.stopPropagation()
				info_node.classList.toggle('hide')
			})
		// info container
			const info_node = render_info_container(self)
			info_node.classList.add('hide')
			content_data.appendChild(info_node)

	// template_node
		const template_node = await render_template(self)
		content_data.appendChild(template_node)


	return content_data
}//end get_content_data



/**
* RENDER_INFO_CONTAINER
* @param object self
* @return HTMLElement info_container
*/
export const render_info_container = function(self) {

	// info_container
		const info_container = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'info_container '
		})

	// caller component
		ui.create_dom_element({
			element_type	: 'label',
			inner_html		: 'Caller',
			parent			: info_container
		})
		ui.create_dom_element({
			element_type	: 'div',
			inner_html		: self.caller.model,
			parent			: info_container
		})

	// target quality
		const target_quality = self.caller.context.features
			? self.caller.context.features.target_quality || self.caller.context.features.default_target_quality
			: null
		if (target_quality) {
			ui.create_dom_element({
				element_type	: 'label',
				inner_html		: 'Target quality',
				parent			: info_container
			})
			ui.create_dom_element({
				element_type	: 'div',
				inner_html		: target_quality,
				parent			: info_container
			})
		}

	// allowed extensions
		ui.create_dom_element({
			element_type	: 'label',
			inner_html		: 'Allowed extensions',
			parent			: info_container
		})
		ui.create_dom_element({
			element_type	: 'div',
			inner_html		: self.allowed_extensions.join(", "),
			parent			: info_container
		})

	// max file size upload file size
		const max_mb = Math.floor(self.max_size_bytes / (1024*1024))
		ui.create_dom_element({
			element_type	: 'label',
			inner_html		: 'Max file size',
			parent			: info_container
		})
		ui.create_dom_element({
			element_type	: 'div',
			class_name		: (max_mb < 100) ? 'warning' : '',
			inner_html		: max_mb.toLocaleString() + ' MB',
			parent			: info_container
		})

	// DEDALO_UPLOAD_SERVICE_CHUNK_FILES
		ui.create_dom_element({
			element_type	: 'label',
			inner_html		: 'Chunk files size',
			parent			: info_container
		})
		const chunk_text = self.upload_service_chunk_files
			? self.upload_service_chunk_files + ' MB'
			: JSON.stringify(self.upload_service_chunk_files)
		ui.create_dom_element({
			element_type	: 'div',
			inner_html		: chunk_text,
			parent			: info_container
		})

	// sys_get_temp_dir
		ui.create_dom_element({
			element_type	: 'label',
			inner_html		: 'System temp dir',
			parent			: info_container
		})
		ui.create_dom_element({
			element_type	: 'div',
			inner_html		: self.sys_get_temp_dir,
			parent			: info_container
		})

	// upload_tmp_dir
		ui.create_dom_element({
			element_type	: 'label',
			inner_html		: 'User upload tmp dir',
			parent			: info_container
		})
		ui.create_dom_element({
			element_type	: 'div',
			inner_html		: self.upload_tmp_dir,
			parent			: info_container
		})

	// upload_tmp_perms
		ui.create_dom_element({
			element_type	: 'label',
			inner_html		: 'User upload tmp perms',
			parent			: info_container
		})
		ui.create_dom_element({
			element_type	: 'div',
			inner_html		: self.upload_tmp_perms,
			parent			: info_container
		})

	// session_cache_expire
		const session_cache_expire = (self.session_cache_expire / 60) > 24
			? (self.session_cache_expire / (60 * 24)).toLocaleString() + ' Days'
			: (self.session_cache_expire / 60).toLocaleString() + ' Hours'
		ui.create_dom_element({
			element_type	: 'label',
			inner_html		: 'Session cache expire',
			parent			: info_container
		})
		ui.create_dom_element({
			element_type	: 'div',
			inner_html		: session_cache_expire + ' [' + self.session_cache_expire.toLocaleString() + ' minutes]',
			parent			: info_container
		})


	return info_container
}//end render_info_container



/**
* RENDER_TEMPLATE
* @param object self
* 	Instance of current tool
* @return DocumentFragment
*/
const render_template = async function(self) {

	const fragment = new DocumentFragment();

	// actions row
		const actions = ui.create_dom_element({
			element_type	: 'div',
			id				: 'actions',
			class_name		: 'row',
			parent			: fragment
		})

	// buttons_container
		const buttons_container = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'buttons_container',
			parent			: actions
		})

		// button_add_files
			const button_add_files = ui.create_dom_element({
				element_type	: 'button',
				class_name		: 'success add dz-clickable',
				inner_html		: get_label.add_file || 'Add files',
				parent			: buttons_container
			})

		// button_start_upload
			const button_submit_files = ui.create_dom_element({
				element_type	: 'button',
				class_name		: 'primary upload start',
				inner_html		: get_label.start_upload || 'Start upload',
				parent			: buttons_container
			})
			// button_submit_files.addEventListener('click', function(e) {
			// 	e.stopPropagation()
			// })

		// button_cancel_upload
			const button_cancel_upload = ui.create_dom_element({
				element_type	: 'button',
				class_name		: 'warning cancel',
				inner_html		: get_label.cancel_upload || 'Cancel upload',
				parent			: buttons_container
			})
			button_cancel_upload.addEventListener('click', function() {
				current_dropzone.removeAllFiles(true);
			});

		// button_delete
			const button_delete = ui.create_dom_element({
				element_type	: 'button',
				class_name		: 'danger delete',
				inner_html		: get_label.delete_file || 'Delete file',
				dataset			: {dzRemove : ""},
				parent			: buttons_container
			})

		// delete_check_box
			const delete_check_box = ui.create_dom_element({
				element_type	: 'input',
				type			: 'checkbox',
				class_name		: 'all_delete_checkbox',
				parent			: buttons_container
			})
			delete_check_box.addEventListener('change', function(){
				const delete_check_nodes	= document.querySelectorAll('.delete_checkbox')
				const len					= delete_check_nodes.length
				for (let i = len - 1; i >= 0; i--) {
					delete_check_nodes[i].checked = delete_check_box.checked
				}
			})

	// column_right
		const column_right = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'col-lg-5 column_right',
			parent			: actions
		})
		// The global file processing state
			const fileupload_process = ui.create_dom_element({
				element_type	: 'span',
				class_name		: 'fileupload-process',
				parent			: column_right
			})
			// The global file processing state
				const global_progress = ui.create_dom_element({
					element_type	: 'div',
					class_name		: 'progress progress-striped active',
					parent			: fileupload_process
				})
				global_progress.style.opacity = "0";
			// global_progress_bar
				const global_progress_bar = ui.create_dom_element({
					element_type	: 'div',
					class_name		: 'progress-bar progress-bar-success',
					dataset			: {dzUploadprogress : ''},
					parent			: global_progress
				})
				//initial state
				global_progress_bar.style.width = '0%';

			// total bytes
				const global_total_bytes = ui.create_dom_element({
					element_type	: 'span',
					class_name		: 'progress-global_total_bytes',
					value			: '',
					parent			: global_progress
				})
				const global_total_bytes_sent = ui.create_dom_element({
					element_type	: 'span',
					class_name		: 'progress-global_total_bytes_sent',
					value			: '',
					parent			: global_progress
				})

	// grid template used for rows
		const previews_container = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'table table-striped',
			parent			: fragment
		})
		// template used for rows
			const template = ui.create_dom_element({
				id 				: 'template',
				element_type	: 'div',
				class_name		: 'file-row',
				parent			: previews_container
			})

		// preview_wrapp
			const preview_wrapp = ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'preview_wrapp',
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
					dataset			: {dzThumbnail : ''},
					class_name		: '_preview_image',
					parent			: preview_wrapp
				})
				// preview_image.dataset.dzThumbnail = ''

		// details_wrapp
			const details_wrapp = ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'details_wrapp',
				parent			: template
			})
			// name
				const name = ui.create_dom_element({
					element_type	: 'span',
					class_name		: 'name',
					dataset			: {dzName : ''},
					parent			: details_wrapp
				})
			// error
				const error = ui.create_dom_element({
					element_type	: 'span',
					class_name		: 'error text-danger',
					dataset			: {dzErrormessage : ''},
					parent			: details_wrapp
				})
			// size
				const size = ui.create_dom_element({
					element_type	: 'span',
					class_name		: 'size',
					dataset			: {dzSize : ''},
					parent			: details_wrapp
				})

		// options_fragment
			const options_fragment = new DocumentFragment();

			// row_options_wrapper
				const row_options_wrapper = ui.create_dom_element({
					element_type	: 'div',
					class_name 		: 'component options',
					parent 			: options_fragment
				})
				// filter processor options of the files, it could be defined in the preferences or could be the caller
				const ar_file_processor = self.file_processor
				if(ar_file_processor) {
					// options process
						const select_process = ui.create_dom_element({
							element_type	: 'select',
							class_name		: 'file_processor_select',
							parent			: row_options_wrapper
						})
					// blank option
					const row_option_node = new Option('', null, true, false);
					select_process.appendChild(row_option_node)
					// values options
					for (let i = 0; i < ar_file_processor.length; i++) {
						const element			= ar_file_processor[i]
						const row_option_node	= new Option(element.function_name_label, element.function_name, element.default || false, false);
						select_process.appendChild(row_option_node)
					}
				}//end if(ar_file_processor)

			// component options to store the file, normally the component_portal, it could be defined in the preferences or could be the caller
				const ddo_option_components	= self.component_option
				if(ddo_option_components){
					const option_components = (ddo_option_components)
						? ddo_option_components
						: [
							{
								tipo	: self.caller.tipo,
								label	: self.label,
								default	: true
							}
						]

					// row_select_options
						const row_select_options = ui.create_dom_element({
							element_type	: 'select',
							class_name		: 'option_component_select',
							parent			: row_options_wrapper
						})
						for (let i = 0; i < option_components.length; i++) {
							const option			= option_components[i]
							const row_option_node	= new Option(option.label, option.tipo, option.default || false, false);
							row_select_options.appendChild(row_option_node)
						}
				}
			// append full options_fragment
			template.appendChild(options_fragment)

		// row_progress_bar
			const row_progress_bar = ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'row_progress_bar',
				parent			: template
			})
			// row_progress_bar
				const row_progress_bar_active = ui.create_dom_element({
					element_type	: 'div',
					class_name		: 'progress progress-striped active',
					parent			: row_progress_bar
				})
			// row_progress_bar_success
				ui.create_dom_element({
					element_type	: 'div',
					class_name		: 'progress-bar progress-bar-success',
					dataset			: {dzUploadprogress : ''},
					parent			: row_progress_bar_active
				})

		// row_buttons
			const row_buttons = ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'row_buttons',
				parent			: template
			})

			// row_button_submit_files
				const row_button_submit_files = ui.create_dom_element({
					element_type	: 'button',
					class_name		: 'primary start',
					inner_html		: get_label.submit || 'Start upload',
					parent			: row_buttons
				})

			// row_button_cancel_upload
				const row_button_cancel_upload = ui.create_dom_element({
					element_type	: 'button',
					class_name		: 'warning cancel',
					inner_html		: get_label.cancel_upload || 'Cancel upload',
					dataset			: {dzRemove : ""},
					parent			: row_buttons
				})

			// row_button_delete
				ui.create_dom_element({
					element_type	: 'button',
					class_name		: 'danger delete row_button_delete hide',
					inner_html		: get_label.delete_file || 'Delete file',
					dataset			: {dzRemove : ""},
					parent			: row_buttons
				})

			// row_delete_check_box
				ui.create_dom_element({
					element_type	: 'input',
					type			: 'checkbox',
					class_name		: 'delete_checkbox row_delete_check_box hide',
					parent			: row_buttons
				})

	// Get the template HTML and remove it from the document
		const previewNode		= template;
		previewNode.id			= '';
		const previewTemplate	= previewNode.parentNode.innerHTML;
		previewNode.parentNode.removeChild(previewNode);

	// dropzone init
		const api_url	= DEDALO_API_URL
		const current_dropzone = self.active_dropzone || new Dropzone(document.body, { // Make the whole body a dropzone
			url					: api_url,
			// thumbnailWidth	: 192,
			thumbnailHeight		: 96,
			thumbnailMethod		: 'contain',
			parallelUploads		: 20,
			previewTemplate		: previewTemplate,
			autoQueue			: false, // Make sure the files aren't queued until manually added
			previewsContainer	: previews_container, // Define the container to display the previews
			clickable			: button_add_files, // Define the element that should be used as click trigger to select files.
			addRemoveLinks		: false,
			acceptedFiles		: self.allowed_extensions.join(','),
			params				: {
				key_dir : self.key_dir
			},
			renameFile			: function (file) {

				const files		= self.caller.files_data;
				const { name }	= file; // equivalent to const name = file.name;

				if (files.some(el => el.name === name)) {

					const last_dot			= name.lastIndexOf('.');
					// const base_name		= name.slice((name.lastIndexOf('.') - 1 >>> 0) + 2);
					const file_name			= name.substring(0, last_dot);
					const file_extension	= name.substring(last_dot + 1);
					const renamed			= file_name + ' ('+ files.length +').' + file_extension;

					return renamed
				}

				return name;
			}
		});
		self.active_dropzone = current_dropzone

	// event addedfile
		current_dropzone.on('addedfile', function(file) {

			const button_start				= file.previewElement.querySelector('.start')
			const button_cancel				= file.previewElement.querySelector('.cancel')
			const button_delete				= file.previewElement.querySelector('.delete')
			const button_delete_check_box	= file.previewElement.querySelector('.delete_checkbox')

			if(file.url){
				button_start.disabled	= true;
				button_cancel.disabled	= true;
				button_delete.disabled	= false;

				button_start.classList.add('hide')
				button_cancel.classList.add('hide')
				button_delete.classList.remove('hide')
				button_delete_check_box.classList.remove('hide')
			}else{

				button_start.disabled	= false;
				button_cancel.disabled	= false;
				button_delete.disabled	= true;

				button_start.classList.remove('hide')
				button_cancel.classList.remove('hide')
				button_delete.classList.add('hide')
				button_delete_check_box.classList.add('hide')
			}

			// check if the file comes from the server or from dropzone
			const current_name = (file.upload && file.upload.filename) ? file.upload.filename : file.name

			// Hookup the start button
			button_start.onclick = function() {
				current_dropzone.enqueueFile(file);
			};
			file.previewElement.querySelector(".name").innerHTML = current_name
			button_delete_check_box.value = current_name

			self.caller.files_data.push({
				name			: current_name,
				previewTemplate	: file.previewTemplate,
				previewElement	: file.previewElement,
				size			: file.size
			})

		});

	// event removedfile
		current_dropzone.on('removedfile', async function(file) {

			const current_name = (file.upload && file.upload.filename) ? file.upload.filename : file.name;

			const data_length = self.caller.files_data.length
			for (let i = data_length - 1; i >= 0; i--) {
				const current_data = self.caller.files_data[i]
				if(current_data.name === current_name){
					self.caller.files_data.splice(i,1);
				}
			}

			if(file.url || file.status==='success'){

				// source
					const source = create_source(self)

				// rqo
					const rqo = {
						dd_api	: 'dd_utils_api',
						action	: 'delete_uploaded_file',
						source	: source,
						options	: {
							key_dir		: self.key_dir,
							file_name	: current_name
						}
					}

				// call to the API, fetch data and get response
					const response = await data_manager.request({
						body : rqo
					})
			}
		});


	// event totaluploadprogress. Update the total progress bar
		current_dropzone.on('totaluploadprogress', function(progress, totalBytes, totalBytesSend) {
			const finished_files = current_dropzone.getFilesWithStatus(Dropzone.SUCCESS);

			finished_files.forEach(file => {
				totalBytes		+= file.size;
				totalBytesSend	+= file.size;
				progress = totalBytesSend / totalBytes * 100.0;
			});

			global_progress_bar.style.width = progress + '%';
			global_total_bytes_sent.textContent = Math.floor(totalBytesSend / 1024 / 1024 );
		});

	// event sending
		current_dropzone.on('sending', function(file) {
			// Show the total progress bar when upload starts
			// document.querySelector('#total-progress').style.opacity = '1';
			global_progress.style.opacity = '1';
			// And disable the start button
			file.previewElement.querySelector('.start').setAttribute('disabled', 'disabled');

			let total = 0
			self.caller.files_data.forEach(file => {
				total += file.size
			});
			const total_bytes = Math.floor(total / 1024 / 1024 );
			global_total_bytes.textContent = total_bytes + 'MB'
		});

	// event queuecomplete. Hide the total progress bar when nothing's uploading anymore
		current_dropzone.on('queuecomplete', function(progress) {
			// document.querySelector("#total-progress").style.opacity = "0";
			global_progress.style.opacity = '0';
		});

	// Setup the buttons for all transfers
	// The 'add files' button doesn't need to be setup because the config
	// `clickable` has already been specified.
	// document.querySelector('#actions .start').onclick = function() {

	// button_submit_files
		// button_submit_files.onclick = function() {
		// 	current_dropzone.enqueueFiles(current_dropzone.getFilesWithStatus(Dropzone.ADDED))
		// }

	// button_submit_files
		// document.querySelector('#actions .cancel').onclick = function() {
		button_submit_files.onclick = function() {

			current_dropzone.enqueueFiles(current_dropzone.getFilesWithStatus(Dropzone.ADDED))

			// current_dropzone.removeAllFiles(true);
			const files = current_dropzone.getFilesWithStatus(Dropzone.UPLOADING)
			for (let i = files.length - 1; i >= 0; i--) {
				const current_file = files[i]
				current_dropzone.cancelUpload(current_file)
				current_file.status = Dropzone.ADDED
			}
		}

	// button_delete
		button_delete.onclick= async function() {

			const delete_checkbox_nodes	= document.querySelectorAll('.delete_checkbox')
			const len					= delete_checkbox_nodes.length
			for (let i = len - 1; i >= 0; i--) {
				if(delete_checkbox_nodes[i].checked){
					const row_delete_node	= delete_checkbox_nodes[i].parentNode.querySelector('button.delete')
					if(row_delete_node){
						row_delete_node.click()
					}
				}
			}
		}

	// event success
		current_dropzone.on('success', function(file, api_response) {

			//showing an image created by the server after upload
			this.emit('thumbnail', file, api_response.file_data.thumbnail_url);

			// Handle the api_responseText here. For example, add the text to the preview element:
			file.previewTemplate.appendChild(
				document.createTextNode(api_response.msg)
			);

			const button_start	= file.previewElement.querySelector('.start')
			const button_cancel	= file.previewElement.querySelector('.cancel')
			const button_delete	= file.previewElement.querySelector('.delete')
			const button_delete_check_box = file.previewElement.querySelector('.delete_checkbox')

			button_start.disabled = true;
			button_cancel.disabled = true;
			button_delete.disabled = false;

			button_start.classList.add('hide')
			button_cancel.classList.add('hide')
			button_delete.classList.remove('hide')
			button_delete_check_box.classList.remove('hide')

			const row_progress_bar = file.previewElement.querySelector('.progress')
			row_progress_bar.style.opacity = '0';

			event_manager.publish('drop_zone_success', {
				file			: file,
				api_response	: api_response
			})
		});

	// get the images in the server (uploaded previously), and display into the dropzone

		// source. Note that second argument is the name of the function to manage the API request like 'delete'
			// this generates a call as my_tool_name::my_function_name(options)
			const source = create_source(self, 'list_uploaded_files')

		// rqo
			const rqo = {
				dd_api	: 'dd_utils_api',
				action	: 'list_uploaded_files',
				source	: source,
				options	: {
					key_dir : self.key_dir
				}
			}

		// call to the API, fetch data and get response
			const response = await data_manager.request({
				body : rqo
			})
			const files = response.result

		// Access to the original image sizes on your server,
		// to resize them in the browser:
		const files_length = files.length

		const callback			= null; // Optional callback when it's done
		const crossOrigin		= null; // Added to the `img` tag for crossOrigin handling
		const resizeThumbnail	= false; // Tells Dropzone whether it should resize the image first

		for (let i = 0; i < files_length; i++) {
			const current_file = files[i]
			current_dropzone.displayExistingFile(current_file, current_file.url, callback, crossOrigin, resizeThumbnail);
		}


	return fragment
}//end render_template



// @license-end
