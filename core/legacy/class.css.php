<?php
/**
* CSS
* Control css files includes
* Load common files and notified loaded components css files
*/
class css {


	static $css_skin;
	static $ar_url				= array();
	static $ar_url_basic		= array();
	static $structure_file_path	= '/common/css/structure.css';
	static $mixins_file_path	= '/common/css/mixins.less';


	/**
	* GET_CSS_LINK_CODE
	# css link code . return combined css links for insert in header
	*/
		// public static function get_css_link_code() {
		// 	global $mode;

		// 	$html	= '';

		// 	#
		// 	# COMMON CSS . Insertamos los estilos generales

		// 		css::$ar_url_basic[] = DEDALO_CORE_URL . '/common/css/fonts.css';
		// 		#css::$ar_url_basic[] = DEDALO_CORE_URL . '/common/css/glyphicons.css';

		// 		# BOOTSTRAP css
		// 		#css::$ar_url_basic[] = BOOTSTRAP_CSS_URL;
		// 		#css::$ar_url_basic[] = 'https://cdnjs.cloudflare.com/ajax/libs/normalize/3.0.3/normalize.css';
		// 		css::$ar_url_basic[] = BOOTSTRAP_CSS_URL;

		// 		# JQUERY UI css
		// 		css::$ar_url_basic[] = JQUERY_UI_URL_CSS ;

		// 		# HTML PAGE css
		// 		css::$ar_url_basic[] = DEDALO_CORE_URL . '/html_page/css/html_page.css';

		// 		# GRIDSTER
		// 		#css::$ar_url_basic[] = DEDALO_ROOT_WEB .'/lib/jquery/gridster/jquery.gridster.min.css';

		// 		# COMMON css
		// 		css::$ar_url_basic[] = DEDALO_CORE_URL . '/common/css/common.css';
		// 		css::$ar_url_basic[] = DEDALO_CORE_URL . '/common/css/buttons.css';
		// 		// css::$ar_url_basic[] = DEDALO_CORE_URL . '/dd_grid/css/dd_grid.css';

		// 		# COMMON services
		// 		css::$ar_url_basic[] = DEDALO_CORE_URL . '/services/service_autocomplete/css/service_autocomplete.css';
		// 		css::$ar_url_basic[] = DEDALO_CORE_URL . '/relation_list/css/relation_list.css';

		// 		# TOOLS COMMON
		// 		css::$ar_url_basic[] = DEDALO_CORE_URL . '/tools/tool_common/css/tool_common.css';
		// 		css::$ar_url_basic[] = DEDALO_CORE_URL . '/tools/tool_diffusion/css/tool_diffusion.css';

		// 		# MENU css
		// 		css::$ar_url_basic[] = DEDALO_CORE_URL . '/menu/css/menu.css';

		// 		# AREA css
		// 		css::$ar_url_basic[] = DEDALO_CORE_URL . '/area/css/area.css';

		// 		# BUTTONS css
		// 		css::$ar_url_basic[] = DEDALO_CORE_URL . '/button_common/css/button_common.css';

		// 		# SEARCH css
		// 		css::$ar_url_basic[] = DEDALO_CORE_URL . '/search/css/search.css';

		// 		# COMPONENTS common css
		// 		css::$ar_url_basic[] = DEDALO_CORE_URL . '/component_common/css/component_common.css';

		// 		switch ($mode) {
		// 			case 'edit':
		// 				css::$ar_url_basic[] = DEDALO_CORE_URL . '/tools/tool_lang_multi/css/tool_lang_multi.css';
		// 				css::$ar_url_basic[] = DEDALO_CORE_URL . '/time_machine_list/css/time_machine_list.css';

		// 			case 'list':
		// 				break;
		// 		}


		// 	# Recorremos los componentes usados por modeloID es decir: root=dd117, etc..
		// 	$ar_url_elements 		= array();
		// 	$ar_excepciones 		= array('component_autocomplete_ts');
		// 	$ar_loaded_models_name = array_unique(common::$ar_loaded_models_name);
		// 	foreach($ar_loaded_models_name as $modelo_name) {
		// 		# Load específico del componente actual
		// 		if (!in_array($modelo_name, $ar_excepciones)) {
		// 			$ar_url_elements[]	= DEDALO_CORE_URL . '/'. $modelo_name .'/css/'. $modelo_name .'.css';
		// 		}
		// 	}

