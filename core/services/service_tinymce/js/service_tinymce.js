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
				// init_instance_callback_editor  : this.init_instance_callback_editor.bind(this),
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
	* init_instance_callback_editor
	* @return
	*/
	// this.init_instance_callback_editor = function(editor) {

	// 	const self = this

	// 		console.log("editor:",editor);

	// 		// container size
	// 		const container_height = self.container.offsetHeight;
	// 			console.log("container_height:",container_height);

	// 		var positionInfo = self.container.getBoundingClientRect();
	// 		var height = positionInfo.height;
	// 			console.log("height:",height);

	// };//end init_instance_callback_editor



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

		// set value to editor
		// editor.setContent("<small>"+ self.caller.id + "</small><hr>" + self.options.value);

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



	/**
	* INIT
	*/
	this.init__OLD = async function (caller, container, options) {


		// useful but not used
			// // await until element dd-tiny changes id attribute (changed when tinnymc is ready)
			// const changes = await observe_changes(dd_tinny, {attributes:true}, true)
			// // editor . get current by id from tinymce editors
			// const editor = tinymce.get(dd_tinny.id)
			// // set editor as component property
			// caller.editor = editor

			// // set value to editor
			// editor.setContent("<small>"+ caller.id + "</small><hr>" +options.value);

			// // focus event
			// 	editor.on('focus', function(evt) {

			// 		alert("focus");
			// 		editor.isNotDirty = true; // Force not dirty state
			// 	});//end focus event

			// // blur event
			// 	editor.on('blur', function(evt) {

			// 		// alert("blur");
			// 	});//end blur event

		// return

		// console.log("current_active_editor:",current_active_editor);

		// get tiny editor
		// tinymce.get(dd_tinny.id).setContent('...content here... '+caller.id);



		// setTimeout(()=>{
			// tinymce.get(dd_tinny.id).setContent('...content here... '+caller.id);
		// },2000)


		return


		// text area node
			// const fragment= new DocumentFragment()
			const text_area = ui.create_dom_element({
				element_type 	: 'textarea',
				// id 				: text_area_id,
				// class_name 		: 'hide',
				parent 		 	: container,
				inner_html 		: "id: "   + caller.id
			})

				console.log("text_area:",text_area);
			// fragment.appendChild(text_area)
			//container.appendChild(text_area)

		// load_dependences
			// const load = await self.load_dependences()

		// wait until tinymce is really available (not only loaded) max 10 secs
			// await wait_for_global('tinymce', 300)


		// editor build
			tinymce.init({
				// selector : text_area,
				// selector : '#'+text_area_id,
				target 	 : text_area,
				// mode 	 : "textareas",
				setup 	 : function(ed) {

					// init
					ed.on('init', function(evt) {
						console.log("+++++++++++++ init evt:",evt);
						// container.appendChild(text_area)
					});

						// // POSTRENDER EVENT
						ed.on('PostRender', function(evt){
							console.log("+++++++++++++ PostRender evt:",evt);
							// container.appendChild(text_area)
						});


						// // FOCUS EVENT
						// ed.on('focus', function(evt) {


						// 	ed.isNotDirty = true; // Force not dirty state
						// });// END FOCUS EVENT


						// // BLUR EVENT
						// ed.on('blur', function(evt) {

						// });// END BLUR EVENT


						// // CHANGE EVENT
						// ed.on('change', function(evt) {

						// });// END BLUR EVENT


						// // CLICK EVENT
						// ed.on('click', function(evt) {

						// });// END CLICK EVENT


						// // MOUSEUP EVENT
						// ed.on('MouseUp', function(evt) {

						// });//END MOUSEUP EVENT

						// // KEYPRESS
						// ed.on('KeyPress', function(evt) {

						// 	// var minor_that_key = 60 // 188
						// 	// var more_that_key  = 62	// 190

						// 	// if(evt.keyCode===minor_that_key || evt.keyCode===more_that_key) {
						// 	// 	evt.preventDefault()

						// 	// 	switch(evt.keyCode) {
						// 	// 		case minor_that_key:
						// 	// 			ed.insertContent("[")
						// 	// 			break;
						// 	// 		case more_that_key:
						// 	// 			ed.insertContent("]")
						// 	// 			break;
						// 	// 	}
						// 	// 	alert("Warning! This key is reserved and will be replaced for safe char. Key: " + evt.key + " ["+evt.keyCode+"]" );
						// 	// }
						// });

						// // KEY UP EVENT
						// ed.on('KeyUp', function(evt) {

						// });//END KEY UP EVENT

				}//end setup
			})



			return





	////////////////////////






		// // render_tiny
		// 	function render_tiny() {

		// 		// unavailable case
		// 			if (typeof(tinymce)==="undefined") {
		// 				console.error("Unable to get tinymce");
		// 				alert("Editor unavailable");
		// 				return text_area
		// 			}

		// 		// console.log("++++++++++++++tinymce.editors:",tinymce, tinymce.editors);
		// 		// const a = document.getElementById(text_area.id)
		// 		// console.log("a:",text_area.id,a);
		// 		// console.log("text_area:",text_area);

		// 		// editor remove if exists before init (necessary for pagination)
		// 			// window.tinymce.dom.Event.domLoaded = true;
		// 			// tinymce.remove('#'+text_area_id);

		// 		// editor build
		// 			const tiny_build_promise = tinymce.init({
		// 				// selector : text_area,
		// 				// selector : '#'+text_area_id,
		// 				target 	 : text_area,
		// 				// mode 	 : "textareas",
		// 				setup 	 : function(ed) {

		// 					// init
		// 					ed.on('init', function(evt) {
		// 						console.log("+++++++++++++ init evt:",evt);
		// 						// container.appendChild(text_area)
		// 					});

		// 						// // POSTRENDER EVENT
		// 						ed.on('PostRender', function(evt){
		// 							console.log("+++++++++++++ PostRender evt:",evt);
		// 							// container.appendChild(text_area)
		// 						});


		// 						// // FOCUS EVENT
		// 						// ed.on('focus', function(evt) {


		// 						// 	ed.isNotDirty = true; // Force not dirty state
		// 						// });// END FOCUS EVENT


		// 						// // BLUR EVENT
		// 						// ed.on('blur', function(evt) {

		// 						// });// END BLUR EVENT


		// 						// // CHANGE EVENT
		// 						// ed.on('change', function(evt) {

		// 						// });// END BLUR EVENT


		// 						// // CLICK EVENT
		// 						// ed.on('click', function(evt) {

		// 						// });// END CLICK EVENT


		// 						// // MOUSEUP EVENT
		// 						// ed.on('MouseUp', function(evt) {

		// 						// });//END MOUSEUP EVENT

		// 						// // KEYPRESS
		// 						// ed.on('KeyPress', function(evt) {

		// 						// 	// var minor_that_key = 60 // 188
		// 						// 	// var more_that_key  = 62	// 190

		// 						// 	// if(evt.keyCode===minor_that_key || evt.keyCode===more_that_key) {
		// 						// 	// 	evt.preventDefault()

		// 						// 	// 	switch(evt.keyCode) {
		// 						// 	// 		case minor_that_key:
		// 						// 	// 			ed.insertContent("[")
		// 						// 	// 			break;
		// 						// 	// 		case more_that_key:
		// 						// 	// 			ed.insertContent("]")
		// 						// 	// 			break;
		// 						// 	// 	}
		// 						// 	// 	alert("Warning! This key is reserved and will be replaced for safe char. Key: " + evt.key + " ["+evt.keyCode+"]" );
		// 						// 	// }
		// 						// });

		// 						// // KEY UP EVENT
		// 						// ed.on('KeyUp', function(evt) {

		// 						// });//END KEY UP EVENT

		// 				}//end setup
		// 			})
		// 			// .then(function(ed){
		// 			// 	// promises resolve the new created editor
		// 			// 	console.log("++++++++++++++ TINYMC INITED ed:",ed);

		// 			// });

		// 		return tiny_build_promise
		// 	}//end function render_tiny

		// 	// event_manager.publish('render_'+self.id, node)
		// 	// event_manager.subscribe('render_'+caller.id , async (node) => {
		// 	// setTimeout(async ()=>{
		// 		//event_manager.subscribe('render_instance', (el)=>{
		// 			//console.log("el.id:",el.model, el.id);
		// 		//	if (el.model==='section') { // if (el.id==='page') {
		// 				render_tiny().then(function(ed){
		// 					self.ed = ed
		// 					console.log("TINY RENDERED! ed:", ed[0].id);

		// 				})
		// 		//	}
		// 		//})//end event_manager.subscribe
		// 	// },10)// end setTimeout
		// 	// })//end event_manager.subscribe



		// return




		//var text_area_component = $('#'+text_area_id);
			let text_area_component = document.getElementById(text_area_id) // Use let (reasignable)
				if(!text_area_component) {
					if(SHOW_DEBUG) console.log("Ops.. text_area_component not found. text_area_id: "+text_area_id)
					return false;
				}

			let text_area_wrapper	= component_common.get_wrapper_from_element(text_area_component) // Use let (reasignable)
			let	cssFile				= DEDALO_CORE_URL + '/component_text_area/css/' + 'mce_editor_default.css?' + page_globals.dedalo_version
			let	editor_height		= parseInt(window.getComputedStyle(text_area_wrapper).height)-60; //126

			if(!editor_height) {
				editor_height = 125
			}

		// BODY_CLASS . Propagate component propiedades.wrap_css_selectors to editor body styles
			let body_class = null; // 'viewing_glyphs'
			if(typeof text_area_wrapper.dataset.component_info!=="undefined"){

				const component_info = JSON.parse(text_area_wrapper.dataset.component_info)
				if (component_info.propiedades && component_info.propiedades.wrap_css_selectors && component_info.propiedades.wrap_css_selectors[modo]) {
					body_class = component_info.propiedades.wrap_css_selectors[modo]
				}
			}

		// CONTEXT_NAME
			if(typeof text_area_wrapper.dataset.related_name!=='undefined'){

				const related_component_name = JSON.parse(text_area_wrapper.dataset.related_name)
				const related_component_length = related_component_name.length

				if(related_component_length > 0 ){
					for (let i = related_component_length - 1; i >= 0; i--) {

						if (related_component_name[i]!=='component_select_lang' || typeof context_name!=='undefined' || context_name==='') {
							context_name = related_component_name[i];
							//console.log("[mce_editor.init] context_name",context_name);
						}
					}
				}
			}
		// tabindex heritage from textarea
		//var text_area_tabindex = text_area_component.getAttribute('tabindex')
		//$('#'+text_area_id+'_ifr').attr('tabindex', 1);
		//text_area_component.setAttribute('tabindex',null);

		// propiedades_obj
			let propiedades_obj = {}
			if(typeof propiedades==="string"){
				// parse propiedades string
				propiedades_obj = JSON.parse(propiedades)
			}else if(typeof propiedades==="object") {
				propiedades_obj = propiedades
			}

		// current_statusbar
			let current_statusbar = true
			if(propiedades_obj && propiedades_obj.statusbar===false){
				current_statusbar = false
			}

		// CONFIG DEFAULT
			let current_inline 	 = false
			let	current_menubar  = false
			let	current_toolbar  = "bold italic underline undo redo searchreplace pastetext code fullscreen | button_save"
			let	current_plugings = ["paste","image","print","searchreplace","code","fullscreen","noneditable"]// "wordcount"
			// TR rsc36 case
			if (text_area_wrapper.dataset && text_area_wrapper.dataset.tipo==='rsc36') {
				current_plugings.push("wordcount")
			}

		switch(modo) {
			case 'tool_transcription':
					if(context_name === 'component_geolocation') {
						current_toolbar  = "bold italic undo redo searchreplace pastetext code fullscreen | button_geo | button_note | button_save"
					}else{
						current_toolbar  = "bold italic undo redo searchreplace pastetext code fullscreen | button_note button_person | button_save"
					}
					//cssFile 		 = DEDALO_CORE_URL + '/component_text_area/css/' + 'mce_editor_tool_transcription.css?' + page_globals.dedalo_version
					editor_height 	 = 597 -70
					break;
			/* tool_structuration Not use text editor
			case 'tool_structuration':
					current_toolbar  = "bold italic undo redo searchreplace pastetext code fullscreen | button_note button_reference | button_save"
					cssFile 		 = DEDALO_CORE_URL + '/component_text_area/css/' + 'mce_editor_tool_transcription.css?' + page_globals.dedalo_version
					editor_height 	 = 597 -70
					break;*/
			case 'tool_lang':
					editor_height 	 = 407 -70
					if (text_area_wrapper.dataset.role && text_area_wrapper.dataset.role==="source_lang") {
					current_toolbar  = "bold italic undo redo searchreplace pastetext code fullscreen | button_save"
					}else{
					current_toolbar  = "bold italic undo redo searchreplace pastetext code fullscreen | button_add_structuration button_change_structuration button_delete_structuration | button_save"
					}
					break;
			case 'tool_indexation':
					editor_height 	 = 250
			case 'indexation':
					current_toolbar  = "bold italic undo redo searchreplace pastetext code fullscreen | button_note button_reference | button_save"
					current_inline   = false
					current_statusbar= false
					editor_height    = 270
					break;
			case 'edit_note':
					current_toolbar  = "bold italic undo redo searchreplace pastetext code fullscreen | button_save"
					current_inline   = false
					current_statusbar= false
					editor_height    = 270
					break;
			default:
					switch(context_name){
						case 'component_geolocation':
							current_toolbar  = "bold italic undo redo searchreplace pastetext code fullscreen | button_geo | button_note | button_save"
							break;
						case 'component_av':
							current_toolbar  = "bold italic undo redo searchreplace pastetext code fullscreen | button_note button_person | button_save"
							break
					}
					break;
		}

		// HTML_TAGS_ALLOWED . Any others will be removed on save
		let html_tags_allowed  = "strong/b,em/i,div[class],span[class|style],img[id|src|class],br,p,apertium-notrans,section[id|class],reference[id|class],h2[class],label[class]"

		// CONFIG CUSTOM PROPIEDADES (configure editor options in component propiedades)
			if(propiedades_obj.text_editor_options==='full') {
				// CONFIG CUSTOM
				current_menubar  = true,
				current_plugings = [
									"advlist autolink lists link image charmap print preview hr anchor pagebreak",
									"searchreplace visualblocks visualchars code fullscreen",
									"insertdatetime media nonbreaking save table contextmenu directionality",
									"paste textcolor autoresize noneditable",
									], //wordcount
				current_toolbar  = "insertfile undo redo | styleselect | bold italic forecolor backcolor | alignleft aligncenter alignright alignjustify | bullist numlist outdent indent | link image print preview";
			}

		/*
		let paste_data_images = true // Default tiny is false
		if (text_area_wrapper.dataset.role && text_area_wrapper.dataset.role==="source_lang") {
			// readonly
			paste_data_images = false;
		}*/

		// Clean all editors
		//tinymce.editors=[];
		//console.log(tinyMCE.editors)

		// To cleanly remove an editor instance and avoid any errors
		//tinymce.EditorManager.execCommand('mceRemoveEditor',true, text_area_id);
		// tinymce.remove('#'+text_area_id);

		// To reinitialize the instance
		//tinymce.EditorManager.execCommand('mceAddEditor',true, text_area_id); return;

		// INIT TINYMCE
		tinymce.init({
				selector 			: '#'+text_area_id,
				//selector 			: "textarea#"+text_area_id,
				//cache_suffix		: "?v="+page_globals.dedalo_version,
				cache_suffix		: "?"+page_globals.dedalo_version,
				mode 				: "textareas",//"exact",

				// CUSTOM OPTIONS
				inline	 			: current_inline,
				//theme 			: 'inlite',
				menubar  			: current_menubar,
				statusbar 			: current_statusbar,
				toolbar_items_size	: 'small',
				toolbar  			: current_toolbar,

				// CDN NO COMPATBLE
				plugins  			: current_plugings,

				// CDN COMPATIBLE DEFINITIONS
				/*
				external_plugins: {

					"image" 		: DEDALO_ROOT_WEB + "/lib/tinymce/js/tinymce/plugins/image/plugin.min.js",
					"print" 		: DEDALO_ROOT_WEB + "/lib/tinymce/js/tinymce/plugins/print/plugin.min.js",
					"searchreplace"	: DEDALO_ROOT_WEB + "/lib/tinymce/js/tinymce/plugins/searchreplace/plugin.min.js",
					"code"			: DEDALO_ROOT_WEB + "/lib/tinymce/js/tinymce/plugins/code/plugin.min.js",
					"fullscreen" 	: DEDALO_ROOT_WEB + "/lib/tinymce/js/tinymce/plugins/fullscreen/plugin.min.js",
					"paste"			: DEDALO_ROOT_WEB + "/lib/tinymce/js/tinymce/plugins/paste/plugin.min.js",
					//"wordcount" 	: DEDALO_ROOT_WEB + "/lib/tinymce/js/tinymce/plugins/wordcount/plugin.min.js",
					"nanospell": DEDALO_ROOT_WEB + "/lib/tinymce/nanospell/plugin.js"
				},
				*/
				skin_url 			: DEDALO_ROOT_WEB + "/lib/tinymce/js/tinymce/skins/lightgray",
				theme_url			: DEDALO_ROOT_WEB + "/lib/tinymce/js/tinymce/themes/modern/theme.min.js?" +page_globals.dedalo_version,


				// ENCODING
				// This option allows you to get XML escaped content out of TinyMCE. By setting this option to xml, posted content will be converted to an XML string escaping characters such as <, >, ", and & to <, >, ", and &.
				// encoding 			: 'xml',
				entity_encoding		: "raw",

				// P : FORCE NO INSERT TINYMCE PARAGRAPS "<p>"
				//v3 force_br_newlines	: true, // need true for webkit
				force_p_newlines		: false,
				forced_root_block		: false, // Needed for 3.x

				// SIZE :
				width 					: '100%',
				height 					: editor_height,

				autoresize_min_height	: 80,
				autoresize_max_height	: 276,
				autoresize_bottom_margin: 10,

				// CSS
				content_css 			: cssFile,
				//skin 					: 'lightgray',
				body_class 				: body_class,

				// IMAGES : Avoid user resize images
				object_resizing			: false,
				paste_block_drop 		: false, // block drag images on true

				// HTML ELEMENTS ALLOWED
				valid_elements 			: html_tags_allowed, //"strong/b,em/i,div[class],span[class],img[id|src|class],br,p",

				// This option enables or disables the element cleanup functionality. If you set this option to false,
				// all element cleanup will be skipped but other cleanup functionality such as URL conversion will still be executed.
				//v3 verify_html 			: false,		// default false (IMPORTANT FOR IMAGE TAGS ALWAYS SET FALSE)
				//v3 apply_source_formatting : false,

				// Gestion de URL's por tiny. Default is both true
				relative_urls			: false,
				convert_urls			: false,

				// TESTING
				//v3 remove_linebreaks		: false, // remove line break stripping by tinyMCE so that we can read the HTML
				//v3 verify_css_classes 	: false,
				paste_create_linebreaks 	: true, // for paste plugin - single linefeeds are converted to hard line break elements
				paste_auto_cleanup_on_paste : true, // for paste plugin - word paste will be executed when the user copy/paste content

				//paste_data_images 			: true, // allow data:url copy images
				//paste_as_text 				: true, // for paste plugin - forces to paste as text by default 15-09-2017

				// SPELLCHECKER
				browser_spellcheck 		: true,	// Browser (Chrome) spellchecker bool
				//spellchecker_rpc_url: DEDALO_ROOT_WEB + '/lib/tinymce/spellchecker/' + 'spellchecker.php',

				schema: 'html5-strict',


				// SETUP EDITOR
				setup : function(ed) {

						// BUTTON GEOREF
						ed.addButton('button_geo', {
							tooltip: 'Add georef',
							image:  '../themes/default/buttons/geo.svg',
							onclick: function(evt) {
								component_text_area.load_tags_geo(ed, evt, text_area_component) //ed, evt, text_area_component
							}
						});

						// BUTTON PERSON
						ed.addButton('button_person', {
							tooltip: 'Add person',
							image:  '../themes/default/buttons/person.svg',
							onclick: function(evt) {
								component_text_area.load_tags_person() //ed, evt, text_area_component
							}
						});

						// BUTTON NOTE
						ed.addButton('button_note', {
							tooltip: 'Add note',
							image:  '../themes/default/buttons/note.svg',
							onclick: function(evt) {
								component_text_area.create_new_note(ed, evt, text_area_component)
							}
						});

						// BUTTON REFERENCE
						ed.addButton('button_reference', {
							tooltip: 'Add reference',
							image:  '../themes/default/buttons/reference.svg',
							onclick: function(evt) {
								component_text_area.create_new_reference(ed, evt, text_area_component)
							}
						});

						// BUTTON_DELETE_STRUCTURATION
						ed.addButton('button_delete_structuration', {
							tooltip: 'Delete structuration',
							text: "Delete chapter",
							onclick: function(evt) {
								tool_lang.delete_structuration(ed, evt, text_area_component)
							}
						});

						// BUTTON_ADD_STRUCTURATION
						ed.addButton('button_add_structuration', {
							tooltip: 'Add structuration',
							text: "Add chapter",
							onclick: function(evt) {
								tool_lang.add_structuration(ed, evt, text_area_component)
							}
						});

						// BUTTON_CHANGE_STRUCTURATION
						ed.addButton('button_change_structuration', {
							tooltip: 'Change structuration',
							text: "Change chapter",
							onclick: function(evt) {
								tool_lang.change_structuration(ed, evt, text_area_component)
							}
						});

						// BUTTON SAVE ADD
						ed.addButton('button_save', {
							text: get_label.salvar,
							tooltip: get_label.salvar,
							icon: false,
							onclick: function(evt) {
								// SAVE COMMAND
								// It will get dirty if the user has made modifications to the contents
								//ed.setDirty(true);	// Force dirty state
								mce_editor.save_command(ed, evt, text_area_component);
							}
						});


						// INIT
						ed.on('init', function(evt) {

							// Enable browser spellcheck
							//ed.getBody().setAttribute('spellcheck', true);
							switch(modo) {
								case 'edit':
									// RESIZE VERTICAL . Adjust editor height to wrap height
									//setTimeout(function(){
										if(text_area_wrapper) {
											let content_data  = text_area_wrapper.querySelector("div.content_data")
											let target_height = content_data.offsetHeight -70
											if (target_height>90 && ed.theme) {
												ed.theme.resizeTo ('100%', target_height)
												if(SHOW_DEBUG===true) {
													//console.log("resizeTo target_height: " +target_height, text_area_wrapper.id);
												}
											}
										}
									//},900)
									break;
								case 'tool_transcription' :
									// RESIZE VERTICAL . Adjust editor height to wrap height
									//setTimeout(function(){
										if(text_area_wrapper) {
											let warp_height = text_area_wrapper.offsetHeight -100 //parseInt(text_area_wrapper.offsetHeight) -100;
											if (warp_height>100 && ed.theme) {
												//ed.theme.resizeTo ('100%', warp_height)
												tool_transcription.fix_height_of_texteditor()
												if(SHOW_DEBUG===true) {
													//console.log("resizeTo warp_height: " +warp_height);
												}
											}
										}
									//},900)
									tool_transcription.verify_tc_tags(ed)
									break;
								case 'indexation' :
									// Fix text area height on init
									tool_indexation.fix_height()
									break;
								case 'tool_lang' :

									break;
							}
						});


						// POSTRENDER EVENT
						ed.on('PostRender', function(evt){
							// Render tc tags with canvas
							/* window.setTimeout(function(){
								let render_all_tags_promise = component_text_area.render_all_tags(ed, "tc", true)
							}, 1)*/

							// Set tabindex
							let iframe = document.getElementById(ed.id + "_ifr");
							ed.dom.setAttrib(iframe, 'tabindex', 1);

							switch(modo) {
								case 'tool_lang' :
									// Set read only mode when source lang
									if (text_area_wrapper.dataset.role && text_area_wrapper.dataset.role==="source_lang") {
										ed.setMode("readonly")
									}
									// Resize editor height
									let warp_height = window.innerHeight - 250 //parseInt(text_area_wrapper.offsetHeight) -100;
									if (warp_height>100 && ed.theme) {
										ed.theme.resizeTo ('100%', warp_height)
									}
									break;
								case 'tool_indexation' :
									// Set read only mode when source lang
									if (text_area_wrapper.dataset.role && text_area_wrapper.dataset.role!=="source_lang") {
										ed.setMode("readonly")
									}
									break;
							}

						});


						// FOCUS EVENT
						ed.on('focus', function(evt) {
							// RE-Select elements (IMPORTANT!)
							text_area_component = document.getElementById( ed.id );
							text_area_wrapper	= component_common.get_wrapper_from_element(text_area_component)

							component_common.select_wrap(text_area_wrapper)

							ed.isNotDirty = true; // Force not dirty state
						});// END FOCUS EVENT


						// BLUR EVENT
						ed.on('blur', function(evt) {
							// SAVE COMMAND
							// It will get dirty if the user has made modifications to the contents
							if(SHOW_DEBUG===true) {
								//console.log("triggered blur event from tiny");
								//console.log("ed.isDirty(): "+ed.isDirty());
							}
							// If user has made changes, save content
							mce_editor.save_command(ed,evt,text_area_component)
						});// END BLUR EVENT


						// CHANGE EVENT
						ed.on('change', function(evt) {
							// SAVE COMMAND
							//if(page_globals.modo=='tool_indexation') mce_editor.save_command(ed,evt,text_area_component);
						});// END BLUR EVENT


						// CLICK EVENT
						ed.on('click', function(evt) {

							// Fix text area selection values
							// Note that when in structuration mode, we don't want loose the main editor vars (text_preview editor)
							// and in this case we skip fix this component selected vars (case modal notes text area for example)
							if (page_globals.modo!=='tool_structuration') {
								component_text_area.section_tipo 	= text_area_wrapper.dataset.section_tipo
								component_text_area.section_id 		= text_area_wrapper.dataset.parent
								component_text_area.component_tipo 	= text_area_wrapper.dataset.tipo
								component_text_area.lang 			= text_area_wrapper.dataset.lang
								component_text_area.wrapper_id 		= text_area_wrapper.id
							}
							//component_text_area.tag
							//component_text_area.tag_id

							// IMG : CLICK ON IMG
							if( evt.target.nodeName === 'IMG' || evt.target.nodeName === 'REFERENCE' ) {

								// Fix text area selection values
								if (page_globals.modo!=='tool_structuration') {
									component_text_area.tag_obj = evt.target
								}

								// SELECTED_TAG_DATA
								// Fix selected_tag_data var in class component_text_area
								component_text_area.selected_tag_data = {
										id 				: evt.target.id,
										type 			: evt.target.dataset.type,
										tag_id 			: evt.target.dataset.tag_id,
										state 			: evt.target.dataset.state,
										label 			: evt.target.dataset.label,
										data 			: evt.target.dataset.data,
										component_tipo 	: text_area_wrapper.dataset.tipo,
										lang 			: text_area_wrapper.dataset.lang
									}

								switch(evt.target.className) {
									case 'person':
										// Show person info
										component_text_area.show_person_info( ed, evt, text_area_component )
										break;
									case 'note':
										// Show note info
										component_text_area.show_note_info( ed, evt, text_area_component )
										break;
									case 'reference':
										if(evt.altKey===true){
											// Select all node to override content
											ed.selection.select(ed.selection.getNode())
										}else{
											// Show reference info
											component_text_area.show_reference_info( ed, evt, text_area_component )
										}
										break;
									default:
										// IMAGE COMMAND GENERIG
										mce_editor.image_command( ed, evt, text_area_component )
								}
							}else if( evt.target.nodeName === 'LABEL' ) {
								// Fix text area selection values
								if (page_globals.modo==='tool_lang') {

									component_text_area.show_structuration_info(ed, evt, text_area_component)

									//component_text_area.tag_obj = evt.target
								}
								//reference
							}else{
								// Sets styles on all paragraphs in the currently active editor
								if (ed.dom.select('img').length>0) {
									ed.dom.setStyles(ed.dom.select('img'), {'opacity':'0.8'});
								}
							}// END CLICK ON IMG
						});// END CLICK EVENT

						/*
						// MouseOver EVENT
						ed.on('MouseOver', function(evt) {

							if( evt.target.nodeName === 'IMG' && evt.target.className==='person') {
								// Show person info
								//component_text_area.show_person_info( evt )
							}
						});// END MouseOver EVENT

						// MouseOver EVENT
						ed.on('MouseOut', function(evt) {

							if( evt.target.nodeName === 'IMG' && evt.target.className==='person') {
								// Show person info
								//component_text_area.show_person_info( evt )
							}
						});// END MouseOut EVENT
						*/

						// MOUSEUP EVENT
						ed.on('MouseUp', function(evt) {
							// CREATE_FRAGMENT_COMMAND
							mce_editor.create_fragment_command(ed,evt,text_area_component)
						});//END MOUSEUP EVENT

						// KEYPRESS
						ed.on('KeyPress', function(evt) {

							var minor_that_key = 60 // 188
							var more_that_key  = 62	// 190

							if(evt.keyCode===minor_that_key || evt.keyCode===more_that_key) {
								evt.preventDefault()

								switch(evt.keyCode) {
									case minor_that_key:
										ed.insertContent("[")
										break;
									case more_that_key:
										ed.insertContent("]")
										break;
								}
								alert("Warning! This key is reserved and will be replaced for safe char. Key: " + evt.key + " ["+evt.keyCode+"]" );
							}
						});

						// KEY UP EVENT
						ed.on('KeyUp', function(evt) {
							switch(context_name) {
								case 'component_av':
										// Send keys for tool_transcription (F2, ESC, etc..)
										component_text_area.av_editor_key_up(evt);
										break;
								case 'component_image':
										// 114 : Key F2 Write draw tag in text
										var tag_insert_key_cookie = get_localStorage('tag_insert_key')
										var tag_insert_key = tag_insert_key_cookie ? tag_insert_key_cookie : 113; // Default 113 'F2'
										if(evt.keyCode==tag_insert_key) {
											mce_editor.write_tag('draw', ed, evt, text_area_component)
										}
										break;
								case 'component_geolocation':
										// 115 : Key F2 Write geo tag in text
										var tag_insert_key_cookie = get_localStorage('tag_insert_key')
										var tag_insert_key = tag_insert_key_cookie ? tag_insert_key_cookie : 113; // Default 113 'F2'
										if(evt.keyCode==tag_insert_key) {
											mce_editor.write_tag('geo', ed, evt, text_area_component)
										}
										break;
							}
						});//END KEY UP EVENT

				}//end setup
		});//end tinymce.init(

	}//end this.init



	/**
	* INIT
	* @return
	*/
	// this.init2 = async function (caller, container, options) {

	// 	// container.attachShadow({mode: 'open'})

	// 	const header = document.createElement('div');
	// 	const shadowRoot = header.attachShadow({mode: 'open'});
	// 	const textarea = document.createElement('textarea');
	// 	shadowRoot.appendChild(textarea)
	// 	textarea.innerHTML = "123"
	// 	// shadowRoot.innerHTML = '<h1>Hello Shadow DOM</h1>'; // Could also use appendChild().

	// 	tinymce.init({
	// 		target : textarea,
	// 		init_instance_callback : (editor) =>{
	// 				console.log("editor:",editor);
	// 		}
	// 	})
	// 	container.appendChild(header)

	// };//end init



	/**
	* LOAD_DEPENDENCES
	* @return promise
	*/
	// this.load_dependences = async function() {

	// 	const self = this

	// 	if (loaded_dependences===true) {
	// 		console.log("+++ [service_tinymce.load_dependences] Already loaded dependences (tinymce)");
	// 		return true
	// 	}

	// 	// load dependences js/css
	// 	const load_promises = []

	// 	// js
	// 		const lib_js_file = DEDALO_ROOT_WEB + '/lib/tinymce/js/tinymce/tinymce.min.js'
	// 		load_promises.push( common.prototype.load_script(lib_js_file) )

	// 	// css
	// 		// const lib_css_file = DEDALO_ROOT_WEB + '/lib/leaflet/dist/leaflet.css'
	// 		// load_promises.push( common.prototype.load_style(lib_css_file) )

	// 	const loaded = await Promise.all(load_promises)

	// 	await wait_for_global('tinymce', 300)


	// 	loaded_dependences = true

	// 	return loaded
	// }//end load_dependences



}//end class
