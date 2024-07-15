// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, ddEditor, ckeditor, DEDALO_ROOT_WEB, DEDALO_API_URL */
/*eslint no-undef: "error"*/



// imports
	import {event_manager} from '../../../common/js/event_manager.js'
	import {common} from '../../../common/js/common.js'
	import {clone} from '../../../common/js/utils/index.js'
	import {data_manager} from '../../../common/js/data_manager.js'
	import {delete_instance} from '../../../common/js/instances.js'
	import {render_button, render_find_and_replace} from './render_text_editor.js'



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
		this.fallback_value



	/**
	* INIT
	* Get the options of the caller that do the initialization and set the instance
	* the caller is a component_text_area and the editor is a instance of the ckeditor
	* CkEditor is compiled with custom plug-in: dedalo_tags to upcast and downcast the Dédalo tags into the ckeditor model
	* 	See the ckeditor.js file in ../libs_dev/ckeditor to change the conversion tags
	* Editor load the core and common commands and plugins from ckEditor but Dédalo will not use the ckEditor user interface
	* the interface is created inside the toolbar_container with custom icons and functionalities
	* @param object options
	* @return promise
	*  	object ckeditor
	*/
	this.init = async function(options) {

		const self = this

		// options vars
			const caller			= options.caller // compnent_text_area that create the instance
			const value_container	= options.value_container // dom node to be used as value container (empty when is set by the caller)
			const toolbar_container	= options.toolbar_container // dom node for the toolbar
			const fallback_value	= options.fallback_value // the html data to be showed as placeholder when value is empty
			const key				= options.key // array key of the value of the caller data
			const editor_config		= options.editor_config // options for build custom buttons in the toolbar or custom events
			const editor_class		= options.editor_class || 'ddEditor'

		// fix vars
			self.caller				= caller
			self.value_container	= value_container
			self.toolbar_container	= toolbar_container
			self.options			= options
			self.key				= key
			self.fallback_value		= fallback_value

		// load ckeditor files if not already loaded
			if(typeof ckeditor==='undefined'){
				const t0 = performance.now()

				// load dependencies
					const load_promises = []

				// load ckeditor JS file
					const ckeditor_file = DEDALO_ROOT_WEB + '/lib/ckeditor/build/ckeditor.js'
					load_promises.push(
						common.prototype.load_script(ckeditor_file)
					)

				// load and set JSON langs file
					if (!window['json_langs']) {
						load_promises.push(
							new Promise(function(resolve){
								data_manager.request({
									url		: '../common/js/lang.json',
									method	: 'GET',
									cache	: 'force-cache' // force use cache because the file do not changes
								})
								.then(function(response){
									// set json_langs
									window['json_langs'] = response
									resolve(response)
								})
							})
						)
					}
					await Promise.all(load_promises)
			}

		// set json_langs (loaded once and set to global var)
			self.json_langs = window['json_langs']

		// create editor (ddEditor|InlineEditor)
			const create = async function (){
				// init ckeditor (InlineEditor|ddEditor)
				switch(editor_class) {
					case 'InlineEditor':
						await self.create_InlineEditor(editor_config)
						break;

					case 'ddEditor':
					default:
						await self.create_ddEditor(editor_config)
						break;
				}
			}

		return new Promise(function(resolve){
			// try lo create every x milliseconds (editor parse takes time...)
			const wait_ckeditor = setInterval(async function() {
				if ( typeof ckeditor !=='undefined' ) {
					clearInterval(wait_ckeditor);

					const current_editor = await create()

					resolve(current_editor)
				}
			}, 50);
		})
	}//end init



	/**
	* CREATE_INLINEEDITOR
	* Builds a ckeditor InlineEditor instance
	* This instance uses full featured ckeditor toolbar and is used
	* by component_html_text
	* @param object editor_config
	* @return promise
	* 	Resolve editor
	*/
	this.create_InlineEditor = async function(editor_config) {

		const self = this

		// set the lang of the tool
			const json_langs	= self.json_langs || []
			if (json_langs.length<1) {
				console.error('Error. Expected array of json_langs but empty result is obtained:', json_langs);
			}
			const dedalo_lang	= page_globals.dedalo_data_lang
			const lang_obj		= json_langs.find(item => item.dd_lang===dedalo_lang)
			const lang			= lang_obj
				? lang_obj.tld2
				: 'en'

			if(lang !== 'en'){
				const ck_translation_file = DEDALO_ROOT_WEB + '/lib/ckeditor/build/translations/'+lang+'.js'
				await common.prototype.load_script(ck_translation_file)
			}

		// remove loading class of value_container before is changed by ckeditor
			self.value_container.classList.remove('loading')

		// Remove reference toolbar
		// when is defined don't touch the toolbar, reference isset by default
		// else remove the reference button in the tool bar.
			const remove_reference = editor_config.toolbar.find(el => el === 'reference')
				? [null]
				: ['reference']

		return new Promise(function(resolve){

			// editor.
			// InlineEditor is created from lib ckeditor source using webpack.
			// See source and webpack config files
			// InlineEditor is initialized with user interface
			ckeditor.InlineEditor.create( self.value_container, {
				// initialData: value
				// toolbar: {
					// 	items : [
					// 		"heading",
					// 		// "|",
					// 		"bold",
					// 		"italic",
					// 		"underline",
					// 		"strikethrough",
					// 		"alignment",
					// 		"|",
					// 		"undo",
					// 		"redo",
					// 		"|",
					// 		"findAndReplace",
					// 		"sourceEditing",
					// 		"|",
					// 		"imageUpload",
					// 		"blockQuote",
					// 		"insertTable",
					// 		"htmlEmbed",
					// 		"link",
					// 		// "-",
					// 		"style",
					// 		"|",
					// 		"fontColor",
					// 		"fontBackgroundColor",
					// 		"fontSize",
					// 		"fontFamily",
					// 		"superscript",
					// 		"subscript",
					// 		"|",
					// 		"numberedList",
					// 		"bulletedList",
					// 		"horizontalLine",
					// 		"|",
					// 		"outdent",
					// 		"indent",
					// 		"|",
					// 		"specialCharacters",
					// 		"pageBreak"
					// 	],
					// 	shouldNotGroupWhenFull: false
					// }
				toolbar:{
					removeItems: remove_reference
				},
				// The UI will be in English.
				language: lang,
				simpleUpload: {
					 // The URL that the images are uploaded to.
					uploadUrl: DEDALO_API_URL + '?resource_type=web'
				},
				placeholder: self.fallback_value
			})
			.then( editor => {

				// fix the instance
					self.editor = editor

				// init editor status changes to track isDirty value
					self.init_status_changes()

				// setup_events
					self.setup_button_reference();

				// setup_events
					self.setup_events(editor_config);

				// read_only
					if(editor_config.read_only) {
						editor.enableReadOnlyMode( 'read_only_ mode' );
					}

				// set toolbar width
					(()=>{
						// elements
							const toolbar			= editor.ui.view.toolbar
							const ck_toolbar		= toolbar.element
							const ck_balloon_panel	= ck_toolbar.parentNode
							// move ck_balloon_panel inside component toolbar_container
							self.toolbar_container.appendChild(ck_balloon_panel)

						// adjust_size function
							const adjust_size = () => {
								const width = self.value_container.offsetWidth // add corrective factor of 47 px
								// fix maxWidth
								// toolbar.maxWidth = width
								// set styles
								Object.assign(ck_toolbar.style, {
									width : width + 'px'
								});
							}

						// sync toolbar container. Focus/blur editor show/hide the toolbar container
							editor.ui.focusTracker.on( 'change:isFocused', ( evt, name, isFocused ) => {
								if ( isFocused===true ) {
									self.toolbar_container.classList.remove('hide')
								}else{
									self.toolbar_container.classList.add('hide')
								}
							} );

						// resize value_container observer
							const resizeObserver = new ResizeObserver((entries) => {
								for (const entry of entries) {
									if (entry.contentBoxSize) {
										window.requestAnimationFrame(adjust_size)
									}
								}
							});
							resizeObserver.observe(self.value_container);
					})()

				resolve(editor)
			})
			.catch( error => {
				console.error( 'Oops, something went wrong!' );
				console.error( error );
			});
		})
	}//end create_InlineEditor



	/**
	* CREATE_DDEDITOR
	* Builds a ckeditor ddEditor instance
	* This instance uses custom limited toolbar and is used
	* by component_text_area
	* @param object editor_config
	* @return promise
	* 	Resolve editor
	*/
	this.create_ddEditor = async function(editor_config) {

		const self = this

		// editor
		// ddEditor is created from lib ckeditor source using webpack.
		// See source and webpack config files
		// ckEditor is initialized without user interface
			const editor = await ckeditor.ddEditor.create( self.value_container, {
				// initialData: value
				placeholder: self.fallback_value
			})

		// fix the instance
			self.editor = editor

		// focus
			// editor.ui.focusTracker.on( 'change:isFocused', ( evt, data, isFocused ) => {
			//     console.log( `The editor is focused: ${ isFocused }.` );
			// } );

		// build toolbar
			self.build_toolbar(editor_config);

		// setup_events
			self.setup_events(editor_config);

		// read_only
			if(editor_config.read_only) {
				editor.enableReadOnlyMode( 'read_only_ mode' );
			}

		// setup_button_reference
			self.setup_button_reference();

		// drag and drop control
			// Control the drop action to move the caret outside of the img node when the target is a img node (dd_tag)
			// the drop event doesn't has any effect in the final position of the drop,
			// the final check position is fired in the clipboardInput event.
			editor.editing.view.document.on( 'clipboardInput', ( evt, data ) => {

				// target is undefined unless a existing element is focus on paste or drop
				// In this cases, no more check area necessary. Stop here
					if (!data.target) {
						return
					}

				// check the target name of the element (expected a image)
				if(data.target.name==='img'){
					editor.editing.view.change((writer) => {
						// create new position at start and end of the target
						// use the target parent because the img is wrapped inside a span
						// the parent span has other position of the image and it's necessary avoid the parent position
						const start = writer.createPositionAt(
							data.target.parent,
							"after"
						);
						const end = writer.createPositionAt(
							data.target.parent,
							"after"
						);
						// create the range of the new position
						const range = writer.createRange(start, end);

						// it's not necessary change the range to model range
						// comment this code
							// writer.setSelection( range );
							// transform to the model_range
							// const model_range = editor.editing.mapper.toModelRange( range )
							// editor.model.change( writer => writer.setSelection( model_range ) );
							// data.targetRanges = [ editor.editing.mapper.toViewRange( model_range ) ];
						// set new range to the targetRanges of the data
						// it will use to calculate the drop position when will insertContect()
						data.targetRanges = [ range ];
					});
				}
			}, { priority: 'high' } );

		// Active this drop event listeners to change the visual effect, but any of them will change the result
			// editor.editing.view.document.on( 'drop', ( evt, data ) => {
			// }, { priority: 'high' } );

			// editor.editing.view.document.on( 'dragover', ( evt, data ) => {

			// 	if(data.target.name === 'img'){
			// 		evt.stop();
			// 		//Stop the default event action.
			// 		data.preventDefault();
			// 	}
			// }, { priority: 'high' } );

			// editor.editing.view.document.on( 'dragenter', ( evt, data ) => {

			// 	if(data.target.name === 'img'){

			// 		evt.stop();
			// 		//Stop the default event action.
			// 		data.preventDefault();
			// 	}
			// }, { priority: 'high' } );

		// init editor status changes to track isDirty value
			self.init_status_changes()

		// remove original value container
			if (self.value_container) {
				self.value_container.remove()
			}

		// click event
			self.click = function(e) {
				e.stopPropagation()
				e.preventDefault()

				self.toolbar_container.classList.remove('hide')
				editor.editing.view.focus()

				document.body.addEventListener('mouseup', fn_remove)
			}

		// add custom class to the root element of the editor
			editor.editing.view.change( writer => {
				writer.addClass( 'editor_container', editor.editing.view.document.getRoot() );
			});

		// toolbar toggle event
			// show toolbar_container on user mousedown
			// removes the toolbar_container when user click outside
			const node = self.toolbar_container.parentNode
			node.addEventListener('mousedown', function() {
				// remove the class 'hide' to show the toolbar
				self.toolbar_container.classList.remove('hide')
				document.body.addEventListener('mouseup', fn_remove)
			})
			function fn_remove(e) {
				if (e.target!==node) {
					const path	= e.composedPath()
					const found	= path.find(el => el===node)
					if (!found) {
						self.toolbar_container.classList.add('hide')
						document.body.removeEventListener('mouseup', fn_remove)
					}
				}
			}


		return editor
	}//end create_ddEditor



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

		// // no user interactions case
		if (self.is_dirty!==true) {
			return false
		}

		const value = editor.getData();

		await self.caller.save_value(key, value)

		// set_set_dirty after save is finish
		self.is_dirty = false;


		return true
	}//end save



	/**
	* INIT_STATUS_CHANGES
	* Listen to new changes (to enable the "Save" button) and to pending actions.
	*/
	this.init_status_changes = function() {

		const self		= this
		const editor	= self.editor

		// set a timer to wait until user is writing
		// when user stop set the dirty and change data
		let timer;              // Timer identifier
		const waitTime = 500;   // Wait time in milliseconds
		// the editor send a event when the data is changed and change the is_dirty state
		editor.model.document.on( 'change:data', () => {

			// Clear timer every time than keyup
				clearTimeout(timer);

			// Wait for X ms and then process data and setup dirty
				timer = setTimeout(() => {
					self.set_dirty(true);
				}, waitTime);

		});
	}//end init_status_changes



	/**
	* GET_VALUE
	* Get editor value as raw html string
	* @return string
	*/
	this.get_value = function() {

		const self = this

		const editor = self.editor
		const value = editor.getData();

		return value
	}//end get_value



	/**
	* SETUP_EVENTS
	* callback when ckeditor is ready
	* Capture the event fired in the editor and callback to the caller to be processed. See render_edit_component_text_area.js
	* @return true
	*/
	this.setup_events = function(editor_config) {

		const self		= this
		const editor	= self.editor
		// used to pass the the events in the editor to the custom_events in the caller
		// defined in the render of the component_text_area with the events that it could process
		// when the event in the editor is fired, it call to the event in the caller and do the process of data
		const custom_events = editor_config.custom_events || {}

		// prevent
			custom_events.prevent_selectionChangeDone = false

		// focus event
			editor.editing.view.document.on('focus', function(evt, data ) {
				if (custom_events.focus) {
					custom_events.focus(data.domEvent, {})
				}
			});//end focus event


		// blur event
			editor.editing.view.document.on('blur', function(evt, data ) {
				if (custom_events.blur) {
					custom_events.blur(data.domEvent, {})
				}
			});//end blur event


		// click event
			editor.editing.view.document.on('click', function(evt, data ) {

				// get the name of the node clicked, 'img' 'p' 'div', etc
				const click_element = data.target.name

				// check if the click element was inside a empty editor. div is the main node and it doesn't has parent, parent=undefined
				if(click_element==='div' || ( click_element!=='img' && click_element!=='reference')){
					return
				}
				const item = click_element!=='reference'
					? data.target.parent
					: data.domTarget

				// get the parent of the img, it will be a span with the data of the tag in attributes
				// const item = data.target.parent._attrs
				const tag_obj =  {
					node_name	: click_element,
					// dataset
					type		: item.getAttribute('data-type'),
					tag_id		: item.getAttribute('data-tag_id'),
					state		: item.getAttribute('data-state'),
					label		: item.getAttribute('data-label'),
					data		: item.getAttribute('data-data')
				}

				if (custom_events.click) {
					custom_events.click(data.domEvent, tag_obj)
				}

				if (custom_events.MouseUp && (click_element==='img' || click_element==='reference')) {
					custom_events.prevent_selectionChangeDone = click_element==='reference' ? true : false;
					// if the element clicked is not a img (any text or other elements in the editor) get the selection and fire mouseup
					const options = {
						selection	: '',
						node_name	: click_element
					}
					custom_events.MouseUp(data.domEvent, options)
				}
			});//end click event


			// editor.editing.view.document.on('mouseup', async function(evt, data ){
			// 	// get the name of the node clicked, 'img' 'p' 'div', etc
			// 	const click_element = data.target.name

			// 	if (custom_events.MouseUp && click_element==='img') {
			// 		// if the element clicked is not a img (any text or other elements in the editor) get the selection and fire mouseup
			// 		const options = {
			// 			selection : ''
			// 		}
			// 			// console.log("click_element:",click_element);
			// 			// console.log("options:",options);
			// 		custom_events.MouseUp(data.domEvent, options)
			// 	}
			// })
			editor.editing.view.document.on('selectionChangeDone', function(evt, data) {

				if(custom_events.prevent_selectionChangeDone === true){
					custom_events.prevent_selectionChangeDone = false
					return
				}

				if (custom_events.MouseUp) {
					// if the element clicked is not a img (any text or other elements in the editor) get the selection and fire mouseup
					const options = {
						selection : self.get_selection()
					}
					custom_events.MouseUp(
						null, // event (no DOM event in this case)
						options // object with selection info
					)
				}
			});//end click event

			// change data is used to observe changes in editor as insert or remove
			// select the image changes (tag changes) to fire event to other components
			// see the render_edit_component_text_area to see the event dispatched
			editor.editing.model.document.on('change:data', (evt, batch) => {
				const changes = editor.editing.model.document.differ.getChanges(); //{ includeChangesInGraveyard: true }
				const ar_changes =[]
				for (const entry of changes) {
					if (entry.name == 'imageInline' ) {
						const attributes = entry.attributes
						const type = attributes.get('type')
						const tag_id = attributes.get('tag_id')
						ar_changes.push({
							action	: entry.type, // insert || remove
							tag_id	: tag_id,
							type	: type // draw, geo, tc, indexIn, indexOut, svg. page, person, note, lang, reference
						})
					}
				}
				if (custom_events.changeData) {
					custom_events.changeData(evt, ar_changes)
				}
			});//end change:data event

		// keyup event
			editor.editing.view.document.on('keydown', function(evt, data ) {

				if (custom_events.KeyUp) {
					custom_events.KeyUp(data.domEvent, {})
				}
			}); //end keyup event


		return true
	}//end onsetup_editor



	/**
	* SETUP_button_reference
	* callback when ckeditor is ready
	* Capture the event fired in the editor and callback to the caller to be processed. See render_edit_component_text_area.js
	* @return bool
	*/
	this.setup_button_reference = function() {

		const self		= this
		const editor	= self.editor
		const key  		= self.key

		editor.commands.get( 'reference' ).on( 'execute', ( evt, args ) => {
			// fire event
			event_manager.publish('create_reference_'+ self.id_base + '_' + key, {
				caller		: self,
				text_editor	: self
			})

			const seleted_tag = self.get_selected_reference_element()

			// create the new tag for the reference
			const last_tag_id	= self.get_last_tag_id( {tag_type:'reference'} )
			const tag_id		= last_tag_id + 1

			const reference_tag		= {
				type	: 'reference',
				label	: 'reference ' + tag_id,
				tag_id	: String(tag_id),
				state	: 'n',
				data	: ''
			}
			const tag = (seleted_tag)
				? seleted_tag
				: self.caller.build_view_tag_obj(reference_tag, reference_tag.tag_id)

			// render the modal
			self.caller.render_reference({
				self		: self.caller,
				text_editor	: self,
				i			: key,
				tag			: tag
			})
		});


		return true
	}//end setup_button_reference



	/**
	* SET_CONTENT
	* get the tag parameters and create the node of the DOM using the ckeditor tools
	* insert the node in the caret position
	* @param tag_obj
	* Tag object with all parameters for create a view node in DOM
	* @return bool
	*/
	this.set_content = function(tag_obj) {

		const self		= this
		const editor	= self.editor

		editor.model.change( writer => {
			// get the end position of the selection
			const position = editor.model.document.selection.getLastPosition()
			// create the tag_node
			const model_tag_node = writer.createElement( 'imageInline', tag_obj) ;
			// Insert the html in the current selection location.
			editor.model.insertContent( model_tag_node, position );
		});

		self.is_dirty = true;


		return true
	}//end set_content



	/**
	* DELETE_TAG
	* @param tag_obj
	*  Tag object with all parameters for search the tag inside the model structure of ckeditor
	* @return promise bool
	*/
	this.delete_tag = function(tag_obj) {

		// options
			const type		= tag_obj.type
			const tag_id	= tag_obj.tag_id

		// short vars
			const self		= this
			const editor	= self.editor
			const ar_type	= (type instanceof Array)
				? type
				: [type]

		return new Promise(function(resolve) {

			// root. Whole editor document to traverse
				const root = editor.model.document.getRoot();

			// iterate multiple types like case [indexIn, indexOut]
			// note that it's necessary get the range in each iteration because
			// when a element is deleted, the range changes
			const ar_type_length = ar_type.length
			for (let i = 0; i < ar_type_length; i++) {

				// type
					const current_type = ar_type[i]

				// range. Create a range spanning over the entire root content:
					const range = editor.model.createRangeIn( root );

				// Iterate over all items in this range:
					for ( const value of range.getWalker({ ignoreElementEnd: true }) ) {

						const item = value.item

						// attributes. Get an object like:
						// {
						//   attributes : {data: '', label: 'label in 1', state: 'r', tag_id: '1', type: 'indexIn', …}
						//	 classes : ['index']
						// }
						const attributes = item._attrs

						if(attributes && attributes.size > 0) {

							const current_att_type		= attributes.get('type')
							const current_att_tag_id	= attributes.get('tag_id')

							if(current_att_tag_id==tag_id && current_att_type===current_type) {

								// remove
									editor.model.change( writer => {
										writer.remove( item )
									});

								// set dirty state
									self.set_dirty(true)

								// if the tag was found break the loop
									break;
							}
						}
					}//end for( const value of range.getWalker({ ignoreElementEnd: true }) )
			}//end for (let i = 0; i < ar_type_length; i++)

			resolve(true)
		})
	}//end delete_tag



	/**
	* GET_EDITOR_CONTENT_DATA
	* get the full data of the editor in html format to be saved
	* @return HTMLElement | false
	*/
	this.get_editor_content_data = function() {

		const self = this

		// editor
			const editor = self.editor
			if (!editor) {
				console.error("Error on get self.editor. Not available. self:", self);
				return false
			}

		// editor_content_data. get the domRoots map of the editor
			const domRoots				= editor.editing.view.domRoots;
			const editor_content_data	= domRoots.get('main') // Returns the root element of the editable area. For a non-inline iframe-based editor, returns the iframe's body element.
			if (!editor_content_data) {
				console.error("! INVALID editor_content_data (getBody) editor_content_data:", editor_content_data, " editor:", self.editor);
			}

		return editor_content_data
	}//end get_editor_content_data



	/**
	* GET_SELECTION
	* get the html fragment, in string format, selected by the user
	* @return string selection
	*	Raw string without formatting
	*/
	this.get_selection = function() {

		const self = this

		const editor = self.editor
		if (!editor) {
			return false
		}

		// get the user selection
		const user_selection = editor.model.document.selection

		// get the content of the selection, it get the html representation
		const content = editor.model.getSelectedContent(user_selection)

		// convert the ckeditor data to html in string format
		const selection = editor.data.stringify(content)


		return selection
	}//end get_selection



	/**
	* WRAP_SELECTION_WITH_TAGS
	* get the tag_in and the tag out
	* @param tag_obj_in
	* object with the definition of the in tag options
	* @param tag_obj_out
	* object with the definition of the out tag options
	* @return bool
	*/
	this.wrap_selection_with_tags = function(tag_obj_in, tag_obj_out) {

		const self 	 = this
		const editor = self.editor

		editor.model.change( writer => {
			// convert the html to the model of ck_editor

			// get the in position of the selection
			const in_position = editor.model.document.selection.getFirstPosition()

			const model_tag_obj_in = writer.createElement( 'imageInline', tag_obj_in );

			editor.model.insertContent( model_tag_obj_in, in_position );

		});

		editor.model.change( writer => {
			// get the out position of the selection
			const out_position = editor.model.document.selection.getLastPosition()

			const model_tag_obj_out = writer.createElement( 'imageInline', tag_obj_out );
			// convert the html to the model of ck_editor
			editor.model.insertContent( model_tag_obj_out, out_position );
		});

		editor.editing.view.focus();
		self.is_dirty = false;


		return true
	}//end wrap_selection_with_tags



	/**
	* SET_SELECTION_FROM_TAG
	* @param object|null tag_obj
	* Tag object with all parameters for search the tag inside the model structure of ckeditor
	* @return void
	*/
	this.set_selection_from_tag = function(tag_obj) {

		// short vars
			const self = this

		// Check the tag to be the type reference
		// reference tags don't need find the in and out because it has a close node
		// <reference>text to be selected</reference>
			if(tag_obj || (tag_obj.type==='reference')){

				const editor	= self.editor

				const tag_reference	= self.get_view_tag(tag_obj)
				editor.editing.view.change((writer) => {
					writer.setSelection( tag_reference, 'on' );
				});
			}

		// Index tags has a span to mark the in and other span to mark out as:
		// <span data.type="indexIn"></span>text to be selected<span data.type="indexOut"></span>
		// Check the tag to be the type indexXX
			if(!tag_obj || (tag_obj.type!=='indexIn' && tag_obj.type!=='indexOut')){
				return false
			}

		// tag_view_in. change the type to set it as indexIn and get the view tag in
			const tag_obj_in	= { ...tag_obj };
			tag_obj_in.type		= 'indexIn'
			const tag_view_in	= self.get_view_tag(tag_obj_in)

		// tag_view_out. change the type to set it as indexOut and get the view tag out
			const tag_obj_out	= { ...tag_obj };
			tag_obj_out.type	= 'indexOut'
			const tag_view_out	= self.get_view_tag(tag_obj_out)

		// selection_from_view_tags
			if(tag_view_in && tag_view_out){
				self.set_selection_from_view_tags(tag_view_in, tag_view_out)
			}else{
				console.warn('Invalid tag_view_in/tag_view_out:', tag_view_in, tag_view_out);
			}
	}//end set_selection_from_tag



	/**
	* GET_SELECTION_FROM_TAGS
	* Set selection and scroll selection into the view
	* @param object tag_view_in
	* 	tag representation in ckeditor view structure, it's a object with the parameters of the ckeditor for tag in
	* @param object tag_view_out
	* 	tag representation in ckeditor view structure, it's a object with the parameters of the ckeditor for tag out
	* @return void
	*/
	this.set_selection_from_view_tags = function(tag_view_in, tag_view_out) {

		const self 	 = this
		const editor = self.editor

		editor.editing.view.change((writer) => {

			const start = writer.createPositionAt(
				tag_view_in,
				'after'
			);

			const end = writer.createPositionAt(
				tag_view_out,
				'before'
			);

			// create the range of the new position
			const range = writer.createRange(start, end);

			writer.setSelection( range );
		});
	}//end get_selection_from_tags



	/**
	 * SCROLL_TO_SELECTION
	 * Scroll the editor to show the selection.
	 * get the view selection and move the editor to center the range
	 * @return void
	 */
	this.scroll_to_selection = function() {

		const self		= this
		const editor	= self.editor

		const selection	= editor.editing.view.document.selection;
		const range		= selection.getFirstRange()

		if(range){
			editor.editing.view.scrollToTheSelection({
				target			: editor.editing.view.domConverter.viewRangeToDom(range),
				viewportOffset	: 40
			});
		}
	}//end scroll_to_selection



	/**
	* GET_VIEW_TAG
	* @param obj tag_obj
	* 	Tag object with all parameters for search the tag inside the model structure of ckeditor
	* @return bool
	*/
	this.get_view_tag = function(tag_obj) {

		// the view type will need to be the same of the tag_obj
			const type = tag_obj.type

		// the view tag_id will need to be the same of the tag_obj
			const tag_id = tag_obj.tag_id

		// short vars
			const self		= this
			const editor	= self.editor

		// check
			if (!editor || !editor.editing) {
				console.error('get_view_tag. Editor is not available:', editor);
				return false
			}

		// root. Whole editor document to traverse
			const root = editor.editing.view.document.getRoot();

		// range. Create a range spanning over the entire root content:
			const range = editor.editing.view.createRangeIn( root );

		// Iterate over all items in this range:
			for ( const value of range.getWalker({ ignoreElementEnd: true }) ) {

				const item = value.item

				if(item.name !== 'img' && item.name !== 'reference'){
					continue
				}

				// attributes. Get an object like:
				// {
				//   attributes : {data: '', label: 'label in 1', state: 'r', tag_id: '1', type: 'indexIn', …}
				//	 classes : ['index']
				// }
				// const htmlAttributes = item.getAttribute('htmlAttributes')
				// const htmlAttributes = item.getAttributes()
				const parent_item = (item.name === 'img')
					? item.parent
					: item

				const attributes = parent_item._attrs

				if(attributes && attributes.size > 0) {

					const current_type		= attributes.get('data-type')
					const current_tag_id	= attributes.get('data-tag_id')

					if(current_type===type && current_tag_id===tag_id) {
						return parent_item
					}
				}
			}//end for ( const value of range.getWalker({ ignoreElementEnd: true }) )


		return false
	}//end get_pair_tag



	/**
	* GET_VIEW_TAG_NODE
	* Get the DOM element of the tag
	* If the tag is a index the DOM element will be the span (it context the img node as child)
	* @param object tag_obj
	* Tag object with 'type' and 'tag_id' parameters for search the tag inside the model structure of ckeditor
	* @return HTMLElement tag_node
	*/
	this.get_view_tag_node = function(tag_obj) {

		const self		= this
		const editor	= self.editor

		// the view type will need to be the same of the tag_obj
			const type = tag_obj.type

		// the view tag_id will need to be the same of the tag_obj
			const tag_id = tag_obj.tag_id

		// get view_tag
			const view_tag = self.get_view_tag({
				type	: type,
				tag_id	: tag_id.toString()
			})
		// get the DOM node of the view_tag, it will be the span node with the img node
			const tag_node = editor.editing.view.domConverter.mapViewToDom(view_tag)


		return tag_node
	}//end get_view_tag_node



	/**
	* GET_LAST_TAG_ID
	* Calculates all current text_editor editor tags id of given type (ex. 'tc') and get last used id
	* @param object options
	*	object with the tag parameters, here use only tag_type to search in the ckeditor model structure
	* @return int last_tag_id
	*/
	this.get_last_tag_id = function(options) {

		// if the tag_type is index change to indexIn, index type is not used in the dataset of the tag and it's not parse to the model.
			const type = options.tag_type==='index'
				? 'indexIn'
				: options.tag_type

		// short vars
			const self		= this
			const editor	= self.editor

		// root. Whole editor document to traverse
			const root = editor.model.document.getRoot();

		// range. Create a range spanning over the entire root content:
			const range = editor.model.createRangeIn( root );

		// ar_tag_id, array with all id of the tags nodes
			const ar_tag_id = [0]

		// Iterate over all items in this range:
			for ( const value of range.getWalker({ ignoreElementEnd: true }) ) {

				const item = value.item

				// attributes. Get an object like:
				// {
				//   attributes : {data: '', label: 'label in 1', state: 'r', tag_id: '1', type: 'indexIn', …}
				//	 classes : ['index']
				// }
				// const htmlAttributes = item.getAttribute('htmlAttributes')
				// const htmlAttributes = item.getAttributes()
				const current_type = item.hasAttribute('reference')
					? item.getAttribute( 'reference' ).type
					: item.getAttribute( 'type' )


				// if(attributes && attributes.size > 0) {

					// const current_type		= attributes.get('type')
					// const current_tag_id	= attributes.get('tag_id')

					if( current_type && current_type === type ) {
						 const current_tag_id	= item.hasAttribute('reference')
							? item.getAttribute( 'reference' ).tag_id
							: item.getAttribute(' tag_id' )

						ar_tag_id.push(current_tag_id)
					}
				// }
			}//end for ( const value of range.getWalker({ ignoreElementEnd: true }) )

		const last_tag_id = Math.max(...ar_tag_id);


		return last_tag_id
	}//end get_last_tag_id



	/**
	* GET_VIEW_TAG_ATTRIBUTES
	* @param tag_obj
	* Tag object with type and tag_id for search the tag inside the model structure of ckeditor
	* @return object|null
	* 	sample: {data: '', label: 'label in 1', state: 'r', tag_id: '1', type: 'indexIn', …}
	*/
	this.get_view_tag_attributes = function(tag_obj) {

		// the view type will need to be the same of the tag_obj
			const type = tag_obj.type

		// the view tag_id will need to be the same of the tag_obj
			const tag_id = tag_obj.tag_id

		// short vars
			const self		= this
			const editor	= self.editor

		// root. Whole editor document to traverse
			const root = editor.editing.view.document.getRoot();

		// range. Create a range spanning over the entire root content:
			const range = editor.editing.view.createRangeIn( root );

		// Iterate over all items in this range:
			for ( const value of range.getWalker({ ignoreElementEnd: true }) ) {

				const item = value.item

				// ignore non image elements
					if(item.name !== 'img' && item.name !== 'reference') {
						continue
					}

				// attributes. Get an object map like:
				// {
				//   attributes : {data: '', label: 'label in 1', state: 'r', tag_id: '1', type: 'indexIn', …}
				//	 classes : ['index']
				// }
				// when the tag is a img get his parent (the span with the attributes)
				// else get the item as reference (the attributes are into same node)
				const parent_item = (item.name === 'img') ? item.parent : item;

				const attributes = parent_item._attrs

				if(attributes && attributes.size > 0) {

					const tag_attributes = {
						type	: attributes.get('data-type'),
						tag_id	: attributes.get('data-tag_id'),
						state	: attributes.get('data-state'),
						label	: attributes.get('data-label'),
						data	: attributes.get('data-data')

					}
					if(tag_attributes.type===type && tag_attributes.tag_id===tag_id) {
						return tag_attributes
					}
				}
			}//end for ( const value of range.getWalker({ ignoreElementEnd: true }) )

		return null
	}//end get_pair_tag



	/**
	* UPDATE_TAG
	* Find and change target tag in editor
	* @param object options
	* Sample:
	* {
	* 	type : [indexIn,indexOut]
	* 	tag_id : 1,
	* 	new_data_obj : { type : n } (former dataset)
	* }
	* @return promise
	*/
	this.update_tag = function(options) {

		// options
			const type			= options.type
			const tag_id		= options.tag_id
			const new_data_obj	= options.new_data_obj // all properties need to be his type (object, string, etc) do not send stringify properties

		// short vars
			const self		= this
			const editor	= self.editor
			const ar_type	= (type instanceof Array)
				? type
				: [type]
			let changed = 0

		return new Promise(function(resolve) {

			// root. Whole editor document to traverse
				const root = editor.model.document.getRoot();

			// range. Create a range spanning over the entire root content:
				const range = editor.model.createRangeIn( root );

			// Iterate over all items in this range:
				for ( const value of range.getWalker({ ignoreElementEnd: true }) ) {

					const item = value.item

					// attributes. Get an object like:
					// {
					//   attributes : {data: '', label: 'label in 1', state: 'r', tag_id: '1', type: 'indexIn', …}
					//	 classes : ['index']
					// }
					const attributes = item._attrs

					if(attributes && attributes.size > 0) {

						const current_type		= attributes.get('type')
						const current_tag_id	= attributes.get('tag_id')

						if(current_tag_id==tag_id && ar_type.includes(current_type)) {

							// short vars
								const current_state	= attributes.get('state')
								const current_label	= attributes.get('label')
								const current_data	= attributes.get('data')
								const current_src	= item.getAttribute('src')

							// edit_attributes. Clone attributes to prevent unwanted events trigger
								const edit_attributes = clone(attributes)

							// add/replace new_data_obj properties given
								for (const name in new_data_obj) {

									const current_value = name==='data'
										? self.caller.tag_data_object_to_string(new_data_obj[name])
										: new_data_obj[name]

									edit_attributes.set(name, current_value)
								}

							// id. Re-create the id like [/index-n-1-label in 1]
								const data_tag = {
									type	: current_type, // type
									tag_id	: current_tag_id, // tag_id
									state	: new_data_obj.state || current_state, // state
									label 	: new_data_obj.label || current_label, // label
									data	: new_data_obj.data || current_data // data
								}
								const new_tag	= self.caller.build_view_tag_obj( data_tag, current_tag_id )
								const new_id	= new_tag.id
								edit_attributes.set('src_id' , new_id)

							// set to model
								editor.model.change( writer => {
									writer.setAttributes( edit_attributes, item );
									if(data_tag.type !=='reference'){
										// image_url. Replace url var id with updated id tag
										const image_url = current_src.split('?')[0] + '?id=' + new_id
										writer.setAttribute( 'src', image_url, item );
									}
								});

							// set dirty state
								self.set_dirty(true)

							// changed
								changed++;

							// if the tag was found break the loop
								if (ar_type.length===changed) {
									break;
								}
						}
					}
				}//end for( const value of range.getWalker({ ignoreElementEnd: true }) )

			resolve(true)
		})
	}//end update_tag



	/**
	* SET_DIRTY
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
				self.caller.update_changed_data({
					text_editor	: self,
					key			: self.key
				})
			}

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
	* @return HTMLElement toolbar_node
	*/
	this.build_toolbar = function(editor_config) {

		const self = this
		const editor = self.editor

		const toolbar_container = self.toolbar_container

		// editor config vars
			// toolbar array with the order of the buttons like:
			// ['bold','italic','underline','|','undo','redo']
			const toolbar = editor_config.toolbar
			// custom_buttons array of the buttons objects with the own configuration
			const custom_buttons = editor_config.custom_buttons

			const toolbar_length = toolbar.length
			for (let i = 0; i < toolbar_length; i++) {

				const toolbar_item = toolbar[i]

				const button_config = custom_buttons.find(el => el.name === toolbar_item)
				if(!button_config){
					console.warn("Button object definition doesn't exist:", toolbar_item);
					continue
				}
				// create the node in the text_area render (common for all text_editors tinny, ckeditor, etc.)
				const button_node	= render_button(button_config)
				button_config.node	= button_node
				// when the button need to be processed by the editor, use the factory
				if(button_config.manager_editor === true){
					self.factory_events_for_buttons(button_config)
				}

				toolbar_container.appendChild(button_node)

				toolbar_container.addEventListener('mousedown', function(evt){
					evt.preventDefault()
					evt.stopPropagation()
				})
			}

		// toolbar toggle event
			// // show toolbar_container on user mousedown
			// // removes the toolbar_container when user click outside
			// const node = toolbar_container.parentNode
			// node.addEventListener("mousedown", function() {
			// 	// remove the hide class to show the toolbar
			// 	toolbar_container.classList.remove('hide')
			// 	document.body.addEventListener("mouseup", fn_remove)
			// })
			// function fn_remove(e) {
			// 	if (e.target!==node) {
			// 		const path	= e.composedPath()
			// 		const found	= path.find(el => el===node)
			// 		if (!found) {
			// 			toolbar_container.classList.add('hide')
			// 			document.body.removeEventListener("mouseup", fn_remove)
			// 		}
			// 	}
			// }

		return toolbar_container
	}//end this.build_toolbar



	/**
	* FACTORY_EVENTS_FOR_BUTTONS
	* @param button_obj
	* definition of the button, it's created at render of the caller as: render_edit_component_text_area.js
	* Like
	* {
	*	name			: "button_geo",
	*	manager_editor	: false,
	*	options	: {
	*		tooltip	: 'Add georef',
	*		image	: '../../core/themes/default/icons/geo.svg',
	*		onclick	: function(evt) {
	*			event_manager.publish('create_geo_tag_'+ self.id_base, {
	*				caller		: self,
	*				text_editor	: text_editor
	*			})
	*		}
	*	}
	* }
	* @return bool
	*/
	this.factory_events_for_buttons = function(button_obj) {

		const self = this
		const editor = self.editor

		const name		= button_obj.name
		const button	= button_obj.node

		// html_source case. Editing the html_souece button doesn't has command, call it by the state of the plug-ing
			if(name==='html_source') {
				// Clicking the buttons should execute the editor command...
				button.addEventListener('click', function(){
					const state = editor.plugins.get( 'SourceEditing' ).isSourceEditingMode
					editor.plugins.get( 'SourceEditing' ).isSourceEditingMode = !state
				})
				return
			}

		// find_and_replace case
			if(name==='find_and_replace') {
				button.addEventListener('click', function(){
					render_find_and_replace(editor)
				})
				return
			}

		// command. Retrieve the editor command corresponding with the ID of the button in the DOM.
			const command = editor.commands.get( name );

		// Clicking the buttons should execute the editor command...
			button.addEventListener('click', function(){
				editor.execute( name )
				editor.editing.view.focus();
			})

		// ...but it should not steal the focus so the editing is uninterrupted.
			const onValueChange = () => {
				if(command.value){
					button.classList.add('active')
				}else{
					button.classList.remove('active')
				}
			};
			editor.listenTo( command, 'change:value', (evt)=>{
				if ( !new Set( [ 'undo', 'redo' ] ).has( name ) ) {
					onValueChange();
				}
			})

		// change the state of the button if the command is not enable
			const onIsEnabledChange = () => {

				if(!command.isEnabled){
					button.classList.add('disable')
				}else{
					button.classList.remove('disable')
				}
			};
			editor.listenTo( command, 'change:isEnabled', (evt)=>{
				onIsEnabledChange()
			})


		return true
	}//end factory_events_for_buttons



	/**
	* _GETVALUEFROMFIRSTALLOWEDNODE
	* Checks the attribute value of the first node in the selection that allows the attribute.
	* For the collapsed selection returns the selection attribute.
	* @private
	* @returns bool
	*  The attribute value.
	*/

	this._getValueFromFirstAllowedNode = function() {
		const model		= this.editor.model;
		const schema	= model.schema;
		const selection	= model.document.selection;

		if ( selection.isCollapsed ) {
			return selection.hasAttribute( this.attributeKey );
		}

		for ( const range of selection.getRanges() ) {
			for ( const item of range.getItems() ) {
				if ( schema.checkAttribute( item, this.attributeKey ) ) {
					return item.hasAttribute( this.attributeKey );
				}
			}
		}

		return false;
	}//end _getValueFromFirstAllowedNode



	/**
	* GET_SELECTED_REFERENCE_ELEMENT
	* Returns the link {@link module:engine/view/attributeelement~AttributeElement} under
	* the {@link module:engine/view/document~Document editing view's} selection or `null`
	* if there is none.
	*
	* **Note**: For a non–collapsed selection, the link element is returned when **fully**
	* selected and the **only** element within the selection boundaries, or when
	* a linked widget is selected.
	*
	* @private
	* @return {module:engine/view/attributeelement~AttributeElement|null}
	*/
	this.get_selected_reference_element = function() {

		const self		= this
		const editor	= self.editor

		const model		= editor.model;
		const selection	= model.document.selection;

		// get the reference_editing plug-ing to get ck_funcitonalities
		const reference_editing = editor.plugins.get( 'reference_editing' )
		const selectedElement	= selection.getSelectedElement() || reference_editing.first( selection.getSelectedBlocks() );

		function is_referable_element( element, schema ) {
			if ( !element ) {
				return false;
			}
			return schema.checkAttribute( element.name, 'reference' );
		}
		// A check for any integration that allows reference elements.
		// Currently the selection reads attributes from text nodes only.
		// if ( is_referable_element( selectedElement, model.schema ) ) {
		const value = ( is_referable_element( selectedElement, model.schema ) )
				? selectedElement.getAttribute( 'reference' )
				: selection.getAttribute( 'reference' )


		return value
	}//end get_selected_reference_element



	/**
	* FIND_REFERENCE_ELEMENT_ANCESTOR
	* Returns `true` if a given view node is the reference element.
	*
	* @param {module:engine/view/node~Node} node
	* @return bool
	*/
	this.find_reference_element_ancestor = function ( position ) {

		const node = position.getAncestors()

		return node.find( ancestor =>
			ancestor.is( 'attributeElement' ) && !!ancestor.getCustomProperty( 'reference' )
		);
	}//end find_reference_element_ancestor



	/**
	* SET_REFERENCE
	* @param object options
	* Sample:
	* {
	* 	type : [indexIn,indexOut]
	* 	tag_id : 1,
	* 	new_data_obj : { type : n } (former dataset)
	* }
	* @return void
	*/
	this.set_reference = function(options) {

		const self		= this
		const editor	= self.editor

		const new_data_obj			= options.new_data_obj // all properties need to be his type (object, string, etc) do not send stringify properties
		const locator_text_value	= options.locator_text_value

		const model		= editor.model;
		const selection	= model.document.selection;
		// get the reference_editing plugin to get ck_funcitonalities
		const reference_editing = editor.plugins.get( 'reference_editing' )

		model.change( writer => {
			// If selection is collapsed then update selected link or insert new one at the place of caret.
			if ( selection.isCollapsed ) {
				const position = selection.getFirstPosition();

				// When selection is inside text with `reference` attribute.
				if ( selection.hasAttribute( 'reference' ) ) {
					// Then update `reference` value.
					const reference_range = reference_editing.findAttributeRange( position, 'reference', selection.getAttribute( 'reference' ), model );

					writer.setAttribute( 'reference', new_data_obj, reference_range );

					// Put the selection at the end of the updated link.
					writer.setSelection( writer.createPositionAfter( reference_range.end.nodeBefore ) );
				}
				// If not then insert text node with `reference` attribute in place of caret.
				// However, since selection is collapsed, attribute value will be used as data for text node.
				else {
					const attributes = new Map( selection.getAttributes() );

					attributes.set( 'reference', new_data_obj );

					const { end: positionAfter } = model.insertContent( writer.createText( locator_text_value, attributes ), position );

					// Put the selection at the end of the inserted link.
					// Using end of range returned from insertContent in case nodes with the same attributes got merged.
					writer.setSelection( positionAfter );
				}

				// Remove the `reference` attribute and all link decorators from the selection.
				// It stops adding a new content into the link element.
				// [ 'reference', ...truthyManualDecorators, ...falsyManualDecorators ].forEach( item => {
				writer.removeSelectionAttribute( 'reference' );
				// } );
			}else{
				// If selection has non-collapsed ranges, we change attribute on nodes inside those ranges
				// omitting nodes where the `reference` attribute is disallowed.
				const ranges = model.schema.getValidRanges( selection.getRanges(), 'reference' );

				// But for the first, check whether the `reference` attribute is allowed on selected blocks (e.g. the "image" element).
				const allowedRanges = [];

				for ( const element of selection.getSelectedBlocks() ) {
					if ( model.schema.checkAttribute( element, 'reference' ) ) {
						allowedRanges.push( writer.createRangeOn( element ) );
					}
				}

				// Ranges that accept the `reference` attribute. Since we will iterate over `allowedRanges`, let's clone it.
				const rangesToUpdate = allowedRanges.slice();

				const is_range_to_update = function( range, allowedRanges ) {
					for ( const allowedRange of allowedRanges ) {
						// A range is inside an element that will have the `reference` attribute. Do not modify its nodes.
						if ( allowedRange.containsRange( range ) ) {
							return false;
						}
					}
					return true;
				}

				// For all selection ranges we want to check whether given range is inside an element that accepts the `reference` attribute.
				// If so, we don't want to propagate applying the attribute to its children.
				for ( const range of ranges ) {
					if ( is_range_to_update( range, allowedRanges ) ) {
						rangesToUpdate.push( range );
					}
				}

				for ( const range of rangesToUpdate ) {
					writer.setAttribute( 'reference', new_data_obj, range );
				}
			}
		});
	}//end set_reference



	/**
	* REMOVE_REFERENCE
	* @return void
	*/
	this.remove_reference = function() {

		const self		= this
		const editor	= self.editor
		const model		= editor.model;
		const selection	= model.document.selection;

		// get the reference_editing plugin to get ck_funcitonalities
		const reference_editing = editor.plugins.get( 'reference_editing' )

		model.change( writer => {
			// Get ranges to unlink.
			const ranges_to_remove = selection.isCollapsed ?
				[ reference_editing.findAttributeRange(
					selection.getFirstPosition(),
					'reference',
					selection.getAttribute( 'reference' ),
					model
				) ] :
				model.schema.getValidRanges( selection.getRanges(), 'reference' );

			// Remove `reference` attribute from specified ranges.
			for ( const range of ranges_to_remove ) {
				writer.removeAttribute( 'reference', range );
			}
		});
	}//end remove_reference



	/**
	* FOCUS
	* Focus editor and set pointer to the end of text
	* @return void
	*/
	this.focus = function() {

		const editorInstance = this.editor
		if (!editorInstance) {
			console.warn('Editor is available', this);
			return
		}

		editorInstance.model.change( writer => {
			writer.setSelection( writer.createPositionAt( editorInstance.model.document.getRoot(), 'end' ));
			editorInstance.editing.view.focus();
		});
	}//end focus



	/**
	* DESTROY
	* @return void
	*/
	this.destroy = async function() {

		if (this.editor) {
			await this.editor.destroy()
			.catch( error => {
				console.error( error );
			})

			this.editor = null
		}

		// delete_instance from instances register array
		const instance_options = {
			id : self.id
		}
		await delete_instance(instance_options)
	}//end destroy



}//end service_ckeditor



// @license-end
