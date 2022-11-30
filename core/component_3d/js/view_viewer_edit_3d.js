/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	// import {event_manager} from '../../common/js/event_manager.js'
	import {ui} from '../../common/js/ui.js'
	import {get_content_data_player} from './view_player_edit_3d.js'



/**
* VIEW_VIEWER_EDIT_3D
* Manage the components logic and appearance in client side
*/
export const view_viewer_edit_3d = function() {

	return true
}//end view_viewer_edit_3d



/**
* RENDER
* Render node to be used by service autocomplete or any datalist
* @return DOM node
*/
view_viewer_edit_3d.render = async function(self, options) {

	// short vars
		const datalist = self.data.datalist || []

	// wrapper
		const wrapper = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'wrapper_component component_3d viewer'
		})

	// url
		const quality		= page_globals.dedalo_3d_quality_default // 'original'
		const url_object	= datalist.filter(item => item.quality===quality)[0]
		const url			= (typeof url_object==='undefined')
			? DEDALO_CORE_URL + '/themes/default/0.jpg'
			: url_object.file_url

	// wrapper background color from posterframe image
		const posterframe_url = self.data.posterframe_url || page_globals.fallback_image
		const image = ui.create_dom_element({
			element_type	: 'img',
			src				: posterframe_url
		})
		image.addEventListener('load', set_bg_color, false)
		function set_bg_color() {
			this.removeEventListener('load', set_bg_color, false)
			ui.set_background_image(this, wrapper)
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
			class_name		: 'primary download',
			parent			: wrapper
		})
		download_image_button.addEventListener('click', function() {

			// get the original quality for download
			const original = datalist.find(item => item.quality==='original')

			// check if the original file exist else get the url of the default image
			const download_url	= (original.file_exist)
				? original.file_url // original image
				: url // default image

			// get the name of the original file uploaded (user filename)
			// else get the default name
			const name = self.data.value[0].original_file_name
				? self.data.value[0].original_file_name
				: self.tipo+'_'+self.section_tipo+'_'+self.section_id

			download_original_3d({
				download_url : download_url,
				name : name
			})
		})


	return wrapper
}//end render



/**
* DOWNLOAD_ORIGINAL_IMAGE
* create a temp <a> node with the original quality or default quality if the original file is missing
* set the node to be downloadable with the original filename uploaded by user
* download the file
* @return bool
*/
const download_original_3d = function (options) {

	const download_url	= options.download_url
	const name			= options.name

	// Create a temporal 'a' element and click it
	const download_image_temp = document.createElement('a');
		  download_image_temp.href = download_url
		  download_image_temp.setAttribute('download', name);
		  download_image_temp.style.display = 'none';
	document.body.appendChild(download_image_temp);
	// do click to the image to be downloaded
	download_image_temp.click();
	// remove the temp node
	document.body.removeChild(download_image_temp);

	return true
}// end download_original_3d
