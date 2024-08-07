// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	// import {event_manager} from '../../common/js/event_manager.js'
	import {download_file} from '../../common/js/utils/index.js'
	import {ui} from '../../common/js/ui.js'



/**
* VIEW_VIEWER_IMAGE
* Manage the components logic and appearance in client side
*/
export const view_viewer_image = function() {

	return true
}//end view_viewer_image



/**
* RENDER
* Render node to be used by service autocomplete or any list
* @param object self
* @param object options
* @return HTMLElement wrapper
*/
view_viewer_image.render = function(self, options) {

	// short vars
		const data			= self.data || {}
		const value			= data.value || []
		const files_info	= value[0]
			? (value[0].files_info || [])
			: []
		const external_source	= data.external_source
		const extension			= self.context.features.extension

	// wrapper
		// const wrapper = ui.component.build_wrapper_mini(self)
		const wrapper = document.createElement('div')
			  wrapper.classList.add('component_image')
			  wrapper.classList.add('view_viewer')

	// url
		const quality	= page_globals.dedalo_image_quality_default // '1.5MB'
		const file_info	= files_info.find(el => el.quality===quality && el.extension===extension)
		const url		= external_source
			? external_source
			: file_info
				? DEDALO_MEDIA_URL + file_info.file_path + '?t=' + (new Date()).getTime()
				: page_globals.fallback_image

	// image
		const image = ui.create_dom_element({
			element_type	: 'img',
			class_name		: 'viewer_image hidden',
			parent			: wrapper
		})
		// ui.component.add_image_fallback(image)

		// mousedown event
			image.addEventListener('mousedown', function() {
				window.close()
			})

		// image background color
			image.addEventListener('load', set_bg_color, false)
			function set_bg_color() {
				// if (image.src.indexOf(thumb_url)!==-1) {
				// 	return
				// }
				resize_window_to_image_size(image)
				this.removeEventListener('load', set_bg_color, false)
				// ui.set_background_image(this, wrapper)
				image.classList.remove('hidden')
				image.classList.add('fit')

				// show download_image_button
				// only if the user has permissions
				if(self.permissions > 1){
					download_image_button.classList.remove('hidden')
				}

			}

		// error event
			image.addEventListener('error', function(){
				if (image.src!==page_globals.fallback_image) {
					image.src = page_globals.fallback_image
				}
			}, false)

		// set url
			image.src = url

	// button download
		const download_image_button = ui.create_dom_element({
			element_type	: 'button',
			class_name		: 'primary download hidden',
			title			: get_label.download || 'Download',
			// value		: ' ok ',
			parent			: wrapper
		})
		download_image_button.addEventListener('click', function(e) {
			e.stopPropagation()

			// get the original quality for download
			const original = files_info.find(el => el.quality==='original' && el.extension===extension)

			// check if the original file exist else get the url of the default image
			const download_url	= (original.file_exist)
				? DEDALO_MEDIA_URL + original.file_path + '?t=' + (new Date()).getTime() // original image
				: url // default image

			// get the name of the original file uploaded (user filename)
			// else get the default name
			name = self.data.value[0].original_file_name
				? self.data.value[0].original_file_name
				: self.tipo+'_'+self.section_tipo+'_'+self.section_id

			download_original_image({
				download_url	: download_url,
				name			: name
			})
		})


	return wrapper
}//end render



/**
* RESIZE_WINDOW_TO_IMAGE_SIZE
* create a temp <a> node with the original quality or default quality if the original file is missing
* set the node to be downloadable with the original filename uploaded by user
* download the file
* @param HTMLElement image
* @return boo
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
			? screen_max_width / image.width
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
		// console.log('width:', width, 'height:', height);
		// console.log('tool_bar_height:', tool_bar_height);

	window.resizeTo(width, height+tool_bar_height)


	return true
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

	download_file({
		url			: download_url,
		file_name	: `dedalo_download_` + name
	})

	return true
}//end download_original_image



// @license-end
