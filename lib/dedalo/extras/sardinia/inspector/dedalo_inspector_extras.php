<?php

	
	$current_html='';


	#
	# PUBLISH CURRENT RECORD


	#
	# CONJUNTOS : RDF GENERATOR
	if ($section_tipo=='numisdata4') {	// Conjuntos	//   && $section_id==4
		
		$current_html .= "<div id=\"button_difussion_export_record\" class=\"icon_bs tool_diffusion tool_diffusion_inspector link\" style=\"margin-bottom:8px;margin-top:0px;margin-left:15px;\"		
		>Publish to Nomisma</div>";
	}



	echo $current_html;							



?>