		// 	# eliminamos las duplicidades
		// 	$ar_url = array_unique($ar_url_elements);


		// 	# Añadimos al final los elementos existentes en css::$ar_url
		// 	css::$ar_url = array_merge(css::$ar_url_basic, $ar_url_elements, css::$ar_url);


		// 	# STRUCTURE CSS
		// 	if (defined('DEDALO_STRUCTURE_CSS') && DEDALO_STRUCTURE_CSS===true) {
		// 		$structure_file_path_url = DEDALO_CORE_URL . css::$structure_file_path;
		// 		css::$ar_url[] 			 = $structure_file_path_url;
		// 	}


		// 	# despejamos las url
		// 	foreach (css::$ar_url as $url) {

		// 		# Si hay algún componente, le insertamos antes el component_common (sólo una vez)
		// 		if( !isset($added_component_commons) && strpos($url,'component_')!==false ) {

		// 			# component common functions css
		// 			$html .= self::build_tag( DEDALO_CORE_URL . '/component_common/css/component_common.css' );

		// 			# INSPECTOR css
		// 			$html .= self::build_tag( DEDALO_CORE_URL . '/inspector/css/inspector.css' );

		// 			# TOOLS TOOL_TIME_MACHINE css
		// 			#if(navigator::get_selected('mode')==='tool_time_machine')
		// 			#$html .= self::build_tag( DEDALO_CORE_URL . '/tools/tool_time_machine/css/tool_time_machine.css' );

		// 			# TOOLS LANG css
		// 			#if(navigator::get_selected('mode')==='tool_lang') {
		// 			#$html .= self::build_tag( DEDALO_CORE_URL . '/tools/tool_lang/css/tool_lang.css' );
		// 			#$html .= self::build_tag( DEDALO_CORE_URL . '/component_state/css/component_state.css' );
		// 			#}

		// 			# button delete
		// 			# En algunos contextos es necesario el js de button_delete aunque no tengamos cargado el componente. Por tanto lo cargaremos siempre
		// 			$html .= self::build_tag( DEDALO_CORE_URL . '/button_delete/css/button_delete.css' );
		// 			#$html .= self::build_tag( DEDALO_CORE_URL . '/button_stats/css/button_stats.css' );

		// 			$added_component_commons = true;
		// 		}


		// 		# EVITA DUPLICIDADES
		// 		if(strpos($html,$url)===false) {
		// 			$html .= self::build_tag($url);
		// 		}
		// 	}

		// 	# DEBUG CSS OVERRIDE
		// 	if(SHOW_DEBUG && strpos(DEDALO_HOST, 'debug')!==false) {
		// 		$html .= self::build_tag(DEDALO_CORE_URL . '/html_page/css/html_page_debug.css');
		// 	}
		// 	#dump( htmlentities($html), '$html');

		// 	return $html;
		// }//end get_css_link_code



	/**
	* BUILD_TAG
	* Legacy method used by the Ontology page
	*/
	static function build_tag($url, $media=null, $uncacheable=false) {

		if (strpos($url, 'section_group_')!==false) return null;

		// if (USE_CDN!==false) {
		// 	$url = USE_CDN . $url;
		// }

		# Add version
		$url = $url.'?'.DEDALO_VERSION;


		$media_attr='';
		if (!is_null($media)) {
			$media_attr = " media=\"$media\"";  // Like screen
		}

		if(SHOW_DEBUG===true) {
			if (strpos($url,'structure.css')!==false || $uncacheable===true) {
				$url .= '&t=' . start_time();
			}
		}

		$tag = "\n<link href=\"$url\" rel=\"stylesheet\"{$media_attr}\">";

		return $tag;
	}//end build_tag



