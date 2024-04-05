// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL, tool_media_versions */
/*eslint no-undef: "error"*/



// imports
	import {event_manager} from '../../../core/common/js/event_manager.js'
	import {ui} from '../../../core/common/js/ui.js'
	import {bytes_format, download_file, open_window} from '../../../core/common/js/utils/index.js'
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
* @return HTMLElement wrapper
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


	return wrapper
}//end edit



/**
* GET_CONTENT_DATA
* Render tool body or 'content_data'
* @param instance self
* @return HTMLElement content_data
*/
const get_content_data = async function(self) {

	// DocumentFragment
		const fragment = new DocumentFragment()

	// main_element_container
		const main_element_container = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'main_element_container',
			parent			: fragment
		})
		// show_interface
		self.main_element.show_interface.tools = false
		self.main_element.show_interface.read_only = true
		// render
		self.main_element.render()
		.then(function(component_node){
			main_element_container.appendChild(component_node)
		})
		// fix
		self.main_element_container = main_element_container

	// render_sync_data
		const sync_data = render_sync_data(self)
		if (sync_data) {
			fragment.appendChild(sync_data)
		}

	// versions_container
		const versions_grid = render_versions_grid(self)
		fragment.appendChild(versions_grid)

	// content_data
		const content_data = ui.tool.build_content_data(self)
		content_data.appendChild(fragment)


	return content_data
}//end get_content_data



/**
* RENDER_SYNC_DATA
* @param object self
* @return HTMLElement|null
*/
const render_sync_data = function(self) {

	// files info from DB data
		const files_info_db = self.files_info_db || []

	// files info from disk
		const files_info_disk = self.files_info_disk || []

	// is_sync
		const is_sync = files_info_db.length === files_info_disk.length

	// debug
		if(SHOW_DEBUG===true) {
			console.log('files_info_db:', files_info_db);
			console.log('files_info_disk:', files_info_disk);
		}

	// sync_data_wrapper
		const sync_data_wrapper = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'sync_data_wrapper'
		})

		// versions_container
			const versions_container = ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'sync_data_container',
				parent			: sync_data_wrapper
			})

		// icon
			const icon = ui.create_dom_element({
				element_type	: 'span',
				class_name		: 'button icon ' + (is_sync ? 'eye' : 'exclamation'),
				parent			: versions_container
			})
			icon.addEventListener('click', function(e) {
				e.stopPropagation()
				pre_data.classList.toggle('hide')
			})

		// label
			const label_string = !is_sync
				? self.get_tool_label('files_info_is_unsync') || 'Files info data is unsync'
				: self.get_tool_label('show_data') || 'Show data'
			const label_node = ui.create_dom_element({
				element_type	: 'span',
				class_name		: 'label',
				inner_html		: label_string,
				parent			: versions_container
			})
			label_node.addEventListener('click', (e)=> {
				icon.click(e)
			})


		// button_sync
			const button_sync = ui.create_dom_element({
				element_type	: 'button',
				class_name		: 'gear button_sync_data ' + (is_sync ? 'light' : 'warning'),
				inner_html		: self.get_tool_label('sync_data') || 'Sync data',
				parent			: versions_container
			})
			button_sync.addEventListener('click', function(e) {
				e.stopPropagation()

				// confirm dialog
				if ( !confirm( (get_label.sure || 'Sure?') ) ) {
					return false
				}

				versions_container.classList.add('loading')

				self.sync_files()
				.then(function(response){
					if (response.result===true) {
						self.refresh()
					}else{
						versions_container.classList.remove('loading')
						alert('Error: ' + (response.msg || 'Unknown') )
					}
				})
			})

		// pre JSON data
			const pre_data = ui.create_dom_element({
				element_type	: 'pre',
				class_name		: 'pre hide',
				inner_html		: JSON.stringify({
					files_info_db	: files_info_db,
					files_info_disk	: files_info_disk
				}, null, 2),
				parent			: sync_data_wrapper
			})


	return sync_data_wrapper
}//end render_sync_data



