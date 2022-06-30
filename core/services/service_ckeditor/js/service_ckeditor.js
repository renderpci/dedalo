/*global get_label, page_globals, SHOW_DEBUG, ddEditor */
/*eslint no-undef: "error"*/



// imports
	import {event_manager} from '../../../common/js/event_manager.js'
	// import {ui} from '../../../common/js/ui.js'
	import {clone} from '../../../common/js/utils/index.js'
	import {render_button} from './render_text_editor_toolbar.js'



/**
* SERVICE_CKEDITOR
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
	* @param object options
	*/
	this.init = async function(options) {

		const self = this

		// options vars
			const caller			= options.caller
			const value_container	= options.value_container
			const toolbar_container	= options.toolbar_container
			const value				= options.value
			const key				= options.key
			const editor_config		= options.editor_config
				console.log("editor_config:",editor_config);

		// fix vars
			self.caller				= caller
			self.value_container	= value_container
			self.toolbar_container	= toolbar_container
			self.options			= options
			self.key				= key

		// add component_text_area value
			value_container.innerHTML = value

		// editor.
			// ddEditor is created from lib ckeditor source using webpack.
			// See source and webpack config files
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

				// fix instance
					self.editor = editor

				// focus
					// editor.ui.focusTracker.on( 'change:isFocused', ( evt, data, isFocused ) => {
					//     console.log( `The editor is focused: ${ isFocused }.` );
					// } );

				// build toolbar
					self.build_toolbar(editor_config);

				// toolbar toggle
					// show toolbar_container on user mousedown
					// removes the toolbar_container when user click outside
					const node = toolbar_container.parentNode
					node.addEventListener("mousedown", function() {
						toolbar_container.classList.remove('hide')
						document.body.addEventListener("mouseup", fn_remove)
					})
					function fn_remove(e) {
						if (e.target!==node) {
							const found = e.path.find(el => el===node)
							if (!found) {
								toolbar_container.classList.add('hide')
								document.body.removeEventListener("mouseup", fn_remove)
							}
						}
					}

				// setup_events
					self.setup_events(editor_config);


				// click event sample
					// container.addEventListener("click", function(e){
					// 	if (e.target.matches('img')) {
					// 		e.stopPropagation()

					// 		console.log("click e:", e.target);
					// 		console.log("parentNode:", e.target.parentNode);

					// 		const data = editor.getData();
					//  		console.log("editor data:",data);
					// 	}
					// })

				// init editor status changes to track isDirty value
					self.init_status_changes()

				// debug
					// setTimeout(function(){
					// 	self.caller.update_tag({
					// 		type	: 'indexIn',
					// 		tag_id	: 2,
					// 		new_data_obj : {
					// 			state : 'd'
					// 		}
					// 	})
					// }, 2000)



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
	* SETUP_EVENTS -Ok
	* callback when ckeditor is ready
	* @return true
	*/
	this.setup_events = function(editor_config) {

		const self		= this
		const editor	= self.editor

		const custom_events = editor_config.custom_events || {}

		// focus event
			editor.editing.view.document.on('focus', function(evt, data ) {
				if (custom_events.focus) {
					custom_events.focus(evt, {})
				}
			});//end focus event


		// blur event
			editor.editing.view.document.on('blur', function(evt, data ) {
				if (custom_events.blur) {
					custom_events.blur(evt, {})
				}
			});//end blur event


		// click event
			editor.editing.view.document.on('click', function(evt, data ) {

				const click_element = data.target.name

					const item = data.target.parent._attrs
					const tag_obj = {
						node_name : data.target.name,
						dataset :{
							type	: item.get('data-type'),
							tag_id	: item.get('data-tag_id'),
							state	: item.get('data-state'),
							label	: item.get('data-label'),
							data	: item.get('data-data')
						}
					}
					if (custom_events.click) {
						custom_events.click(evt, tag_obj)
					}


				// }else{
					const options = (click_element !== 'img')
						? {selection : self.get_selection()}
						: {selection : ''}


					if (custom_events.MouseUp) {
						custom_events.MouseUp(evt, options)
					}

			});//end click event

		// keyup event
			editor.editing.view.document.on('keyup', function(evt, data ) {
				if (custom_events.KeyUp) {
					custom_events.KeyUp(data.domEvent, {})
				}
			}); //end keyup event


		return true
	}//end onsetup_editor



	/**
	* SET_CONTENT -OK
	*/
	this.set_content = function(html){

		const self = this

		const editor = self.editor

		// convert the html to the model of ck_editor
		const view_fragment		= editor.data.processor.toView( html );
		const model_fragment	= editor.data.toModel( view_fragment );

		const position = editor.model.document.selection.getLastPosition()
		// Insert the html in the current selection location.
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
	* WRAP_SELECTION_WITH_TAGS -OK
	* @return bool true
	*/
	this.wrap_selection_with_tags = function(tag_node_in, tag_node_out) {

		const self 	 = this
		const editor = self.editor

		// convert the html to the model of ck_editor
		const data_tag_node_in		= editor.data.processor.toView( tag_node_in.outerHTML  );

		const model_tag_node_in	= editor.data.toModel( data_tag_node_in );

		const in_position = editor.model.document.selection.getFirstPosition()

		editor.model.insertContent( model_tag_node_in, in_position );

		// convert the html to the model of ck_editor
		const view_tag_node_out	= editor.data.processor.toView( tag_node_out.outerHTML );
		// const view_tag_node_out = editor.editing.view.domConverter.domToView( tag_node_out );
		const model_tag_node_out = editor.data.toModel( view_tag_node_out );

		const out_position = editor.model.document.selection.getLastPosition()

		editor.model.insertContent( model_tag_node_out, out_position );
		editor.editing.view.focus();
		self.is_dirty = true;

		// const value = editor.getContent({format:'raw'})
		const value = editor.getData();
		// const value = self.editor.getBody()
		self.caller.save_value(self.key, value)

		return true
	}//end wrap_selection_with_tags



	/**
	* DOM_SELECT
	* @param string selector_str (CSS selector like .greyhound, #greyhound, etc.)
	* @return DOM node (one or more)
	*/
		// this.dom_select = function(selector_str) {

		// 	const self		= this
		// 	const editor	= self.editor

		// 	const root = editor.model.document.getRoot();

		// 	// Create a range spanning over the entire root content:
		// 	const range = editor.model.createRangeIn( root );

		// 	// Iterate over all items in this range:
		// 	for ( const value of range.getWalker({ ignoreElementEnd: true }) ) {
		// 		const item = value.item

		// 		const htmlAttributes = item.getAttribute('htmlAttributes') //.attributes //getAttributes() //.htmlAttributes //.hasAttribute('data-type')
		// 		if(htmlAttributes){

		// 			const attributes = htmlAttributes.attributes['data-type']
		// 			const id = htmlAttributes.attributes['data-tag_id']
		// 			if(attributes==='indexIn' && id === '6'){

		// 				const old_att = JSON.parse(JSON.stringify((htmlAttributes)))
		// 				old_att.attributes['data-state'] ='n'

		// 				editor.model.change( writer => {
		// 					writer.setAttribute( 'htmlAttributes', old_att, item );
		// 				});

		// 			}
		// 		}
		// 	}

		// 	// des
		// 		// for ( const value of children ) {

		// 		// 	console.log("node:",node);
		// 		// 	const node = children[value]

		// 		// 		console.log("node:",node);

		// 		// 	// if ( node.is( type ) ) {
		// 		// 	// 	nodes.push(node);
		// 		// 	// }
		// 		// }

		// 		// console.log("editor.model:",children  );

		// 			// console.log("editor.model:",editor.model.viewElement.hasClass( 'placeholder' ) );
		// 		// const node = editor.dom.select(selector_str)

		// 		// return node
		// }//end dom_select



	/**
	* UPDATE_TAG
	* Find and change target tag in editor
	* @param object options
	* Sample:
	* {
	* 	type : [indexIn,indexOut]
	* 	tag_id : 1,
	* 	dataset : {	type : n }
	* }
	* @return bool
	*/
	this.update_tag = function(options) {

		// options
			const type			= options.type
			const tag_id		= options.tag_id
			const new_data_obj	= options.new_data_obj

		// short vars
			const self		= this
			const editor	= self.editor
			const ar_type	= Array.isArray(type)
				? type
				: [type]

		// root. Whole editor document to traverse
			const root = editor.model.document.getRoot();

		// range. Create a range spanning over the entire root content:
			const range = editor.model.createRangeIn( root );

		// Iterate over all items in this range:
			for ( const value of range.getWalker({ ignoreElementEnd: true }) ) {

				const item = value.item

				// htmlAttributes. Get an object like:
				// {
				//   attributes : {data-data: '', data-label: 'label in 1', data-state: 'r', data-tag_id: '1', data-type: 'indexIn', …}
				//	 classes : ['index']
				// }
				const htmlAttributes = item.getAttribute('htmlAttributes')
				if(htmlAttributes) {

					const current_tag_id	= htmlAttributes.attributes['data-tag_id']
					const current_type		= htmlAttributes.attributes['data-type']

					if(current_tag_id==tag_id && ar_type.includes(current_type)) {

						console.log("update_tag item:", item);

						// short vars
							const current_state	= htmlAttributes.attributes['data-state']
							const current_label	= htmlAttributes.attributes['data-label']
							const current_data	= htmlAttributes.attributes['data-data']
							const current_src	= item.getAttribute('src')

						// edit_attributes. Clone htmlAttributes to prevent unwanted events trigger
							const edit_attributes = clone(htmlAttributes)

						// add/replace new_data_obj properties given
							for (const name in new_data_obj) {
								edit_attributes.attributes['data-'+name] = new_data_obj[name]
							}

							// console.log("-> 1 changed htmlAttributes:",htmlAttributes);
							// console.log("-> 2 changed edit_attributes:",edit_attributes);

						// id. Re-create the id like [/index-n-1-label in 1]
							const new_id = self.caller.build_data_tag(
								current_type, // type
								current_tag_id, // tag_id
								new_data_obj.state || current_state, // state
								new_data_obj.label || current_label, // label
								new_data_obj.data || current_data // data
							)
							edit_attributes.attributes.id = new_id

						// image_url. Replace url var id with updated id tag
							const image_url = current_src.split('?')[0] + '?id=' + new_id

						// set to model
							editor.model.change( writer => {
								writer.setAttribute( 'htmlAttributes', edit_attributes, item );
								writer.setAttribute( 'src', image_url, item );
							});
					}
				}
			}//end for ( const value of range.getWalker({ ignoreElementEnd: true }) )


		return true
	}//end update_tag



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
	* 	Render all toolbar buttons from editor_config
	* @param object editor_config
	* Like
	* {
	* 	custom_buttons : [{name:..},{name:..}],
	* 	custom_events : [{name:..},{name:..}],
	* 	toolbar : ['bold','italic',..]
	* }
	* @return DOM node toolbar_node
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


		return true
	};//end factory_events_for_buttons



}//end service_ckeditor
