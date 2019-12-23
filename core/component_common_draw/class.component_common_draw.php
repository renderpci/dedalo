<?php
/**
* TOOLS . STATIC DRAW METHODS	
*
*
*/
abstract class component_common_draw {
	
	
	# DRAW LABEL  
	public static function draw_label($component_obj, stdClass $options=null) {
		
		$html = '';

		$modo = $component_obj->get_modo();
		$tipo = $component_obj->get_tipo();

		# CAMPO OBLIGATORIO
		$required_code = null;
		if($component_obj->get_required())
			$required_code = 'style="font-weight:bold"';
		
		$label = $component_obj->get_label();		
		if ($modo==='search') {
			$label_add  = RecordObj_dd::get_termino_by_tipo($component_obj->get_section_tipo(), DEDALO_DATA_LANG, true, true);
			$label	.= ' <span class="label_add">(' . $label_add .')</span>';
			if(SHOW_DEBUG===true) {
			$label	.= '<span class="label_modelo_name">' .get_class($component_obj).'</span>';
			}
		}		
		
		if($modo==='edit' || $modo==='search') {
			#$def = RecordObj_dd::get_def_by_tipo($tipo, $lang=DEDALO_APPLICATION_LANG);
			$def = $component_obj->get_def(); 	
			if (!empty($def)) {
				$def = "\n".$def;
			}
		}else{
			$def = null;
		}
		
		$warning_code='';
		$propiedades = $component_obj->get_propiedades();			
		if (isset($propiedades->state_of_component)) {
			$state_of_component = key((array)$propiedades->state_of_component);
			$msg 			= label::get_label( $propiedades->state_of_component->$state_of_component->msg );
			$component_name = RecordObj_dd::get_termino_by_tipo($propiedades->state_of_component->$state_of_component->target_component,DEDALO_APPLICATION_LANG);
			$warning_text =	sprintf($msg, $component_name);			 
			$html 		 .= '<label class="css_label label tooltip_active label_warning label_warning_'.$state_of_component.'" '.$required_code .'title="'.$warning_text.'">';
			$html 		 .= '<span class="glyphicon glyphicon-warning-sign"></span>';
			$html 		 .= $label;
			$html 		 .= '</label>';
			
		}else{

			if (empty($def)) {
				$html 	.= '<label class="css_label label" '.$required_code.'>'.$label.'</label>';
			}else{
				$html 	.= '<label class="css_label label tooltip_active" '.$required_code.' title="'.$def.'">'.$label.'</label>';
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