/**
* RENDER_VERSIONS_GRID
* @param object self
* @return HTMLElement
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
		versions_container.appendChild( get_line_file(ar_quality, self) )

	// line_file_open
		versions_container.appendChild( get_line_file_open(ar_quality, self) )

	// line_file_extension
		// versions_container.appendChild( get_line_file_extension(ar_quality, self) )

	// line_file_size
		versions_container.appendChild( get_line_file_size(ar_quality, self) )

	// line_file_upload
		versions_container.appendChild( get_line_file_upload(ar_quality, self) )

	// line_file_download
		versions_container.appendChild( get_line_file_download(ar_quality, self) )

	// line_alternative_extensions
		// if(self.main_element.context.features.alternative_extensions) {
		// 	versions_container.appendChild( get_line_alternative_extensions(ar_quality, self) )
		// }

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
* @param array ar_quality
* @param object self
* @return HTMLElement fragment
*/
const get_line_labels = function(ar_quality, self) {

	// DocumentFragment
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

			const file_info_node = ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'file_info' + (quality===self.main_element.context.features.default_quality ? ' default' : ''),
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
* GET_LINE_FILE
* @param array ar_quality
* @param object self
* @return HTMLElement fragment
*/
const get_line_file = function(ar_quality, self) {

	// DocumentFragment
 		const fragment = new DocumentFragment()

 	// main label
		ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'label',
			inner_html		: get_label.file || 'File',
			parent			: fragment
		})

	// info columns
		const ar_quality_length = ar_quality.length
		for (let i = 0; i < ar_quality_length; i++) {

			const quality = ar_quality[i]

			const file_info_node = ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'file_info' + (quality===self.main_element.context.features.default_quality ? ' default' : ''),
				parent			: fragment
			})

			// file_info
			const file_info = self.files_info_safe.find(el => el.quality===quality)

			if (file_info && file_info.file_exist===true) {
				if (file_info.file_path) {
					const button_file_av = ui.create_dom_element({
						element_type	: 'span',
						class_name		: 'button media',
						parent			: file_info_node
					})
					button_file_av.addEventListener('click', async function(e) {
						e.stopPropagation()

						self.node.classList.add('loading')
						// change component av quality and refresh
						self.main_element.quality = quality
						await self.main_element.refresh()
						self.node.classList.remove('loading')
					})
				}else{
					// const extension = file_info.file_path.split(".").pop();
					ui.create_dom_element({
						element_type	: 'span',
						class_name		: '',
						inner_html		: `-`,
						parent			: file_info_node
					})
				}
			}//end if (file_info.file_path) {
		}//end for (let i = 0; i < ar_quality_length; i++)


	return fragment
}//end get_line_file



/**
* GET_LINE_FILE_OPEN
* @param array ar_quality
* @param object self
* @return HTMLElement fragment
*/
const get_line_file_open = function(ar_quality, self) {

	// DocumentFragment
 		const fragment = new DocumentFragment()

 	// main label
		ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'label',
			inner_html		: get_label.open || 'Open',
			parent			: fragment
		})

	// info columns
		const ar_quality_length = ar_quality.length
		for (let i = 0; i < ar_quality_length; i++) {

			const quality = ar_quality[i]

			const file_info_node = ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'file_info' + (quality===self.main_element.context.features.default_quality ? ' default' : ''),
				parent			: fragment
			})

			// file_info
			const file_info = self.files_info_safe.find(el => el.quality===quality)

			if (file_info && file_info.file_exist===true) {

				// file_url
				const file_url = DEDALO_MEDIA_URL + file_info.file_path

				// icon file
				const link = ui.create_dom_element({
					element_type	: 'a',
					class_name		: 'button find',
					parent			: file_info_node
				})
				link.addEventListener('click', function(e) {
					e.stopPropagation()

					open_window({
						url : file_url
					})
				})
			}
		}


	return fragment
}//end get_line_file_open



