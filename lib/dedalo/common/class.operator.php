<?php
#require_once( dirname(dirname(__FILE__)) .'/config/config4.php');
#require_once(DEDALO_LIB_BASE_PATH . '/db/class.RecordObj_dd.php');

/**
* OPERATOR
* Manage all operators of Dedalo for compose searchs
* Get all operators from file or data base and convert all variables to static vars
*/

# OPERATOR  
 abstract class operator {


 	static $ar_operator;



 	/**
 	* GET AR OPERATOR
 	* @return $ar_operator
 	* Class static array 
 	* Priority:
 	* 1 - Class static 
 	* 2 - Session ['config4']['ar_operator']
 	* 3 - Calculate method 'set_static_operator_vars'
 	*/
 	public static function get_ar_operator( $lang=DEDALO_APPLICATION_LANG ) {

 		if ($lang==='lg-vlca') {
			$lang = 'lg-cat';
		}

 		# DEBUG NOT STORE SESSION OPERATORS
 		#if(SHOW_DEBUG) unset($ar_operator);

 		if(isset(operator::$ar_operator[$lang])) return operator::$ar_operator[$lang];		


		switch (true) {

			# using DEDALO_CACHE_MANAGER as cache
			case (DEDALO_CACHE_MANAGER && CACHE_OPERATORS) :

				$cache_key_name = DEDALO_DATABASE_CONN.'_operator_'.$lang;;
				if (cache::exists($cache_key_name)) {
					#error_log("INFO: readed data from operator cache key: $cache_key_name");
					operator::$ar_operator[$lang] = unserialize(cache::get($cache_key_name));
				}else{
					# Calculate operator for current lang and store
					operator::$ar_operator[$lang] = self::set_static_operator_vars( $lang );
					cache::set($cache_key_name, serialize( operator::$ar_operator[$lang] ));
				}
				break;

			# Using php session as cache
			default:				
				if( isset($_SESSION['dedalo4']['config']['ar_operator'][$lang]) ) {
					# Get from session	
					operator::$ar_operator[$lang] = $_SESSION['dedalo4']['config']['ar_operator'][$lang];		
				}else{
					# Calculate operator for current lang and store
					operator::$ar_operator[$lang] = self::set_static_operator_vars( $lang );	
					$_SESSION['dedalo4']['config']['ar_operator'][$lang] = operator::$ar_operator[$lang];				
				}								
		}

		return operator::$ar_operator[$lang];
 	}
 	

 	/**
	* GET_OPERATOR_CACHE_KEY_NAME
	*//*
	public function get_operator_cache_key_name() {
		return DEDALO_DATABASE_CONN.'_operator_'.DEDALO_APPLICATION_LANG;
	}
	*/


	/**
	* GET OPERATOR
	* @param $name
	*	String var name like 'quit'
	* Get operator data static
	*/
	public static function get_operator($SQL_operator, $lang=DEDALO_APPLICATION_LANG) {
		
		if ($lang==='lg-vlca') {
			$lang = 'lg-cat';
		}

		# Calculate values (is calculated once)
		self::get_ar_operator($lang);		

		if(!isset(operator::$ar_operator[$lang][$SQL_operator])) {
			#return "Sorry, $name is untranslated";
			#return '<span class="untranslated">'.$name .'</span>';
			return component_common::decore_untranslated($SQL_operator);			
		}
		#dump(operator::$ar_operator,'operator::$ar_operator');

		return operator::$ar_operator[$lang][$SQL_operator];
	}


	/**
	* GET VAR FROM OPERATOR
	* @param $operator
	*	String operator like 'Relaciones'
	* Resolve inverse operator
	*/
	public static function get_var_from_operator($operator, $lang=DEDALO_APPLICATION_LANG) {

		if ($lang==='lg-vlca') {
			$lang = 'lg-cat';
		}

		# Calculate values (is calculated once)
		self::get_ar_operator($lang);		

		if(!isset(operator::$ar_operator[$lang])) return NULL;

		# Search in array to resolve
		foreach (operator::$ar_operator[$lang] as $key => $value) {
			#echo $key .'<br>';
			if ( strtolower($value) === strtolower($operator) ) {
				return $key;
			}
		}
	}



	/**
	* SET STATIC VARS
	* Calculate an fix all operators values from structure (all terms with model 'operator')
	*/
	protected static function set_static_operator_vars( $lang=DEDALO_APPLICATION_LANG ) {

		if(SHOW_DEBUG) $start_time=microtime(1);

		if ($lang==='lg-vlca') {
			$lang = 'lg-cat';
		}
		
		if(SHOW_DEBUG) {
			global$TIMER;$TIMER[__METHOD__.'_IN_'.microtime(1)]=microtime(1);
		}		
		
		$ar_terminoID_by_modelo_name = (array)RecordObj_dd::get_ar_terminoID_by_modelo_name($modelo_name='operator'); 
			#dump($ar_terminoID_by_modelo_name,'$ar_terminoID_by_modelo_name',"operator: operator ");

		$ar_operator = array();
		$cached   = true;
		$fallback = true;
		if(SHOW_DEBUG) {
			$cached=false;
		}
		foreach ($ar_terminoID_by_modelo_name as $current_terminoID) {
			
			$RecordObj_dd 	= new RecordObj_dd($current_terminoID);			
			$propiedades 	= $RecordObj_dd->get_propiedades();

			$vars_obj 		= json_decode($propiedades);

			# No data in field 'propiedades'
			if(empty($vars_obj) || empty($vars_obj->SQL_operator)) {
				trigger_error("Term $current_terminoID with model 'operator' dont't have properly configurated 'propiedades'. Please solve this ASAP");
				continue;
			}			

			# Set value			
			$ar_operator[$vars_obj->SQL_operator] = RecordObj_dd::get_termino_by_tipo($current_terminoID, $lang, $cached, $fallback);
		}	

		if(SHOW_DEBUG) {
			global$TIMER;$TIMER[__METHOD__.'_OUT_'.microtime(1)]=microtime(1);
			#error_log("Calculated operators ".count($ar_terminoID_by_modelo_name));
			debug_log(__METHOD__." for lang: $lang ".exec_time_unit($start_time,'ms').' ms');
		}
			
		return (array)$ar_operator;

	}//end set_static_operator_vars



	/**
	* GET_SEARCH_COMPARISON_OPERATORS_HTML
	* @return string $selector_html
	*/
	public static function get_search_comparison_operators_html($tipo, $ar_comparison_operator) {
		$selector_html='';
		
		$selector_html .= "\n <select class=\"css_operator_select comparison_operator\" name=\"{$tipo}_comparison_operator\" data-tipo=\"$tipo\" onchange=\"search.comparation_operator_options(this)\">";


			$checked = "";

			#$selector_html .= "\n <option value=\"\" {$checked}> </option>";
				
			foreach ($ar_comparison_operator as $value => $rotulo) {
				#$value = urlencode($value);
				$selector_html .= "\n<option value='$value' {$checked}>";
				$selector_html .= trim($rotulo);
				$selector_html .= "</option>";
			}
		
		$selector_html .= "\n </select> ";

		return (string)$selector_html;

	}#end get_search_comparison_operators_html



	/**
	* GET_SEARCH_LOGICAL_OPERATORS_HTML
	* @return string $selector_html
	*/
	public static function get_search_logical_operators_html($tipo, $ar_logical_operator) {
		$selector_html='';

		$selector_html .= "\n <select class=\"css_operator_select logical_operator\" name=\"{$tipo}_logical_operator\">";

			$checked = "";
			#$selector_html .= "\n <option value=\"\" {$checked}> </option>";
				
			foreach ($ar_logical_operator as $value => $rotulo) {				
				$selector_html .= "\n<option value='$value' {$checked}>";
				$selector_html .= trim($rotulo);
				$selector_html .= "</option>";
			}
		
		$selector_html .= "\n </select>";

		return (string)$selector_html;

	}#end get_search_logical_operators_html


}
?>