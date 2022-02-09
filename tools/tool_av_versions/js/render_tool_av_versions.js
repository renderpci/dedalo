/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL, tool_av_versions */
/*eslint no-undef: "error"*/



// imports
	import {event_manager} from '../../../core/common/js/event_manager.js'
	import {ui} from '../../../core/common/js/ui.js'



/**
* RENDER_tool_av_versions
* Manages the component's logic and appearance in client side
*/
export const render_tool_av_versions = function() {

	return true
};//end render_tool_av_versions



/**
* EDIT
* Render tool DOM nodes
* This function is called by render common attached in 'tool_av_versions.js'
* @param object options
* @return DOM node
*/
render_tool_av_versions.prototype.edit = async function(options) {

	const self = this

	// options
		const render_level = options.render_level || 'full'

	// content_data
		const content_data = await get_content_data(self)
		if (render_level==='content') {
			return content_data
		}

	// wrapper. ui build_edit returns a standard built tool wrapper
		const wrapper = ui.tool.build_wrapper_edit(self, {
			content_data : content_data
		})

	// modal container
		const header = wrapper.querySelector('.tool_header') // is created by ui.tool.build_wrapper_edit
		const modal  = ui.attach_to_modal(header, wrapper, null)
		modal.on_close = () => {
			// when closing the modal, common destroy is called to remove tool and elements instances
			self.destroy(true, true, true)
		}


	return wrapper
};//end tool_av_versions



/**
* GET_CONTENT_DATA
* Render tool body or 'content_data'
* @param instance self
* @return DOM node content_data
*/
const get_content_data = async function(self) {

	const fragment = new DocumentFragment()

	// main_component_container
		const main_component_container = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'main_component_container',
			parent			: fragment
		})
		self.main_component.render()
		.then(function(component_node){
			main_component_container.appendChild(component_node)
		})
		// fix
		self.main_component_container = main_component_container

	// versions_container
		const versions_grid = get_versions_grid(self)
		fragment.appendChild(versions_grid)

	// content_data
		const content_data = document.createElement("div")
			  content_data.classList.add("content_data", self.type)
			  content_data.appendChild(fragment)


	return content_data
};//end get_content_data



/**
* GET_VERSIONS_GRID
* @return DOM node
*/
const get_versions_grid = function(self) {

	const fragment = new DocumentFragment()

	// quality versions
		const ar_quality = self.ar_quality
		if (!ar_quality || ar_quality.length<1) {
			console.log('Error. Invalid component ar_quality :', ar_quality);
			return fragment
		}

	// versions_container
		const versions_container = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'versions_container',
			parent			: fragment
		})
		Object.assign(
			versions_container.style,
			{
				'grid-template-columns': `20% repeat(${ar_quality.length}, 1fr)`
			}
		)

	// line_labels
		versions_container.appendChild( get_line_labels(ar_quality, self) )

	// line_file_exists
		versions_container.appendChild( get_line_file_exists(ar_quality, self) )

	// line_file_size
		versions_container.appendChild( get_line_file_size(ar_quality, self) )

	// line_file_upload
		versions_container.appendChild( get_line_file_upload(ar_quality, self) )

	// line_file_download
		versions_container.appendChild( get_line_file_download(ar_quality, self) )

	// line_file_delete
		versions_container.appendChild( get_line_file_delete(ar_quality, self) )

	// line_file_build_version
		versions_container.appendChild( get_line_build_version(ar_quality, self) )

	// line_file_conform_headers
		versions_container.appendChild( get_line_conform_headers(ar_quality, self) )


	return fragment
};//end get_versions_grid



/**
* GET_LINE_LABELS
* @return DOM node fragment
*/
const get_line_labels = function(ar_quality, self) {

 	const fragment = new DocumentFragment()

 	// main label
		ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'label',
			text_content	: get_label.quality || 'Quality',
			parent			: fragment
		})

	// quality labels
		const ar_quality_length = ar_quality.length
		for (let i = 0; i < ar_quality_length; i++) {

			const quality = ar_quality[i]

			// file_info
				// const file_info = self.files_info.find(el => el.quality===quality)

				// 'file_exist'
				// 'file_size'
				// 'url'

			const file_info_node = ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'file_info' + (quality===self.caller.context.default_quality ? ' default' : ''),
				parent			: fragment
			})

			ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'label',
				text_content	: quality,
				parent			: file_info_node
			})
		}


	return fragment
};//end get_line_labels



