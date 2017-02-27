<?php
/**
* LANG CLASS
* To manage dedalo lang resolutions 
* Complements thesaurus langs
*/
class lang {


	# fixed matrix table where are stored all langs
	public static $langs_matrix_table = 'matrix_langs';
	
 
	/**
	* RESOLVE
	* Resolve request lag tld in requested language
	* For example: resolves "Spanish" from $lang_tld='lg-spa', $lang='lg-eng'
	* or "Español" from $lang_tld='lg-spa', $lang='lg-spa'
	* @param string $lang_tld
	*	like 'lg-spa'
	* @param string $lang
	*	like 'lg-eng'. Default is current dedalo data lang
	* @return string $name
	*/
	private static function resolve( $lang_tld, $lang=DEDALO_DATA_LANG ) {

		$name = null;

		if (strpos($lang_tld, 'lg-')===0) {
			$lang_tld = substr($lang_tld, 3);
		}

		static $resolve_response;
		if (isset($resolve_response[$lang_tld])) {
			return $resolve_response[$lang_tld];
		}
		
		$tipo 	 	 = DEDALO_THESAURUS_CODE_TIPO;
		$table 		 = lang::$langs_matrix_table;
		$term_tipo	 = DEDALO_THESAURUS_TERM_TIPO;

		$strQuery  = '';
		$strQuery .= "SELECT";
		$strQuery .= "\n section_id, section_tipo, datos#>'{components, $term_tipo, dato}' AS names";
		$strQuery .= "\n FROM \"$table\"";
		$strQuery .= "\n WHERE";
		#$strQuery .= "\n datos#>>'{components, $tipo, dato, lg-nolan}' = '$lang_tld';";
		$strQuery .= "\n datos#>'{components, $tipo, dato, lg-nolan}' ? '$lang_tld';";

					if(SHOW_DEBUG===true) {
						#debug_log(__METHOD__." query: $strQuery ".to_string($lang_tld), logger::DEBUG);
						#dump($strQuery, ' $strQuery ++ '.to_string());
					}

		$response = new stdClass();
		$result	  = JSON_RecordObj_matrix::search_free($strQuery);
					while ($rows = pg_fetch_assoc($result)) {
						$names = $rows['names'];
						$names = json_decode($names);

						$response->section_id = $rows['section_id'];
						$response->names 	  = $names;
						break;
					}
					#dump($names, ' names ++ '.to_string());

		$resolve_response[$lang_tld] = $response;

		return (object)$response;
	}//end resolve



	/**
	* GET_section_ID_FROM_CODE
	* @return 
	*/
	public static function get_section_id_from_code( $code ) {

		$result 	 = lang::resolve( $code, $lang=DEDALO_DATA_LANG );
		$section_id  = $result->section_id;

		return (int)$section_id;
	}//end get_section_id_from_code



	/**
	* GET_LANG_LOCATOR_FROM_CODE
	* @return 
	*/
	public static function get_lang_locator_from_code( $code ) {
		
		$result 	 = lang::resolve( $code, $lang=DEDALO_DATA_LANG );
		if (!isset($result->section_id)) {
			# Temporal cath error for import v4.0.15 to v4.5.0
			# When import hierarchy, langs are not imported yet (langs are insise hierarchies)
			# Remove this catch in next versions
			switch ($lang) {
				case 'lg-spa':	$section_id = 17344;	break;
				case 'lg-eng':	$section_id = 5101;		break;
				case 'lg-cat':	$section_id = 3032;		break;
				case 'lg-vlca':	$section_id = 20155;	break;
				case 'lg-fra':	$section_id = 5450;		break;
				case 'lg-eus':	$section_id = 5223;		break;
				case 'lg-por':	$section_id = 14895;	break;
				case 'lg-ara':	$section_id = 841;		break;
				case 'lg-rus':	$section_id = 15862;	break;
				case 'lg-ell':	$section_id = 5037;		break;
				case 'lg-deu':	$section_id = 4253;		break;
				default:
					break;
			}
		}else{
			# Normal case
			$section_id  = $result->section_id;
		}		

		$locator = new locator();
			$locator->set_section_tipo(DEDALO_LANGS_SECTION_TIPO);
			$locator->set_section_id($section_id);		

		return (object)$locator;
	}//end get_lang_locator_from_code



	/**
	* GET_NAME_FROM_CODE
	* @return string $name 
	*/
	public static function get_name_from_code( $code, $lang=DEDALO_DATA_LANG ) {

		# NO LANG : When lang code is lg-nolan, null is returned
		if ($code===DEDALO_DATA_NOLAN) {
			return null;
		}

		# RESOLVE
		$result = lang::resolve( $code, $lang );
			#dump($result, ' $result ++ '.to_string());

		# NOT FOUNDED NAME
		if(!isset($result->names)) {
			if(SHOW_DEBUG===true) {			
				#dump($result, ' result ++ '.to_string($code));				
			}
			return null;
		}

		# Set names from object result
		$names  = $result->names;
			#dump($names, '$names ++ '.to_string());

		# Fallback
		if (!empty($names->$lang)) {

			$name = to_string($names->$lang);

		}else{

			$section_tipo = DEDALO_LANGS_SECTION_TIPO;
			$main_lang 	  = hierarchy::get_main_lang($section_tipo);
			# Recursion in main_lang lang
			if (isset($names->$main_lang)) {
				$name = to_string($names->$main_lang);
			}else{
				return null;
			}
		}
		#dump($name, ' name ++ '.to_string());

		return (string)$name;		
	}//end get_name_from_code



