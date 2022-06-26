/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {event_manager} from '../../../common/js/event_manager.js'
	import {ui} from '../../../common/js/ui.js'

	import {render_toolbar, render_button} from '../../../component_text_area/js/render_text_editor_toolbar.js'




/**
* service_ckeditor
* Used as service by component_text_area
*/
export const service_ckeditor = function() {


	// self vars
		this.caller
		this.value_container
		this.toolbar_container
		this.options
		this.key
		this.editor


	/**
	* INIT
	*/
	this.init = async function (options) {

		const self = this

		// options vars
			const caller			= options.caller
			const value_container	= options.value_container
			const toolbar_container	= options.toolbar_container
			const value				= options.value
			const key				= options.key
			const editor_config		= options.editor_config

			const custom_events		= editor_config.custom_events

		// fix vars
			self.caller				= caller
			self.value_container	= value_container
			self.toolbar_container 	= toolbar_container
			self.options			= options
			self.key				= key

		// add component_text_area value
			value_container.innerHTML = value

			// setTimeout(function(){





		// editor
			ddEditor.create( value_container, {
				// view.element = value_container

				// extraPlugins: [ InsertImage ],
				// toolbar: [ 'bold', 'italic', 'underline', 'undo', 'redo', '|','findAndReplace', 'sourceEditing', 'InsertImage' ],
				// image: {
				// 	toolbar: [ 'toggleImageCaption' ]
				// }
				// toolbar: ['bold'],
				htmlSupport : {
					allow : [{
						name		: 'img',
						attributes	: true,
						classes		: true
					}]
				}

				})
				.then( editor => {

					self.editor = editor

					// editor.ui.focusTracker.on( 'change:isFocused', ( evt, data, isFocused ) => {
					//     console.log( `The editor is focused: ${ isFocused }.` );
					// } );

					// // build toolbar
					// 	const toolbar_node = self.build_toolbar(editor_config);
					// 	toolbar_container.appendChild(toolbar_node)

					// setTimeout(function(){
						// build toolbar
						const toolbar_node = self.build_toolbar(editor_config);
						// toolbar_container.appendChild(toolbar_node)


						// const htmlDP = editor.data.processor;
						// const viewFragment = htmlDP.toView("<p><b>patata</b> frita</p>");
						// console.log("viewFragment:",viewFragment);
						// const modelFragment = editor.data.toModel( viewFragment );
						// console.log("modelFragment:",modelFragment);

						// editor.model.insertContent( modelFragment, editor.model.document.selection );

					// }, 500)

						// container.addEventListener("click", function(e){

						// 	if (e.target.matches('img')) {
						// 		e.stopPropagation()

						// 		console.log("click e:", e.target);
						// 		console.log("parentNode:", e.target.parentNode);

						// 		const data = editor.getData();
						//  		console.log("editor data:",data);
						// 	}
						// })

				})
				.catch( error => {
					console.error( 'Oops, something went wrong!' );
					console.error( 'Please, report the following error on https://github.com/ckeditor/ckeditor5/issues with the build id and the error stack trace:' );
					console.warn( 'Build id: 7z83pgok0tkn-1117njnu31gy' );
					console.error( error );
				});

	// }, 500)

		return true
	}//end init



	/**
	* SAVE
	* Trigger save_value against caller sending key and value
	* @param string previous_value
	*	Used to compare changes in editor value.
	*	Current saved value for current key data
	* @return bool
	*/
	this.save = async function() {

		const self = this

		const editor	= self.editor
		const key		= self.key

		// no user interactions case
		if (editor.isDirty()!==true) {
			return false
		}
		const value = self.get_value()	// editor.getContent({format:'raw'})
		// const value = self.editor.getBody()

		await self.caller.save_value(key, value)

		// set_set_dirty after save is finish
		self.set_dirty(false)


		return true
	}//end save



	/**
	* GET_VALUE
	* Get editor value as raw string
	* @return string
	*/
	this.get_value = function() {

		const self = this

		const editor = self.editor
		const value	 = editor.getContent({format:'raw'})

		return value
	}//end get_value



	/**
	* ADD_EDITOR_BUTTONS
	* @return array buttons_added
	*/
	this.add_editor_buttons = function() {

		const editor = this.editor

		const custom_buttons		= this.options.editor_config.custom_buttons
		const custom_buttons_length	= (custom_buttons) ? custom_buttons.length : 0
		for (let i = 0; i < custom_buttons_length; i++) {

			const options = custom_buttons[i].options

			// button add
			editor.addButton(custom_buttons[i].name, options)
			// v5
			// editor.ui.registry.addButton(custom_buttons[i].name, options);
		}

		return custom_buttons
	}//end add_editor_buttons



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
			})//end focus event

		// blur event
			editor.on('blur', function(evt) {
				if (custom_events.blur) {
					custom_events.blur(evt, {
						key		: self.key,
						value	: editor.getContent({format:'raw'}),
						isDirty	: editor.isDirty()
					})
				}
			})//end blur event

		// click event
			editor.on('click', function(evt) {
				if (custom_events.click) {
					custom_events.click(evt, {

					})
				}
			})//end click event

		// MouseUp
			editor.on('MouseUp', function(evt) {
				if (custom_events.MouseUp) {
					custom_events.MouseUp(evt, {
						selection : editor.selection.getContent({format:'text'})
					})
				}
			})//end click event

		// NodeChange
			// editor.on('NodeChange', function(evt) {
			// 	if (custom_events.NodeChange) {
			// 		// custom_events.NodeChange(evt, {
			// 			// selection : editor.selection.getContent({format:'text'})
			// 		// })
			// 		console.log("NodeChange evt", evt);
			// 	}
			// })//end click event

		// KeyPress
			// prevent that user insert special reserved chars
			const minor_than_code	= 60 // <
			const more_than_code	= 62 // >
			const prevent_chars		= [minor_than_code, more_than_code]
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
				// set data as changed
				self.caller.is_data_changed = true
			})

		// init
			editor.on('init', function(evt) {

				// set tinymce caller
					evt.target.caller = self

				const container_height  = self.dd_tinny.offsetHeight; // self.container

				const toolbar			= self.dd_tinny.querySelector('.mce-toolbar-grp') // mce-toolbar-grp mce-container mce-panel mce-stack-layout-item mce-first
				const toolbar_height	= toolbar ? toolbar.offsetHeight : 0

				const statusbar			= self.dd_tinny.querySelector('.mce-statusbar') // mce-statusbar mce-container mce-panel mce-stack-layout-item mce-last
				const statusbar_height	= statusbar ? statusbar.offsetHeight : 0

				const h = container_height - toolbar_height - statusbar_height - 3

				// resize editor to adjust height of container
				editor.theme.resizeTo ('100%', h)

				// show dd-tiny after resize
				self.dd_tinny.style.opacity = 1

				// placeholder. (!) See mce_editor_default.less 'contentEditable'
					const tinyMceData = editor.getContent({ format: 'raw' });
					if(tinyMceData.indexOf('<br data-mce-bogus="1">')>= 0 || tinyMceData==='') {

						const editor_div = editor.iframeElement.contentWindow.document.body

						// remove possible bogus code
							editor.setContent('', { format: 'raw' });
							editor_div.innerHTML = ''

						// fallback_value
							const fallback_value = self.caller.data.fallback_value
							if (fallback_value) {

								// const parsed_value = tr.add_tag_img_on_the_fly(fallback_value)
								const parsed_value = self.caller.tags_to_html(fallback_value)

								// placeholder_div. create a new div an insert before editor div
									const placeholder_div = ui.create_dom_element({
										element_type	: 'div',
										class_name		: 'placeholder_div',
										inner_html		: parsed_value
									})
									editor_div.parentNode.insertBefore(placeholder_div, editor_div);

								// focus event. Hide placeholder_div on focus editor
									editor_div.addEventListener("focus", function(e){
											console.log("focus:",e, placeholder_div);
										placeholder_div.classList.add("hide")
									})

								// blur event. If editor content is empty, show the placeholder_div again
									editor_div.addEventListener("blur", function(e){
										if (editor.getContent({ format: 'raw' })==='') {
											placeholder_div.classList.remove("hide")
										}
									})
							}
					}//end if(tinyMceData.indexOf('<br data-mce-bogus="1">')>= 0 || tinyMceData==='')

				// debug
					// console.log("container_height:",container_height, self.dd_tinny);
					// console.log("toolbar_height:",toolbar_height);
					// console.log("statusbar_height:",statusbar_height);
					// console.log("resizeTo h:",h);

					// console.log("================================================================ editor._beforeUnload:",editor._beforeUnload);
					// console.log("================================================================ self.dd_tinny:",self.dd_tinny);

			})

		// render
			// editor.on('PostRender', function(evt) {
			// 	// console.log('--------------- After render: ' + editor.id);
			// })


		return true
	}//end onsetup_editor



	/**
	* SET_CONTENT
	*/
	this.set_content = function(html){

		const self = this

		const editor = self.editor

		// Insert the html in the current selection location.
		editor.model.insertContent( html, editor.model.document.selection );
		// self.editor.selection.setContent( html ); // tiny

		editor.setDirty(true);

		// save. service save function calls current component save_value()
			// const actual_value 	= self.caller.data.value[0]
			// const actual_value 	= self.editor.getContent({format:'raw'})
			// self.save(actual_value)

		const value = editor.getContent({format:'raw'})
		// const value = self.editor.getBody()
		self.caller.save_value(self.key, value)

		return true
	}//end set_content



	/**
	* GET_EDITOR_CONTENT_DATA
	* @return DOM node | false
	*/
	this.get_editor_content_data = function() {

		const self = this

		if (!self.editor) {
			console.error("Error on get self.editor. Not available. self:", self);
			return false
		}

		const editor_content_data = self.editor.getBody(); // Returns the root element of the editable area. For a non-inline iframe-based editor, returns the iframe's body element.
		if (!editor_content_data) {
			console.error("! INVALID editor_content_data (getBody) editor_content_data:", editor_content_data, " editor:", self.editor);
		}

		return editor_content_data
	}//end get_editor_content_data



	/**
	* GET_SELECTION
	* @return string selection
	*	Raw string without formatting
	*/
	this.get_selection = function() {

		const self = this

		if (!self.editor.selection) {
			return false
		}

		const selection = self.editor.selection.getContent({format:'raw'})

		return selection
	}//end get_selection



	/**
	* WRAP_SELECTION_WITH_TAGS
	* @return bool true
	*/
	this.wrap_selection_with_tags = function(tag_node_in, tag_node_out) {

		const self 	 = this
		const editor = self.editor

		// Get selection range
			const range			= editor.selection.getRng(0)
			const range_clon	= range.cloneRange()

		// Save start and end position
			const startOffset		= range_clon.startOffset
			const startContainer	= range_clon.startContainer

		// Go to end of range position
			range_clon.collapse(false)

		// Insert end out node
			range_clon.insertNode(tag_node_out)

		// Positioned to begin of range
			range_clon.setStart(startContainer, startOffset)

		// Go to start of range position
			range_clon.collapse(true)

		// Insert start in node
			range_clon.insertNode(tag_node_in)

		// set editor as dirty to allow save
			editor.setDirty(true)


		return range_clon
	}//end wrap_selection_with_tags



	/**
	* DOM_SELECT
	* @param string selector_str (CSS selector like .greyhound, #greyhound, etc.)
	* @return DOM node (one or more)
	*/
	this.dom_select = function(selector_str) {

		const self		= this
		const editor	= self.editor

		const node = editor.dom.select(selector_str)

		return node
	}//end dom_select



	/**
	* SET_DIRTY
	* @param bool value
	* @return bool
	*/
	this.set_dirty = function(value) {
		console.log("///////////////// set_dirty value:",value);

		const self = this

		// check value type
			if (typeof value !== 'boolean') {
				console.error("Error. Invalid value type. expected boolean: ", typeof value);
				return false
			}

		// fix editor (tiny) as dirty trye|false
			self.editor.setDirty(value);

		// true case
			if (value===true) {
				// is_data_changed
				self.caller.is_data_changed = true
			}

		// page unload event
			// set_before_unload (bool)
			event_manager.set_before_unload(value)


		return true
	}//end set_dirty


	/**
	* BUILD_TOOLBAR
	* @return bool
	*/
	this.build_toolbar = function(editor_config) {

		const self = this

		// editor config vars
			// toolbar array with the order of the buttons like:
			// ['bold','italic','underline','|','undo','redo']
			const toolbar			= editor_config.toolbar
			// custom_buttons array of the buttons objects with the own configuration
			const custom_buttons	= editor_config.custom_buttons

			const toolbar_node = self.toolbar_container

			const toolbar_length = toolbar.length
			for (let i = 0; i < toolbar_length; i++) {
				const toolbar_item = toolbar[i]

				const button_config = custom_buttons.find(el => el.name === toolbar_item)
				if(!button_config){
					console.warn("Button object definition doesn't exist:", toolbar_item);
					continue
				}
				// create the node in the text_area render (common for all text_editors tinny, ckeditor, etc.)
				const button_node = render_button(button_config)
				button_config.node = button_node
				// when the button need to be processed by the editor, use the factory
				if(button_config.manager_editor === true){
					self.factory_events_for_buttons(button_config)
				}
					console.log("button_node:",button_node);
				toolbar_node.appendChild(button_node)
			}

		return toolbar_node
	};//end this.build_toolbar


	/**
	* FACTORY_EVENTS_FOR_BUTTONS
	* @return
	*/
	this.factory_events_for_buttons = function(button_obj) {

		const self = this

		const editor = self.editor

			console.log("editor:",editor);

		const name		= button_obj.name
		const button	= button_obj.node

		// Exception: editing the html_souece button doesn't has command, call it by the state of the plug-ing
		if( name === 'html_source'){

			// Clicking the buttons should execute the editor command...
			button.addEventListener('click', function(){
				const state = editor.plugins.get( 'SourceEditing' ).isSourceEditingMode
				if(state === false){
					editor.plugins.get( 'SourceEditing' ).isSourceEditingMode = true
				}else{
					editor.plugins.get( 'SourceEditing' ).isSourceEditingMode = false
				}
			})

			return
		}

		 // Retrieve the editor command corresponding with the ID of the button in the DOM.
		const command = editor.commands.get( name );
		// const button = this.view.toolbarButtons[ name ];

		// Clicking the buttons should execute the editor command...
		// ...but it should not steal the focus so the editing is uninterrupted.
		// button.onmousedown( evt => evt.preventDefault() );
		button.addEventListener('click', function(evt){
			evt.preventDefault()
			evt.stopPropagation()
			editor.execute( name )
			editor.editing.view.focus();
		})
		// button.onclick( () => editor.execute( name ) );

		// ...but it should not steal the focus so the editing is uninterrupted.
		// button.onmousedown( evt => evt.preventDefault() );
		// button.addEventListener('click', evt => evt.preventDefault() )

		const onValueChange = () => {
			// button.toggleClass( 'active', command.value );
			if(command.value){
				button.classList.add('active')
			}else{
				button.classList.remove('active')
			}
		};

		const onIsEnabledChange = () => {
			// button.attr( 'disabled', () => !command.isEnabled );
			button.setAttribute( 'disabled', () => !command.isEnabled );
		};

		// Commands can become disabled, e.g. when the editor is read-only.
		// Make sure the buttons reflect this state change.
		// command.addEventListener('change',onIsEnabledChange())
		// command.on( 'change:isEnabled', onIsEnabledChange );
		// onIsEnabledChange();
		// console.log("command:",command);
		// console.log("name:",name);

		// Bold, Italic and Underline commands have a value that changes
		// when the selection starts in an element the command creates.
		// The button should indicate that e.g. you are editing text which is already bold.
		// if ( !new Set( [ 'undo', 'redo' ] ).has( name ) ) {
		// 	command.on( 'change:value', onValueChange );
		// 	onValueChange();
		// }


		// The object we wanna control
		const obj = {}

		// Our handler to control object via Proxy
		const handler = {
			get(obj, prop) {
			console.log(`Getting property ${prop} from object`)
			// Remember to so the default operation, returning the prop item inside obj
			return obj[prop]
			},
			set(obj, prop, value) {
			console.log(`Setting property ${prop} as ${value} in object`)

			// Do the default operation, set prop as value in obj
			obj[prop] = value

			if( prop==='isEnabled') {
				onIsEnabledChange()
			}
			if(name !== 'undo' && name !== 'redo' && prop==='value'){
				onValueChange();
			}

			/*
				Set method must return a value.
				Return `true` to indicate that assignment succeeded
				Return `false` (even a falsy value) to prevent assignment.in `strict mode`, returning false will throw TypeError
			*/

			return true
			}
		}

		// Set the proxy
		const proxifiedObj = new Proxy(command, handler)

	};//end factory_events_for_buttons


}//end service_ckeditor
