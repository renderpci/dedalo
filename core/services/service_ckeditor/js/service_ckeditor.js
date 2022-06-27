/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {event_manager} from '../../../common/js/event_manager.js'
	import {ui} from '../../../common/js/ui.js'

	import {render_toolbar, render_button} from './render_text_editor_toolbar.js'




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


		// editor
			ddEditor.create( value_container, {

				// toolbar: [ 'bold', 'italic', 'underline', 'undo', 'redo', '|','findAndReplace', 'sourceEditing', 'InsertImage' ],
				// add support for images and his own attributes
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

					// build toolbar
					const toolbar_node = self.build_toolbar(editor_config);

					// container.addEventListener("click", function(e){

					// 	if (e.target.matches('img')) {
					// 		e.stopPropagation()

					// 		console.log("click e:", e.target);
					// 		console.log("parentNode:", e.target.parentNode);

					// 		const data = editor.getData();
					//  		console.log("editor data:",data);
					// 	}
					// })
					self.init_status_changes()

				})
				.catch( error => {
					console.error( 'Oops, something went wrong!' );
					console.error( error );
				});

		return true
	}//end init



	/**
	* SAVE -OK
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


		// // no user interactions case
		if (self.is_dirty!==true) {
			return false
		}

		// const value = self.get_value()	// editor.getContent({format:'raw'})
		// // const value = self.editor.getBody()
		const value = editor.getData();

		await self.caller.save_value(key, value)

		// // set_set_dirty after save is finish
		self.is_dirty = false;


		return true
	}//end save

	/**
	 * INIT_STATUS_CHANGES -OK
	 *
	*/
	// Listen to new changes (to enable the "Save" button) and to pending actions.
	this.init_status_changes = function() {

		const self = this

		const editor	= self.editor

		editor.model.document.on( 'change:data', () => {
			self.is_dirty = true;
		});
	}//end init_status_changes


	/**
	* GET_VALUE -OK
	* Get editor value as raw string
	* @return string
	*/
	this.get_value = function() {

		const self = this

		const editor = self.editor
		const value = editor.getData();

		return value
	}//end get_value


	/**
	* SET_CONTENT -OK
	*/
	this.set_content = function(html){

		const self = this

		const editor = self.editor

		// Insert the html in the current selection location.
		// editor.model.insertContent( html, editor.model.document.selection );
		// self.editor.selection.setContent( html ); // tiny

		// convert the html to the model of ck_editor
		const view_fragment = editor.data.processor.toView( html );
		const model_fragment = editor.data.toModel( view_fragment );

		const position = editor.model.document.selection.getLastPosition()

		editor.model.insertContent( model_fragment, position );

		self.is_dirty = true;

		// save. service save function calls current component save_value()
			// const actual_value 	= self.caller.data.value[0]
			// const actual_value 	= self.editor.getContent({format:'raw'})
			// self.save(actual_value)

		// const value = editor.getContent({format:'raw'})
		const value = editor.getData();
		// const value = self.editor.getBody()
		self.caller.save_value(self.key, value)

		return true
	}//end set_content



	/**
	* GET_EDITOR_CONTENT_DATA -OK
	* @return DOM node | false
	*/
	this.get_editor_content_data = function() {

		const self = this

		const editor = self.editor

		if (!editor) {
			console.error("Error on get self.editor. Not available. self:", self);
			return false
		}
		// get the domRoots map of the editor
		const domRoots = editor.editing.view.domRoots;
		const editor_content_data = domRoots.get('main') // Returns the root element of the editable area. For a non-inline iframe-based editor, returns the iframe's body element.
		if (!editor_content_data) {
			console.error("! INVALID editor_content_data (getBody) editor_content_data:", editor_content_data, " editor:", self.editor);
		}

		return editor_content_data
	}//end get_editor_content_data



	/**
	* GET_SELECTION -OK
	* @return string selection
	*	Raw string without formatting
	*/
	this.get_selection = function() {

		const self = this

		const editor = self.editor

		if (!self.editor) {
			return false
		}
		// get the user selection
		const user_selection = editor.model.document.selection

		// get the content of the selection, it get the html representation
		const content = editor.model.getSelectedContent(user_selection)
		// convert the ckeditor data to html in string format
		const selection =  editor.data.stringify(content)

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
	* SET_DIRTY -OK
	* @param bool value
	* @return bool
	*/
	this.set_dirty = function(value) {

		const self = this

		// check value type
			if (typeof value !== 'boolean') {
				console.error("Error. Invalid value type. expected boolean: ", typeof value);
				return false
			}

		// true case
			if (value===true) {
				self.is_dirty = true
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
			// button.setAttribute( 'disabled', !command.isEnabled );
			if(!command.isEnabled){
				button.classList.add('disable')
			}else{
				button.classList.remove('disable')
			}

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
		// const obj = {}
		// 	// console.log("obj:",obj);
		// 	// 	console.log("command:",command);
		// // Our handler to control object via Proxy
		// const handler = {
		// 	// get(obj, prop) {
		// 	// console.log(`Getting property ${prop} from object`)
		// 	// // Remember to so the default operation, returning the prop item inside obj
		// 	// return obj[prop]
		// 	// },
		// 	set(obj, prop, value) {
		// 	console.log(`Setting property ${prop} as ${value} in object`)

		// 	// Do the default operation, set prop as value in obj
		// 	obj[prop] = value

		// 	if( prop==='isEnabled') {
		// 		onIsEnabledChange()
		// 	}
		// 	if(name !== 'undo' && name !== 'redo' && prop==='value'){
		// 		onValueChange();
		// 	}

		// 	/*
		// 		Set method must return a value.
		// 		Return `true` to indicate that assignment succeeded
		// 		Return `false` (even a falsy value) to prevent assignment.in `strict mode`, returning false will throw TypeError
		// 	*/

		// 	return true
		// 	}
		// }

		// // Set the proxy
		// const proxy_field_obj = new Proxy(command, handler)

		editor.listenTo( command, 'change:isEnabled',(evt)=>{
				onIsEnabledChange()
		})

		editor.listenTo( command, 'change:value',(evt)=>{
			if ( !new Set( [ 'undo', 'redo' ] ).has( name ) ) {
				onValueChange();
			}
		})

	};//end factory_events_for_buttons


}//end service_ckeditor
