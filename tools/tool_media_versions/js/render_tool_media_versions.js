/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL, tool_media_versions */
/*eslint no-undef: "error"*/



// imports
	import {event_manager} from '../../../core/common/js/event_manager.js'
	import {ui} from '../../../core/common/js/ui.js'
	import {bytes_format} from '../../../core/common/js/utils/index.js'
	import {open_tool} from '../../../tools/tool_common/js/tool_common.js'



/**
* RENDER_TOOL_MEDIA_VERSIONS
* Manages the component's logic and appearance in client side
*/
export const render_tool_media_versions = function() {

	return true
}//end render_tool_media_versions



/**
* EDIT
* Render tool DOM nodes
* This function is called by render common attached in 'tool_media_versions.js'
* @param object options
* @return DOM node
*/
render_tool_media_versions.prototype.edit = async function(options) {

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
		// if (!window.opener) {
		// 	const header	= wrapper.tool_header // is created by ui.tool.build_wrapper_edit
		// 	const modal		= ui.attach_to_modal(header, wrapper, null)
		// 	modal.on_close	= () => {
		// 		self.caller.refresh()
		// 		// when closing the modal, common destroy is called to remove tool and elements instances
		// 		self.destroy(true, true, true)
		// 	}
		// }


	return wrapper
}//end tool_media_versions



/**
* GET_CONTENT_DATA
* Render tool body or 'content_data'
* @param instance self
* @return DOM node content_data
*/
const get_content_data = async function(self) {

	const fragment = new DocumentFragment()

	// main_element_container
		const main_element_container = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'main_element_container',
			parent			: fragment
		})
		self.main_element.render()
		.then(function(component_node){
			main_element_container.appendChild(component_node)
		})
		// fix
		self.main_element_container = main_element_container

	// versions_container
		const versions_grid = render_versions_grid(self)
		fragment.appendChild(versions_grid)

	// content_data
		const content_data = ui.tool.build_content_data(self)
		content_data.appendChild(fragment)


	return content_data
}//end get_content_data



/**
* RENDER_VERSIONS_GRID
* @param object self
* @return DOM node
*/
const render_versions_grid = function(self) {

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
				'grid-template-columns': `minmax(6rem, 20%) repeat(${ar_quality.length}, 1fr)`
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
		if (ar_quality.length>1) {
			versions_container.appendChild( get_line_build_version(ar_quality, self) )
		}

	// specific_actions. Special features based on main_element model. They are defined in tool properties.
		// sample:
		// {
		//   "specific_actions": {
		//     "rotate": [
		//       "component_image"
		//     ],
		//     "conform_headers": [
		//       "component_av"
		//     ]
		//   }
		// }
		const specific_actions = self.context.properties.specific_actions || {}
		// functions mapper. Maps action name with handler function
		// Define here the list of available specific tool functions
		const fn_mapper = {
			conform_headers	: get_line_conform_headers,
			rotate			: get_line_rotate
		}
		for(const action_name in specific_actions) {

			const ar_models = specific_actions[action_name]
			if (ar_models.includes(self.main_element.model)) {

				// check valid function call
					if(typeof fn_mapper[action_name]!=='function') {
						console.log("Ignored invalid function name:", action_name);
						continue;
					}

				// build line node and add
					const line_node = fn_mapper[action_name](ar_quality, self)
					versions_container.appendChild(line_node)
			}
		}


	return fragment
}//end render_versions_grid



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
			inner_html		: get_label.quality || 'Quality',
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
				inner_html		: quality,
				parent			: file_info_node
			})
		}


	return fragment
}//end get_line_labels



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
			inner_html		: get_label.fichero || 'File',
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
						class_name		: 'button media',
						parent			: file_info_node
					})
					button_file_av.addEventListener('click', async function() {
						self.node.classList.add('loading')
						// change component av quality and refresh
						self.main_element.quality = quality
						await self.main_element.refresh()
						self.node.classList.remove('loading')
					})
				}else{
					// const extension = file_info.url.split(".").pop();
					ui.create_dom_element({
						element_type	: 'span',
						class_name		: '',
						inner_html		: `-`,
						parent			: file_info_node
					})
				}
			}//end if (file_info.url) {
		}//end for (let i = 0; i < ar_quality_length; i++)


	return fragment
}//end get_line_file_exists



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
			inner_html		: get_label.tamano || 'Size',
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

				// size
				const size = bytes_format(file_info.file_size)

				// icon file
				ui.create_dom_element({
					element_type	: 'span',
					class_name		: '',
					inner_html		: size,
					parent			: file_info_node
				})
			}
		}


	return fragment
}//end get_line_file_size



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
			inner_html		: get_label.subir || 'Upload',
			parent			: fragment
		})

	// info columns
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

			const button_file_upload = ui.create_dom_element({
				element_type	: 'span',
				class_name		: 'button upload',
				parent			: file_info_node
			})
			button_file_upload.addEventListener('click', function(e){
				e.stopPropagation()

				// open tool_upload
					// tool context minimum
						const tool_context = {
							model	: 'tool_upload',
							name	: 'tool_upload',
							mode	: 'edit'
						}

					const caller = self.main_element

					// update caller context quality
						caller.context.target_quality = quality

					// open_tool (tool_common)
						open_tool({
							tool_context	: tool_context,
							caller			: caller
						})

				// event on refresh caller
					const token = event_manager.subscribe('render_'+self.main_element.id, fn_refresh)
					self.events_tokens.push(token)
					function fn_refresh() {
						event_manager.unsubscribe(token)
						self.main_element_quality = quality
						self.refresh()
					}
			})
		}


	return fragment
}//end get_line_file_upload



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
			inner_html		: get_label.descargar || 'Download',
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
				button_file_download.addEventListener('click', function(){
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
}//end get_line_file_download



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
			inner_html		: get_label.borrar || 'Delete',
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
				button_file_download.addEventListener('click', async function(){
					self.node.classList.add('loading')
					// exec delete_file
					const response = await self.delete_file(quality)
					if (response===true) {
						// self.main_element_quality = quality
						self.refresh()
					}
					self.node.classList.remove('loading')
				})
			}
		}


	return fragment
}//end get_line_file_delete



