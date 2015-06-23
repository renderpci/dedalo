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


	this.Save = function(component_obj, save_arguments) {

		// FORCE UPDATE REAL TEXT AREA CONTENT (and save is triggered when text area changes)												
		tinyMCE.triggerSave();//console.log(tinyMCE);	

		if (typeof save_arguments==='undefined') {
			var save_arguments = {} 
		}		
		
		// Exec general save
		component_common.Save(component_obj, save_arguments);
		
		// Update possible dato in list (in portal x example)
		component_common.propagate_changes_to_span_dato(component_obj);
	}

	
	
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


	// GET_LAST_TAG_ID
	this.get_last_tag_id = function(ed,tipo_tag) {

		var ar_id_final = [0];
		// IMG : Select all images in text area	
		var ar_img = ed.dom.select('img');
			//console.log(ar_img)

		// ITERATE TO FIND TIPO_TAG (filter by classname: svg,etc.)
		for (var i=0; i < ar_img.length; i++ ){

			var current_className 	= ar_img[i].className;
			if( current_className.indexOf(tipo_tag) != -1 ) {
				// current tag like [svg-n-1]
				var current_tag = ar_img[i].id;
				switch(tipo_tag) {
					// SVG [svg-n-1-data:**]
					case 'svg':	var ar_parts = current_tag.split('-');
								var number 	 = parseInt(ar_parts[2]);
								break;
					// GEO [geo-n-1-data:**]
					case 'geo':	var ar_parts = current_tag.split('-');
								var number 	 = parseInt(ar_parts[2]);
								break;
				}
				// Insert id formated as number in final array
				ar_id_final.push(number)
					//console.log(number)
			}
		}
		// LAST ID
		var last_tag_id = Math.max.apply(null, ar_id_final);
			//console.log(last_tag_id )
			//console.log(ar_id_final);

		return parseInt(last_tag_id);
	}
	
	// UPDATE_SVG_TAG
	this.update_svg_tag = function(tagOriginal, id, state, data){

		// Format data
		data = replaceAll('"', '\'', data);

		// TEXT_AREA : Get current content
		var texto = tinyMCE.activeEditor.getContent({format : 'raw'});

		// TAG : Build new tag
		var tagNew = this.tag_svg.pre + state + '-' + id  + '-data:' + data + this.tag_svg.post;

		// TEXT : Repalce content text
		texto = texto.replace(tagOriginal, tagNew)

		// TEXT_AREA : Set updated content
		tinyMCE.activeEditor.setContent(texto,{format : 'raw'});
		
		// Text editor foce sync update data
		tinyMCE.triggerSave();

		// SAVE : Save component data
		component_text_area.Save( $('.css_text_area') )

		return tagNew;
	}

	/**
	* UPDATE_GEO_TAG
	* @see component_geolocation
	*/
	this.update_geo_tag = function(tagOriginal, id, state, data){

		// Format data
		data = replaceAll('"', '\'', data);

		// TEXT_AREA : Get current content
		var texto = tinyMCE.activeEditor.getContent({format : 'raw'});

		// TAG : Build new tag
		var tagNew = this.tag_geo.pre + state + '-' + id  + '-data:' + data + this.tag_geo.post;

		// TEXT : Repalce content text
		texto = texto.replace(tagOriginal, tagNew)

		// TEXT_AREA : Set updated content
		tinyMCE.activeEditor.setContent(texto,{format : 'raw'});
		
		// Text editor foce sync update data
		tinyMCE.triggerSave();

		// SAVE : Save component data
		component_text_area.Save( $('.css_text_area') )

		return tagNew;
	}


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
							component_text_area.videoPlay(e);				if (DEBUG) console.log('->text editor videoPlay ed.onKeyUp: '+e.keyCode);						
							break;

				//case 113 : 	// Key F2 (113) Write tc tag in text
				case parseInt(videoFrame.av_media_player_insert_tc_key) :
							component_text_area.get_and_write_tc_tag(e);	if (DEBUG) console.log('->text editor write_tc_tag ed.onKeyUp: '+e.keyCode);
							break;			
			}
		}catch(e){
			if(DEBUG) console.log(e)
		}
		
		//alert(typeof videoFrame.av_media_player_play_pause_key)
	}
	
	

	/*
	* LOAD_FRAGMENT_INFO_IN_IDEXATION
	* Alias of tool_indexation.fragment_info()
	*/
	this.load_fragment_info_in_idexation = function(tag, tipo, parent, section_tipo) {
		return tool_indexation.fragment_info(tag, tipo, parent, section_tipo)
	}

	/**
	* LOAD RELATION
	* Carga el botón correspondiente a la etiqueta seleccionada (ni mas ni menos)
	*/
	this.load_relation = function(tagName, tipo, parent, section_tipo ) {
		// alert(tagName +' '+ tipo+' '+ parent)
		// Catch no operacional modes : Sólo se usará en modo 'edit'
		if (page_globals.modo!='edit') { return false };

		// VARS VALIDATE : Comprueba variables válidas
		if(typeof( tagName )==='undefined')		return alert("Error: load_relation: tagName is not defined!");
		if(typeof( tipo )==='undefined')			return alert("Error: load_relation: tipo is not defined!");


		// INSPECTOR : CARGA DATOS RELACIONADOS A LA ETIQUETA EN INSPECTOR
			// Ajax load inspector_indexation_list from trigger.tool_indexation
			tool_indexation.load_inspector_indexation_list(tagName, tipo, parent, section_tipo);
			
			// Ajax load inspector_relation_list_tag from trigger.tool_indexation
			// DESACTIVA DE MOMENTO
			//tool_relation.load_inspector_relation_list_tag(tagName, tipo, parent);
		
		
		// Target div (contains all data info required for create the component to load)
		var wrapper_id 	= 'relations_ajax_div_'+tipo;
		var target_obj 	= $('#'+wrapper_id);

		// Usamos caller_id para pasar el tag al componente (no hay otra forma mejor de momento..)	
		$(target_obj).data('caller_id',tagName);


		/*
		if (DEBUG) console.log("->load_relation loading tag data on div wrapper: "+wrapper_id + " from tagName:"+tagName+" - tipo:"+tipo)
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
		
	}//end load_relation


	/**
	* LOAD_BUTTON_LINK_FRAGMET_TO_PORTAL
	* Carga el botón correspondiente a la etiqueta seleccionada (toma ya..)
	*/
	this.load_button_link_fragmet_to_portal = function(tagName, tipo, parent, section_tipo) {
		//return 	console.log(tagName + ' ' +tipo +' '+ parent)
		// vars
		var vars = new Object();
			vars.tagName 		= tagName,
			vars.tipo			= tipo,
			vars.section_tipo	= section_tipo,
			vars.parent			= parent;
		// Verify vars values
		if(!test_object_vars(vars,'remove_locator_from_portal')) return false;


		// Target div (contains all data info required for create the component to load)
		var wrapper_id 	= 'relations_ajax_div_'+tipo;
		var target_obj 	= $('#'+wrapper_id);

		// Usamos caller_id para pasar el tag al componente (no hay otra forma mejor de momento..)	
		//$(target_obj).data('caller_id',tagName);

			//console.log($(target_obj))

		if (DEBUG) console.log("->load_button_link_fragmet_to_portal loading tag data on div wrapper: "+wrapper_id + " from tagName:"+tagName+" - tipo:"+tipo)
		
		var arguments = {
			'tagName': tagName,
			'portal_tipo': page_globals.portal_tipo,
			'portal_parent': page_globals.portal_parent,
			'portal_section_tipo': page_globals.portal_section_tipo,
		};
		//console.log(arguments)

		component_common.load_component_by_wrapper_id(wrapper_id, arguments, 
							function(){
								// Callback function rebuild taps
								//component_text_area.build_relation_taps(wrapper_id);
								$('.btn_relate_fragment').css('display','inline-block')
							});

		// Fix global selected_tag and selected_tipo for index
		selected_tag 	= tagName;
		selected_tipo 	= tipo;

	}// end load_button_link_fragmet_to_portal



	/**
	* LOAD FRAGMENT INFO
	* Used in modo 'tool_lang' to change tags state 
	*/
	this.load_fragment_info = function(tagName, tipo, lang) {
		
		// Target div (contains all data info required for create the component to load)
		var wrapper_id 	= 'fragment_info_div_'+tipo+'_'+lang;
		var target_obj 	= $('#'+wrapper_id);

		// Usamos caller_id para pasar el tag al componente (no hay otra forma mejor de momento..)	
		$(target_obj).data('caller_id',tagName);

		if (DEBUG) console.log("->load_fragment_info loading tag data on div wrapper: "+wrapper_id + " from tag:"+tagName+" - tipo:"+tipo+" - lang:"+lang)
		var arguments = null;
		component_common.load_component_by_wrapper_id(wrapper_id, arguments);
	}

	
	this.logIndexChanges = function (tagName) {
		alert("Captured logIndexChanges: "+tagName)
	}

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
	}
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
	}
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
	}
	

	// Return REAL tinymce representation of current image
	this.get_tinymce_index_in_img = function (id,state) {
		var tag =  tag_index.in_pre + state+'-' + id + tag_index.in_post;
		return '<img id=\"' +tag+ '\" src=\"../../../inc/btn.php/' +tag+ '\" class=\"index\" data-mce-src=\"../../../inc/btn.php/' +tag+ '\">';
	}
	this.get_tinymce_index_out_img = function (id,state) {
		var tag =  tag_index.out_pre + state+'-' + id + tag_index.out_post;
		return '<img id="' +tag+ '" src="../../../inc/btn.php/' +tag+ '" class="index" data-mce-src="../../../inc/btn.php/' +tag+ '">';
	}

	/**
	* TAG TO ID
	*/
	this.tag_to_id = function (tag){
		var tag =tag.replace(/\D/g,'');
		var id = parseInt(tag);
		//alert(id);
		return id;
	}
	/**
	* ID TO TAG
	*/
	this.id_to_tag = function (id, inout) {
		if (inout==='out') {
			return tag_index.out_pre + id + tag_index.out_post;
		}else{
			return tag_index.in_pre + id + tag_index.in_post;
		}		
	}
	/**
	* TAG TO TIMECODE
	*/
	this.tag_to_timecode = function (tag) {
		// tag format [TC_00:00:00_TC]
		var str = tag.replace("[TC_","");
		str = str.replace("_TC]","");

		return str;
	}
	

	/**
	* CHANGE TAF STATE
	*/
	this.change_tag_state = function (obj) {

		var tag 			= $(obj).data('tag');
		var id 				= component_text_area.tag_to_id(tag);
		var current_state 	= component_text_area.tag_to_state(tag);
		var new_state 		= $(obj).val();

		if (!new_state) return false;

			var content = tinyMCE.activeEditor.getBody().innerHTML;		//alert(content);

			/**
			* Replace tag code 
			*/
			var tag_entrada =  '([index-)' + current_state + '(-' + id + '])'; 
			var tag_salida 	= '([/index-)' + current_state + '(-' + id + '])'; 

			// Prepare tag to regex
			pattern_entrada 	= component_text_area.escape_tag(tag_entrada);		//if (DEBUG) console.log(tag_entrada)				
			pattern_salida 		= component_text_area.escape_tag(tag_salida);		//if (DEBUG) console.log(tag_salida)		

			// Repalce tag in
			var pattern		= new RegExp(pattern_entrada,'g');				
			var newContent 	= content.replace(pattern, "$1"+new_state+"$2");	

			// Repalce tag out
			var pattern		= new RegExp(pattern_salida,'g');				
			var newContent 	= newContent.replace(pattern, "$1"+new_state+"$2");

			// update data tag state
			$(obj).data('tag','[index-' + new_state + '-' + id + ']');
			
			var ed = tinyMCE.activeEditor;
			ed.focus();
			ed.setContent(newContent);
			// FORCE UPDATE REAL TEXT AREA CONTENT (and save is triggered when text area changes)												
			tinyMCE.triggerSave();//console.log(tinyMCE);
			component_text_area.Save( $('.css_text_area') );

	}

	/**
	* CHECK IS IN/OUT TAG
	*/
	this.tag_in_or_out = function (tag) {
		if (tag.indexOf("/")) {
			return 'out';
		}else{
			return 'in';
		}
	}

	/**
	* ESCAPE TAG 
	*/
	this.escape_tag = function (tag) {
		return tag.replace(/([?"<>\/*+^$[\]\\{}|])/g, "\\$1")
	}

	/**
	* TAG TO STATE . Resolve state from tag
	*/
	this.tag_to_state = function (tag) {

		// Unificamos etiquetas a tag_in
		var tag		= tag.replace("[/","[");

		// recibimos [index-u-2] 
		var state 	= tag.substring(7,8);	

		return state;
	}


	/**
	* TESAURO OPEN WINDOW TREE
	*/
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
	}


	
	


	/**
	* TEXT AREA HILIGHT SELECTED TEXT
	*/
	this.HighlightText = function (ed,tag,tipo){
		
		
		return false;
		/*
		DESACTIVO !!!
		*/
		
		
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



		if (DEBUG) console.log(thisNode);
		return false;




		var image_in= component_text_area.build_index_in_img(id,state); //.replace(/([?"<>\/*+^$[\]\\(){}|])/g, "\\$1");
		var image_out= component_text_area.build_index_out_img(id,state);//.replace(/([?"<>\/*+^$[\]\\(){}|])/g, "\\$1");

		//var inicio = tinyMCE.activeEditor.selection.setContent(image_in);
		//alert(tag_entrada + ' '+ tag_salida)

		//var tt = $(ed.getBody()).find('[index-n-4]' );
		//if (DEBUG) console.log(tt);
		var range = document.createRange();
		//var start = ed.getContent();
		//var seleccion = ed.selection.getContent();
		var entrada = ed.dom.select('img.'+tag_entrada );
		var salida = ed.dom.select('img.'+tag_salida );

		//range.setStart(seleccion, 0);
		//range.setEnd(elemento, 0);
		//ed.selection.setRng(range); 
		//var textNode = tt.getElementsByTagName('img#'+tag_entrada)[0].firstChild;
		if (DEBUG) console.log(entrada);

		


		//var ed = tinyMCE.activeEditor;
		var contenido = ed.getContent();

		/*
		var node2selectArray = ed.dom.select('img' ); if (DEBUG) console.log('node2selectArray: ');if (DEBUG) console.log(node2selectArray);
		var node2select = node2selectArray[2];
		ed.selection.select(node2select);
		return false;
		*/
		var range 	 = ed.selection.getRng();						//if (DEBUG) console.log(range)
		//var textNode = ed.getBody();								if (DEBUG) console.log(textNode)
		var node2selectArray = ed.dom.select(new RegExp('index-n-4', "gi"));	if (DEBUG) console.log(node2selectArray); //return false; //tinyMCE.get('[index-n-4]');	
		var textNode = node2selectArray[0];							if (DEBUG) console.log(textNode);return false;

		var start 	= 0;
		var end 	= 0;
		range.setStart(textNode, start);	
		range.setEnd(textNode, end);	//return false;
		ed.selection.setRng(range); 
		return false;
		
		ed.selection.select(ed.dom.select('img')[0]);return false;


		


		//var contenido = tinyMCE.activeEditor.getBody().innerHTML;
		if (DEBUG) console.log('contenido: '+contenido);

		var range = ed.selection.getRng(1);
		if (DEBUG) console.log('range: '+range);
		//return false;

		var rng2 = range.cloneRange();

		rng2.setStartBefore($(ed.getBody()).find(tag_entrada));
		rng2.setEndBefore($(ed.getBody()).find(tag_salida).get(0));
		//return false;

		//range.setStart(contenido, image_in);
		//range.setEnd(contenido, image_out);
		ed.selection.setRng(rng2); 

		if (DEBUG) console.log('inicio: '+inicio);




		//var contenido = tinyMCE.activeEditor.getBody().innerHTML;

		//var pattern = new RegExp(image_in+'(.*?)'+image_out);			if (DEBUG) console.log('pattern: '+pattern);
		//var newContent = contenido.replace(pattern, "XXXX <span class=\"hilite\">($1)</span> XXX ");
		
		//var image_in	= component_text_area.get_tinymce_index_in_img(id);	if (DEBUG) console.log('pattern: '+pattern);

		//var pattern		= new RegExp(image_in,'g');
		//var newContent 	= contenido.replace(pattern, "XX ($1)");		//if (DEBUG) console.log('newContent: '+newContent);



		//var image_out	= component_text_area.get_tinymce_index_out_img(id);
		//newContent 	= newContent.replace(image_out, "($1)</span>");		//if (DEBUG) console.log('newContent: '+newContent);


		//var newContent ="hola2;";
		//ed.focus();
		//ed.setContent(newContent);

		return ;
		
	}



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
	}


	
	


}//end class component-text_area


	




	/**
	* GOTO TIME CAPTURE CALL
	*/
	function goto_time(timecode) {
		if(DEBUG) console.log("->goto_time captured call in page edit context for tc "+timecode)
		return null;
	}


