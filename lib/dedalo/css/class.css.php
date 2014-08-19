<?php
require_once(DEDALO_LIB_BASE_PATH . '/db/class.RecordObj_ts.php');


class css {
	
	static $css_skin;
	static $ar_url = array();
	
	
	# CSS LINK CODE . RETURN COMBINATED CSS LINKS FOR INSERT IN HEADER 
	public static function get_css_link_code() {
		global $modo;
					
		$html	= '';				
		
		# Insertamos los estilos generales

			$ar_url_basic = array();

			# Bootstrap 
    		#$ar_url_basic[] = DEDALO_ROOT_WEB . '/lib/bootstrap/css/bootstrap.min.css' ;

			# JQUERY UI css
			$ar_url_basic[] = JQUERY_UI_URL_CSS ;

			# HTML PAGE css
			$ar_url_basic[] = DEDALO_LIB_BASE_URL . '/html_page/css/html_page.css';

			# GRIDSTER
			#$ar_url_basic[] = DEDALO_ROOT_WEB .'/lib/jquery/gridster/jquery.gridster.min.css';

			# COMMON css			
			$ar_url_basic[] = DEDALO_LIB_BASE_URL . '/common/css/common.css';

			# MENU css
			$ar_url_basic[] = DEDALO_LIB_BASE_URL . '/menu/css/menu.css';

			# BUTTONS css
			$ar_url_basic[] = DEDALO_LIB_BASE_URL . '/button_common/css/button_common.css';

			# COMPONENTS common css
			#$ar_url_basic[] = DEDALO_LIB_BASE_URL . '/component_common/css/component_common.css';
				
			# SECTION LIST css
			$ar_url_basic[] = DEDALO_LIB_BASE_URL . '/section_list/css/section_list.css';


			# Ponemos las librerías básicas al principio de la lista
			css::$ar_url = array_merge($ar_url_basic, css::$ar_url);
						

		# Recorremos los elemetos usados por modeloID es decir: root=dd117, etc..		
		$ar_excepciones 		= array('relation_list');
			#dump(common::$ar_loaded_modelos_name);
		$ar_loaded_modelos_name = array_unique(common::$ar_loaded_modelos_name);
		foreach($ar_loaded_modelos_name as $modelo_name) {			
			
			/*
			# MODO DEPENDIENTE DE LA ESTRUCTURA. DESACTIVO TEMPORALMENTE !!
			# sacamos el nombre del path de la clase
			$css_base_file_name		= RecordObj_ts::get_termino_by_tipo($modeloID);	#echo "$css_base_file_name	<br>";				
			
			# Buscamos sus terminos relacionados (normalmente uno) que contienen el nombre del archivo final en su skin. ej. translation/dedalo_classic 
			$ar_relacionados		= RecordObj_ts::get_ar_terminos_relacionados($modeloID);	#print_r($modeloID); echo "<hr>";
			
			if(is_array($ar_relacionados)) foreach($ar_relacionados as $ar_relacionadosID){
				
				foreach($ar_relacionadosID as $modeloID => $terminoID) {
				
					$css_file_name	= RecordObj_ts::get_termino_by_tipo($terminoID,self::$css_skin);
					$final_path		= DEDALO_LIB_BASE_URL . '/'. $css_base_file_name .'/css/'. $css_file_name;				
					css::$ar_url[]	= $final_path ;																			#dump($final_path,'$final_path');		
				}
			}
			*/
			
			# MODO DIRECTO (Como en js, en función del componente o elemento cargado)
			#$modelo_name			= RecordObj_ts::get_termino_by_tipo($modeloID);

			# Load específico del objeto actual	
			if (!in_array($modelo_name, $ar_excepciones)) {		
				css::$ar_url[]			= DEDALO_LIB_BASE_URL . '/'. $modelo_name .'/css/'. $modelo_name .'.css';
			}		
		}
		# Portales
		if (in_array(DEDALO_LIB_BASE_URL . '/component_portal/css/component_portal.css', css::$ar_url)) {
			# Siempre cargamos la librería tex_area (necesaria para portales con text_area que se cargan en bloque)
			css::$ar_url[] = DEDALO_LIB_BASE_URL . '/component_text_area/css/component_text_area.css';
		}		
		# eliminamos las duplicidades		
		css::$ar_url = array_unique(css::$ar_url);
		
		#despejamos las url
		foreach (css::$ar_url as $url) {
				
			# Si hay algún componente, le insertamos antes el component_common una vez
			if( strpos($url,'component_')!==false && !isset($added_component_commons) ) {				
				
				# component common functions css
				$html .= self::build_tag( DEDALO_LIB_BASE_URL . '/component_common/css/component_common.css' );

				# INSPECTOR css
				$html .= self::build_tag( DEDALO_LIB_BASE_URL . '/inspector/css/inspector.css' );
				
				# TOOLS TOOL_TIME_MACHINE css
				if(navigator::get_selected('modo')=='tool_time_machine')
				$html .= self::build_tag( DEDALO_LIB_BASE_URL . '/component_tools/tool_time_machine/css/tool_time_machine.css' );

				# TOOLS LANG css
				if(navigator::get_selected('modo')=='tool_lang') {
				$html .= self::build_tag( DEDALO_LIB_BASE_URL . '/component_tools/tool_lang/css/tool_lang.css' );
				$html .= self::build_tag( DEDALO_LIB_BASE_URL . '/component_state/css/component_state.css' );
				}
				

				# button delete
				# En algunos contextos es necesario el js de button_delete aunque no tengamos cargado el componente. Por tanto lo cargaremos siempre				
				#$html .= self::build_tag( DEDALO_LIB_BASE_URL . '/button_delete/css/button_delete.css' );
				#$html .= self::build_tag( DEDALO_LIB_BASE_URL . '/button_stats/css/button_stats.css' );

				# TOOLS COMMON
				$html .= self::build_tag( DEDALO_LIB_BASE_URL . '/component_tools/tool_common/css/tool_common.css' );
				#$html .= self::build_tag( DEDALO_LIB_BASE_URL . '/component_tools/tool_indexation/css/tool_indexation.css' );
				
				# TOOLS SPECIFIC
				$current_modo = navigator::get_selected('modo');
				if (strpos($current_modo, 'tool_')!==false) {
					$html .= self::build_tag( DEDALO_LIB_BASE_URL . '/component_tools/'.$current_modo.'/css/'.$current_modo.'.css' );
				}
				
				$added_component_commons = true;
			}
					

			# EVITA DUPLICIDADES
			if(strpos($html,$url)===false)					
			$html .= self::build_tag($url);
		}
		
		return $html;		
	}


