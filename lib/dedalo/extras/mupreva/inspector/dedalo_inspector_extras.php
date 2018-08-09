<?php

	
	$current_html='';


	#
	# PUBLISH CURRENT RECORD


	#
	# CONJUNTOS : RDF GENERATOR
	if ($section_tipo=='mupreva494') {	// Conjuntos	//   && $section_id==4
		
		$current_html .= "<div id=\"button_difussion_export_record\" class=\"icon_bs tool_diffusion tool_diffusion_inspector link\" style=\"margin-bottom:8px;margin-top:0px;margin-left:15px;\"		
		onclick=\"mupreva_dump_collection(this)\">Publicar en Nomisma</div>";
	}



	echo $current_html;							



?>
<script type="text/javascript">

	
	function mupreva_dump_collection( button_obj ) {

		var section_id 	 = page_globals._parent,
			section_tipo = page_globals.section_tipo

		var tesoro_lliria = 4;
		if (section_id!=tesoro_lliria) {
			return alert("Este conjunto no está habillitado para publicación en Nomisma. Consulte al administrador para incluirlo en el volcado")
		}
		//console.log(section_id);

		var mydata = {	'mode' 			: 'dump_collection',
						'section_id' 	: section_id,
						'section_tipo' 	: section_tipo
					 }
					 //console.log(mydata); return;

		var wrap_div = document.getElementById('log_messages'); 
			wrap_div.innerHTML = common.print_response('<span class=\"css_spinner blink\"> Publishing.. please wait </span>');
		//html_page.loading_content( wrap_div, 1 );

		// AJAX REQUEST
		$.ajax({
			url		: DEDALO_LIB_BASE_URL + '/extras/mupreva/nomisma/trigger.nomisma.php',
			data	: mydata ,
			type 	: "POST"
		})
		// DONE
		.done(function(received_data) {

			// DEBUG CONSOLE Console log
			//if(SHOW_DEBUG===true) console.log(received_data );
			
			// INSPECTOR LOG INFO			
			if (received_data.indexOf("Error")!=-1 || received_data.indexOf("error")!=-1 || received_data.indexOf("Failed")!=-1) {
				var msg = "<span class='error'>Failed Save!<br>" +received_data+ " for " + label + "</span>";
			}else{
				var msg = "<span class='ok'>" + received_data +"</span>";
			}
			//inspector.show_log_msg(msg);				
			wrap_div.innerHTML = common.print_response(msg);
		})
		// FAIL ERROR 
		.fail(function(error_data) {
			// Notify to log messages in top of page
			var msg = "<span class='error'>ERROR: on Save data id:" + id + " (Ajax error)<br>Data is NOT saved!</span>";				
			//inspector.show_log_msg(msg);
			wrap_div.innerHTML = msg;
			if(SHOW_DEBUG===true) console.log(error_data);	
		})
		// ALWAYS
		.always(function() {
			//if(show_spinner) html_page.loading_content( wrap_div, 0 );
		})

	}//end mupreva_dump_collection

</script>