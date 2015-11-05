
// TOOL_IMPORT_AV CLASS
var tool_import_av = new function() {

	// LOCAL VARS
	this.url_trigger = DEDALO_LIB_BASE_URL + '/tools/tool_import_av/trigger.tool_import_av.php?top_tipo='+page_globals.top_tipo ;



	this.process_files = function(button_obj) {
		//console.log(button_obj);
		
		var target_id = parseInt( $('#target_id').val() );
			//console.log(target_id);
			//console.log( isNaN(target_id) || target_id==0 );return false;
		if ( isNaN(target_id) || target_id==0 ) {
			if( !confirm("No ha especificado ID.\nSe creará un registro nuevo para esta importación. ¿Continuar?") ) return false;			
		}
		

		$( button_obj ).after(function() {
		  return "<span class=\"processing_msg\">Processing files. Please wait..</span>";
		}).hide(0);

		$('#button_gestion_de_archivos').hide();


		return true;
	}


};//end class