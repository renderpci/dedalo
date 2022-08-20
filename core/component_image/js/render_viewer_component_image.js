/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	// import {event_manager} from '../../common/js/event_manager.js'
	import {ui} from '../../common/js/ui.js'



/**
* RENDER_VIEWER_COMPONENT_IMAGE
* Manage the components logic and appearance in client side
*/
export const render_viewer_component_image = function() {

	return true
}//end render_viewer_component_image



/**
* VIEWER
* Render node to be used by service autocomplete or any datalist
* @return DOM node
*/
render_viewer_component_image.prototype.viewer = function() {

	const self = this

	// short vars
		const datalist = self.data.datalist || []

	// wrapper
		const wrapper = ui.component.build_wrapper_mini(self)
			  wrapper.classList.add('component_image')
			  wrapper.classList.add('viewer')

	// url
		const quality		= page_globals.dedalo_image_quality_default // '1.5MB'
		const url_object	= datalist.filter(item => item.quality===quality)[0]
		const url			= (typeof url_object==='undefined')
			? DEDALO_CORE_URL + '/themes/default/0.jpg'
			: url_object.url

	// image
		const image = ui.create_dom_element({
			element_type	: 'img',
			src				: url,
			class_name 		: 'hidden',
			parent			: wrapper
		})
		// ui.component.add_image_fallback(image)

	// image background color
		image.addEventListener('load', set_bg_color, false)
		function set_bg_color() {
			resize_window_to_image_size(image)
			this.removeEventListener('load', set_bg_color, false)
			ui.set_background_image(this, wrapper)
			image.classList.remove('hidden')
		}
	// button download
		const download_image_button = ui.create_dom_element({
			element_type	: 'button',
			class_name 		: 'primary download',
			// value 			: ' ok ',
			parent			: wrapper,
		})
		download_image_button.addEventListener('click', function(e) {
			e.stopPropagation()
			// get the original quality for download
			const original = self.data.datalist.find(item => item.quality==='original')
			// check if the original file exist else get the url of the default image
			const download_url	= (original.file_exist)
				? original.url // original image
				: url // default image

			// get the name of the original file uploaded (user filename)
			// else get the default name
			name = self.data.value[0].original_file_name
				? self.data.value[0].original_file_name
				: self.tipo+'_'+self.section_tipo+'_'+self.section_id

			download_original_image({download_url:download_url, name:name})
		})

	// close window when the user click in the image
		image.addEventListener('mousedown',function () {
			window.close()
		})


	return wrapper
}//end viewer



/**
* RESIZE_WINDOW_TO_IMAGE_SIZE
* create a temp <a> node with the original quality or default quality if the original file is missing
* set the node to be downloadable with the original filename uploaded by user
* download the file
* @param DOM node image
* @return void
*/
const resize_window_to_image_size = function(image) {
	// screen size
		const screen_max_width	= window.screen.availWidth;
		const screen_max_height	= window.screen.availHeight;

	// Image size, get the ratio of the image when the image is more bigger than screen size
		const ratio_h = screen_max_height < image.height
			?  screen_max_height / image.height
			: 1;
		const ratio_w = screen_max_width < image.width
			?  screen_max_width / image.width
			: 1;
		// get the ratio of the most high multiplied
		// (lowest ratio is more difference between sizes; 0.5 > 0.7)
		// ratio 1 is not necessary change the values the change is null
		const ratio		= Math.min(ratio_h, ratio_w, 1)
		const img_h		= image.height * ratio
		// const img_w	= image.width * ratio
		// set one size of the image, it will resize the other size
		image.height	= img_h
		// image.width	= img_w

		// use the image size to be applied to the window size
		const height	= image.height;
		const width		= image.width;

	const tool_bar_height = (window.outerHeight - window.innerHeight) || 50
	window.resizeTo(width, height+tool_bar_height)
}//end resize_window_to_image_size



/**
* DOWNLOAD_ORIGINAL_IMAGE
* create a temp <a> node with the original quality or default quality if the original file is missing
* set the node to be downloadable with the original filename uploaded by user
* download the file
* @return bool
*/
const download_original_image = function (options) {

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
}//end download_original_image