	/**
	* GET_LANG_NAME_BY_LOCATOR
	* @return string $lang_name
	*/
	public static function get_lang_name_by_locator($locator, $lang=DEDALO_DATA_LANG, $from_cache=false) {
		$lang_name = ts_object::get_term_by_locator( $locator, $lang, $from_cache );

		return $lang_name;
	}//end get_lang_name_by_locator



	/**
	* GET_CODE_FROM_LOCATOR
	* @return string $code
	*/
	public static function get_code_from_locator($locator, $add_prefix=true) {

		if (!isset($locator->section_id)) {
			if(SHOW_DEBUG===true) {
				dump($locator, ' locator ++ (locator_id not found!)'.to_string());
				dump(debug_backtrace(), ' debug_backtrace() ++ '.to_string());;
			}
			return null;
		}

		$section_tipo 	 = DEDALO_LANGS_SECTION_TIPO;

			# Test section tipo and modelo_name exists (TEMPORAL FOR INSTALATIONS BEFORE 4.5)		
			$section_modelo_name = RecordObj_dd::get_modelo_name_by_tipo($section_tipo, true);
			if ($section_modelo_name!=='section') {

				$section_id = (int)$locator->section_id;
				switch ($section_id) {
					case 17344 	: $code = 'spa';	break;
					case 5101 	: $code = 'lg-eng';	break;
					case 3032 	: $code = 'lg-cat';	break;
					case 20155 	: $code = 'lg-vlca';break;
					case 5450 	: $code = 'lg-fra';	break;
					case 5223 	: $code = 'lg-eus';	break;
					case 14895 	: $code = 'lg-por';	break;
					case 841 	: $code = 'lg-ara';	break;
					case 15862	: $code = 'lg-rus';	break;
					case 5037 	: $code = 'lg-ell';	break;
					case 4253 	: $code = 'lg-deu';	break;
					default:
						break;
				}
				throw new Exception("Error Processing Request. Impossible calculate lang code from locator. <br>
					Your desired code could be '$code' for $locator->section_tipo - $locator->section_id<br>
					But, please review your langs section ($section_tipo) data before continue working to avoid critical errors.<br>
					<a href=\"../?t=$section_tipo\">Go to langs section</a><br> Locator: ".to_string($locator), 1);
				
			}

		$tipo 			 = DEDALO_THESAURUS_CODE_TIPO;
		$modelo_name 	 = RecordObj_dd::get_modelo_name_by_tipo($tipo, true);
		$parent 		 = $locator->section_id;				
		$component 		 = component_common::get_instance($modelo_name,
														  $tipo,
														  $parent,
														  'edit',
														  DEDALO_DATA_NOLAN,
														  $section_tipo);
		$code = $component->get_valor(0);

		if ($add_prefix===true) {
			$code = 'lg-'.$code;
		}

		return (string)$code;
	}//end get_code_from_locator



	/**
	* GET_LANG_CODE_FROM_ALPHA2
	* @return 
	*/
	public static function get_lang_code_from_alpha2($lang_apha2) {	

		$lang_code = null;
		
		switch ($lang_apha2) {
			case 'es' 	: $code = 'lg-spa';	break;
			case 'en' 	: $code = 'lg-eng';	break;
			case 'cat' 	: $code = 'lg-cat';	break;
			case 'va' 	: $code = 'lg-vlca';break;
			case 'fr' 	: $code = 'lg-fra';	break;
			case 'eu' 	: $code = 'lg-eus';	break;
			case 'pt' 	: $code = 'lg-por';	break;
			case 'ar' 	: $code = 'lg-ara';	break;
			case 'ru'	: $code = 'lg-rus';	break;
			case 'el' 	: $code = 'lg-ell';	break;
			case 'de' 	: $code = 'lg-deu';	break;		
			case 'el' 	: $code = 'lg-ell';	break;
			default:
				debug_log(__METHOD__." Sorry, lang not defined: \"$lang_apha2\" ".to_string(), logger::ERROR);
				break;
		}
		if (isset($code)) {
			$lang_code = $code;
		}		

		return $lang_code;
	}//end get_lang_code_from_alpha2



	/**
	* BUILD_RESOLVE_QUERY
	* @return string $strQuery
	*//*
	private static function build_resolve_query($lang_tld, $lang) {
		
		$tipo 	 	 = lang::$tld_tipo;
		$table 		 = lang::$langs_matrix_table;

		$strQuery  = '';
		$strQuery .= "SELECT";
		$strQuery .= "\n id, section_id, section_tipo, datos#>>'{components, $tipo, dato, $lang}' AS name";
		$strQuery .= "\n FROM \"$table\"";
		$strQuery .= "\n WHERE";
		$strQuery .= "\n datos#>>'{components, $tipo, dato, lg-nolan}' = '$lang_tld';";

		return $strQuery;
	}//end build_resolve_query
	*/



}//end class lang
?>