/**
* GET_LINE_FILE_EXTENSION
* @param array ar_quality
* @param object self
* @return HTMLElement fragment
*/
const get_line_file_extension = function(ar_quality, self) {

	// DocumentFragment
 		const fragment = new DocumentFragment()

 	// main label
		ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'label',
			inner_html		: get_label.extension || 'Extension',
			parent			: fragment
		})

	// info columns
		const ar_quality_length = ar_quality.length
		for (let i = 0; i < ar_quality_length; i++) {

			const quality = ar_quality[i]

			const file_info_node = ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'file_info' + (quality===self.main_element.context.features.default_quality ? ' default' : ''),
				parent			: fragment
			})

			// file_info
			const file_info = (quality==='original' && self.file_info_normalized_name)
				? self.file_info_normalized_name
				: self.files_info_safe.find(el => el.quality===quality)

			if (file_info && file_info.file_exist===true) {

				const extension = file_info.file_path.split('.').pop();

				// icon file
				ui.create_dom_element({
					element_type	: 'span',
					class_name		: '',
					inner_html		: extension,
					parent			: file_info_node
				})
			}
		}//end for (let i = 0; i < ar_quality_length; i++)


	return fragment
}//end get_line_file_extension



/**
* GET_LINE_FILE_SIZE
* @param array ar_quality
* @param object self
* @return HTMLElement fragment
*/
const get_line_file_size = function(ar_quality, self) {

	// DocumentFragment
 		const fragment = new DocumentFragment()

 	// main label
		ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'label',
			inner_html		: get_label.size || 'Size',
			parent			: fragment
		})

	const custom_files_info	= self.files_info_safe.concat(self.files_info_alternative)

	// info columns
		const ar_quality_length = ar_quality.length
		for (let i = 0; i < ar_quality_length; i++) {

			const quality = ar_quality[i]

			// file_info
			const file_info = custom_files_info.find(el => el.quality===quality)

			const file_info_node = ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'file_info' + (quality===self.main_element.context.features.default_quality ? ' default' : ''),
				parent			: fragment
			})

			if (file_info && file_info.file_exist===true) {

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
		}//end for (let i = 0; i < ar_quality_length; i++)


	return fragment
}//end get_line_file_size



/**
* GET_LINE_ALTERNATIVE_EXTENSIONS
* @param array ar_quality
* @param object self
* @return HTMLElement fragment
*/
const get_line_alternative_extensions = function(ar_quality, self) {

	// DocumentFragment
 		const fragment = new DocumentFragment()

 	// main label
		ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'label',
			inner_html		: get_label.alternative_extensions || 'Alt. extensions',
			parent			: fragment
		})

	// short vars
		const value_files_info				= self.files_info_alternative
		const extension						= self.main_element.context.features.extension
		const alternative_extensions		= self.main_element.context.features.alternative_extensions
		const alternative_extensions_length	= alternative_extensions.length

	const ar_quality_length = ar_quality.length
	for (let i = 0; i < ar_quality_length; i++) {

		const quality = ar_quality[i]

		const file_info_container = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'file_info' + (quality===self.main_element.context.features.default_quality ? ' default' : ''),
			parent			: fragment
		})

		// info columns
		for (let j = 0; j < alternative_extensions_length; j++) {

			const alternative_extension = alternative_extensions[j]

			// files_info
			const file_info = value_files_info.find(el => el.quality===quality && el.extension===alternative_extension)
			if (file_info) {

					const cell_node = ui.create_dom_element({
						element_type	: 'div',
						class_name		: 'cell_node',
						parent			: file_info_container
					})

					const button_download = ui.create_dom_element({
						element_type	: 'span',
						class_name		: 'button download',
						title			: get_label.download || 'Download',
						parent			: cell_node
					})
					button_download.addEventListener('click', function(e) {
						e.stopPropagation();
						const file_url = DEDALO_MEDIA_URL + file_info.file_path
						open_window({
							url : file_url
						})
					})

					ui.create_dom_element({
						element_type	: 'span',
						class_name		: 'file_info_extension',
						inner_html		: file_info.extension,
						parent			: cell_node
					})
			}
		}
	}//end for (let i = 0; i < ar_quality_length; i++)


	return fragment
}//end get_line_alternative_extensions



