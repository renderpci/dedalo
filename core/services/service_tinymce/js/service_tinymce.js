/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {event_manager} from '../../../common/js/event_manager.js'
	import {ui} from '../../../common/js/ui.js'
	import {observe_changes} from '../../../common/js/utils.js'
	import {common} from '../../../common/js/common.js'



/**
* SERVICE_TINYMCE
* Used as service by component_text_area
*/
export const service_tinymce = function() {



	// self vars
		this.caller
		this.container
		this.dd_tinny
		this.key
		this.options
		this.editor



	/**
	* INIT
	*/
	this.init = async function (caller, container, options) {

		const self = this

		// fix vars
			this.caller 	= caller
			this.container 	= container
			this.options 	= options
			this.key 		= options.key

		// editor options
			const toolbar = options.editor_config.toolbar
				|| "bold italic underline undo redo searchreplace pastetext code fullscreen | button_save"
			const plugins = options.editor_config.plugins
				|| ["paste","image","print","searchreplace","code","fullscreen","noneditable"] // "wordcount"

		// dd-tiny dom element (cusmtomHTML element)
			const dd_tinny = document.createElement('dd-tiny');
				  dd_tinny.style.opacity = 0 // on init the editor, will be set to 1

		// store
			self.dd_tinny = dd_tinny

		// dd-tiny options (to config editor)
			dd_tinny.options = {
				// called when tinymce editor is ready
				onsetup_editor  		: this.onsetup_editor.bind(this),
				value  	 				: options.value,
				toolbar  				: toolbar,
				plugins 				: plugins,
				container 				: container
			}

		// add to dom
			container.appendChild(dd_tinny)



		return true
	}//end init



	/**
	* SAVE
	* Trigger save_value against caller sending key and value
	* @param string previous_value
	*	Used to compare changes in editor value.
	*	Current svaed value for current key data
	* @return bool
	*/
	this.save = function(previous_value) {

		const self = this

		const editor = self.editor
		const key 	 = self.key

		// no user interactions case
		if (editor.isDirty()!==true) {
			return false
		}

		const value = editor.getContent({format:'raw'})

		// no changes in value found
		if (previous_value===value) {
			return false
		}

		self.caller.save_value(key, value)

		return true
	};//end save



	/**
	* ADD_EDITOR_BUTTONS
	* @return array buttons_added
	*/
	this.add_editor_buttons = function() {

		const editor = this.editor

		const custom_buttons 		= this.options.editor_config.custom_buttons
		const custom_buttons_length = (custom_buttons) ? custom_buttons.length : 0
		for (let i = 0; i < custom_buttons_length; i++) {

			const options = custom_buttons[i].options

			// button add
			editor.addButton(custom_buttons[i].name, options)
		}

		return custom_buttons
	};//end add_editor_buttons



	/**
	* ONSETUP_EDITOR
	* callback when tinymce is ready
	* @return true
	*/
	this.onsetup_editor = function(editor) {

		const self = this

		// fix vars
			this.editor = editor

		const custom_events = this.options.editor_config.custom_events || {}


		// additional buttons
			this.add_editor_buttons()


		// focus event
			editor.on('focus', function(evt) {
				// Force not dirty state
				editor.isNotDirty = true;

				if (custom_events.focus) {
					custom_events.focus(evt, {})
				}
			});//end focus event


		// blur event
			editor.on('blur', function(evt) {
				if (custom_events.blur) {
					custom_events.blur(evt, {
						key 	: self.key,
						value 	: editor.getContent({format:'raw'}),
						isDirty : editor.isDirty()
					})
				}
			});//end blur event


		// click event
			editor.on('click', function(evt) {
				if (custom_events.click) {
					custom_events.click(evt, {

					})
				}
			});//end click event


		// MouseUp
			editor.on('MouseUp', function(evt) {
				if (custom_events.MouseUp) {
					custom_events.MouseUp(evt, {
						selection : editor.selection.getContent({format:'text'})
					})
				}
			});//end click event


		// KeyPress
			// prevent that user insert special reserved chars
			const minor_than_code 	= 60 // <
			const more_than_code  	= 62 // >
			const prevent_chars 	= [minor_than_code, more_than_code]
			editor.on('KeyPress', function(evt) {
				if(prevent_chars.indexOf(evt.keyCode)!==-1) {
					evt.preventDefault()
					// when keyCode is detected, will be changed for save char
					switch(evt.keyCode) {
						case minor_than_code:
							editor.insertContent("[") // < to [
							break;
						case more_than_code:
							editor.insertContent("]") // > to ]
							break;
					}
					alert("Warning! This key is reserved and will be replaced for safe char. Key: " + evt.key + " ["+evt.keyCode+"]" );
				}

				if (custom_events.KeyPress) {
					custom_events.KeyPress(evt, {})
				}
			})//end KeyPress


		// KeyUp
			editor.on('KeyUp', function(evt) {
				if (custom_events.KeyUp) {
					custom_events.KeyUp(evt, {})
				}
			})


		// init
			editor.on('init', function(evt) {

				const container_height  = self.dd_tinny.offsetHeight; // self.container

				const toolbar			= self.dd_tinny.querySelector('.mce-toolbar-grp') // mce-toolbar-grp mce-container mce-panel mce-stack-layout-item mce-first
				const toolbar_height 	= toolbar ? toolbar.offsetHeight : 0

				const statusbar 		= self.dd_tinny.querySelector('.mce-statusbar') // mce-statusbar mce-container mce-panel mce-stack-layout-item mce-last
				const statusbar_height  = statusbar ? statusbar.offsetHeight : 0

				const h = container_height - toolbar_height - statusbar_height - 3

				// resize editor to adjust height of container
				editor.theme.resizeTo ('100%', h)

				// show dd-tiny after resize
				self.dd_tinny.style.opacity = 1
			})


		return true
	}//end onsetup_editor


	this.set_content = function(html){

		const self = this
		self.editor.selection.setContent( html );
	}
	

}//end class
