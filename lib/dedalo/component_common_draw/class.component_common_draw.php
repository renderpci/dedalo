<?php
/*
	TOOLS . STATIC DRAW METHODS	
*/

abstract class component_common_draw {
	
	
	# DRAW LABEL  
	public static function draw_label($component_obj) {	
		global $modo;
		$html = '';

		# CAMPO OBLIGATORIO
		$required_code 	= NULL;
		if($component_obj->get_required())
			$required_code = 'style="font-weight:bold"';
		
		$label	= $component_obj->get_label();
		$tipo	= $component_obj->get_tipo();

		
		if($modo==='edit') {
			$def = RecordObj_dd::get_def_by_tipo($tipo, $lang=DEDALO_APPLICATION_LANG);
			if (!empty($def)) {
				$def = "\n".$def;
			}
		}else{
			$def = null;
		}
		#$def = 'dasd ajk asdklj askdjad sd asda dad as564564a dadkalkd akdñlks adñlaksdñalskda d asdlkñlkañsd ñlk';
		#WIDTH LARGE IN TOOLS
		/*$max_width 	= NULL;
		if($modo=='tool_lang'){
			$max_width = 'style="max-width: 250px;"';
		}*/


		#dump($component_obj->propiedades, ' $propiedades ++ '.to_string());
		$warning_code='';
		$propiedades = $component_obj->get_propiedades();			
		if (isset($propiedades->state_of_component)) {
			if (property_exists($propiedades->state_of_component, 'deprecated')) {
				$msg = label::get_label( $propiedades->state_of_component->deprecated->msg );
				$component_name = RecordObj_dd::get_termino_by_tipo($propiedades->state_of_component->deprecated->target_component);
				$warning_text =	sprintf($msg, $component_name);			 
				$html 		 .= "<label class=\"css_label label tooltip_active label_warning\" $required_code title=\"$warning_text\">";
				$html 		 .= "<span class=\"glyphicon glyphicon-warning-sign\"></span>";
				$html 		 .= $label;
				$html 		 .= "</label>";
			}
		}else{

			if (empty($def)) {
				$html 	.= "<label class=\"css_label label\" $required_code>$label</label>";
			}else{
				$html 	.= "<label class=\"css_label label tooltip_active\" $required_code title=\"$def\">$label</label>";
			}
			//data-title=\"". $label . $def . "\" 
			#$html 	.= "\n <label class=\"css_label tooltips\" $required_code >$label<span>$label $def</span></label>"; //data-title=\"". $label . $def . "\" 
		}			
		
		return $html;
	}#end draw_label



	/**
	* DRAW_SELECT_FAST_LANG_SWITCH
	* @param string $lang
	*	current component lang
	* @param string $action
	*	javascript function name triggered on change
	* @return string $html
	*/
	public static function draw_select_fast_lang_switch($id_wrapper, $lang, $css_class='select_fast_lang_switch', $action='component_common.fast_switch_lang') {
		
		# LANG FAST SWITCHER
		$html  = '';
		$html .= "<select class=\"$css_class edit_hidden\" data-id_wrapper=\"$id_wrapper\" onchange=\"$action(this)\">";
			# Aplication langs
			$dedalo_application_langs = unserialize(DEDALO_APPLICATION_LANGS);
			foreach($dedalo_application_langs as $current_lang => $lang_name) {
				# Selected
				$selected = ($current_lang === $lang) ? ' selected="selected"' : '';
				$html .= '<option value="'.$current_lang.'" '.$selected.'>'.$lang_name.'</option>';
			}
		$html .= "</select>";


		return $html;
	}//end draw_select_fast_lang_switch
	
	
	
	/**
	* DRAW_HTML_DELIMITER
	* @return string
	*/
	public static function html_delimiter($component_name, $tipo, $section_id=null, $label=null, $type='in', $modo=null, $lang=null) {
		if(SHOW_DEBUG!==true) {
			return '';
		}
		$begin = $type==='out' ? '//END ' : '';

		$html = PHP_EOL . '<!-- '.$begin.strtoupper($component_name).' [tipo:'.$tipo.' section_id:'.$section_id.' modo:'.$modo.' lang:'.$lang.'] '.$label.' -->';
		if ($type==='out') {
			$html .= PHP_EOL;
		}

		return $html;
	}//end draw_html_delimiter
}
?>