	/**
	* BUILD_STRUCTURE_CSS
	*
	* DEACTIVE INTO V6!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
	* NOW THE COMPONENTS AND SECTION SET THE ONTOLOGY CSS IN CLIENT
	* ONTOLOGY CSS DEFINTION IS PARSE INTO class.common.php INSIDE get_structure_context() AND SET INTO CONTEXT->CSS
	* AND THE CSS IS ASSIGNED IN CLIENT
	*
	* SEE
	*
	* COMPONENTS:
	* common/ui.js build_wrapper_edit or build_wrapper_lit
	*
	* SECTION:
	* view_base_list_section render or
	* view_default_edit_section.js render()
	* view_default_list_section.js render()
	*
	* @return object $response
	*/
	public static function build_structure_css() {
		$start_time=start_time();

		// SEE common/ui.js build_wrapper_edit for v6 model!!!!
		$response = new stdClass();
			$response->result	= true;
			$response->msg		= 'Ignored build_structure_css in v6';
		return $response; // STOPPED METHOD EXECUTION ON V6


		$response = new stdClass();
			$response->result	= false;
			$response->msg		= null;

		// less lib
			include DEDALO_LIB_PATH . '/lessphp/lessc.inc.php';
			$less = new lessc();

		// less code
			$full_ar_less_code = [];

		// date of compile
			$full_ar_less_code[] = '/* Build: '.date("Y-m-d h:i:s").' */';

		// search . Get all components custom css

		// filter. use current config DEDALO_PREFIX_TIPOS to get all valid 'tipos'
			$DEDALO_PREFIX_TIPOS = get_legacy_constant_value('DEDALO_PREFIX_TIPOS');
			$ar_pairs = array_map(function($prefix){
				return PHP_EOL . '"terminoID" LIKE \''.$prefix.'%\'';
			}, $DEDALO_PREFIX_TIPOS);
			$filter = implode(' OR ', $ar_pairs);

		// search exec query
			$strQuery	= "SELECT \"terminoID\",\"properties\" \n FROM \"jer_dd\" \n WHERE cast(\"properties\" AS TEXT) LIKE '%\"css\":%' AND ($filter) \n ORDER BY \"terminoID\" ASC";
			$result		= pg_query(DBi::_getConnection(), $strQuery);

		// iterate records
			while ($rows = pg_fetch_assoc($result)) {

				$terminoID		= $rows["terminoID"];
				$properties_str	= $rows["properties"];
				$properties		= json_decode($properties_str);

				// properties check
					if (!isset($properties->css)) {
						debug_log(__METHOD__." Failed json decode for terminoID: $terminoID. properties: ".to_string($properties_str), logger::ERROR);
						continue;
					}

				// model check
					$model_name = RecordObj_dd::get_modelo_name_by_tipo($terminoID, false); // set cache as false to prevent development issues when model is changed
					if ($model_name==='box elements') {
						continue;
					}

				// css_obj. Parsed JSON object
					$css_obj = $properties->css;

				// css_prefix. get_css_prefix
					$css_prefix = css::get_css_prefix($terminoID, $model_name);

				// less line
					if ($model_name==='section') {

						$ar_less_code = []; foreach ($css_obj as $selector => $obj_value) {
							$ar_less_code[] = self::convert_to_less($selector, $obj_value, $css_prefix, $terminoID, true);
						}

						// Involve code into custom wrapper
						$less_line = '.wrap_section_'.$terminoID.'{' . implode('', $ar_less_code) . "\n}";

					}else{

						$ar_less_code = []; foreach ($css_obj as $selector => $obj_value) {
							$ar_less_code[] = self::convert_to_less($selector, $obj_value, $css_prefix, $terminoID, false);
						}

						// Envolve code into custom wrapper
						$less_line = '.'.$css_prefix.'_'.$terminoID.'{' . implode('', $ar_less_code) . "\n}";

						// En pruebas (el ampliarlo solo a los de css_prefix wrap_component -los componentes-) 24-08-2018
						if($css_prefix==='wrap_component'){
							$less_line = '.sgc_edit>' . $less_line;
						}
					}

				// Add line code
					$full_ar_less_code[] = $less_line;

			}//end while ($rows = pg_fetch_assoc($result)) {
			#debug_log(__METHOD__." less_code ".to_string($full_ar_less_code), logger::DEBUG);

		// final less_code
			$less_code = implode(' ', $full_ar_less_code);


		// MXINS. Get mixins file.  Not used in version 6
			// $file_name = DEDALO_CORE_PATH . self::$mixins_file_path;
			// if ($mixins_code = file_get_contents($file_name)) {
			// 	$less_code = $mixins_code.$less_code;
			// }

		// file_name full path
			$file_name = DEDALO_CORE_PATH . self::$structure_file_path;

		// Format : lessjs (default) | compressed | classic
			$format = (DEVELOPMENT_SERVER===true) ? 'lessjs' : 'compressed';
			$less->setFormatter($format);	// lessjs (default) | compressed | classic

		// Preserve comments : true | false
			$less->setPreserveComments(false);	// true | false

		// Compile
			#$compiled_css = $less->compile( $less_code );
			try {
				$compiled_css = $less->compile( $less_code );
			} catch (exception $e) {
				debug_log(__METHOD__." Error en compile less: ".$e->getMessage(), logger::ERROR);
				echo "fatal error: " . $e->getMessage();
				dump($less_code, ' less_code ++ '.to_string());

				$response->result	= false;
				$response->msg		= "Error on compile less_code (1) ".$e->getMessage();
				return $response;
			}

		// Delete old version if exists
			if ( file_exists($file_name) && !unlink($file_name) ) {
				$response->result	= false;
				$response->msg		= "Error on remove old css file ($file_name) ";
			}

		// write file
			if( !$write = file_put_contents($file_name, $compiled_css) ) {
				$response->result	= false;
				$response->msg		= "Error on write css file ($file_name) ".to_string($write);
			}else{
				$file_size				= format_size_units( filesize($file_name) );
				$response->result		= true;
				$response->msg			= "File css created successful. Size: $file_size";
				$response->file_path	= self::$structure_file_path;
			}


			if(SHOW_DEBUG===true) {
				#debug_log(__METHOD__." Response: ".to_string($response), logger::DEBUG);
				$total = exec_time_unit($start_time,'ms')." ms";
				debug_log(__METHOD__." Total time [build_structure_css] ms: ".$total, logger::DEBUG);
			}


		return (object)$response;
	}//end build_structure_css



