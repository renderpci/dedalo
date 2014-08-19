<?php
/*
	TOOLS . STATIC METHODS
	
*/

abstract class component_common_draw {
	
	
	# DRAW LABEL  
	public static function draw_label($component_obj) {		
		
		# VERIFICACION DE PERMISOS
		#$tipo			= $component_obj->get_tipo();
		
		#$modo = $component_obj->get_modo();	echo $modo;		
		#if($modo != 'simple')
		#$permissions	= common::get_permissions($tipo); 	#print_r($permissions);	
		
		/*	
		if( !isset($permissions) || $permissions>3 ) {			
			print( __METHOD__." <span class='error'>Permissions not defined! ($permissions - $tipo)</span> " );
			return false;
		}
		*/

		
		# CSS
		$ar_css			= $component_obj->get_ar_css();		
		if(!isset ($ar_css['css_label']))		$ar_css['css_label'] = '';	
		if(!isset ($ar_css['css_span_dato']))	$ar_css['css_span_dato'] = '';		
		
		# CAMPO OBLIGATORIO
		$required_code 	= NULL;
		if($component_obj->get_required())
			$required_code = 'style="font-weight:bold"';
		
		$label			= $component_obj->get_label();
		$tipo 			= $component_obj->get_tipo();

		global $modo;
		if($modo=='edit') {
			$def = RecordObj_ts::get_def_by_tipo($tipo, $lang=DEDALO_APPLICATION_LANG);
		}else{
			$def = null;
		}
		
		
		$html 			 = '';		
		$html 			.= "\n <label class=\"css_label {$ar_css['css_label']}\" $required_code title=\"".$def."\" >$label</label>";
		
		/*
		switch($permissions) {			
			
			#case 0		:	$html .= "\n <span class=\"css_span_dato {$ar_css['css_span_dato']}\"> No access here (label) ! </span>";
			
			#case ($permissions>=1)	:
			#				
			#				$html .= "\n <label class=\"css_label {$ar_css['css_label']}\" $required >$label</label>";
			
							
			case 1		:	break;
			case 2		: 	break;
			case 3		:	$html .= "\n <div class=\"debugger_div\">{$component_obj->get_debugger()}</div>";	
								
		}
		*/
		
		#$html .= "\n <div class=\"debugger_div\">{$component_obj->get_debugger()}</div>";
		
		return $html;	
	}
	
	
	
	
}

?>