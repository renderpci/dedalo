// JavaScript Document

// Global var. Set when load fragment
var selected_rel_locator;
var selected_tag;
var selected_tipo;


/**
* COMPONENT TEXT AREA CLASS
*
*/
var component_text_area = new function() {

	this.url_trigger = DEDALO_LIB_BASE_URL + '/component_text_area/trigger.component_text_area.php';

	/*
	// Prevent bootstrap dialog from blocking focusin
	$(document).on('focusin', function(e) {
	    if ($(e.target).closest(".mce-window").length) {
	        e.stopImmediatePropagation();
	    }
	});	
	*/	


	// Fix this values on select elements in text editor
	this.section_tipo
	this.section_id
	this.component_tipo
	this.wrapper_id
	this.lang
	this.tag
	this.tag_id

	this.reload_on_save = true


	/**
	* SELECT_COMPONENT
	* Overwrite common method
	* @param object obj_wrap
	*/
	this.select_component = function(obj_wrap) {
		obj_wrap.classList.add("selected_wrap");
		var text_area = $(obj_wrap).find('textarea').first()
		if (text_area.length===1 && tinyMCE.activeEditor) {
			tinyMCE.get( text_area[0].id ).focus()
		}
	}//end select_component



	/**
	* SAVE
	*
	*/
	this.Save = function(component_obj, save_arguments, ed) {

		// TEXT AREA . Hidden
		if (component_obj === null || typeof component_obj !== 'object') {
			alert("[Save] Error: component_text_area is empty")
			return false;
		}

		// TEXT EDITOR OBJECT SELECT FALLBACK
		if (ed === null || typeof ed !== 'object') {
			// text editor is not received as argument, fallback to select from global tinyMCE
			ed = tinyMCE.activeEditor;
			if(SHOW_DEBUG===true) console.log("[Save] Warning: text editor is not received as argument. Global active editor is selected instead as fallback !");		
		}
		if (ed === null || typeof ed !== 'object') {
			alert("[Save] Error: editor is empty")
			return false;
		}

		// FORCE UPDATE REAL TEXT AREA CONTENT (and save is triggered when text area changes)
		//tinyMCE.triggerSave(); // Force update all textareas	//console.log(tinyMCE);
		//ed.save(); // Force update current textarea content
		//console.log(ed.isDirty());

		// ISDIRTY . Content has change ?
		console.log(ed.isDirty())
		if(ed.isDirty()===false) {
			if(SHOW_DEBUG===true) {
				console.log("[Save]-> Info: Nothing is saved because ed.isDirty() is false (no changes are detected in editor)");
			}
			return false;
		}

		// SAVE ARGUMENTS
		if (save_arguments === null || typeof save_arguments !== 'object') {
			save_arguments = {}
		}
		// As already using own editor spinner, don't use here component spinner
		save_arguments.show_spinner = false;

		// Saving from main text editor content instead text area content
		var dato = ed.getContent();
			save_arguments.dato = dato;
			//console.log(dato);
			//console.log("Saving: "+save_arguments.dato);

		// FORCE UPDATE REAL TEXT AREA CONTENT
			//tinyMCE.triggerSave();		//alert(ed.getContent())
			//ed.save();

			//var c = component_common.get_wrapper_from_element(component_obj)
			//console.log( c); return;
			//console.log(component_obj); return

		// SAVE COMPONENT_COMMON . Exec general save
		var jsPromise = component_common.Save(component_obj, save_arguments);

			// Update editor and component content on finish save
			jsPromise.then(function(response) {

			  	// Reload TR processed text
			  	if (component_text_area.reload_on_save===true) {
			  		component_text_area.load_tr( component_obj, ed )
			  	}				

				// Update possible dato in list (in portal x example)
				//component_common.propagate_changes_to_span_dato(component_obj);
			}, function(xhrObj) {
			  	console.log(xhrObj);
			});

		return jsPromise;
	};//end Save



	/**
	* LOAD_TR
	* Load text editor content without load component html
	*/
	this.load_tr = function(component_obj, ed) {

		if (typeof component_obj!=='object' || typeof component_obj.dataset==='undefined') {
			console.log("[load_tr] Error on load_tr. Invalid component_obj: ")
			return false;
		}		

		var mydata = {	mode		 : 'load_tr',
						parent		 : component_obj.dataset.parent,
						tipo		 : component_obj.dataset.tipo,
						lang		 : component_obj.dataset.lang,
						section_tipo : component_obj.dataset.section_tipo,
						top_tipo	 : page_globals.top_tipo,
						top_id		 : page_globals.top_id,
					}
					//return console.log(mydata)

		//html_page.loading_content( component_obj, 1 );
		ed.setProgressState(true); // Show progress en texto

		//var jsPromise = Promise.resolve(

			// AJAX REQUEST
			$.ajax({
				url		: component_text_area.url_trigger,
				data	: mydata,
				type 	: "POST",
				async   : component_common.save_async
			})
			// DONE
			.done(function(response) {
				if (SHOW_DEBUG===true) {
					console.log(response);
				}

				if (response===null) {
					return alert("[load_tr] Error on load_tr. null value is received")
				}else if (response.result===false) {
					return alert("[load_tr] Error on load_tr. false value is received")
				}

				var updated_received_data = response.result				

				// INSPECTOR LOG INFO
				/*
				if (received_data.indexOf("Error")!=-1 || received_data.indexOf("error")!=-1 || received_data.indexOf("Failed")!=-1) {
					var msg = "<span class='error'>Failed!<br>" +received_data+ "</span>";
					console.log(msg);
				}
				*/
				if ( /Auth error/i.test(updated_received_data) ) {
					ed.setProgressState(false); // Hide progress en texto
					ed.setDirty(true); 			// Force dirty state
					// "To keep the changes, DO NOT CLOSE THIS WINDOW. Log on to another browser window and then return to this window and save the content (pressing the 'Save' button)"
					alert("[load_tr] Error on save: "+updated_received_data+"<hr>"+ get_label.conservar_los_cambios_transcripcion)
				}else{
					//console.log(updated_received_data);
					ed.setContent(updated_received_data);
					ed.save()

					// FORCE UPDATE REAL TEXT AREA CONTENT
					//tinyMCE.triggerSave();		//alert(ed.getContent())
				}
			})
			// FAIL ERROR
			.fail(function(error_data) {
				if(SHOW_DEBUG===true) console.log(error_data);
			})
			// ALWAYS
			.always(function() {
				//html_page.loading_content( component_obj, 0 );
				ed.setProgressState(false); 	// Hide progress en texto
			})
		//)//end promise
		//return jsPromise;
	};//end load_tr



	/**
	* GET UNIFIED PATTERNS FOR MARKS
	* JS version of php function TR->get_mark_pattern() with minor changes
	* @see class.TR.php
	*/
	this.get_mark_pattern = function(mark, flags, id, data) {

		var regex
		
		switch(mark) {

			// TC
			case 'tc' :
					regex = new RegExp(/\[TC_([0-9]{1,2}:[0-9]{1,2}:[0-9]{1,2}\.[0-9]{1,3})_TC\]/, flags)
					break;

			// INDEX
			case 'index' :
					if (id) {
						regex = new RegExp(/\[\/{0,1}index-[a-z]-"+id+"\]/, flags)
					}else{						
						regex = new RegExp(/\[\/{0,1}(index)-([a-z])-([0-9]{1,6})\]/, flags)
					}
					break;
					
			case 'indexIn' :
					if (id) {
						regex = new RegExp(/\[index-[a-z]-"+id+"\]/, flags)
					}else{
						regex = new RegExp(/\[index-([a-z])-([0-9]{1,6})\]/, flags)
					}
					break;

			case 'indexOut':
					if (id) {
						regex = new RegExp(/\[\/index-[a-z]-"+id+"\]/, flags)
					}else{
						regex = new RegExp(/\[\/index-([a-z])-([0-9]{1,6})\]/, flags)
					}
					break;	

			// SVG
			case 'svg' :
					if (id) {
						regex = new RegExp(/\[svg-[a-z]-"+id+"-data:"+data+"\]/, flags)
						console.log("Error Processing Request");
					}else{
						regex = new RegExp(/\[(svg)-([a-z])-([0-9]{1,6})-data:.*?:data\]/, flags)
					}
					break;

			// GEO
			case 'geo' :
					if (id) {
						var regex_string = "\\[geo-[a-z]-"+id+"-data:{.*?}:data\\]"	
						//console.log(regex_string);
						regex = new RegExp(regex_string, flags)
						//console.log(regex);
					}else{
						regex = new RegExp(/\[geo-[a-z]-[0-9]{1,6}-data:{.*?}:data\]/, flags)
					}
					break;			

			// PAGE (pdf) [page-n-3]
			case 'page' :
					if (id) {
						regex = new RegExp(/\[page-[a-z]-"+id+"\]/, flags)
					}else{
						regex = new RegExp(/\[(page)-([a-z])-([0-9]{1,6})\]/, flags)
					}
					break;

			// PERSON (transcription spoken person) like [person-a-number-data:{"section_tipo":"dd15","section_id":"5"}:data]
			case 'person' :
					if (id) { // id is pseudo locator as dd35_oh1_52 (section_tipo section_id)
						regex = new RegExp(/\[person-[a-z]-.+-data:"+id+":data\]/, flags)
					}else{
						regex = new RegExp(/\[person-([a-z])-(\S{0,10})-data:.*?:data\]/, flags)
					}
					break;

			// NOTE (transcription annotations) like [note-n-number-data:{"section_tipo":"dd15","section_id":"5"}:data]
			case 'note' :
					if (id) { // id is pseudo locator as dd35_oh1_52 (section_tipo section_id)
						regex = new RegExp(/\[note-[a-z]-.+-data:"+id+":data\]/, flags)
					}else{
						regex = new RegExp(/\[note-([a-z])-(\S{0,10})-data:.*?:data\]/, flags)
					}
					break;

			// OTHERS
			case 'br' :
					regex = new RegExp(/\<br \/\>/, flags)
					break;

			case 'strong' :
					regex = new RegExp(/\<strong\>|\<\/strong\>/, flags)
					break;

			case 'em' :
					regex = new RegExp(/\<em\>|\<\/em\>/, flags)
					break;

			case 'apertium-notrans' :
					regex = new RegExp(/\<apertium-notrans\>|\<\/apertium-notrans\>/, flags)
					break;

			default :
					console.log("Error Processing Request. Error: mark: '"+mark+"' is not valid !");
		}
		
				
		return regex;
	}//end get_mark_pattern



	// INDEX TAG
	this.tag_index 					= new Object();
		// Format [index-n-2]
		this.tag_index.in_pre 		= '[index-';
		this.tag_index.in_post 		= ']';
		// Format [/index-n-2]
		this.tag_index.out_pre 		= '[/index-';
		this.tag_index.out_post		= ']';

	// INDEX IMG
	this.tag_index_img 				= new Object();
		this.tag_index_img.in_pre 	= '<img id="' + this.tag_index.in_pre ;
		this.tag_index_img.in_post 	= ']" src="../inc/btn.php/';
		this.tag_index_img.out_pre 	= '[index-';
		this.tag_index_img.out_post	= ']';

	// SVG TAG
	this.tag_svg 					= new Object();
		// Format [svg-n-1]
		this.tag_svg.pre 			= '[svg-';
		this.tag_svg.post 			= ':data]';

	// SVG IMG
	this.tag_svg_img 				= new Object();
		this.tag_svg_img.pre 		= '<img id="' + this.tag_svg.pre ;
		this.tag_svg_img.post 		= ']" src="../inc/btn.php/';

	// GEO TAG
	this.tag_geo 					= new Object();
		// Format [geo-n-1]
		this.tag_geo.pre 			= '[geo-';
		this.tag_geo.post 			= ':data]';

	// GEO IMG
	this.tag_geo_img 				= new Object();
		this.tag_geo_img.pre 		= '<img id="' + this.tag_geo.pre ;
		this.tag_geo_img.post 		= ']" src="../inc/btn.php/';
	
	// PERSON TAG
	this.tag_person 				= new Object();
		// Format [person-n-1]
		this.tag_person.pre 			= '[person-';
		this.tag_person.post 			= ':data]';

	// PERSON IMG
	this.tag_person_img 			= new Object();
		this.tag_person_img.pre 		= '<img id="' + this.tag_person.pre;
		this.tag_person_img.post 		= ']" src="../inc/btn.php/';

	// NOTE TAG
	this.tag_note 					= new Object();
		// Format [note-n-1]
		this.tag_note.pre 			= '[note-';
		this.tag_note.post 			= ':data]';

	// NOTE IMG
	this.tag_note_img 				= new Object();
		this.tag_note_img.pre 		= '<img id="' + this.tag_note.pre;
		this.tag_note_img.post 		= ']" src="../inc/btn.php/';
	
	//var hiliteIn	= '<div class="hilite">';
	//var hiliteOut	= '</div>';


	// Build oficial formatted image to save on data base
	this.build_index_in_img = function (id,state) {
		if (typeof id === 'undefined')  return alert('undefined id');
		var tag = this.tag_index.in_pre + state + '-' + id + this.tag_index.in_post
		return '<img id="' +tag+ '" src="../../../inc/btn.php/' +tag+ '" class="index mceNonEditable" />';	//class="(index|index mceNonEditable)
	}
	this.build_index_out_img = function (id,state) {
		if (typeof id === 'undefined')  return alert('undefined id');
		var tag = this.tag_index.out_pre + state + '-' + id + this.tag_index.out_post ;
		return '<img id="' +tag+ '" src="../../../inc/btn.php/' +tag+ '" class="index mceNonEditable" />';
	}
	this.build_tc_img = function (tc) {
		if (typeof tc === 'undefined')  return alert('undefined tc');
		return '<img id="[TC_'+tc+'_TC]" src="../../../inc/btn.php/[TC_'+tc+'_TC]" class="tc" />' ;
	}
	this.build_svg_img = function (id,state,data) {
		if (typeof id === 'undefined')  return alert('build_svg_img undefined id');
		var current_tag = this.tag_svg.pre + state + '-' + id  + '-data:' + data + this.tag_svg.post;
		var current_src = this.tag_svg.pre + state + '-' + id  + '-data:' + this.tag_svg.post;
		return '<img id="' +current_tag+ '" src="../../../inc/btn.php/' +current_src+ '" class="svg mceNonEditable" />';
	}
	this.build_geo_img = function (id,state,data) {
		if (typeof id === 'undefined')  return alert('build_geo_img undefined id');
		var current_tag = this.tag_geo.pre + state + '-' + id  + '-data:' + data + this.tag_geo.post;
		var current_src = this.tag_geo.pre + state + '-' + id  + '-data:' + this.tag_geo.post;
		return '<img id="' +current_tag+ '" src="../../../inc/btn.php/' +current_src+ '" class="geo mceNonEditable" />';
	}
	this.build_person_img = function (label,state,data) {
		if (typeof label==='undefined')  return alert('build_person_img undefined label');
		if (typeof data==='object') {
			data = JSON.stringify(data)			
			// Format data Important !!
			data = replaceAll('"', '\'', data)
		}
		var current_tag = this.tag_person.pre + state + '-' + label  + '-data:' + data + this.tag_person.post;
		var current_src = this.tag_person.pre + state + '-' + label  + '-data:' + this.tag_person.post;
		return '<img id="' +current_tag+ '" src="../../../inc/btn.php/' +current_src+ '" class="person" />'; // mceNonEditable
	}
	this.build_note_img = function (label,state,data) {
		if (typeof label==='undefined')  return alert('build_note_img undefined label');
		if (typeof data==='object') {
			data = JSON.stringify(data)			
			// Format data Important !!
			data = replaceAll('"', '\'', data)
		}
		var current_tag = this.tag_note.pre + state + '-' + label  + '-data:' + data + this.tag_note.post;
		var current_src = this.tag_note.pre + state + '-' + label  + '-data:' + this.tag_note.post;
		return '<img id="' +current_tag+ '" src="../../../inc/btn.php/' +current_src+ '" class="note" />'; // mceNonEditable
	}



	/**
	* GET_TAGS
	* @param obj
	*/
	this.get_tags = function (related_tipo, tag_type) {

		// ID . Get editor id from related tipo
		var component_text_area_id = document.querySelector('textarea[data-tipo="'+related_tipo+'"]').id

		// ED . Select text editor
		var ed = tinymce.get(component_text_area_id)
		
		// TEXT : Get current content
		var text = ed.getContent({format : 'raw'});

		var mark_pattern = this.get_mark_pattern(tag_type, 'g', false, false)

		// AR_TAGS . regex find matches as tags
		var ar_tags = text.match(mark_pattern);

		return ar_tags
	}//end get_tags



	/**
	* GET_LAST_TAG_ID
	* @param ed
	*	Text editor instance (tinyMCE)
	* @param tipo_tag
	*	Class name of image searched like 'geo'
	*/
	this.get_last_tag_id = function(ed, tipo_tag) {

		var ar_id_final = [0];
		// IMG : Select all images in text area
		var ar_img = ed.dom.select('img.'+tipo_tag);
			//console.log(ar_img)

		// ITERATE TO FIND TIPO_TAG (filter by classname: svg,etc.)
		var i_len = ar_img.length
		for (var i = i_len - 1; i >= 0; i--) {		
		//for (var i=0; i < i_len; i++ ){
			
			var number = 0;
			//var current_className = ar_img[i].className;
			//if( current_className.indexOf(tipo_tag) !== -1 ) {
				// current tag like [svg-n-1]
				var current_tag = ar_img[i].id;
				switch(tipo_tag) {
					// INDEX [index-n-1-data:**]
					case 'index':
					// NOTE [note-n-1-data:**]
					case 'note':
					// SVG [svg-n-1-data:**]
					case 'svg':
					// GEO [geo-n-1-data:**]
					case 'geo':	var ar_parts = current_tag.split('-');
								var number 	 = parseInt(ar_parts[2]);
								break;
				}
				// Insert id formated as number in final array
				ar_id_final.push(number)
					//console.log(number)
			//}
		}
		// LAST ID
		var last_tag_id = Math.max.apply(null, ar_id_final);
			//console.log(last_tag_id )
			//console.log(ar_id_final);

		return parseInt(last_tag_id);
	}//end get_last_tag_id



	/**
	* CHANGE_TAG_STATE
	* @param obj
	*/
	this.change_tag_state = function (select_obj) {

		var tag 			= $(select_obj).data('tag')
		//var tag 			= select_obj.dataset.tag
		var	id 				= component_text_area.tag_to_id(tag)
		var	current_state 	= component_text_area.tag_to_state(tag)
		//var	new_state 		= $(select_obj).val()
		var	new_state 		= select_obj.value
			//console.log("tag:"+tag+" - id:"+id+" - current_state:"+current_state+" - new_state:"+new_state);

		if (!new_state) {
			if(SHOW_DEBUG===true) {
				console.log("[change_tag_state] Value not changed, Stoped save");
			}
			return false;
		}

		// Editor content
		var content = tinyMCE.activeEditor.getContent({format : 'raw'});

		// Replace tag code
		var tag_entrada =  '([index-)' + current_state + '(-' + id + '])';
		var tag_salida 	= '([/index-)' + current_state + '(-' + id + '])';

		// Prepare tag to regex
		pattern_entrada 	= component_text_area.escape_tag(tag_entrada);
		pattern_salida 		= component_text_area.escape_tag(tag_salida);

		// Replace tag in
		var pattern		= new RegExp(pattern_entrada,'g');
		var newContent 	= content.replace(pattern, "$1"+new_state+"$2");

		// Replace tag out
		var pattern		= new RegExp(pattern_salida,'g');
		var newContent 	= newContent.replace(pattern, "$1"+new_state+"$2");

		// Update data tag state
		var data_tag_value = '[index-' + new_state + '-' + id + ']'		
		$(select_obj).data('tag','[index-' + new_state + '-' + id + ']');		
		//select_obj.dataset.tag    = data_tag_value
		//select_obj.setAttribute("data-tag", data_tag_value)

		// Update editor
		var ed = tinyMCE.activeEditor;
			ed.setContent(newContent, {format : 'raw'});
			ed.focus();
			// Force ed dirty state
			ed.setDirty(true);	

		//var current_component_text_area = document.querySelector('textarea[data-tipo="'+this.component_tipo+'"]') // $('.css_text_area')[0]
		// text_area element and ed share the same id
		var current_component_text_area = document.getElementById(ed.id)

		// Save modified content
		return component_text_area.Save( current_component_text_area, null, tinyMCE.activeEditor );
	}//end change_tag_state



	/**
	* UPDATE_SVG_TAG
	* @param string tagOriginal
	* @param int id
	* @param string state (like 'n')
	* @param string data
	* @return string tagNew
	*/
	this.update_svg_tag = function(tagOriginal, id, state, data){

		// Format data Important !!
		data = replaceAll('"', '\'', data);

		var ed = tinyMCE.activeEditor;

		// TEXT_AREA : Get current content
		var texto = ed.getContent({format : 'raw'});

		// TAG : Build new tag
		var tagNew = this.tag_svg.pre + state + '-' + id  + '-data:' + data + this.tag_svg.post;

		// TEXT : Repalce content text
		texto = texto.replace(tagOriginal, tagNew)

		// TEXT_AREA : Set updated content
		ed.setContent(texto,{format : 'raw'});

		ed.setDirty(true);	// Force dirty state			

		// SAVE : Save component data
		var text_area_component = $('.css_text_area')[0],
			evt = null
		component_text_area.Save( text_area_component, null, ed )
		//text_editor.save_command(ed,evt,text_area_component);

		return tagNew;
	}//end update_svg_tag



	/**
	* UPDATE_GEO_TAG
	* @see component_geolocation
	*/
	this.update_geo_tag = function(id, state, data, related_tipo) {

		// DATA . Format data. Change double quotes with single quotes
			data = replaceAll('"', '\'', data);
				//console.log(data);

		// ID component_text_area_id
			var component_text_area_id 	= document.querySelector('textarea[data-tipo="'+related_tipo+'"]').id;

		// ED		
			//var ed = tinyMCE.activeEditor;			
			//console.log("component_text_area_id:"+component_text_area_id+" - related_tipo:"+related_tipo);
			var ed = tinymce.get(component_text_area_id)

			// Text : Get current content
			var text = ed.getContent({format : 'raw'});

			// Get current tag from tag id
			var mark_pattern = this.get_mark_pattern('geo', 'g', id, false)
				//console.log(mark_pattern);
			var tagOriginal = text.match(mark_pattern)
				//console.log(tagOriginal);

			if (!tagOriginal[0]) {
				console.log("[update_geo_tag] Error on locate original tag "+id);
				return false
			}		

			// Tag : Build new tag
			var tagNew = this.tag_geo.pre + state + '-' + id  + '-data:' + data + this.tag_geo.post;

			// Text : Repalce content text
			text = text.replace(tagOriginal[0], tagNew)

			// Text : Set updated content
			ed.setContent(text,{format : 'raw'});
			
			// Force dirty state
			ed.setDirty(true);

		// COMPONENT_TEXT_AREA select current_component text area
			var current_component = document.getElementById(component_text_area_id)		

		// SAVE : Save component
			var save_arguments = {}
			component_text_area.Save( current_component, save_arguments, ed )

		return tagNew;
	}//end update_geo_tag



	/**
	* AV_EDITOR_KEY_UP : CAPTURE AND MANAGE KEYBOARD EVENTS
	*/
	this.av_editor_key_up = function(e) {

		// MODO : Only 'tool_transcription' is used
		if(page_globals.modo!='tool_transcription') return;

		try{
			switch(e.keyCode) {
				//case 27 : 	// Key ESC(27) llamamos a la función de control de video / rec. posición TC
				case parseInt(videoFrame.av_media_player_play_pause_key) :
							component_text_area.videoPlay(e);				if(SHOW_DEBUG===true) console.log('->text editor videoPlay ed.onKeyUp: '+e.keyCode);
							break;

				//case 113 : 	// Key F2 (113) Write tc tag in text
				case parseInt(videoFrame.av_media_player_insert_tc_key) :
							component_text_area.get_and_write_tc_tag(e);	if(SHOW_DEBUG===true) console.log('->text editor write_tc_tag ed.onKeyUp: '+e.keyCode);
							break;
			}
		}catch(e){
			if(DEBUG) console.log(e)
		}
	};//end av_editor_key_up



	/*
	* LOAD_FRAGMENT_INFO_IN_IDEXATION
	* Alias of tool_indexation.fragment_info()
	*/
	this.load_fragment_info_in_idexation = function(tag, tipo, parent, section_tipo, lang) {
		return tool_indexation.fragment_info(tag, tipo, parent, section_tipo, lang)
	}//end load_fragment_info_in_idexation



	/**
	* LOAD RELATION
	* Carga el botón correspondiente a la etiqueta seleccionada (ni mas ni menos)
	*/
	this.load_relation__DEPRECATED = function(tagName, tipo, parent, section_tipo) {

		// alert(tagName +' '+ tipo+' '+ parent)
		// Catch no operacional modes : Sólo se usará en modo 'edit'
		if (page_globals.modo!='edit') { return false };

		// VARS VALIDATE : Comprueba variables válidas
		if(typeof( tagName )==='undefined')		return alert("Error: load_relation: tagName is not defined!");
		if(typeof( tipo )==='undefined')		return alert("Error: load_relation: tipo is not defined!");

		// INSPECTOR : CARGA DATOS RELACIONADOS A LA ETIQUETA EN INSPECTOR
			// Ajax load inspector_indexation_list from trigger.tool_indexation
			tool_indexation.load_inspector_indexation_list(tagName, tipo, parent, section_tipo, lang);

			// Ajax load inspector_relation_list_tag from trigger.tool_indexation
			// DESACTIVA DE MOMENTO
			//tool_relation.load_inspector_relation_list_tag(tagName, tipo, parent);


		// Target div (contains all data info required for create the component to load)
		//var wrapper_id 	= 'relations_ajax_div_'+tipo;
		//var target_obj 	= $('#'+wrapper_id);
		var target_obj 	= document.getElementById('relations_ajax_div_'+tipo);

		// Usamos caller_id para pasar el tag al componente (no hay otra forma mejor de momento..)
		//$(target_obj).data('caller_id',tagName);
		target_obj.dataset.caller_id = tagName


		/*
		if(SHOW_DEBUG===true) console.log("->load_relation loading tag data on div wrapper: "+wrapper_id + " from tagName:"+tagName+" - tipo:"+tipo)
		var arguments = null;
		// Ajax load component from trigger.component_common
		component_common.load_component_by_wrapper_id(wrapper_id, arguments,
							function(){
								// Callback function rebuild taps
								// component_text_area.build_relation_taps(wrapper_id); // DEPRECATED !!
							});
		*/
		// Fix global selected_tag and selected_tipo for index
		selected_tag 	= tagName;
		selected_tipo 	= tipo;

		//component_text_area.build_relation_taps(wrapper_id);
	};//end load_relation



	/**
	* SHOW_BUTTON_LINK_FRAGMET_TO_PORTAL
	* Carga el botón correspondiente a la etiqueta seleccionada (toma ya..)
	*/
	this.show_button_link_fragmet_to_portal = function(tagName, tipo, parent, section_tipo) {
		
		var	tag_id 		= this.tag_to_id(tagName)
		var button_id 	= 'btn_relate_fragment_'+tipo
		var	button_obj 	= document.getElementById(button_id)
			if (!button_obj) {
				console.log("[show_button_link_fragmet_to_portal] Unable select button_obj by id: "+button_id);
				return false;
			}		

		// Build locator to enable save in portal
		var locator = {
				'section_tipo'  : section_tipo,
				'section_id' 	: parseInt(parent),
				'component_tipo': tipo,
				'tag_id' 		: tag_id,
			}
			locator_string = JSON.stringify(locator); 
			//return 	console.log(locator_string);

		// Update locator data in button for tool_portal task
		button_obj.dataset.rel_locator = locator_string;

		// Update label tag id
		$(button_obj).find('span').html( tag_id )
		
		// Show button
		button_obj.style.display = 'inline-block'

		return false;
	}// end show_button_link_fragmet_to_portal



	/**
	* LOAD FRAGMENT INFO
	* Used in modo 'tool_lang' to change tags state
	*/
	this.load_fragment_info = function(tagName, tipo, lang) {

		// Target div (contains all data info required for create the component to load)
		var wrapper_id 	= 'fragment_info_div_'+tipo+'_'+lang;
		var target_obj  = document.getElementById(wrapper_id);

		// Usamos caller_id para pasar el tag al componente (no hay otra forma mejor de momento..)
		// $target_obj.data('caller_id',tagName);
		target_obj.dataset.caller_id = tagName

		if(SHOW_DEBUG===true) console.log("->load_fragment_info loading tag data on div wrapper: "+wrapper_id + " from tag:"+tagName+" - tipo:"+tipo+" - lang:"+lang)
		var arguments = null;

		return component_common.load_component_by_wrapper_id(
								wrapper_id,
								arguments
								);
	}//end this.load_fragment_info


	// LOGINDEXCHANGES
	this.logIndexChanges = function (tagName) {
		alert("Captured logIndexChanges: "+tagName)
	}
	// LOADFR
	this.loadFr = function (tagName) {
		alert("Captured loadFr: "+tagName)
	}



	/**
	* GOTO TIME
	* Captura el comando y le pasa la gestión a av player
	*/
	this.goto_time = function (tagName) {
		//alert("Captured goto_time: "+tagName)
		if(DEBUG) console.log("->component_text_area goto_time captured and passed: "+tagName)
		var timecode = component_text_area.tag_to_timecode(tagName);

		if ($('#videoFrame').length>0 ) {
			return videoFrame.goto_time(timecode)
		}else{
			return top.goto_time(timecode);
		}
	}//end goto_time



	/**
	* VIDEO PLAY
	* Captura el comando y le pasa la gestión a av player
	*/
	this.videoPlay = function (e) {
		if(DEBUG) console.log("->component_text_area videoPlay captured and passed: "+e.keyCode)
		if ($('#videoFrame').length>0 ) {
			return videoFrame.videoPlay(e)
		}else{
			return top.videoPlay(e);
		}
	}//end videoPlay



	/**
	* WRITE_TC_TAG
	* Captura el comando y le pasa la gestión a av player
	*/
	this.get_and_write_tc_tag = function (e) {
		if(DEBUG) console.log("->component_text_area get_and_write_tc_tag captured and passed: "+e.keyCode);
		if ( $('#videoFrame').length>0 ) {
			return videoFrame.get_and_write_tc_tag(e);
		}else{
			return top.get_and_write_tc_tag(e);
		}
	};



	// Return REAL tinymce representation of current image
	this.get_tinymce_index_in_img = function (id,state) {
		var tag =  tag_index.in_pre + state+'-' + id + tag_index.in_post;
		return '<img id=\"' +tag+ '\" src=\"../../../inc/btn.php/' +tag+ '\" class=\"index\" data-mce-src=\"../../../inc/btn.php/' +tag+ '\">';
	};
	this.get_tinymce_index_out_img = function (id,state) {
		var tag =  tag_index.out_pre + state+'-' + id + tag_index.out_post;
		return '<img id="' +tag+ '" src="../../../inc/btn.php/' +tag+ '" class="index" data-mce-src="../../../inc/btn.php/' +tag+ '">';
	};



	/**
	* TAG TO ID
	*/
	this.tag_to_id = function (tag){

		if (tag.indexOf('data')!==-1) {
			var matches = tag.match(/\[[\w]+-[a-z]-(.+)-data:.*?:data\]/);
			var tag_id  = matches[1]
		}else{
			var tag_id = tag.replace(/\D/g,'');
		}		

		return parseInt(tag_id);
	};	
	/**
	* ID TO TAG
	*/
	this.id_to_tag = function (id, inout) {
		if (inout==='out') {
			return tag_index.out_pre + id + tag_index.out_post;
		}else{
			return tag_index.in_pre + id + tag_index.in_post;
		}
	};
	/**
	* TAG TO TIMECODE
	*/
	this.tag_to_timecode = function (tag) {
		// tag format [TC_00:00:00.000_TC]
		var str = tag.replace("[TC_","");
			str = str.replace("_TC]","");

		return str;
	};



	/**
	* CHECK IS IN/OUT TAG
	*/
	this.tag_in_or_out = function (tag) {
		if (tag.indexOf("/")) {
			return 'out';
		}else{
			return 'in';
		}
	};



	/**
	* ESCAPE TAG
	*/
	this.escape_tag = function (tag) {
		return tag.replace(/([?"<>\/*+^$[\]\\{}|])/g, "\\$1")
	};



	/**
	* TAG TO STATE . Resolve state from tag
	*/
	this.tag_to_state = function (tag) {

		// Unificamos etiquetas a tag_in
		var tag		= tag.replace("[/","[");

		// recibimos [index-u-2]
		var state 	= tag.substring(7,8);

		return state;
	};



	/**
	* TESAURO OPEN WINDOW TREE
	*//*
	this.open_tesauro = function (obj) {

		var current_tipo 	= $(obj).data('tipo');
	  	var caller_tipo 	= $(obj).data('caller_tipo');
		var caller_id 		= $(obj).data('parent');

		// Dialog Title
		$("#dialog_page_iframe").dialog({
			// Change title
			title: 'Add tesauro index',
			// Clear current content on close
			close: function(event, ui) {
	            //$(this).attr( 'src', '');
	        },
	        modal: false,
	        width: 800,
	        height:600,
	        position: { my: "left top", at: "left top", of: obj }
        });

		var iframe_src 	 	= DEDALO_LIB_BASE_URL + "/../../ts/ts_list.php?modo=tesauro_rel&type=4&current_tipo="+current_tipo+"&caller_id="+caller_id+"&caller_tipo="+caller_tipo;

		// Carga la url del iframe y abre el modal box (el iframe 'dialog_page_iframe' está al final de la página principal)
		if( $('#dialog_page_iframe').attr('src').length < 12 ) //about:blank
		$('#dialog_page_iframe').attr('src',iframe_src);
		$('#dialog_page_iframe').dialog( "open" );

		// Fix global var selected_rel_locator
		selected_rel_locator = $(obj).data('rel_locator');

		return false;
	};//end open_tesauro
	*/



	/**
	* TEXT AREA HILIGHT SELECTED TEXT
	*/
	/*
	this.HighlightText = function (ed,tag,tipo){

		return false;

		var id = component_text_area.tag_to_id(tag);
		var state = component_text_area.tag_to_state(tag);
		var comprobacion = tag.indexOf("/");
		if (comprobacion >= 0){
			var tag_entrada=tag.replace("[/","[");
			var tag_salida = tag;
		}else{
			var tag_entrada=tag;
			var tag_salida=tag.replace("[","[/");
		}

		//ed.getBody().setAttribute('contenteditable', false);

        var range = ed.selection.dom.createRng();

        range.setStartBefore(ed.getBody().getElementById(tag_entrada));
        range.setEndAfter(ed.getBody().lastChild);
        ed.selection.setRng(range);
        var thisNode = ed.selection.getNode().id;

		if(SHOW_DEBUG===true) console.log(thisNode);
		return false;

		var image_in= component_text_area.build_index_in_img(id,state); //.replace(/([?"<>\/*+^$[\]\\(){}|])/g, "\\$1");
		var image_out= component_text_area.build_index_out_img(id,state);//.replace(/([?"<>\/*+^$[\]\\(){}|])/g, "\\$1");

		//var inicio = tinyMCE.activeEditor.selection.setContent(image_in);
		//alert(tag_entrada + ' '+ tag_salida)

		//var tt = $(ed.getBody()).find('[index-n-4]' );
		//if(SHOW_DEBUG===true) console.log(tt);
		var range = document.createRange();
		//var start = ed.getContent();
		//var seleccion = ed.selection.getContent();
		var entrada = ed.dom.select('img.'+tag_entrada );
		var salida = ed.dom.select('img.'+tag_salida );

		//range.setStart(seleccion, 0);
		//range.setEnd(elemento, 0);
		//ed.selection.setRng(range);
		//var textNode = tt.getElementsByTagName('img#'+tag_entrada)[0].firstChild;
		if(SHOW_DEBUG===true) console.log(entrada);


		//var ed = tinyMCE.activeEditor;
		var contenido = ed.getContent();

	
		//var node2selectArray = ed.dom.select('img' ); if(SHOW_DEBUG===true) console.log('node2selectArray: ');if(SHOW_DEBUG===true) console.log(node2selectArray);
		//var node2select = node2selectArray[2];
		//ed.selection.select(node2select);
		//return false;
		
		var range 	 = ed.selection.getRng();						//if(SHOW_DEBUG===true) console.log(range)
		//var textNode = ed.getBody();								if(SHOW_DEBUG===true) console.log(textNode)
		var node2selectArray = ed.dom.select(new RegExp('index-n-4', "gi"));	if(SHOW_DEBUG===true) console.log(node2selectArray); //return false; //tinyMCE.get('[index-n-4]');
		var textNode = node2selectArray[0];							if(SHOW_DEBUG===true) console.log(textNode);return false;

		var start 	= 0;
		var end 	= 0;
		range.setStart(textNode, start);
		range.setEnd(textNode, end);	//return false;
		ed.selection.setRng(range);
		return false;

		ed.selection.select(ed.dom.select('img')[0]);return false;

		//var contenido = tinyMCE.activeEditor.getBody().innerHTML;
		if(SHOW_DEBUG===true) console.log('contenido: '+contenido);

		var range = ed.selection.getRng(1);
		if(SHOW_DEBUG===true) console.log('range: '+range);
		//return false;

		var rng2 = range.cloneRange();

		rng2.setStartBefore($(ed.getBody()).find(tag_entrada));
		rng2.setEndBefore($(ed.getBody()).find(tag_salida).get(0));
		//return false;

		//range.setStart(contenido, image_in);
		//range.setEnd(contenido, image_out);
		ed.selection.setRng(rng2);

		if(SHOW_DEBUG===true) console.log('inicio: '+inicio);

		//var contenido = tinyMCE.activeEditor.getBody().innerHTML;

		//var pattern = new RegExp(image_in+'(.*?)'+image_out);			if(SHOW_DEBUG===true) console.log('pattern: '+pattern);
		//var newContent = contenido.replace(pattern, "XXXX <span class=\"hilite\">($1)</span> XXX ");

		//var image_in	= component_text_area.get_tinymce_index_in_img(id);	if(SHOW_DEBUG===true) console.log('pattern: '+pattern);

		//var pattern		= new RegExp(image_in,'g');
		//var newContent 	= contenido.replace(pattern, "XX ($1)");		//if(SHOW_DEBUG===true) console.log('newContent: '+newContent);

		//var image_out	= component_text_area.get_tinymce_index_out_img(id);
		//newContent 	= newContent.replace(image_out, "($1)</span>");		//if(SHOW_DEBUG===true) console.log('newContent: '+newContent);

		//var newContent ="hola2;";
		//ed.focus();
		//ed.setContent(newContent);

		return ;
	}
	*/



	/**
	* TAPS
	*/
	this.build_relation_taps = function(wrapper_id) {
		alert("build_relation_taps -> "+wrapper_id)
		$(function() {
			//  jQueryUI 1.10 and HTML5 ready
			//      http://jqueryui.com/upgrade-guide/1.10/#removed-cookie-option
			//  Documentation
			//      http://api.jqueryui.com/tabs/#option-active
			//      http://api.jqueryui.com/tabs/#event-activate
			//      http://balaarjunan.wordpress.com/2010/11/10/html5-session-storage-key-things-to-consider/
			//
			//  Define friendly index name
			var index_name = 'build_relation_taps_key_'+wrapper_id;
			//  Define friendly data store name
			var dataStore = window.sessionStorage;
			//  Start magic!
			try {
			    // getter: Fetch previous value
			    var oldIndex = dataStore.getItem(index_name);
			} catch(e) {
			    // getter: Always default to first tab in error state
			    var oldIndex = 0;
			}

			//$('#fragment_info_tabs_'+tipo).tabs({
				//var selector = '#' +wrapper_id
			$('#' +wrapper_id).find('.fragment_info_tabs').first().tabs({
			    // The zero-based index of the panel that is active (open)
			    active : oldIndex,
			    // Triggered after a tab has been activated
			    activate : function( event, ui ){
			        //  Get future value
			        var newIndex_name = ui.newTab.parent().children().index(ui.newTab);
			        //  Set future value
			        dataStore.setItem( index_name, newIndex_name )
			    }
			});
			/*
			$('.fragment_info_tabs').each(function() {
				$(this).tabs({
				    // The zero-based index of the panel that is active (open)
				    active : oldIndex,
				    // Triggered after a tab has been activated
				    activate : function( event, ui ){
				        //  Get future value
				        var newIndex_name = ui.newTab.parent().children().index(ui.newTab);
				        //  Set future value
				        dataStore.setItem( index_name, newIndex_name )
				    }
				});
			})
			*/
		});
	};//end build_relation_taps



	/**
	* RELOAD_COMPONENT_WITH_LANG
	* Configures the current component_text_area wrapper and reloads
	*/
	this.reload_component_with_lang = function(data) {

		var selector = '[role="wrap_component_text_area"][data-tipo="'+data.tipo+'"][data-section_tipo="'+data.section_tipo+'"][data-parent="'+data.parent+'"]'
		var wrapper  = document.querySelector(selector);
			//console.log(wrapper);
		if (wrapper && typeof wrapper!=='undefined') {		

			// Update wrapper dataset lang
			wrapper.dataset.lang = data.lang

			// Update wrapper id
			var ar_parts = wrapper.id.split('_');
			if (typeof ar_parts[4]!=='undefined' && ar_parts[4].indexOf('lg-') > -1) {
				ar_parts[4] = data.lang
				wrapper.id = ar_parts.join([separador = '_']);
			}else{
				console.log("Error[reload_component_with_lang]: Lang of wrapper_id not found!");
			}
			// console.log(wrapper.id);

			// Reload component_text_area
			component_common.load_component_by_wrapper_id(wrapper.id)
		}
	}//end reload_component_with_lang



	/**
	* LOAD_TAGS_PERSON
	* @return 
	*/
	this.load_tags_person = function(button_obj, hide) {

		var start = new Date().getTime();

		if (!button_obj) {
			var button_obj = document.querySelector('[data-role="text_area_transcription"]')
		}
		
		// From component wrapper
		var wrap_div = find_ancestor(button_obj, 'wrap_component')
			if (wrap_div === null ) {
				if(DEBUG) console.log(button_obj);
				return alert("component_text_area:load_tags_person: Sorry: wrap_div dom element not found")
			}
		var editor_panel = wrap_div.querySelector('.content_data')
			if (editor_panel === null ) {
				return alert("component_text_area:load_tags_person: Sorry: editor_panel dom element not found")
			}
		var persons_overlay = document.getElementById('persons_overlay')
			if (!persons_overlay) {
				var persons_overlay = document.createElement('div')
					persons_overlay.id = 'persons_overlay'
					persons_overlay.style.display = ''	
			}else{
				if (persons_overlay.style.display==='none') {			
					persons_overlay.style.display = '';					
				}else{
					persons_overlay.style.display = 'none';
				}
				return false
			}
		
		var trigger_vars = {
			mode 		 : 'load_tags_person',
			tipo 		 : wrap_div.dataset.tipo,
			parent 		 : wrap_div.dataset.parent,
			section_tipo : wrap_div.dataset.section_tipo,
			lang 		 : wrap_div.dataset.lang,
			top_tipo 	 : page_globals.top_tipo // Important !
		}
		//return 	console.log(trigger_vars);

		var js_promise 	 = common.get_json_data(component_text_area.url_trigger, trigger_vars).then(function(response) {
			if(SHOW_DEBUG===true) console.log(response);
					
			editor_panel.appendChild(persons_overlay)

			if (response===null) {
				persons_overlay.innerHTML = "<div>null value was received</div>"
			}else{
				var parse_tags_person = component_text_area.parse_tags_person(response.result)			
				persons_overlay.appendChild(parse_tags_person)
			}


			var button_close = document.createElement('div')
				button_close.classList.add('button_close')
				button_close.addEventListener('click', function() {
					//html_page.close_content(this.parentNode)
					//persons_overlay.remove()
					persons_overlay.style.display = 'none';
				});
			 	persons_overlay.appendChild(button_close)

			 if (SHOW_DEBUG===true) {
			 	var end  = new Date().getTime();
				var time = end - start;
				console.log("load_tags_person execution time: " +time+' ms');
			 }

			// Unactive overlay
			// html_page.loading_content( wrap_div, 0 );

			if (hide===true) {
				persons_overlay.style.display = 'none';
			}
		})
	};//end load_tags_person



	/**
	* PARSE_TAGS_PERSON
	* @return 
	*/
	this.parse_tags_person = function(data) {
		
		var ul 	 = document.createElement('ul')

		var len = data.length
		for (var i = 0; i < len; i++) {
		
			var element = data[i]
			var li = document.createElement('li')
			// Tag image
			var container = document.createElement('div')	
				//container.innerHTML = element.tag_image
				container.innerHTML = component_text_area.build_person_img(data[i].label, data[i].state, data[i].locator)						
				li.appendChild(container.firstChild)		

			// Key info
			var t 	  	 = document.createTextNode('Keyboard: Control + '+i)
			var key_info = document.createElement('strong')
				key_info.appendChild(t)
				li.appendChild(key_info)
			// Name
			/*
			var t 	  = document.createTextNode('Name')
			var label = document.createElement('label')	
				label.appendChild(t)
				li.appendChild(label)
			*/
			var t  = document.createTextNode(element.full_name)			
			var span  = document.createElement('span')	
				span.appendChild(t)
				li.appendChild(span)
			
			// Rol
			var t 	  = document.createTextNode('('+element.role+')')
			var label = document.createElement('label')	
				label.appendChild(t)
				li.appendChild(label)

			// LI click add event click
			var info = {
				label  : data[i].label,
				state  : data[i].state,
				locator: data[i].locator
			}
			li.dataset.info = JSON.stringify(info)
			// Event click
			/**/
			li.addEventListener("click", function (e) {				
				e.stopPropagation()				

				var info_obj = JSON.parse(this.dataset.info)
				// console.log(info);
				// Insert tag
				component_text_area.insert_person_image(info_obj.label, info_obj.state, info_obj.locator, e)				
				
				// Close persons selector
				component_text_area.load_tags_person()				
			});
			
			ul.appendChild(li)	
		}

		var t  = document.createTextNode('Persons') // get_label.personas
		var h1 = document.createElement('h1')
			h1.appendChild(t)

		var wrap = document.createElement('div')
			wrap.appendChild(h1)
			wrap.appendChild(ul)

		// keyboard event add
		tinymce.activeEditor.on('keydown', function(e) {
		    			
			for (var j = 0; j < len; j++) {
				if (e.ctrlKey==1 && e.keyCode==j+48) {
					//console.log("presed key: "+j);
					component_text_area.insert_person_image(data[j].label, data[j].state, data[j].locator, e)					
				}
			}
		});		
		
		return wrap
	};//end parse_tags_person



	/**
	* INSERT_PERSON_IMAGE
	* Build and insert a image full html code from vars
	*/
	this.insert_person_image = function(label, state, locator, e) {	
		e.preventDefault()
		e.stopPropagation()

		// Set component to not reload on save temporally
		component_text_area.reload_on_save = false;			

		var data = JSON.stringify(locator)

			// Format data Important !!
			data = replaceAll('"', '\'', data);

		// IMG : Create and insert image in text
		var img_html = component_text_area.build_person_img(label, state, data)	

		// Select text editor
		var ed = tinyMCE.activeEditor

			// Insert html on editor
			ed.selection.setContent( " " + img_html + " ", {format:'raw'} )

			ed.setDirty(true); // Set editor content as changed
			ed.isNotDirty = false; // Force not dirty state				

		// Restore default save behaviour after add image
		setTimeout(function(){
			
			component_text_area.reload_on_save = true;

			console.log("Set person "+label);
			console.log(ed.isDirty());

		}, 300)

		

		/*
		ed.focus();		
		ed.setDirty(true); // Set editor content as changed
		ed.isNotDirty = false; // Force not dirty state
		*/

		//component_text_area.saveable = true;

		/*
			// Update editor
			var ed = tinyMCE.activeEditor;
				ed.setContent(img_html + " "); //, {format : 'raw'}
				ed.focus();
				ed.setDirty(true);	// Force dirty state

			// Save modified content
			var input_text_area = document.querySelector('.css_text_area')
				if (input_text_area) {
					return component_text_area.Save( input_text_area, null, ed );	
				}
				*/		
	};//end insert_person_image



	/**
	* SHOW_PERSON_INFO
	* @return 
	*/
	this.show_person_info = function( evt ) {

		//if(SHOW_DEBUG!==true) return false; // Working here !!!
	
		var id 		= evt.target.id
		var div_id  = 'person_info' + id

		// Hide others		
		var ar_labels = document.querySelectorAll('div.person_info_float')
		var len = ar_labels.length; //console.log(len)
		for (var i = len - 1; i >= 0; i--) {
			if(ar_labels[i].id!==div_id) {
				ar_labels[i].style.display = 'none';
			}			
		}	

		var label_x = evt.x - 25
		var label_y = evt.y + 50

		var div = document.getElementById(div_id)
		if (div) {
			if (div.style.display==='none') {
				div.style.display = '';
			}else{
				div.style.display = 'none';
			}
			div.style.left = label_x +'px';
			div.style.top  = label_y +'px';			
			return false;
		}			

		//var text_area_tool_transcription = document.querySelector('.text_area_tool_transcription')
		var text_area_tool_transcription = document.getElementById(this.wrapper_id)		

		//console.log(id);
		var locator = this.get_data_locator_from_id(id)
			//console.log(locator);

		var trigger_vars = {
				mode 	: 'show_person_info',
				locator : JSON.stringify(locator)
			}
			//return console.log(trigger_vars)

		// Return a promise of XMLHttpRequest
		var js_promise = common.get_json_data(this.url_trigger, trigger_vars).then(function(response) {
							//console.log(response);

							var t_name 	= document.createTextNode(response.full_name)
							var t_role 	= document.createTextNode(" ("+response.role+") ")
							var t_x 	= document.createTextNode("x")							
							var div = document.createElement('div')
								div.classList.add('person_info_float')
								div.id 		   = div_id
								div.style.left = label_x +'px';
								div.style.top  = label_y +'px';

								// Append text
								div.appendChild(t_name)
								div.appendChild(t_role)

								// Close link
								var a_close = document.createElement('a')
									a_close.appendChild(t_x)
									a_close.addEventListener("click", function (e) {
										this.parentNode.style.display = 'none'
									});									
									div.appendChild(a_close)

							// Add to text_area_tool_transcription container
							if(text_area_tool_transcription) text_area_tool_transcription.appendChild(div)

						})

		return js_promise
	};//end show_person_info



	/**
	* GET_DATA_LOCATOR_FROM_ID
	* @return object locator
	*/
	this.get_data_locator_from_id = function( id ) {
		
		var matches = id.match(/data:({.+}):data/);
			
		if (typeof matches[1]!=='undefined') {
			var locator_str = matches[1]
				locator_str = replaceAll('\'', '"', locator_str)
			var locator = JSON.parse(locator_str)
				//console.log(locator);
		}else{
			var locator = null
		}
		
		return locator
	};//end get_data_locator_from_id



	/**
	* LINK_TERM
	* @return 
	*/
	this.link_term = function(section_id, section_tipo, label) {		
		//console.log(section_id+' - '+section_tipo+' - '+label)
		
		tool_indexation.add_index(section_id, section_tipo, label)
	};//end link_term



	/**
	* CREATE_NEW_NOTE
	* Build a new annotation when user clicks on text editor button
	* 
	* @return 
	*/
	this.create_new_note = function() {

		// Select text editor
		var ed 		 	= tinyMCE.activeEditor
		var tipo_tag 	= 'note'
		var last_tag_id = component_text_area.get_last_tag_id(ed, tipo_tag) 
		var note_number = parseInt(last_tag_id) + 1
		//console.log(last_tag_id)

		var trigger_vars = {
			mode 		 	: 'create_new_note',
			note_number		: note_number,
		}
		//return console.log(trigger_vars);

		var js_promise 	 = common.get_json_data(component_text_area.url_trigger, trigger_vars).then(function(response) {
			if(SHOW_DEBUG===true) console.log(response);
				
			if (response===null) {
				alert("Error on create annotation tag")
			}else{
				
				var label = note_number
				var state = 'a'
				var data = JSON.stringify(response.result)
					// Format data Important !!
					data = replaceAll('"', '\'', data);

				// IMG : Create and insert image in text
				var img_html = component_text_area.build_note_img(label, state, data)

				// Insert html on editor
				ed.selection.setContent(  img_html , {format:'raw'} )

				// Set editor as modified and save
				ed.setDirty(true)
				component_text_area.Save( document.getElementById(ed.id), null, ed ).then(function(response){
					// On finish save, select created tag (the last) and trigger click action
					var last_tag_obj = component_text_area.get_last_note(ed)
					if (last_tag_obj) {
						// Select image in text editor
						ed.selection.select(last_tag_obj); //select the inserted element // .scrollIntoView(false)
						// Trigger exec click on selected tag
						last_tag_obj.click();
					}
				})							
			}			
		})

		return js_promise
	};//end create_new_note



	/**
	* SHOW_NOTE_INFO
	* @return 
	*/
	this.show_note_info = function( evt ) {
	
		var tag 		 = evt.target.id
		var locator 	 = component_text_area.get_data_locator_from_id( evt.target.id ) 
		var section_tipo = locator.section_tipo
		var section_id 	 = locator.section_id
		var tag_id 		 = this.tag_to_id(tag)
		var editor_id	 = tinymce.activeEditor.id

		/* For fixed falues
		var component_tipo  = this.component_tipo
		var section_id 		= this.section_id
		var section_tipo 	= this.section_tipo
		var tag_id 		 	= this.tag_to_id(this.tag)
		*/

		var trigger_vars = {
			mode			: 'show_note_info',
			section_tipo	: section_tipo,
			section_id		: section_id,
			lang			: this.lang,
		}
		

		var js_promise 	 = common.get_json_data(component_text_area.url_trigger, trigger_vars).then(function(response) {
			if(SHOW_DEBUG===true) console.log(response);
			
			if (response===null) {
				alert("Error on show_note_info")
			}else{				
				
				// note_dialog
				var note_dialog = component_text_area.build_note_dialog({
					evt 	  : evt,
					response  : response,
					tag_id 	  : tag_id,
					editor_id : editor_id
				})
				document.body.appendChild(note_dialog)

				// Open modal
				$('#div_note_wrapper').modal('show')	
			}			
		})

		return js_promise			
	};//end show_note_info



	/**
	* BUILD_NOTE_DIALOG
	* @return DOM object
	*/
	this.build_note_dialog = function( options ) {
	
		var wrapper_id = "div_note_wrapper"
		var older_div_note_wrapper = document.getElementById(wrapper_id)
			if (older_div_note_wrapper) {
				older_div_note_wrapper.parentNode.removeChild(older_div_note_wrapper)
			}		
		// note wrapper		
		var div_note_wrapper = document.createElement("div")
			div_note_wrapper.id = wrapper_id

		
		var header = document.createElement("div")
			// h4 <h4 class="modal-title">Modal title</h4>
			var h4 = document.createElement("h4")
				h4.classList.add('modal-title')
				t = document.createTextNode("Note " + options.tag_id + " - Created by user "+options.response.created_by_user_name)
				// Add
				h4.appendChild(t)
				header.appendChild(h4)


		var body = document.createElement("div")
			// component_text element
			var component_text = document.createElement("div")
				component_text.innerHTML = options.response.component_text_html
				exec_scripts_inside(component_text)	
				body = component_text


		var footer = document.createElement("div")
			// Button delete <button type="button" class="btn btn-warning">Warning</button>
			var button_delete = document.createElement("button")
				button_delete.classList.add("btn","btn-warning","btn-sm","button_delete_note")
				button_delete.dataset.dismiss = "modal"
				button_delete.addEventListener('click', function() {
					component_text_area.delete_note(this, options)
				})
				t = document.createTextNode(get_label.borrar)
				button_delete.appendChild(t)
				// Add
				footer.appendChild(button_delete)

			// created_date
			var created_date = document.createElement("div")
				created_date.classList.add('created_date')
				t = document.createTextNode("Created date "+options.response.created_date)
				created_date.appendChild(t)
				// Add
				footer.appendChild(created_date)

			// Button ok <button type="button" class="btn btn-warning">OK</button>
			var button_ok = document.createElement("button")
				button_ok.classList.add("btn","btn-success","btn-sm","button_ok_note")
				button_ok.dataset.dismiss = "modal"
				button_ok.addEventListener('click', function() {
					var ed = tinyMCE.activeEditor
					ed.save()
				})
				t = document.createTextNode("  OK  ")
				button_ok.appendChild(t)
				// Add
				footer.appendChild(button_ok)	
			

		// modal dialog
		var modal_dialog = common.build_modal_dialog({
			id 		: wrapper_id,
			header 	: header,
			footer  : footer,
			body 	: body
		})	
		div_note_wrapper.appendChild(modal_dialog)

		
		return modal_dialog
	};//end build_note_dialog



	/**
	* DELETE_NOTE
	* @return 
	*/
	this.delete_note = function( button_obj, options ) {

		if (!confirm(get_label.borrar + " " +get_label.etiqueta+" "+options.tag_id)) {
			return false;
		}	
		
		// Editor where is the note tag (note is NOT the current tinymce.activeEditor)
		var ed 			 = tinymce.get(options.editor_id)
		var locator		 = component_text_area.get_data_locator_from_id( options.evt.target.id )
		var trigger_vars = {
			mode			: 'delete_note',
			section_tipo	: locator.section_tipo,
			section_id		: locator.section_id,
			lang			: this.lang,
		}

		/*
		var image_note  = ed.dom.select("img.note")
		var last_tag_id = this.get_last_tag_id(ed, 'note')
		var last_note   = this.get_last_note(ed)
		console.log(last_note)
		return
		*/

		var js_promise 	 = common.get_json_data(component_text_area.url_trigger, trigger_vars).then(function(response) {
			if(SHOW_DEBUG===true) console.log(response);
			
			if (response===null) {
				alert("Error on delete_note")
			}else{

				// Remove image in editor
				var image_note = ed.selection.getNode()
				if (image_note && image_note.nodeName==='IMG') {
					// Image is already selected
				}else{
					// Image is created and deleted. Locate last image note
					image_note = component_text_area.get_last_note(ed)
				}

				if (image_note && image_note.nodeName==='IMG') {
					// Remove img
					ed.dom.remove(image_note)

					// Set editor as modified and save
					ed.setDirty(true)
					component_text_area.Save( document.getElementById(ed.id), null, ed );
				}				
			}			
		})

		return js_promise
	};//end delete_note



	/**
	* GET_LAST_NOTE
	* @return 
	*/
	this.get_last_note = function(ed) {

		var last_tag_id 	= this.get_last_tag_id(ed, 'note')
		var ar_img_note  	= ed.dom.select("img.note")
		
		var len = ar_img_note.length
		for (var i = len - 1; i >= 0; i--) {
			var img 		= ar_img_note[i]
			var current_tag = img.id
			var ar_parts 	= current_tag.split('-');
			var number 	 	= parseInt(ar_parts[2]);
			if (number===last_tag_id) {
				return img
			}
		}
	};//end get_last_note



	


	
}//end class component_text_area

			









/**
* GOTO TIME CAPTURE CALL
*/
function goto_time(timecode) {
	if(DEBUG) console.log("->goto_time captured call in page edit context for tc "+timecode)
	return null;
}