	/**
	* BUILD_TAG
	*/
	static function build_tag($url) {
		if (strpos($url, 'section_group_')!==false) return null;
		return "\n<link rel=\"stylesheet\" href=\"$url\" type=\"text/css\" media=\"screen\" />";
	}
	
	

































	
	
	# CALCULATE AND FORMAT CSS ARRAY
	public static function get_ar_css(RecordObj_ts $RecordObj_ts) {
		
		# DESACTIVA !!!!!!
		return null;


		

		# despejamos el skin general de la aplicación
		self::$css_skin 		= $_SESSION['config4']['css_skin'];							#dump($RecordObj_ts);	echo "<hr>";
		
		# SET COMMON LOADED OBJ BY MODEL ID
		#common::set_ar_loaded_modelos($RecordObj_ts->get_modelo());
		
		# seleccionamos los términos relacionados
		#$ar_relacionados	= $RecordObj_ts->get_ar_terminos_relacionados();		
		$terminoID			= $RecordObj_ts->get_terminoID();
		#$ar_relacionados	= RecordObj_ts::get_ar_terminos_relacionados($terminoID); #print_r($ar_relacionados);
		$ar_relacionados	= $RecordObj_ts->get_relaciones();
		$ar_css				= array();
		
		# Recorremos todos los términos relacionados
		if( is_array($ar_relacionados)) foreach($ar_relacionados as $ar_termino_relacionadoID) {
			
			 foreach($ar_termino_relacionadoID as $modeloID => $termino_relacionadoID) {
				 
				$termino_modelo		= strtolower(RecordObj_ts::get_termino_by_tipo($modeloID));		
				
				# Añade al array $ar_css los terminos relacionados de tipo 'css_'
				if( strpos($termino_modelo,'css_') !== false ) {
					
					# CSS ESPECIFICO
					$ar_css[$termino_modelo][]	= strtolower(RecordObj_ts::get_termino_by_tipo($termino_relacionadoID, self::$css_skin));	#echo strtolower(RecordObj_ts::get_termino_by_tipo($termino_relacionadoID, $css_skin))."<br>";
					
					# CSS GENERICO
					/*
					$ar_css_generic				= self::get_ar_css_generic($RecordObj_ts);
					if($ar_css_generic)			$ar_css = $ar_css + $ar_css_generic ;
					*/				
					
				}#if( strpos($termino_modelo,'css_')
				
			}
		}#print_r($ar_css);
					
		$ar_css = self::get_formated_css_array($ar_css);		#print_r($ar_css);	echo "<hr>";		
		
		return $ar_css;		
	}



	
	private static function get_ar_css_generic($RecordObj_ts) {
		
		# DESACTIVA !!!!!!
		return null;

		

		# CSS GENERICO
		# Despejamos todos hermanos de tipo 'css_load_required' y loas añadimos al array '$ar_css'
		$ar_css					= false;
		$ar_hermanos			= $RecordObj_ts->get_ar_siblings_of_this();		#print_r($ar_hermanos);
		if(is_array($ar_hermanos)) foreach($ar_hermanos as $hermanoID) {
			
			$RecordObj_ts		= new RecordObj_ts($hermanoID);
			$modeloID			= $RecordObj_ts->get_modelo();
			$modelo				= RecordObj_ts::get_termino_by_tipo($modeloID);
			
			if($modelo == 'css_load_required') {
				$ar_css[$modelo][]		= strtolower(RecordObj_ts::get_termino_by_tipo($hermanoID, self::$css_skin));		
			}
		}
		
		return $ar_css;		
	}
	
	
	
	
	
	
	# AUX FUNCTION
	private static function get_formated_css_array($ar_css) {	
	
		$ar_css_formated = array();
	
		if(is_array($ar_css)) foreach($ar_css as $key => $value) {
			
			$string = '';
			if(is_array($value)) {
				
				foreach($value as $key2) {	
				
					$string .= "$key2 ";
				}		
			}else{
				$string .= "$value ";	
			}
			#echo "$key: $string <br>\n";
			$ar_css_formated[$key] =  substr($string,0,-1); 	
		}
		
		return $ar_css_formated;
	}
	
	
	
	
	
	
	
	
	
	
	

		
}

?>