<?php
/*
	TOOLS . STATIC DRAW METHODS	
*/

abstract class component_common_draw {
	
	
	# DRAW LABEL  
	public static function draw_label($component_obj) {		
		global $modo;
		
		# CAMPO OBLIGATORIO
		$required_code 	= NULL;
		if($component_obj->get_required())
			$required_code = 'style="font-weight:bold"';
		
		$label	= $component_obj->get_label();
		$tipo	= $component_obj->get_tipo();

		
		if($modo=='edit') {
			$def = RecordObj_dd::get_def_by_tipo($tipo, $lang=DEDALO_APPLICATION_LANG);
			if (!empty($def)) {
				$def = "\n".$def;
			}
		}else{
			$def = null;
		}
		#WIDTH LARGE IN TOOLS
		/*$max_width 	= NULL;
		if($modo=='tool_lang'){
			$max_width = 'style="max-width: 250px;"';
		}*/		
		
		$html 	 = '';
		#$html 	.= "\n <label class=\"css_label {$ar_css['css_label']}\" $required_code title=\"".$def."\" >$label</label>";
		$html 	.= "\n <label class=\"css_label tooltips\" $required_code title=\"$label $def\">$label</label>"; //data-title=\"". $label . $def . "\" 
		#$html 	.= "\n <label class=\"css_label tooltips\" $required_code >$label<span>$label $def</span></label>"; //data-title=\"". $label . $def . "\" 	
		
		return $html;

	}#end draw_label
	
	
	
	
}
?>