/**
* GET_LINE_FILE_EXISTS
* @return DOM node fragment
*/
const get_line_file_exists = function(ar_quality, self) {

 	const fragment = new DocumentFragment()

 	// main label
		ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'label',
			text_content	: get_label.fichero || 'File',
			parent			: fragment
		})

	// info columns
		const ar_quality_length = ar_quality.length
		for (let i = 0; i < ar_quality_length; i++) {

			const quality = ar_quality[i]

			// file_info
				const file_info = self.files_info.find(el => el.quality===quality)

				// 'file_exist'
				// 'file_size'
				// 'url'

			const file_info_node = ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'file_info' + (quality===self.caller.context.default_quality ? ' default' : ''),
				parent			: fragment
			})

			if (file_info.file_exist===true) {
				if (file_info.url) {
					const button_file_av = ui.create_dom_element({
						element_type	: 'span',
						class_name		: 'button file_av',
						parent			: file_info_node
					})
					button_file_av.addEventListener("click", function(){
						// change component av quality and refresh
						self.main_component.quality = quality
						console.log("self.main_component:",self.main_component);
						self.main_component.refresh()
						.then(function(){

							console.log("///////////// self.main_component.video:", self.main_component.video);

							// self.main_component.video.addEventListener('canplay', fn_play)
							// function fn_play() {

							// 	// self.main_component.video.removeEventListener('canplay', fn_play);
							// 	self.main_component.video.play()
							// }
							// self.main_component.video.pause()
							// self.main_component.video.play()
						})
					})
				}else{
					// const extension = file_info.url.split(".").pop();
					ui.create_dom_element({
						element_type	: 'span',
						class_name		: '',
						text_content	: `-`,
						parent			: file_info_node
					})
				}
			}//end if (file_info.url) {
		}//end for (let i = 0; i < ar_quality_length; i++)


	return fragment
};//end get_line_file_exists



/**
* GET_LINE_FILE_SIZE
* @return DOM node fragment
*/
const get_line_file_size = function(ar_quality, self) {

 	const fragment = new DocumentFragment()

 	// main label
		ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'label',
			text_content	: get_label.tamano || 'Size',
			parent			: fragment
		})

	// info columns
		const ar_quality_length = ar_quality.length
		for (let i = 0; i < ar_quality_length; i++) {

			const quality = ar_quality[i]

			// file_info
				const file_info = self.files_info.find(el => el.quality===quality)

				// 'file_exist'
				// 'file_size'
				// 'url'

			const file_info_node = ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'file_info' + (quality===self.caller.context.default_quality ? ' default' : ''),
				parent			: fragment
			})

			if (file_info.file_exist===true) {
				const button_file_av = ui.create_dom_element({
					element_type	: 'span',
					class_name		: '',
					inner_html		: file_info.file_size,
					parent			: file_info_node
				})
			}
		}


	return fragment
};//end get_line_file_size



/**
* GET_LINE_FILE_UPLOAD
* @return DOM node fragment
*/
const get_line_file_upload = function(ar_quality, self) {

 	const fragment = new DocumentFragment()

 	// main label
		ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'label',
			text_content	: get_label.subir || 'Upload',
			parent			: fragment
		})

	// info columns
		const ar_quality_length = ar_quality.length
		for (let i = 0; i < ar_quality_length; i++) {

			const quality = ar_quality[i]

			// file_info
				const file_info = self.files_info.find(el => el.quality===quality)

				// 'file_exist'
				// 'file_size'
				// 'url'

			const file_info_node = ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'file_info' + (quality===self.caller.context.default_quality ? ' default' : ''),
				parent			: fragment
			})

			const button_file_upload = ui.create_dom_element({
				element_type	: 'span',
				class_name		: 'button upload',
				parent			: file_info_node
			})
			button_file_upload.addEventListener("click", function(){
				// open tool_upload
					// tool context minimun
						const tool_context = {
							model	: 'tool_upload',
							name	: 'tool_upload'
						}
					// update caller context quality
						self.caller.context.target_quality = quality

					// event publish
						event_manager.publish('load_tool', {
							tool_context	: tool_context,
							caller			: self.caller
						})

				// event on refresh caller
					const token = event_manager.subscribe('render_'+self.caller.id, fn_refresh)
					self.events_tokens.push(token)
					function fn_refresh() {
						event_manager.unsubscribe(token)
						self.refresh()
					}
			})
		}


	return fragment
};//end get_line_file_upload



/**
* GET_LINE_FILE_downLOAD
* @return DOM node fragment
*/
const get_line_file_download = function(ar_quality, self) {

 	const fragment = new DocumentFragment()

 	// main label
		ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'label',
			text_content	: get_label.descargar || 'Download',
			parent			: fragment
		})

	// info columns
		const ar_quality_length = ar_quality.length
		for (let i = 0; i < ar_quality_length; i++) {

			const quality = ar_quality[i]

			// file_info
				const file_info = self.files_info.find(el => el.quality===quality)

				// 'file_exist'
				// 'file_size'
				// 'url'

			const file_info_node = ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'file_info' + (quality===self.caller.context.default_quality ? ' default' : ''),
				parent			: fragment
			})

			if (file_info.file_exist===true) {

				const button_file_download = ui.create_dom_element({
					element_type	: 'span',
					class_name		: 'button download',
					parent			: file_info_node
				})
				button_file_download.addEventListener("click", function(){
					// open trigger call in new window

					// url
						const url_vars = {
							mode			: 'download_file',
							quality			: quality,
							tipo			: self.caller.tipo,
							section_tipo	: self.caller.section_tipo,
							section_id		: self.caller.section_id
						}
						const pairs = []
						for (const key in url_vars) {
							pairs.push( key+'='+url_vars[key] )
						}
						const url = self.trigger_url + '?' + pairs.join('&')

					// confirm dialog
						if ( !confirm( (get_label.descargar || 'Download') + ' ['+quality+']' ) ) {
							return false
						}

					// open new window
						window.open(url, get_label.descargar)
						// const download_window = window.open(url, get_label.descargar)
						// download_window.focus()
				})
			}
		}//end if (file_info.file_exist===true)


	return fragment
};//end get_line_file_download



