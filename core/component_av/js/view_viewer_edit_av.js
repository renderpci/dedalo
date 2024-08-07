// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {url_vars_to_object, download_file} from '../../common/js/utils/index.js'
	import {ui} from '../../common/js/ui.js'
	import {
		get_content_data_player
	} from './view_player_edit_av.js'



/**
* VIEW_VIEWER_EDIT_AV
* Manage the components logic and appearance in client side
*/
export const view_viewer_edit_av = function() {

	return true
}//end view_viewer_edit_av



/**
* RENDER
* Render node to be used by service autocomplete
* @param object self
* @param object options
* @return HTMLElement wrapper
*/
view_viewer_edit_av.render = async function(self, options) {

	// short vars
		const data			= self.data || {}
		const value			= data.value || []
		const files_info	= value[0]
			? (value[0].files_info || [])
			: []
		const extension		= self.context.features.extension

	// wrapper
		const wrapper = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'wrapper_component component_av view_viewer'
		})

	// permissions
	// set read only permissions, remove the context menu
		if(self.permissions < 2){
			wrapper.addEventListener("contextmenu", (e) => {
				e.preventDefault();
				return false
			});
		}

	// url to download
		const quality	= page_globals.dedalo_av_quality_default // '404'
		const file_info	= files_info.find(el => el.quality===quality && el.extension===extension)
		const url		= file_info
			? DEDALO_MEDIA_URL + file_info.file_path + '?t=' + (new Date()).getTime()
			: page_globals.fallback_image

	// wrapper background color from posterframe image
		const posterframe_url = self.data.posterframe_url
			? self.data.posterframe_url + '?t=' + (new Date()).getTime()
			: page_globals.fallback_image
		const image = ui.create_dom_element({
			element_type : 'img'
		})
		image.addEventListener('error', function(e) {
			if (image.src!==page_globals.fallback_image) {
				image.src = page_globals.fallback_image
			}
		})
		image.src = posterframe_url

		// set the parameter when the posterframe is loaded
			image.addEventListener('load', function(e) {

				// show download_image_button
				// only if the user has permissions
				if(self.permissions > 1){
					download_image_button.classList.remove('hidden')
				}
			})

	// fragment. if url params contains tc_in, set a fragment
		const url_vars = url_vars_to_object(window.location.search)
		if (url_vars && url_vars.tc_in) {
			self.fragment = {
				tc_in	: url_vars.tc_in,
				tc_out	: url_vars.tc_out
			}
		}

	// media_component player
		const media_player_node = get_content_data_player({
			self					: self,
			with_control_buttons	: false
		})
		wrapper.appendChild(media_player_node)

	// button download
		const download_image_button = ui.create_dom_element({
			element_type	: 'button',
			class_name		: 'primary download hidden',
			title			: get_label.download || 'Download',
			parent			: wrapper
		})
		download_image_button.addEventListener('click', function(e) {
			e.stopPropagation()

			// get the original quality for download
			const original = files_info.find(item => item.quality==='original')

			// check if the original file exist else get the url of the default image
			const download_url = original && original.file_exist
				? DEDALO_MEDIA_URL + original.file_path + '?t=' + (new Date()).getTime()
				: url // default image

			// get the name of the original file uploaded (user filename)
			// else get the default name
			const name = self.data.value[0].original_file_name
				? self.data.value[0].original_file_name
				: self.tipo+'_'+self.section_tipo+'_'+self.section_id

			download_original_av({
				download_url : download_url,
				name : name
			})
		})


	return wrapper
}//end render



/**
* DOWNLOAD_ORIGINAL_IMAGE
* Creates a temp <a> node with the original quality or default quality if the original file is missing
* set the node to be downloadable with the original filename uploaded by user
* download the file
* @param object options
* {
* 	download_url: string
* 	name: string
* }
* @return bool
*/
const download_original_av = function (options) {

	const download_url	= options.download_url
	const name			= options.name

	download_file({
		url			: download_url,
		file_name	: `dedalo_download_` + name
	})

	return true
}// end download_original_av



// @license-end