/**
* GET_LINE_FILE_UPLOAD
* @param array ar_quality
* @param object self
* @return HTMLElement fragment
*/
const get_line_file_upload = function(ar_quality, self) {

	// DocumentFragment
 		const fragment = new DocumentFragment()

 	// main label
		ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'label',
			inner_html		: get_label.upload || 'Upload',
			parent			: fragment
		})

	// info columns
		const ar_quality_length = ar_quality.length
		for (let i = 0; i < ar_quality_length; i++) {

			const quality = ar_quality[i]

			// file_info
				// const file_info = self.files_info.find(el => el.quality===quality)

			const file_info_node = ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'file_info' + (quality===self.main_element.context.features.default_quality ? ' default' : ''),
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
* GET_LINE_FILE_DOWNLOAD
* @param array ar_quality
* @param object self
* @return HTMLElement fragment
*/
const get_line_file_download = function(ar_quality, self) {

	// DocumentFragment
 		const fragment = new DocumentFragment()

 	// main label
		ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'label',
			inner_html		: get_label.download || 'Download',
			parent			: fragment
		})

	// custom_files_info. Include non original and files_info_alternative quality
		const raw_custom_files_info	= self.files_info_safe.concat(self.files_info_alternative)
		// remove duplicates
		const object_files_info = {}
		const raw_custom_files_info_length = raw_custom_files_info.length
		for (let i = 0; i < raw_custom_files_info_length; i++) {
			const el = raw_custom_files_info[i]
			object_files_info[el.quality +'_'+ el.extension] = el
		}
		const custom_files_info = Object.values(object_files_info)

	// info columns
		const ar_quality_length = ar_quality.length
		for (let i = 0; i < ar_quality_length; i++) {

			const quality = ar_quality[i]

			// file_info_node
				const file_info_node = ui.create_dom_element({
					element_type	: 'div',
					class_name		: 'file_info' + (quality===self.caller.context.features.default_quality ? ' default' : ''),
					parent			: fragment
				})

			const files_info = custom_files_info.filter(el => el.quality===quality)

			const files_info_length = files_info.length
			for (let k = 0; k < files_info_length; k++) {

				const file_info = files_info[k]

				// file_info
					// const file_info = (quality==='original' && self.file_info_normalized_name)
					// 	? self.file_info_normalized_name
					// 	: self.files_info_safe.find(el => el.quality===quality)

				// extension
					const extension	= file_info && file_info.file_path
						? file_info.file_path.split('.').pop()
						: null;

				// download button
					if (file_info && file_info.file_exist===true) {

						const cell_node = ui.create_dom_element({
							element_type	: 'div',
							class_name		: 'cell_node',
							parent			: file_info_node
						})

						const button_file_download = ui.create_dom_element({
							element_type	: 'span',
							class_name		: 'button download',
							title			: get_label.download || 'Download',
							parent			: cell_node
						})
						button_file_download.addEventListener('click', function(e){
							e.stopPropagation()

							const url		= DEDALO_MEDIA_URL + file_info.file_path
							const file_name	= `dedalo_download_${quality}_` + url.substring(url.lastIndexOf('/')+1);

							download_file({
								url			: url,
								file_name	: file_name
							})
						})

						ui.create_dom_element({
							element_type	: 'span',
							class_name		: 'file_info_extension',
							inner_html		: extension,
							parent			: cell_node
						})
					}
			}//end for (let k = 0; k < files_info_length; k++)
		}//end if (file_info.file_exist===true)


	return fragment
}//end get_line_file_download



/**
* GET_LINE_FILE_DELETE
* @param array ar_quality
* @param object self
* @return HTMLElement fragment
*/
const get_line_file_delete = function(ar_quality, self) {

	// DocumentFragment
 		const fragment = new DocumentFragment()

 	// main label
		ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'label',
			inner_html		: get_label.delete || 'Delete',
			parent			: fragment
		})

	// custom_files_info. Include non original and original quality
		const custom_files_info = self.files_info_safe.concat(self.files_info_original)

	// info columns
		const ar_quality_length = ar_quality.length
		for (let i = 0; i < ar_quality_length; i++) {

			const quality = ar_quality[i]

			const file_info_node = ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'file_info' + (quality===self.caller.context.features.default_quality ? ' default' : ''),
				parent			: fragment
			})

			// file_info
				const file_info = custom_files_info.find(el => el.quality===quality)
				// const file_info = (quality==='original' && self.file_info_normalized_name)
				// 	? self.file_info_normalized_name
				// 	: custom_files_info.find(el => el.quality===quality)

				if (file_info && file_info.file_exist===true) {

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
		}//end for (let i = 0; i < ar_quality_length; i++)


	return fragment
}//end get_line_file_delete



