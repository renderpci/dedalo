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
				case 'lg-eng':	$section_id = 5101;		break;
				case 'lg-spa':	$section_id = 17344;	break;				
				case 'lg-cat':	$section_id = 3032;		break;
				case 'lg-ell':	$section_id = 5037;		break;
				case 'lg-deu':	$section_id = 4253;		break;
				case 'lg-vlca':	$section_id = 20155;	break;
				case 'lg-fra':	$section_id = 5450;		break;
				case 'lg-eus':	$section_id = 5223;		break;
				case 'lg-por':	$section_id = 14895;	break;
				case 'lg-ara':	$section_id = 841;		break;
				case 'lg-rus':	$section_id = 15862;	break;				
				case 'lg-ita':	$section_id = 7466;		break;
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
	public static function get_name_from_code( $code, $lang=DEDALO_DATA_LANG, $from_cache=true ) {

		if(SHOW_DEBUG===true) {
			$start_time = microtime(1);
		}

		# NO LANG : When lang code is lg-nolan, null is returned
		if ($code===DEDALO_DATA_NOLAN) {
			return null;
		}

		$cache_uid = $code.'_'.$lang;
		if ($from_cache===true && isset($_SESSION['dedalo4']['config']['lang_name_from_code'][$cache_uid])) {
			return $_SESSION['dedalo4']['config']['lang_name_from_code'][$cache_uid];
		}

		# RESOLVE
		$result = lang::resolve( $code, $lang );
			#dump($total=round(microtime(1)-$start_time,3)*1000, '$total=round(microtime(1)-$start_time,3)*1000 ++ '.to_string($result));

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
		#dump($total=round(microtime(1)-$start_time,3)*1000, '$total=round(microtime(1)-$start_time,3)*1000 ++ '.to_string());

		if($from_cache===true){
			$_SESSION['dedalo4']['config']['lang_name_from_code'][$cache_uid] = $name;
		}
		

		return (string)$name;		
	}//end get_name_from_code



	/**
	* GET_LANG_NAME_BY_LOCATOR
	* @return string $lang_name
	*/
	public static function get_lang_name_by_locator($locator, $lang=DEDALO_APPLICATION_LANG, $from_cache=false) {
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
			#case 'es' 	: $code = 'lg-spa';	break;
			#case 'en' 	: $code = 'lg-eng';	break;
			#case 'cat' 	: $code = 'lg-cat';	break;
			case 'va' 	: $code = 'lg-vlca';break;
			#case 'fr' 	: $code = 'lg-fra';	break;
			#case 'eu' 	: $code = 'lg-eus';	break;
			#case 'pt' 	: $code = 'lg-por';	break;
			#case 'ar' 	: $code = 'lg-ara';	break;
			#case 'ru'	: $code = 'lg-rus';	break;
			#case 'el' 	: $code = 'lg-ell';	break;
			#case 'de' 	: $code = 'lg-deu';	break;		

			case "aa" 	: $code = "lg-aar"; break;
			case "ab" 	: $code = "lg-abk"; break;
			case "ae" 	: $code = "lg-ave"; break;
			case "af" 	: $code = "lg-afr"; break;
			case "ak" 	: $code = "lg-aka"; break;
			case "am" 	: $code = "lg-amh"; break;
			case "an" 	: $code = "lg-arg"; break;
			case "ar" 	: $code = "lg-ara"; break;
			case "as" 	: $code = "lg-asm"; break;
			case "av" 	: $code = "lg-ava"; break;
			case "ay" 	: $code = "lg-aym"; break;
			case "az" 	: $code = "lg-aze"; break;
			case "ba" 	: $code = "lg-bak"; break;
			case "be" 	: $code = "lg-bel"; break;
			case "bg" 	: $code = "lg-bul"; break;
			case "bi" 	: $code = "lg-bis"; break;
			case "bm" 	: $code = "lg-bam"; break;
			case "bn" 	: $code = "lg-ben"; break;
			case "bo" 	: $code = "lg-bod"; break;
			case "br" 	: $code = "lg-bre"; break;
			case "bs" 	: $code = "lg-bos"; break;
			case "ca" 	: $code = "lg-cat"; break;
			case "ce" 	: $code = "lg-che"; break;
			case "ch" 	: $code = "lg-cha"; break;
			case "co" 	: $code = "lg-cos"; break;
			case "cr" 	: $code = "lg-cre"; break;
			case "cs" 	: $code = "lg-ces"; break;
			case "cu" 	: $code = "lg-chu"; break;
			case "cv" 	: $code = "lg-chv"; break;
			case "cy" 	: $code = "lg-cym"; break;
			case "da" 	: $code = "lg-dan"; break;
			case "de" 	: $code = "lg-deu"; break;
			case "dv" 	: $code = "lg-div"; break;
			case "dz" 	: $code = "lg-dzo"; break;
			case "ee" 	: $code = "lg-ewe"; break;
			case "el" 	: $code = "lg-ell"; break;
			case "en" 	: $code = "lg-eng"; break;
			case "eo" 	: $code = "lg-epo"; break;
			case "es" 	: $code = "lg-spa"; break;
			case "et" 	: $code = "lg-est"; break;
			case "eu" 	: $code = "lg-eus"; break;
			case "fa" 	: $code = "lg-fas"; break;
			case "ff" 	: $code = "lg-ful"; break;
			case "fi" 	: $code = "lg-fin"; break;
			case "fj" 	: $code = "lg-fij"; break;
			case "fo" 	: $code = "lg-fao"; break;
			case "fr" 	: $code = "lg-fra"; break;
			case "fy" 	: $code = "lg-fry"; break;
			case "ga" 	: $code = "lg-gle"; break;
			case "gd" 	: $code = "lg-gla"; break;
			case "gl" 	: $code = "lg-glg"; break;
			case "gn" 	: $code = "lg-grn"; break;
			case "gu" 	: $code = "lg-guj"; break;
			case "gv" 	: $code = "lg-glv"; break;
			case "ha" 	: $code = "lg-hau"; break;
			case "he" 	: $code = "lg-heb"; break;
			case "hi" 	: $code = "lg-hin"; break;
			case "ho" 	: $code = "lg-hmo"; break;
			case "hr" 	: $code = "lg-hrv"; break;
			case "ht" 	: $code = "lg-hat"; break;
			case "hu" 	: $code = "lg-hun"; break;
			case "hy" 	: $code = "lg-hye"; break;
			case "hz" 	: $code = "lg-her"; break;
			case "ia" 	: $code = "lg-ina"; break;
			case "id" 	: $code = "lg-ind"; break;
			case "ie" 	: $code = "lg-ile"; break;
			case "ig" 	: $code = "lg-ibo"; break;
			case "ii" 	: $code = "lg-iii"; break;
			case "ik" 	: $code = "lg-ipk"; break;
			case "io" 	: $code = "lg-ido"; break;
			case "is" 	: $code = "lg-isl"; break;
			case "it" 	: $code = "lg-ita"; break;
			case "iu" 	: $code = "lg-iku"; break;
			case "ja" 	: $code = "lg-jpn"; break;
			case "jv" 	: $code = "lg-jav"; break;
			case "ka" 	: $code = "lg-kat"; break;
			case "kg" 	: $code = "lg-kon"; break;
			case "ki" 	: $code = "lg-kik"; break;
			case "kj" 	: $code = "lg-kua"; break;
			case "kk" 	: $code = "lg-kaz"; break;
			case "kl" 	: $code = "lg-kal"; break;
			case "km" 	: $code = "lg-khm"; break;
			case "kn" 	: $code = "lg-kan"; break;
			case "ko" 	: $code = "lg-kor"; break;
			case "kr" 	: $code = "lg-kau"; break;
			case "ks" 	: $code = "lg-kas"; break;
			case "ku" 	: $code = "lg-kur"; break;
			case "kv" 	: $code = "lg-kom"; break;
			case "kw" 	: $code = "lg-cor"; break;
			case "ky" 	: $code = "lg-kir"; break;
			case "la" 	: $code = "lg-lat"; break;
			case "lb" 	: $code = "lg-ltz"; break;
			case "lg" 	: $code = "lg-lug"; break;
			case "li" 	: $code = "lg-lim"; break;
			case "ln" 	: $code = "lg-lin"; break;
			case "lo" 	: $code = "lg-lao"; break;
			case "lt" 	: $code = "lg-lit"; break;
			case "lu" 	: $code = "lg-lub"; break;
			case "lv" 	: $code = "lg-lav"; break;
			case "mg" 	: $code = "lg-mlg"; break;
			case "mh" 	: $code = "lg-mah"; break;
			case "mi" 	: $code = "lg-mri"; break;
			case "mk" 	: $code = "lg-mkd"; break;
			case "ml" 	: $code = "lg-mal"; break;
			case "mn" 	: $code = "lg-mon"; break;
			case "mr" 	: $code = "lg-mar"; break;
			case "ms" 	: $code = "lg-msa"; break;
			case "mt" 	: $code = "lg-mlt"; break;
			case "my" 	: $code = "lg-mya"; break;
			case "na" 	: $code = "lg-nau"; break;
			case "nb" 	: $code = "lg-nob"; break;
			case "nd" 	: $code = "lg-nde"; break;
			case "ne" 	: $code = "lg-nep"; break;
			case "ng" 	: $code = "lg-ndo"; break;
			case "nl" 	: $code = "lg-nld"; break;
			case "nn" 	: $code = "lg-nno"; break;
			case "no" 	: $code = "lg-nor"; break;
			case "nr" 	: $code = "lg-nbl"; break;
			case "nv" 	: $code = "lg-nav"; break;
			case "ny" 	: $code = "lg-nya"; break;
			case "oc" 	: $code = "lg-oci"; break;
			case "oj" 	: $code = "lg-oji"; break;
			case "om" 	: $code = "lg-orm"; break;
			case "or" 	: $code = "lg-ori"; break;
			case "os" 	: $code = "lg-oss"; break;
			case "pa" 	: $code = "lg-pan"; break;
			case "pi" 	: $code = "lg-pli"; break;
			case "pl" 	: $code = "lg-pol"; break;
			case "ps" 	: $code = "lg-pus"; break;
			case "pt" 	: $code = "lg-por"; break;
			case "qu" 	: $code = "lg-que"; break;
			case "rm" 	: $code = "lg-roh"; break;
			case "rn" 	: $code = "lg-run"; break;
			case "ro" 	: $code = "lg-ron"; break;
			case "ru" 	: $code = "lg-rus"; break;
			case "rw" 	: $code = "lg-kin"; break;
			case "sa" 	: $code = "lg-san"; break;
			case "sc" 	: $code = "lg-srd"; break;
			case "sd" 	: $code = "lg-snd"; break;
			case "se" 	: $code = "lg-sme"; break;
			case "sg" 	: $code = "lg-sag"; break;
			case "sh" 	: $code = "lg-hbs"; break;//deprecated
			case "hbs" 	: $code = "lg-hbs"; break;//changed
			case "si" 	: $code = "lg-sin"; break;
			case "sk" 	: $code = "lg-slk"; break;
			case "sl" 	: $code = "lg-slv"; break;
			case "sm" 	: $code = "lg-smo"; break;
			case "sn" 	: $code = "lg-sna"; break;
			case "so" 	: $code = "lg-som"; break;
			case "sq" 	: $code = "lg-sqi"; break;
			case "sr" 	: $code = "lg-srp"; break;
			case "ss" 	: $code = "lg-ssw"; break;
			case "st" 	: $code = "lg-sot"; break;
			case "su" 	: $code = "lg-sun"; break;
			case "sv" 	: $code = "lg-swe"; break;
			case "sw" 	: $code = "lg-swa"; break;
			case "ta" 	: $code = "lg-tam"; break;
			case "te" 	: $code = "lg-tel"; break;
			case "tg" 	: $code = "lg-tgk"; break;
			case "th" 	: $code = "lg-tha"; break;
			case "ti" 	: $code = "lg-tir"; break;
			case "tk" 	: $code = "lg-tuk"; break;
			case "tl" 	: $code = "lg-tgl"; break;
			case "tn" 	: $code = "lg-tsn"; break;
			case "to" 	: $code = "lg-ton"; break;
			case "tr" 	: $code = "lg-tur"; break;
			case "ts" 	: $code = "lg-tso"; break;
			case "tt" 	: $code = "lg-tat"; break;
			case "tw" 	: $code = "lg-twi"; break;
			case "ty" 	: $code = "lg-tah"; break;
			case "ug" 	: $code = "lg-uig"; break;
			case "uk" 	: $code = "lg-ukr"; break;
			case "ur" 	: $code = "lg-urd"; break;
			case "uz" 	: $code = "lg-uzb"; break;
			case "ve" 	: $code = "lg-ven"; break;
			case "vi" 	: $code = "lg-vie"; break;
			case "vo" 	: $code = "lg-vol"; break;
			case "wa" 	: $code = "lg-wln"; break;
			case "wo" 	: $code = "lg-wol"; break;
			case "xh" 	: $code = "lg-xho"; break;
			case "yi" 	: $code = "lg-yid"; break;
			case "yo" 	: $code = "lg-yor"; break;
			case "za" 	: $code = "lg-zha"; break;
			case "zh" 	: $code = "lg-zho"; break;
			case "zu" 	: $code = "lg-zul"; break;
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
	* GET_ALPHA2_FROM_CODE
	* @return string $alpha2
	*	Like 'en' from lg-eng
	*/
	public function get_alpha2_from_code( $lang_code ) {
		
		$alpha2 = null;

		switch ($lang_code) {
			case 'lg-spa' 	: $code = 'es';	break;
			case 'lg-eng' 	: $code = 'en';	break;
			case 'lg-cat' 	: $code = 'ca';	break;
			case 'lg-vlca' 	: $code = 'va';break;
			case 'lg-fra' 	: $code = 'fr';	break;
			case 'lg-eus' 	: $code = 'eu';	break;
			case 'lg-por' 	: $code = 'pt';	break;
			case 'lg-ara' 	: $code = 'ar';	break;
			case 'lg-rus'	: $code = 'ru';	break;
			case 'lg-ell' 	: $code = 'el';	break;
			case 'lg-deu' 	: $code = 'de';	break;		

			/*
				case "aa" 	: $code = "lg-aar"; break;
				case "ab" 	: $code = "lg-abk"; break;
				case "ae" 	: $code = "lg-ave"; break;
				case "af" 	: $code = "lg-afr"; break;
				case "ak" 	: $code = "lg-aka"; break;
				case "am" 	: $code = "lg-amh"; break;
				case "an" 	: $code = "lg-arg"; break;
				case "ar" 	: $code = "lg-ara"; break;
				case "as" 	: $code = "lg-asm"; break;
				case "av" 	: $code = "lg-ava"; break;
				case "ay" 	: $code = "lg-aym"; break;
				case "az" 	: $code = "lg-aze"; break;
				case "ba" 	: $code = "lg-bak"; break;
				case "be" 	: $code = "lg-bel"; break;
				case "bg" 	: $code = "lg-bul"; break;
				case "bi" 	: $code = "lg-bis"; break;
				case "bm" 	: $code = "lg-bam"; break;
				case "bn" 	: $code = "lg-ben"; break;
				case "bo" 	: $code = "lg-bod"; break;
				case "br" 	: $code = "lg-bre"; break;
				case "bs" 	: $code = "lg-bos"; break;
				case "ca" 	: $code = "lg-cat"; break;
				case "ce" 	: $code = "lg-che"; break;
				case "ch" 	: $code = "lg-cha"; break;
				case "co" 	: $code = "lg-cos"; break;
				case "cr" 	: $code = "lg-cre"; break;
				case "cs" 	: $code = "lg-ces"; break;
				case "cu" 	: $code = "lg-chu"; break;
				case "cv" 	: $code = "lg-chv"; break;
				case "cy" 	: $code = "lg-cym"; break;
				case "da" 	: $code = "lg-dan"; break;
				case "de" 	: $code = "lg-deu"; break;
				case "dv" 	: $code = "lg-div"; break;
				case "dz" 	: $code = "lg-dzo"; break;
				case "ee" 	: $code = "lg-ewe"; break;
				case "el" 	: $code = "lg-ell"; break;
				case "en" 	: $code = "lg-eng"; break;
				case "eo" 	: $code = "lg-epo"; break;
				case "es" 	: $code = "lg-spa"; break;
				case "et" 	: $code = "lg-est"; break;
				case "eu" 	: $code = "lg-eus"; break;
				case "fa" 	: $code = "lg-fas"; break;
				case "ff" 	: $code = "lg-ful"; break;
				case "fi" 	: $code = "lg-fin"; break;
				case "fj" 	: $code = "lg-fij"; break;
				case "fo" 	: $code = "lg-fao"; break;
				case "fr" 	: $code = "lg-fra"; break;
				case "fy" 	: $code = "lg-fry"; break;
				case "ga" 	: $code = "lg-gle"; break;
				case "gd" 	: $code = "lg-gla"; break;
				case "gl" 	: $code = "lg-glg"; break;
				case "gn" 	: $code = "lg-grn"; break;
				case "gu" 	: $code = "lg-guj"; break;
				case "gv" 	: $code = "lg-glv"; break;
				case "ha" 	: $code = "lg-hau"; break;
				case "he" 	: $code = "lg-heb"; break;
				case "hi" 	: $code = "lg-hin"; break;
				case "ho" 	: $code = "lg-hmo"; break;
				case "hr" 	: $code = "lg-hrv"; break;
				case "ht" 	: $code = "lg-hat"; break;
				case "hu" 	: $code = "lg-hun"; break;
				case "hy" 	: $code = "lg-hye"; break;
				case "hz" 	: $code = "lg-her"; break;
				case "ia" 	: $code = "lg-ina"; break;
				case "id" 	: $code = "lg-ind"; break;
				case "ie" 	: $code = "lg-ile"; break;
				case "ig" 	: $code = "lg-ibo"; break;
				case "ii" 	: $code = "lg-iii"; break;
				case "ik" 	: $code = "lg-ipk"; break;
				case "io" 	: $code = "lg-ido"; break;
				case "is" 	: $code = "lg-isl"; break;
				case "it" 	: $code = "lg-ita"; break;
				case "iu" 	: $code = "lg-iku"; break;
				case "ja" 	: $code = "lg-jpn"; break;
				case "jv" 	: $code = "lg-jav"; break;
				case "ka" 	: $code = "lg-kat"; break;
				case "kg" 	: $code = "lg-kon"; break;
				case "ki" 	: $code = "lg-kik"; break;
				case "kj" 	: $code = "lg-kua"; break;
				case "kk" 	: $code = "lg-kaz"; break;
				case "kl" 	: $code = "lg-kal"; break;
				case "km" 	: $code = "lg-khm"; break;
				case "kn" 	: $code = "lg-kan"; break;
				case "ko" 	: $code = "lg-kor"; break;
				case "kr" 	: $code = "lg-kau"; break;
				case "ks" 	: $code = "lg-kas"; break;
				case "ku" 	: $code = "lg-kur"; break;
				case "kv" 	: $code = "lg-kom"; break;
				case "kw" 	: $code = "lg-cor"; break;
				case "ky" 	: $code = "lg-kir"; break;
				case "la" 	: $code = "lg-lat"; break;
				case "lb" 	: $code = "lg-ltz"; break;
				case "lg" 	: $code = "lg-lug"; break;
				case "li" 	: $code = "lg-lim"; break;
				case "ln" 	: $code = "lg-lin"; break;
				case "lo" 	: $code = "lg-lao"; break;
				case "lt" 	: $code = "lg-lit"; break;
				case "lu" 	: $code = "lg-lub"; break;
				case "lv" 	: $code = "lg-lav"; break;
				case "mg" 	: $code = "lg-mlg"; break;
				case "mh" 	: $code = "lg-mah"; break;
				case "mi" 	: $code = "lg-mri"; break;
				case "mk" 	: $code = "lg-mkd"; break;
				case "ml" 	: $code = "lg-mal"; break;
				case "mn" 	: $code = "lg-mon"; break;
				case "mr" 	: $code = "lg-mar"; break;
				case "ms" 	: $code = "lg-msa"; break;
				case "mt" 	: $code = "lg-mlt"; break;
				case "my" 	: $code = "lg-mya"; break;
				case "na" 	: $code = "lg-nau"; break;
				case "nb" 	: $code = "lg-nob"; break;
				case "nd" 	: $code = "lg-nde"; break;
				case "ne" 	: $code = "lg-nep"; break;
				case "ng" 	: $code = "lg-ndo"; break;
				case "nl" 	: $code = "lg-nld"; break;
				case "nn" 	: $code = "lg-nno"; break;
				case "no" 	: $code = "lg-nor"; break;
				case "nr" 	: $code = "lg-nbl"; break;
				case "nv" 	: $code = "lg-nav"; break;
				case "ny" 	: $code = "lg-nya"; break;
				case "oc" 	: $code = "lg-oci"; break;
				case "oj" 	: $code = "lg-oji"; break;
				case "om" 	: $code = "lg-orm"; break;
				case "or" 	: $code = "lg-ori"; break;
				case "os" 	: $code = "lg-oss"; break;
				case "pa" 	: $code = "lg-pan"; break;
				case "pi" 	: $code = "lg-pli"; break;
				case "pl" 	: $code = "lg-pol"; break;
				case "ps" 	: $code = "lg-pus"; break;
				case "pt" 	: $code = "lg-por"; break;
				case "qu" 	: $code = "lg-que"; break;
				case "rm" 	: $code = "lg-roh"; break;
				case "rn" 	: $code = "lg-run"; break;
				case "ro" 	: $code = "lg-ron"; break;
				case "ru" 	: $code = "lg-rus"; break;
				case "rw" 	: $code = "lg-kin"; break;
				case "sa" 	: $code = "lg-san"; break;
				case "sc" 	: $code = "lg-srd"; break;
				case "sd" 	: $code = "lg-snd"; break;
				case "se" 	: $code = "lg-sme"; break;
				case "sg" 	: $code = "lg-sag"; break;
				case "sh" 	: $code = "lg-hbs"; break;//deprecated
				case "hbs" 	: $code = "lg-hbs"; break;//changed
				case "si" 	: $code = "lg-sin"; break;
				case "sk" 	: $code = "lg-slk"; break;
				case "sl" 	: $code = "lg-slv"; break;
				case "sm" 	: $code = "lg-smo"; break;
				case "sn" 	: $code = "lg-sna"; break;
				case "so" 	: $code = "lg-som"; break;
				case "sq" 	: $code = "lg-sqi"; break;
				case "sr" 	: $code = "lg-srp"; break;
				case "ss" 	: $code = "lg-ssw"; break;
				case "st" 	: $code = "lg-sot"; break;
				case "su" 	: $code = "lg-sun"; break;
				case "sv" 	: $code = "lg-swe"; break;
				case "sw" 	: $code = "lg-swa"; break;
				case "ta" 	: $code = "lg-tam"; break;
				case "te" 	: $code = "lg-tel"; break;
				case "tg" 	: $code = "lg-tgk"; break;
				case "th" 	: $code = "lg-tha"; break;
				case "ti" 	: $code = "lg-tir"; break;
				case "tk" 	: $code = "lg-tuk"; break;
				case "tl" 	: $code = "lg-tgl"; break;
				case "tn" 	: $code = "lg-tsn"; break;
				case "to" 	: $code = "lg-ton"; break;
				case "tr" 	: $code = "lg-tur"; break;
				case "ts" 	: $code = "lg-tso"; break;
				case "tt" 	: $code = "lg-tat"; break;
				case "tw" 	: $code = "lg-twi"; break;
				case "ty" 	: $code = "lg-tah"; break;
				case "ug" 	: $code = "lg-uig"; break;
				case "uk" 	: $code = "lg-ukr"; break;
				case "ur" 	: $code = "lg-urd"; break;
				case "uz" 	: $code = "lg-uzb"; break;
				case "ve" 	: $code = "lg-ven"; break;
				case "vi" 	: $code = "lg-vie"; break;
				case "vo" 	: $code = "lg-vol"; break;
				case "wa" 	: $code = "lg-wln"; break;
				case "wo" 	: $code = "lg-wol"; break;
				case "xh" 	: $code = "lg-xho"; break;
				case "yi" 	: $code = "lg-yid"; break;
				case "yo" 	: $code = "lg-yor"; break;
				case "za" 	: $code = "lg-zha"; break;
				case "zh" 	: $code = "lg-zho"; break;
				case "zu" 	: $code = "lg-zul"; break;
			*/
			default:
				debug_log(__METHOD__." Sorry, lang not defined: \"$lang_code\" ".to_string(), logger::ERROR);
				break;
		}
		if (isset($code)) {
			$alpha2 = $code;
		}

		return $alpha2;
	}//end get_alpha2_from_code



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