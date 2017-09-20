<?php




/**
* CSS
* Control css files includes
* Load common files and notified loaded components css files
*/
class css {
	
	static $css_skin;
	static $ar_url = array();
	static $ar_url_basic = array();
	static $structure_file_path = '/common/css/structure.css';
	static $mixins_file_path 	= '/common/css/mixins.less';

	
	# CSS LINK CODE . RETURN COMBINATED CSS LINKS FOR INSERT IN HEADER  
	public static function get_css_link_code() {
		global $modo;
					
		$html	= '';				
		
		#
		# COMMON CSS . Insertamos los estilos generales

			css::$ar_url_basic[] = DEDALO_LIB_BASE_URL . '/common/css/fonts.css';
			#css::$ar_url_basic[] = DEDALO_LIB_BASE_URL . '/common/css/glyphicons.css';

			# BOOTSTRAP css
			#css::$ar_url_basic[] = BOOTSTRAP_CSS_URL;
			#css::$ar_url_basic[] = 'https://cdnjs.cloudflare.com/ajax/libs/normalize/3.0.3/normalize.css';
			css::$ar_url_basic[] = BOOTSTRAP_CSS_URL;

			# JQUERY UI css
			css::$ar_url_basic[] = JQUERY_UI_URL_CSS ;		

			# HTML PAGE css
			css::$ar_url_basic[] = DEDALO_LIB_BASE_URL . '/html_page/css/html_page.css';

			# GRIDSTER
			#css::$ar_url_basic[] = DEDALO_ROOT_WEB .'/lib/jquery/gridster/jquery.gridster.min.css';

			# COMMON css			
			css::$ar_url_basic[] = DEDALO_LIB_BASE_URL . '/common/css/common.css';
			css::$ar_url_basic[] = DEDALO_LIB_BASE_URL . '/common/css/buttons.css';			

			# TOOLS COMMON
			css::$ar_url_basic[] = DEDALO_LIB_BASE_URL . '/tools/tool_common/css/tool_common.css';
			css::$ar_url_basic[] = DEDALO_LIB_BASE_URL . '/tools/tool_diffusion/css/tool_diffusion.css';

			# MENU css			
			css::$ar_url_basic[] = DEDALO_LIB_BASE_URL . '/menu/css/menu.css';

			# AREA css
			css::$ar_url_basic[] = DEDALO_LIB_BASE_URL . '/area/css/area.css';

			# BUTTONS css
			css::$ar_url_basic[] = DEDALO_LIB_BASE_URL . '/button_common/css/button_common.css';

			# SEARCH css
			css::$ar_url_basic[] = DEDALO_LIB_BASE_URL . '/search/css/search.css';				

			# COMPONENTS common css
			#css::$ar_url_basic[] = DEDALO_LIB_BASE_URL . '/component_common/css/component_common.css';

			switch ($modo) {
				case 'edit':
					css::$ar_url_basic[] = DEDALO_LIB_BASE_URL . '/tools/tool_lang_multi/css/tool_lang_multi.css';
				case 'list':
					break;
			}		
						

		# Recorremos los componentes usados por modeloID es decir: root=dd117, etc..
		$ar_url_elements=array();		
		$ar_excepciones 		= array('relation_list');
		$ar_loaded_modelos_name = array_unique(common::$ar_loaded_modelos_name);
		foreach($ar_loaded_modelos_name as $modelo_name) {
			# Load específico del componente actual	
			if (!in_array($modelo_name, $ar_excepciones)) {		
				$ar_url_elements[]	= DEDALO_LIB_BASE_URL . '/'. $modelo_name .'/css/'. $modelo_name .'.css';
			}		
		}

		# eliminamos las duplicidades		
		$ar_url = array_unique($ar_url_elements);

	
		# Añadimos al final los elementos existentes en css::$ar_url
		css::$ar_url = array_merge(css::$ar_url_basic, $ar_url_elements, css::$ar_url);

		
		# STRUCTURE CSS
		if (defined('DEDALO_STRUCTURE_CSS') && DEDALO_STRUCTURE_CSS===true) {
			$structure_file_path_url = DEDALO_LIB_BASE_URL . css::$structure_file_path;			
			css::$ar_url[] 			 = $structure_file_path_url;
		}		

		
		# despejamos las url
		foreach (css::$ar_url as $url) {
				
			# Si hay algún componente, le insertamos antes el component_common (sólo una vez)
			if( !isset($added_component_commons) && strpos($url,'component_')!==false ) {				
				
				# component common functions css
				$html .= self::build_tag( DEDALO_LIB_BASE_URL . '/component_common/css/component_common.css' );

				# INSPECTOR css
				$html .= self::build_tag( DEDALO_LIB_BASE_URL . '/inspector/css/inspector.css' );
				
				# TOOLS TOOL_TIME_MACHINE css
				#if(navigator::get_selected('modo')==='tool_time_machine')
				#$html .= self::build_tag( DEDALO_LIB_BASE_URL . '/tools/tool_time_machine/css/tool_time_machine.css' );

				# TOOLS LANG css
				#if(navigator::get_selected('modo')==='tool_lang') {
				#$html .= self::build_tag( DEDALO_LIB_BASE_URL . '/tools/tool_lang/css/tool_lang.css' );
				#$html .= self::build_tag( DEDALO_LIB_BASE_URL . '/component_state/css/component_state.css' );
				#}				

				# button delete
				# En algunos contextos es necesario el js de button_delete aunque no tengamos cargado el componente. Por tanto lo cargaremos siempre				
				#$html .= self::build_tag( DEDALO_LIB_BASE_URL . '/button_delete/css/button_delete.css' );
				#$html .= self::build_tag( DEDALO_LIB_BASE_URL . '/button_stats/css/button_stats.css' );
				
				$added_component_commons = true;
			}
			

			# EVITA DUPLICIDADES
			if(strpos($html,$url)===false) {
				$html .= self::build_tag($url);
			}			
		}

		# DEBUG CSS OVERRIDE
		if(SHOW_DEBUG && strpos(DEDALO_HOST, 'debug')!==false) {		
			$html .= self::build_tag(DEDALO_LIB_BASE_URL . '/html_page/css/html_page_debug.css');
		}
		#dump( htmlentities($html), '$html');
		
		return $html;
	}//end get_css_link_code



