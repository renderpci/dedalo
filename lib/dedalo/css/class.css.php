<?php
#require_once(DEDALO_LIB_BASE_PATH . '/db/class.RecordObj_dd.php');


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

			# AREA css
			if($modo=='list')
			$ar_url_basic[] = DEDALO_LIB_BASE_URL . '/area/css/area.css';

			# BUTTONS css
			$ar_url_basic[] = DEDALO_LIB_BASE_URL . '/button_common/css/button_common.css';

			# SEARCH css
			$ar_url_basic[] = DEDALO_LIB_BASE_URL . '/search/css/search.css';

			# COMPONENTS common css
			#$ar_url_basic[] = DEDALO_LIB_BASE_URL . '/component_common/css/component_common.css';			

			# COMPONENT_PORTAL css
			#$ar_url_basic[] = DEDALO_LIB_BASE_URL . '/component_portal/css/component_portal.css';

			# Ponemos las librerías básicas al principio de la lista
			#css::$ar_url = array_merge($ar_url_basic, css::$ar_url);

						

		# Recorremos los elemetos usados por modeloID es decir: root=dd117, etc..
		$ar_url_elements=array();		
		$ar_excepciones 		= array('relation_list');
		$ar_loaded_modelos_name = array_unique(common::$ar_loaded_modelos_name);
		foreach($ar_loaded_modelos_name as $modelo_name) {			
			
			/*
			# MODO DEPENDIENTE DE LA ESTRUCTURA. DESACTIVO TEMPORALMENTE !!
			# sacamos el nombre del path de la clase
			$css_base_file_name		= RecordObj_dd::get_termino_by_tipo($modeloID);	#echo "$css_base_file_name	<br>";				
			
			# Buscamos sus terminos relacionados (normalmente uno) que contienen el nombre del archivo final en su skin. ej. translation/dedalo_classic 
			$ar_relacionados		= RecordObj_dd::get_ar_terminos_relacionados($modeloID);	#print_r($modeloID); echo "<hr>";
			
			if(is_array($ar_relacionados)) foreach($ar_relacionados as $ar_relacionadosID){
				
				foreach($ar_relacionadosID as $modeloID => $terminoID) {
				
					$css_file_name	= RecordObj_dd::get_termino_by_tipo($terminoID,self::$css_skin);
					$final_path		= DEDALO_LIB_BASE_URL . '/'. $css_base_file_name .'/css/'. $css_file_name;				
					css::$ar_url[]	= $final_path ;																			#dump($final_path,'$final_path');		
				}
			}
			*/
			
			# MODO DIRECTO (Como en js, en función del componente o elemento cargado)
			#$modelo_name			= RecordObj_dd::get_termino_by_tipo($modeloID);

			# Load específico del objeto actual	
			if (!in_array($modelo_name, $ar_excepciones)) {		
				$ar_url_elements[]			= DEDALO_LIB_BASE_URL . '/'. $modelo_name .'/css/'. $modelo_name .'.css';
			}		
		}
		# Portales	
		/*	
		if (in_array(DEDALO_LIB_BASE_URL . '/component_portal/css/component_portal.css', css::$ar_url) && strpos($modo, 'tool')!==false) {
			# Siempre cargamos la librería tex_area (necesaria para portales con text_area que se cargan en bloque)
			css::$ar_url[] = DEDALO_LIB_BASE_URL . '/component_text_area/css/component_text_area.css'; 	dump($modo, ' modo');
		}
		*/
		# TOOLS COMMON
		$ar_url_elements[] = DEDALO_LIB_BASE_URL . '/tools/tool_common/css/tool_common.css';

		# CURRENT TOOL MAIN CSS
		#if (strpos($modo, 'tool_')!==false) {
		#	$ar_url_elements[] = DEDALO_LIB_BASE_URL . '/tools/'.$modo.'/css/'.$modo.'.css';		
		#}

		# eliminamos las duplicidades		
		$ar_url_elements = array_unique($ar_url_elements);

	
		# Añadimos al final los elementos existentes en css::$ar_url
		css::$ar_url = array_merge($ar_url_basic, $ar_url_elements, css::$ar_url);

		
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
				$html .= self::build_tag( DEDALO_LIB_BASE_URL . '/tools/tool_time_machine/css/tool_time_machine.css' );

				# TOOLS LANG css
				if(navigator::get_selected('modo')=='tool_lang') {
				$html .= self::build_tag( DEDALO_LIB_BASE_URL . '/tools/tool_lang/css/tool_lang.css' );
				$html .= self::build_tag( DEDALO_LIB_BASE_URL . '/component_state/css/component_state.css' );
				}				

				# button delete
				# En algunos contextos es necesario el js de button_delete aunque no tengamos cargado el componente. Por tanto lo cargaremos siempre				
				#$html .= self::build_tag( DEDALO_LIB_BASE_URL . '/button_delete/css/button_delete.css' );
				#$html .= self::build_tag( DEDALO_LIB_BASE_URL . '/button_stats/css/button_stats.css' );
				
				$added_component_commons = true;
			}

			# EVITA DUPLICIDADES
			if(strpos($html,$url)===false)					
			$html .= self::build_tag($url);
		}

		# DEBUD CSS OVERRIDE
		if(SHOW_DEBUG && strpos(DEDALO_HOST, 'debug')!==false) {
		#if(SHOW_DEBUG) {
			$html .= self::build_tag(DEDALO_LIB_BASE_URL . '/html_page/css/html_page_debug.css');
		}
		#dump( htmlentities($html), '$html');
		
		return $html;		
	}


	/**
	* BUILD_TAG
	*/
	static function build_tag($url, $media=null) {

		if (strpos($url, 'section_group_')!==false) return null;

		if (!USE_CDN) {
			if(SHOW_DEBUG) {
				#$url .= "?".date("ymdh");
			}else{
				#$url .= "?".date("ymd");
			}					
		}
		$media_attr='';
		if (!is_null($media)) {
			$media_attr = "media=\"$media\"";  // Like screen
		}
		
		$url = $url.'?v='.DEDALO_VERSION;
		return "\n<link rel=\"stylesheet\" href=\"$url\" type=\"text/css\" {$media_attr}/>";
	}
	
	

































	
	
	# CALCULATE AND FORMAT CSS ARRAY
	public static function get_ar_css(RecordObj_dd $RecordObj_dd) {
		
		# DESACTIVA !!!!!!
		return null;


		

		# despejamos el skin general de la aplicación
		#self::$css_skin 		= $_SESSION['dedalo4']['config']['css_skin'];							#dump($RecordObj_dd);	echo "<hr>";
		
		# SET COMMON LOADED OBJ BY MODEL ID
		#common::set_ar_loaded_modelos($RecordObj_dd->get_modelo());
		
		# seleccionamos los términos relacionados
		#$ar_relacionados	= $RecordObj_dd->get_ar_terminos_relacionados();		
		$terminoID			= $RecordObj_dd->get_terminoID();
		#$ar_relacionados	= RecordObj_dd::get_ar_terminos_relacionados($terminoID); #print_r($ar_relacionados);
		$ar_relacionados	= $RecordObj_dd->get_relaciones();
		$ar_css				= array();
		
		# Recorremos todos los términos relacionados
		if( is_array($ar_relacionados)) foreach($ar_relacionados as $ar_termino_relacionadoID) {
			
			 foreach($ar_termino_relacionadoID as $modeloID => $termino_relacionadoID) {
				 
				$termino_modelo		= strtolower(RecordObj_dd::get_termino_by_tipo($modeloID));		
				
				# Añade al array $ar_css los terminos relacionados de tipo 'css_'
				if( strpos($termino_modelo,'css_') !== false ) {
					
					# CSS ESPECIFICO
					$ar_css[$termino_modelo][]	= strtolower(RecordObj_dd::get_termino_by_tipo($termino_relacionadoID, self::$css_skin));	#echo strtolower(RecordObj_dd::get_termino_by_tipo($termino_relacionadoID, $css_skin))."<br>";
					
					# CSS GENERICO
					/*
					$ar_css_generic				= self::get_ar_css_generic($RecordObj_dd);
					if($ar_css_generic)			$ar_css = $ar_css + $ar_css_generic ;
					*/				
					
				}#if( strpos($termino_modelo,'css_')
				
			}
		}#print_r($ar_css);
					
		$ar_css = self::get_formated_css_array($ar_css);		#print_r($ar_css);	echo "<hr>";		
		
		return $ar_css;		
	}



	
	private static function get_ar_css_generic($RecordObj_dd) {
		
		# DESACTIVA !!!!!!
		return null;

		

		# CSS GENERICO
		# Despejamos todos hermanos de tipo 'css_load_required' y loas añadimos al array '$ar_css'
		$ar_css					= false;
		$ar_hermanos			= $RecordObj_dd->get_ar_siblings_of_this();		#print_r($ar_hermanos);
		if(is_array($ar_hermanos)) foreach($ar_hermanos as $hermanoID) {
			
			$RecordObj_dd		= new RecordObj_dd($hermanoID);
			$modeloID			= $RecordObj_dd->get_modelo();
			$modelo				= RecordObj_dd::get_termino_by_tipo($modeloID);
			
			if($modelo == 'css_load_required') {
				$ar_css[$modelo][]		= strtolower(RecordObj_dd::get_termino_by_tipo($hermanoID, self::$css_skin));		
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