/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	// import {event_manager} from '../../common/js/event_manager.js'
	import {ui} from '../../common/js/ui.js'



/**
* RENDER_VIEWER_COMPONENT_AV
* Manage the components logic and appearance in client side
*/
export const render_viewer_component_av = function() {

	return true
}//end render_viewer_component_av



/**
* VIEWER
* Render node to be used by service autocomplete or any datalist
* @return DOM node
*/
render_viewer_component_av.prototype.viewer = async function() {

	const self = this

	// short vars
		const datalist = self.data.datalist || []

	// wrapper
		const wrapper = ui.component.build_wrapper_mini(self)
		wrapper.classList.add('component_av')
		wrapper.classList.add('viewer')

	// url
		const quality		= page_globals.dedalo_av_quality_default // '404'
		const url_object	= datalist.filter(item => item.quality===quality)[0]
		const url			= (typeof url_object==="undefined")
			? DEDALO_CORE_URL + "/themes/default/0.jpg"
			: url_object.url

	// media_component
		self.mode = 'player'
		const media_player_node = await self.render();
		wrapper.appendChild(media_player_node)

	// button download
		const download_image_button = ui.create_dom_element({
			element_type	: "button",
			class_name 		: 'primary download',
			// value 			: ' ok ',
			parent			: wrapper,
		})
		download_image_button.addEventListener('click', function(evt) {
			// get the original quality for download
			const original = datalist.find(item => item.quality==='original')
			// check if the original file exist else get the url of the default image
			const download_url	= (original.file_exist)
				? original.url // original image
				: url // default image

			// get the name of the original file uploaded (user filename)
			// else get the default name
			name = self.data.value[0].original_file_name
				? self.data.value[0].original_file_name
				: self.tipo+'_'+self.section_tipo+'_'+self.section_id

			download_original_av({download_url:download_url, name:name})
		})

	return wrapper
}//end viewer

/**
* DOWNLOAD_ORIGINAL_IMAGE
* create a temp <a> node with the original quality or default quality if the original file is missing
* set the node to be downloadable with the original filename uploaded by user
* download the file
* @return bool
*/
const download_original_av = function (options) {

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
}// end download_original_av