/**
* GET_LINE_FILE_DELETE
* @return DOM node fragment
*/
const get_line_file_delete = function(ar_quality, self) {

 	const fragment = new DocumentFragment()

 	// main label
		ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'label',
			text_content	: get_label.borrar || 'Delete',
			parent			: fragment
		})

	// info columns
		const ar_quality_length = ar_quality.length
		for (let i = 0; i < ar_quality_length; i++) {

			const quality = ar_quality[i]

			// file_info
				const file_info = self.files_info.find(el => el.quality===quality)

				// 'file_exist'
				// 'file_size'
				// 'url'

			const file_info_node = ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'file_info' + (quality===self.caller.context.default_quality ? ' default' : ''),
				parent			: fragment
			})

			if (file_info.file_exist===true) {

				const button_file_download = ui.create_dom_element({
					element_type	: 'span',
					class_name		: 'button delete',
					parent			: file_info_node
				})
				button_file_download.addEventListener("click", function(){
					// exec delete_file
						self.delete_file(quality)
						.then(function(response){
							if (response===true) {
								self.refresh()
							}
						})
				})
			}
		}


	return fragment
};//end get_line_file_delete



/**
* GET_LINE_BUILD_VERSION
* @return DOM node fragment
*/
const get_line_build_version = function(ar_quality, self) {

 	const fragment = new DocumentFragment()

 	// main label
		ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'label',
			text_content	: (get_label.generar || 'Build') + ' ' + (get_label.version || 'version'),
			parent			: fragment
		})

	// info columns
		const ar_quality_length = ar_quality.length
		for (let i = 0; i < ar_quality_length; i++) {

			const quality = ar_quality[i]

			// file_info
				const file_info = self.files_info.find(el => el.quality===quality)

				// 'file_exist'
				// 'file_size'
				// 'url'

			const file_info_node = ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'file_info' + (quality===self.caller.context.default_quality ? ' default' : ''),
				parent			: fragment
			})

			if (quality!=='original') {

				const button_build_version = ui.create_dom_element({
					element_type	: 'span',
					class_name		: 'button gear',
					parent			: file_info_node
				})
				button_build_version.addEventListener("click", function(){
					// exec build_version
						self.build_version(quality)
						.then(function(result){
							if (result===true) {

								// building
								button_build_version.remove()

								ui.create_dom_element({
									element_type	: 'span',
									class_name		: 'blink',
									inner_html		: get_label.procesando || 'Processing',
									parent			: file_info_node
								})
								function check_file() {
									setTimeout(async function(){
										const files_info = await self.get_files_info()
										const found = files_info.find(el => el.quality===quality)
										if (found && found.url) {
											// processing_label.remove()
											// button_build_version.classList.remove('hide')
											self.refresh()
										}else{
											check_file()
										}
									}, 5000)
								}
								check_file()
							}
						})
				})
			}
		}//end for (let i = 0; i < ar_quality_length; i++)


	return fragment
};//end get_line_build_version



/**
* GET_LINE_CONFORM_HEADERS
* @return DOM node fragment
*/
const get_line_conform_headers = function(ar_quality, self) {

 	const fragment = new DocumentFragment()

 	// main label
		ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'label',
			text_content	: (get_label.conformar_cabeceras || 'Conform headers'),
			parent			: fragment
		})

	// info columns
		const ar_quality_length = ar_quality.length
		for (let i = 0; i < ar_quality_length; i++) {

			const quality = ar_quality[i]

			// file_info
				const file_info = self.files_info.find(el => el.quality===quality)

				// 'file_exist'
				// 'file_size'
				// 'url'

			const file_info_node = ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'file_info' + (quality===self.caller.context.default_quality ? ' default' : ''),
				parent			: fragment
			})

			if (quality!=='original' && file_info.file_exist===true) {

				const button_build_version = ui.create_dom_element({
					element_type	: 'span',
					class_name		: 'button gear',
					parent			: file_info_node
				})
				button_build_version.addEventListener("click", function(){
					// exec conform_headers
						self.conform_headers(quality)
						.then(function(result){
							if (result===true) {
								self.refresh()
							}
						})
				})
			}
		}//end for (let i = 0; i < ar_quality_length; i++)


	return fragment
};//end get_line_conform_headers