	/**
	* CONVERT_TO_LESS
	* @param string $selector
	*	Is the css selector, like ".wrap_section_group_div_mdcat2576"
	* @param object $obj_value
	*
	* @return string $less_value
	*/
	public static function convert_to_less($selector, $obj_value, $css_prefix, $terminoID, $enclose=false) {

		$less_value = '';

		// obj_value check
			if (!is_object($obj_value)) {
				debug_log(__METHOD__." error. obj_value is not object ".json_encode($obj_value)." - css_prefix: ".json_encode($css_prefix)." - key: $selector - terminoID : $terminoID", logger::ERROR);
				return $less_value;
			}

		// wrap_section_group_div_mdcat2576 wrap_section
			if( strpos($selector, $css_prefix)===false
				//&& ($css_prefix==='wrap_section')
				&& ($css_prefix==='alias' && $selector==='.wrap_component')===false) {
				$enclose = true;
			}

		// If current key is not defined as css_prefix, add as new style
			if ($enclose===true) {
				$less_value .= "\n$selector{";
			}

		// mixings. (!) mixings are not used in version 6
			// if (property_exists($obj_value, 'mixin')) {
			// 	foreach((array)$obj_value->mixin as $mixin_value) {
			// 		$less_value .= "\n $mixin_value;";
			// 	}
			// }

		// style
			if (property_exists($obj_value, 'style') && !empty($obj_value->style)) {
				foreach((array)$obj_value->style as $style_key => $style_value) {
					$less_value .= "\n $style_key:$style_value;";
				}
			}

		// enclose
			if ($enclose===true) {
				$less_value .= "\n}";
			}


		return $less_value;
	}//end convert_to_less



	/**
	* GET_CSS_PREFIX
	* @param string $tipo
	* @param string $model_name
	* @return string $css_prefix
	*/
	public static function get_css_prefix($tipo, $model_name) {

		switch (true) {

			case strpos($model_name, 'component')!==false :
				$css_prefix = 'wrap_component';
				break;

			case ($model_name === 'section_group_div'):
				$css_prefix = 'wrap_section_group_div';
				break;

			case ($model_name === 'section_group') :
				$css_prefix = 'wrap_section_group';
				break;

			case ($model_name === 'section_list') :
				$css_prefix = 'wrap_section_records';
				break;

			// section, section_tool
			case strpos($model_name, 'section')===0 :
				$css_prefix = 'wrap_section';
				#$css_prefix = ' '; // (one space)
				break;

			case ($model_name === 'component_alias') :
				$css_prefix = 'alias';
				break;

			case strpos($model_name, 'button_')!==false :
				$css_prefix = 'css_button_generic';
				break;

			default:
				$css_prefix = $tipo;
				debug_log(__METHOD__." Undefined css_prefix from model_name: '$model_name' ($tipo)".to_string(), logger::ERROR);
				break;
		}

		return $css_prefix;
	}//end get_css_prefix



}//end class css