/**
* GET_LINE_BUILD_VERSION
* @param array ar_quality
* @param object self
* @return HTMLElement fragment
*/
const get_line_build_version = function(ar_quality, self) {

	// DocumentFragment
 		const fragment = new DocumentFragment()

 	// main label
		ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'label',
			inner_html		: (get_label.build || 'Build') + ' ' + (get_label.version || 'version'),
			parent			: fragment
		})

	// info columns
		const ar_quality_length = ar_quality.length
		for (let i = 0; i < ar_quality_length; i++) {

			const quality = ar_quality[i]

			// file_info
				const file_info_node = ui.create_dom_element({
					element_type	: 'div',
					class_name		: 'file_info' + (quality===self.main_element.context.features.default_quality ? ' default' : ''),
					parent			: fragment
				})

			// exclude original quality button from list
				if (quality==='original') {
					continue;
				}

			// button_build_version
				const button_build_version = ui.create_dom_element({
					element_type	: 'span',
					class_name		: 'button gear',
					parent			: file_info_node
				})
				const fn_click = async function (e) {
					e.stopPropagation()

					self.node.classList.add('loading')

					// exec build_version
					const result = await self.build_version(quality)
					if (result===true) {

						// building
						button_build_version.remove()

						ui.create_dom_element({
							element_type	: 'span',
							class_name		: 'blink',
							inner_html		: get_label.processing || 'Processing',
							parent			: file_info_node
						})

						switch (self.main_element.model) {

							case 'component_av': {
								const check_file = async function() {

									if (self.timer) {
										clearTimeout(self.timer);
									}

									const files_info	= await self.get_files_info()
									const found			= files_info.find(el => el.quality===quality)
									if (found && found.file_exist===true) {
										// processing_label.remove()
										// button_build_version.classList.remove('hide')
										self.main_element_quality = quality

										// force save component to update dato files_info
										// Note that action 'force_save' do not save data really and do not need more
										// properties, is only to allow API exec component save transparently
											await self.main_element.save([{
												action : 'force_save'
											}])

										self.refresh({
											build_autoload : false
										})
									}else{
										// check again after 5 sec
										self.timer = setTimeout(async function(){
											check_file()
										}, 2000)
									}
								}
								check_file()
								break;
							}
							default:
								setTimeout(async function(){
									self.refresh({
										build_autoload : false
									})
								}, 1)
								break;
						}
					}
					self.node.classList.remove('loading')
				}
				button_build_version.addEventListener('click', fn_click)
		}//end for (let i = 0; i < ar_quality_length; i++)


	return fragment
}//end get_line_build_version



/**
* GET_LINE_CONFORM_HEADERS
* 	Specific component_av feature
* @param array ar_quality
* @param object self
* @return HTMLElement fragment
*/
const get_line_conform_headers = function(ar_quality, self) {

	// DocumentFragment
 		const fragment = new DocumentFragment()

 	// main label
		ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'label',
			inner_html		: (get_label.conform_headers || 'Conform headers'),
			parent			: fragment
		})

	// info columns
		const ar_quality_length = ar_quality.length
		for (let i = 0; i < ar_quality_length; i++) {

			const quality = ar_quality[i]

			// file_info_node
				const file_info_node = ui.create_dom_element({
					element_type	: 'div',
					class_name		: 'file_info' + (quality===self.main_element.context.features.default_quality ? ' default' : ''),
					parent			: fragment
				})


			// file_info
			const file_info = self.files_info_safe.find(el => el.quality===quality)

			if (file_info && quality!=='original' && file_info.file_exist===true) {

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
* @param array ar_quality
* @param object self
* @return HTMLElement fragment
*/
const get_line_rotate = function(ar_quality, self) {

	// DocumentFragment
 		const fragment = new DocumentFragment()

 	// main label
		ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'label',
			inner_html		: (get_label.rotate || 'Rotate'),
			parent			: fragment
		})

	// info columns
		const ar_quality_length = ar_quality.length
		for (let i = 0; i < ar_quality_length; i++) {

			const quality = ar_quality[i]

			const file_info_node = ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'file_info' + (quality===self.main_element.context.features.default_quality ? ' default' : ''),
				parent			: fragment
			})

			// file_info
			const file_info = self.files_info_safe.find(el => el.quality===quality)

			if (file_info && file_info.file_exist===true) {

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



// @license-end