	/**
	* BUILD_TAG
	*/
	static function build_tag($url, $media=null) {

		if (strpos($url, 'section_group_')!==false) return null;

		if (USE_CDN!==false) {
			$url = USE_CDN . $url;
		}

		# Add version
		$url = $url.'?'.DEDALO_VERSION;


		$media_attr='';
		if (!is_null($media)) {
			$media_attr = " media=\"$media\"";  // Like screen
		}		

		if(SHOW_DEBUG===true) {
			if (strpos($url,'structure.css')!==false) {
				$url .= '&t=' . start_time();
			}			
		}		

		$tag = "\n<link href=\"$url\" rel=\"stylesheet\"{$media_attr}>";

		return $tag;
	}//edn build_tag
	
	

	/**
	* BUILD_STRUCTURE_CSS
	* @return object $response
	*/
	public static function build_structure_css() {

		$response = new stdClass();
			$response->result = false;
			$response->msg 	  = null;			

		include DEDALO_ROOT . '/vendor/leafo/lessphp/lessc.inc.php';
		$less = new lessc;
		$less_code = '/* Build: '.date("Y-m-d h:i:s").' */';

		#
		# SEARCH . Get all components custom css
		$ar_prefix = unserialize(DEDALO_PREFIX_TIPOS);
		$filter = '';
		foreach ($ar_prefix as $prefix) {
			$filter .= "\n\"terminoID\" LIKE '$prefix%' ";
			if ( $prefix != end($ar_prefix) ) {
				$filter .= "OR ";
			}
		}
		$strQuery = "SELECT \"terminoID\",\"propiedades\" FROM \"jer_dd\" WHERE \"propiedades\" LIKE '%\"css\"%' AND ($filter) ";
		# debug_log(__METHOD__." $strQuery ".to_string(), logger::DEBUG);
		$result   = pg_query(DBi::_getConnection(), $strQuery);
		while ($rows = pg_fetch_assoc($result)) {

			$terminoID 		 = $rows["terminoID"];
			$propiedades_str = $rows["propiedades"];
			$propiedades 	 = json_decode($propiedades_str);
			if (!isset($propiedades->css)) {
				debug_log(__METHOD__." Failed json decode for terminoID: $terminoID. Propiedades: ".to_string($propiedades_str), logger::ERROR);
				continue;
			}			
			$css_obj = $propiedades->css;

			#
			# get_css_prefix
			$css_prefix = css::get_css_prefix($terminoID);
				#dump($css_prefix, ' $css_prefix ++ '.to_string());

			# Section
			//$section_tipo = RecordObj_dd::get_ar_terminoID_by_modelo_name_and_relation($terminoID, 'section', 'parent', $search_exact=true);
			//wrap_section_{$modo}

			#
			# LESS CODE
			$less_line='';
			$less_line .= ".sgc_edit>";
			$less_line .= ".".$css_prefix."_".$terminoID."{";
			foreach ($css_obj as $key => $obj_value) {
				$less_line .= self::convert_to_less($key, $obj_value, $css_prefix);
			}
			$less_line .= "\n}";

			if(SHOW_DEBUG===true) {
				if($terminoID==='hierarchy25') {
					#dump($less_line, ' $less_line ++ '.to_string());
				}
			}			

			$less_code .= $less_line; // Add
		
		}//end while ($rows = pg_fetch_assoc($result)) {
		#dump($less_code, ' less_code ++ '.to_string($terminoID));		
		

		#
		# MXINS. Get mixixns file
		$file_name = DEDALO_LIB_BASE_PATH . self::$mixins_file_path;
		if ($mixins_code = file_get_contents($file_name)) {
			$less_code = $mixins_code.$less_code;
		}
		#echo $less_code;		 

		#
		# Write final file
		$file_name = DEDALO_LIB_BASE_PATH . self::$structure_file_path;
		
		# FORMAT : lessjs (default) | compressed | classic
		$less->setFormatter("compressed");	// lessjs (default) | compressed | classic
		
		# PRESERVE COMMENTS : true | false	
		#$less->setPreserveComments(false);	// true | false	

		#try {
			$compiled_css = $less->compile( $less_code );
			#echo $compiled_css;

			if( !$write = file_put_contents($file_name, $compiled_css) ) {
				$response->result 	= false;
				$response->msg 	  	= "Error on write css file ($file_name) ".to_string($write);				
			}else{
				$response->result 	 = true;
				$response->msg 	  	 = "File css created successful";
				$response->file_path = self::$structure_file_path;				
			}
			debug_log(__METHOD__." Response: ".to_string($response), logger::DEBUG);

		#} catch (exception $e) {
		#	debug_log(__METHOD__." Fatal error ".$e->getMessage(), logger::ERROR);
		#	//echo "Fatal error: " . $e->getMessage();
		#}
		#$response->code = "<pre>".nl2br($compiled_css) ."</pre>";

		return (object)$response;
	}#end build_structure_css



