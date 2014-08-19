// JavaScript Document
/*
	TOOL_INDEXATION
*/



/**
*  TOOL_INDEXATION CLASS
*/
var tool_indexation = new function() {

	// LOCAL VARS
	this.url_trigger = DEDALO_LIB_BASE_URL + '/component_tools/tool_indexation/trigger.tool_indexation.php' ;

	// Global var. Set when load fragment info	
	this.selected_tag;
	this.selected_tipo;	
	this.selected_rel_locator;


	/**
	* FRAGMENT_INFO
	*/
	this.fragment_info = function(tagName, tipo, id_matrix) {

		if (typeof tagName == 'undefined') { return alert("Error fragment_info: tagName undefined") };
		if (typeof tipo == 'undefined') { return alert("Error fragment_info: tipo undefined") };
		if (typeof id_matrix == 'undefined') { return alert("Error fragment_info: id_matrix undefined") };

		var top_id_matrix 	= page_globals.top_id,
			top_tipo		= page_globals.top_tipo;

		if (typeof top_id_matrix == 'undefined') { return alert("Error fragment_info: top_id_matrix undefined") };
		if (typeof top_tipo == 'undefined') { return alert("Error fragment_info: top_tipo undefined") };


		var wrapper_id 	= '#indexation_page_list';	//alert("fragment_info id_matrix: "+id_matrix);
		
		var mode 		= 'fragment_info';
		var mydata		= { 'mode': mode, 'tagName': tagName, 'tipo': tipo, 'id_matrix': id_matrix, 'top_id_matrix': top_id_matrix, 'top_tipo': top_tipo };
			//if(DEBUG) console.log(JSON.stringify(mydata))

		html_page.loading_content( wrapper_id, 1 );
		
		// AJAX REQUEST
		$.ajax({
			url			: DEDALO_LIB_BASE_URL + '/component_tools/tool_indexation/trigger.tool_indexation.php',
			data		: mydata,
			type		: "POST",
			dataType	: 'html'
		})
		// DONE
		.done(function(received_data) {
			//if(DEBUG) console.log("->fragment_info: "+received_data)
			$(wrapper_id).html( received_data )									
		})
		// FAIL ERROR 
		.fail(function(error_data) {					
			inspector.show_log_msg(" <span class='error'>ERROR: on fragment_info [terminoID] " + terminoID + "</span>");
		})
		// ALLWAYS
		.always(function() {			
			html_page.loading_content( wrapper_id, 0 );
		});

		// Fix global selected_tag and selected_tipo for index
		this.selected_tag 			= tagName;
		this.selected_tipo 			= tipo;
		//this.selected_rel_locator 	= top_tipo +'.'+ top_id_matrix +'.'+ page_globals.caller_id +'.'+tipo+'.'+ component_text_area.tag_to_id(tagName)
		this.selected_rel_locator 	= top_tipo +'.'+ top_id_matrix +'.'+ page_globals.caller_id +'.'+ tipo +'.'+ component_text_area.tag_to_id(tagName)
			console.log('Fixed locator: '+this.selected_rel_locator)

	}//end fragment_info



	/**
	* DELETE_TAG . Remove selected tag an all relations / indexes associated
	*/
	this.delete_tag = function(button_obj) {

		var tag 		= $(button_obj).data('tag'),
			rel_locator = $(button_obj).data('rel_locator'),
			id_matrix 	= $(button_obj).data('id_matrix'),
			tipo 		= $(button_obj).data('tipo')
			//return alert(" tag:"+tag + " rel_locator:"+rel_locator + " id_matrix:"+id_matrix  )

		// Target div (contains all data info required for create the component to load)
		var wrapper_id 	= $('.css_wrap_text_area').first().attr('id');
		var target_obj 	= $('#'+wrapper_id);

		if ($(target_obj).length<1) { return alert("wrapper_id not found: " + wrapper_id) };
		
		if (DEBUG) console.log("->delete_tag loading tag data on div wrapper: "+wrapper_id + " from tag:"+tag+" - rel_locator:"+rel_locator+" - id_matrix:"+id_matrix)

		// Confirm action
		if( !confirm("¿ Remove tag ?\n "+tag) )  return false;

		if( !confirm("Que sepa que la va liar...\nBorrará la etiqueta seleccionada en todos los idiomas así como todas la relaciones e indexaciones asociadas a ella \n Usted mismo..") )  return false;

		var mode 		= 'delete_tag';
		var mydata		= { 'mode': mode, 'id_matrix': id_matrix, 'tipo': tipo, 'tag': tag, 'rel_locator': rel_locator};
			//return alert( JSON.stringify(mydata)  )

		// AJAX REQUEST
		$.ajax({
			url			: DEDALO_LIB_BASE_URL + '/component_common/trigger.component_common.php',
			data		: mydata,
			type		: "POST"
		})
		// DONE
		.done(function(received_data) {

			if (DEBUG) console.log("->delete_tag: "+received_data)
			
			if (received_data=='ok') {
				var arguments = null;
				component_common.load_component_by_wrapper_id(wrapper_id, arguments);

				// Clean selected fragment info
				//tool_indexation.fragment_info(tag,tipo)
				$('#indexation_page_list').html('');

			}else{
				alert("->delete_tag error: "+received_data)
			}						
		})
		// FAIL ERROR 
		.fail(function(error_data) {					
			inspector.show_log_msg(" <span class='error'>ERROR: on delete_tag !</span> ");
		})
		// ALLWAYS
		.always(function() {			
			//html_page.loading_content( wrapper_id, 0 );
		});

		//return alert("en proceso ");
	}

	
	
	/**
	* TESAURO ADD INDEX
	*/
	this.add_index = function( button_obj ) {

		if(typeof(this.selected_rel_locator)=='undefined') {
			return alert(" Please select a tag before indexing! " );
		}

		var terminoID 			= $(button_obj).data('termino_id'),
			termino 			= $(button_obj).data('termino'),
			selected_rel_locator= this.selected_rel_locator,
			tag 				= this.selected_tag,
			tipo 				= this.selected_tipo ,
			_parent 			= page_globals._parent 

			//return alert("add_index vars: terminoID:" + terminoID + " termino:"+ termino+ "\n selected_rel_locator:"+ selected_rel_locator+ "\n tag:"+ tag+ "\n tipo:"+ tipo+ "\n _parent:"+ _parent)

		if(typeof(terminoID)=='undefined') {
			return alert("Error: terminoID is not defined!");
		}
		if(typeof(tag)=='undefined') {
			return alert("Error: add_index: tag is not defined!");
		}
		if(typeof(tipo)=='undefined') {
			return alert("Error: add_index: tipo is not defined!");
		}
		if(typeof(_parent)=='undefined') {
			return alert("Error: add_index: _parent is not defined!");
		}		

		var myurl 		= DEDALO_LIB_BASE_URL + '/component_relation/trigger.component_relation.php' ;
		var mode 		= 'add_index';
		var mydata		= { 'mode': mode, 'terminoID': terminoID, 'rel_locator': selected_rel_locator };
			//return alert("add_index vars: mode:add_index, terminoID:" + terminoID + " termino:"+ termino+ "\n selected_rel_locator:"+ selected_rel_locator)

		// AJAX REQUEST
		$.ajax({
			url			: myurl,
			data		: mydata,
			type		: "POST"
		})
		// DONE
		.done(function(received_data) {

			//if (DEBUG) console.log("->add_index response: "+received_data)
			
			if (received_data=='ok') {
				// RECEIVED OK	
					// Hide tesauro button					
					$(button_obj).css({ opacity: 0.4 })
					
					// Reload ajax div
					tool_indexation.fragment_info(tag, tipo, _parent);				
			}else{
				// RECEIVED ERROR
				alert("->add_index received_data error: "+received_data)
			}						
		})
		// FAIL ERROR 
		.fail(function(error_data) {					
			inspector.show_log_msg(" <span class='error'>ERROR: on add_index [terminoID] " + terminoID + "</span>");
		})
		// ALLWAYS
		.always(function() {			
			//html_page.loading_content( wrapper_id, 0 );
		});

	}//end add_index


	/**
	* TESAURO REMOVE INDEX
	*/
	this.remove_index = function (button_obj) {
		
		var id_matrix 	= $(button_obj).data('id_matrix');		//return alert(caller_id);
		var rel_locator = $(button_obj).data('rel_locator');	// like '1604.0.0'	or '1241.dd87.2'
		var tag 		= $(button_obj).data('tag');			// like [index-u-1] or [/index-u-1] 
		var terminoID 	= $(button_obj).data('termino_id');
		var termino 	= $(button_obj).data('termino');

		//var tipo 		= $(button_obj).parents('.wrap_component').first().data('tipo');
		var tipo 		= $(button_obj).data('tipo');
		var _parent 	= page_globals._parent ;

		// Confirm action
		var msg =  html2text("¿ Remove indexation ?\n" + termino + " ["+terminoID+"]");
		if( !confirm(msg) )  return false;

		var myurl 		= DEDALO_LIB_BASE_URL + '/component_relation/trigger.component_relation.php' ;
		var mode 		= 'remove_index';
		var mydata		= { 'mode': mode, 'id_matrix': id_matrix, 'rel_locator': rel_locator, 'terminoID':terminoID };	
			//return alert('mode:'+ mode+ ' id_matrix:'+ id_matrix+ ' rel_locator:'+ rel_locator+ ' tipo:'+ tipo+ ' tag:'+ tag)

		var received_data;

		//if (DEBUG) console.log(mydata); return false;
		// AJAX REQUEST
		$.ajax({
			url			: myurl,
			data		: mydata,
			type		: "POST"
		})
		// DONE
		.done(function(received_data) {

			if (DEBUG) console.log("->remove_index: "+received_data);	

			tool_indexation.fragment_info(tag, tipo, _parent);
			/*
			if (received_data=='ok') {
				// RECEIVED OK
				// Reload ajax div
				component_text_area.load_relation(tag,tipo,function(){
																	//alert("Indexation removed!\n\n" + termino + " ["+terminoID+"]");																					
																});
			}else{
				// RECEIVED ERROR
				alert("->add_index error: "+received_data)
			}
			*/
		})
		// FAIL ERROR 
		.fail(function(error_data) {
			inspector.show_log_msg(" <span class='error'>ERROR: on remove_index [terminoID] " + terminoID + "</span>");
		})
		// ALLWAYS
		.always(function() {
			//html_page.loading_content( wrapper_id, 0 );
		});
	}


	/**
	* TOGGLE_SELECTED_FRAGMENT
	*/
	this.toggle_selected_fragment = function( button_obj ) {
		$(button_obj).next('.selected_fragment').toggle();		
	}


	/**
	* CREATE FRAGMENT
	* Crea las imágenes (con los tag) al principio y final del texto seleccionado
	* y salva los datos
	*/
	this.create_fragment = function ( button_obj ) {	//, component_name

		var identificador_unico	= $(button_obj).data('identificador_unico'),
			id_matrix			= $(button_obj).data('id_matrix'),
			component_name		= identificador_unico;

		// Select current editor
		var ed = tinyMCE.get(component_name);
		//var ed = tinyMCE.activeEditor;
			if ($(ed).length<1) { return alert("Editor " + component_name + " not found [1]!") };	

		if (DEBUG) console.log( ed.selection.getContent({format : 'text'}) )

		
		var current_text_area = $('#'+component_name);
			if ($(current_text_area).length<1) { return alert("Editor " + component_name + " not found [2]!") };

		var last_tag_index_id = $(current_text_area).data('last_tag_index_id');
			//if (DEBUG) console.log('last_tag_index_id: ' +last_tag_index_id);
			//if (DEBUG) console.log($(current_text_area).data());
		
		var string_selected 	= ed.selection.getContent({format : 'raw'}); // Get the selected text in raw format
		var string_len 			= string_selected.length ;
		if(string_len<1) 		return alert("Please, select a text fragment before ! " +string_len);

		// New tag_id to use
		var tag_id = parseInt(last_tag_index_id+1);		//alert("new tag_id:"+last_tag_index_id + " "+component_name); return false;

		// State. Default is 'n' (normal)
		var state = 'n';

		// Final string to replace 
		//var final_string = tag_index.in_pre + tag_id + tag_index.in_post + string_selected + tag_index.out_pre  + tag_id + tag_index.out_post ;
		var final_string = component_text_area.build_index_in_img(tag_id,state) + string_selected + component_text_area.build_index_out_img(tag_id,state) ;
		
		// Add new formated string to replace the selected text
		var replace = ed.selection.setContent( final_string );	
			//if (DEBUG) console.log(replace)	
		
		// Update last_tag_index_id data on current text area
		$(current_text_area).data('last_tag_index_id',tag_id);


		// FORCE UPDATE REAL TEXT AREA CONTENT (and save is triggered when text area changes)												
		tinyMCE.triggerSave();	console.log(tinyMCE)

		/**/
		// Load current tag relation info
		var tagName = component_text_area.tag_index.in_pre + 'n-' + tag_id + component_text_area.tag_index.in_post;;			
		var tipo 	= $('#'+ed.id).parents('.wrap_component').first().data('tipo');
		if(typeof(tagName)=='undefined' || typeof(tipo)=='undefined') {
			alert("Impossible load relation. Insuficient data: \n tagName:"+tagName+" - tipo:"+tipo);
		}else{
			this.fragment_info(tagName, tipo, id_matrix);	//tagName, tipo, id_matrix //alert("Calling fragment_info with arguments: "+ tagName + " " + tipo)
		}

		$(button_obj).hide();

		// TEXT EDITOR : Force save
		var evt = null;
		text_editor.save_command(ed,evt,current_text_area);

	}//end create_fragment




};
//end tool_indexation