/**
* GET_LINE_BUILD_VERSION
* @param array ar_quality
* @param object self
* @return DOM node fragment
*/
const get_line_build_version = function(ar_quality, self) {

 	const fragment = new DocumentFragment()

 	// main label
		ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'label',
			inner_html		: (get_label.generar || 'Build') + ' ' + (get_label.version || 'version'),
			parent			: fragment
		})

	// info columns
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

			// exclude original quality button from list
				if (quality==='original') {
					continue;
				}

			const button_build_version = ui.create_dom_element({
				element_type	: 'span',
				class_name		: 'button gear',
				parent			: file_info_node
			})
			button_build_version.addEventListener('click', async function() {

				self.node.classList.add('loading')
				// exec build_version
				const result = await self.build_version(quality)
				if (result===true) {

					// building
					button_build_version.remove()

					ui.create_dom_element({
						element_type	: 'span',
						class_name		: 'blink',
						inner_html		: get_label.procesando || 'Processing',
						parent			: file_info_node
					})

					if(self.caller.model==='component_av') {
						async function check_file() {
							setTimeout(async function(){
								const files_info = await self.get_files_info()
								const found = files_info.find(el => el.quality===quality)
								if (found && found.url) {
									// processing_label.remove()
									// button_build_version.classList.remove('hide')
									self.main_element_quality = quality
									self.refresh({
										build_autoload : false
									})
								}else{
									// check again after 5 sec
									check_file()
								}
							}, 1000)
						}
						check_file()
					}else{
						self.refresh({
							build_autoload : false
						})
					}
				}
				self.node.classList.remove('loading')
			})
		}//end for (let i = 0; i < ar_quality_length; i++)


	return fragment
}//end get_line_build_version



/**
* GET_LINE_CONFORM_HEADERS
* 	Specific component_av feature
* @return DOM node fragment
*/
const get_line_conform_headers = function(ar_quality, self) {

 	const fragment = new DocumentFragment()

 	// main label
		ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'label',
			inner_html		: (get_label.conformar_cabeceras || 'Conform headers'),
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
					class_name		: 'button repair',
					parent			: file_info_node
				})
				button_build_version.addEventListener('click', async function(){
					self.node.classList.add('loading')
					// exec conform_headers
					const result = await self.conform_headers(quality)
					if (result===true) {
						self.main_element_quality = quality
						self.refresh()
					}
					self.node.classList.remove('loading')
				})
			}
		}//end for (let i = 0; i < ar_quality_length; i++)


	return fragment
}//end get_line_conform_headers



/**
* GET_LINE_ROTATE
* 	Specific component_image feature
* @return DOM node fragment
*/
const get_line_rotate = function(ar_quality, self) {

 	const fragment = new DocumentFragment()

 	// main label
		ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'label',
			inner_html		: (get_label.rotar || 'Rotate'),
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

				// left rotate
				const button_rotate_left = ui.create_dom_element({
					element_type	: 'span',
					class_name		: 'button rotate',
					parent			: file_info_node
				})
				button_rotate_left.addEventListener('click', async function(){
					self.node.classList.add('loading')
					// exec rotate
					const result = await self.rotate(quality, -90)
					if (result===true) {
						self.main_element.quality = quality
						self.main_element.refresh()
					}
					self.node.classList.remove('loading')
				})

				// right rotate
				const button_rotate_right = ui.create_dom_element({
					element_type	: 'span',
					class_name		: 'button rotate right',
					parent			: file_info_node
				})
				button_rotate_right.addEventListener('click', async function(){
					self.node.classList.add('loading')
					// exec rotate
					const result = await self.rotate(quality, 90)
					if (result===true) {
						self.main_element.quality = quality
						self.main_element.refresh()
					}
					self.node.classList.remove('loading')
				})
			}
		}//end for (let i = 0; i < ar_quality_length; i++)


	return fragment
}//end get_line_rotate