	/**
	* CONVERT_TO_LESS
	* @return string $less_value
	*/
	public static function convert_to_less( $key, $obj_value, $css_prefix ) {		
		
		$less_value  = '';

		# If current key is not defined as css_prefix, add as new style
		if (strpos($key, $css_prefix)===false ) {
			$less_value .= "\n$key{";
		}
		#if($key!=='.wrap_component') $less_value .= "\n$key{";

		#
		# MIXINGS
		if (property_exists($obj_value, 'mixin')) {
			foreach((array)$obj_value->mixin as $mixin_value) {
				$less_value .= "\n $mixin_value;";
			}
		}

		#
		# STYLE
		if (property_exists($obj_value, 'style') && !empty($obj_value->style)) {
			foreach((array)$obj_value->style as $style_key => $style_value) {
				$less_value .= "\n $style_key:$style_value;";
			}
		}

		if (strpos($key, $css_prefix)===false ) {
			$less_value .= "\n}";
		}
		#if($key!=='.wrap_component') $less_value .= "\n}";

		return $less_value;
	}#end convert_to_less



	/**
	* GET_CSS_PREFIX
	* wrap_section_ts1
	* @param string $tipo
	* @return string $css_prefix
	*/
	public static function get_css_prefix($tipo) { 
		
		$modelo_name = RecordObj_dd::get_modelo_name_by_tipo($tipo,false);
			#dump($modelo_name, ' modelo_name ++ '.to_string());

		switch (true) {			

			case ($modelo_name === 'section_group_div'):
				$css_prefix = 'wrap_section_group_div';
				break;
			
			case ($modelo_name === 'section_group') :
				$css_prefix = 'wrap_section_group';
				break;

			case ($modelo_name === 'section_list') :
				$css_prefix = 'wrap_section_records';
				break;

			case strpos($modelo_name, 'component')!==false :
				$css_prefix = 'wrap_component';
				break;		
			/*
			case strpos($modelo_name, 'section')!==false :
				$css_prefix = 'wrap_section'; // section and section_list
				break;
			*/			

			default:
				$css_prefix = $tipo;
				debug_log(__METHOD__." Undefined css_prefix from modelo_name: $modelo_name ($tipo)".to_string(), logger::ERROR);
				break;
		}

		return $css_prefix;
	}#end get_css_prefix


	
		
}//end class
?>