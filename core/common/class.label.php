<?php
#require_once( DEDALO_CONFIG_PATH .'/config.php');
#require_once(DEDALO_CORE_PATH . '/db/class.RecordObj_dd.php');

/**
* LABEL
* Manage all labels and messages of Dedalo
* Get all labels from file or data base and convert all variables to static vars
*/

# LABEL  
 abstract class label {


 	static $ar_label;



 	/**
 	* GET AR LABEL
 	* @return $ar_label
 	* Class static array 
 	* Priority:
 	* 1 - Class static 
 	* 2 - Session ['config4']['ar_label']
 	* 3 - Calculate method 'set_static_label_vars'
 	*/
 	public static function get_ar_label( $lang=DEDALO_APPLICATION_LANG ) {

 		if ($lang==='lg-vlca') {
			$lang = 'lg-cat';
		}

 		# DEBUG NOT STORE SESSION LABELS
 		#if(SHOW_DEBUG===true) unset($ar_label);

 		if(isset(label::$ar_label[$lang])) return label::$ar_label[$lang];

			# Using php session as cache
				
			if( isset($_SESSION['dedalo4']['config']['ar_label'][$lang]) ) {
				# Get from session	
				label::$ar_label[$lang] = $_SESSION['dedalo4']['config']['ar_label'][$lang];		
			}else{
				# Calculate label for current lang and store
				label::$ar_label[$lang] = self::set_static_label_vars( $lang );	
				$_SESSION['dedalo4']['config']['ar_label'][$lang] = label::$ar_label[$lang];				
			}								


		$ar_label = label::$ar_label[$lang];
	

		return $ar_label;
 	}//end get_ar_label
 	

 	/**
	* GET_LABEL_CACHE_KEY_NAME
	*//*
	public function get_label_cache_key_name() {
		return DEDALO_DATABASE_CONN.'_label_'.DEDALO_APPLICATION_LANG;
	}
	*/


	/**
	* GET LABEL
	* @param $name
	*	String var name like 'quit'
	* Get label data static
	*/
	public static function get_label($name, $lang=DEDALO_APPLICATION_LANG) {
		
		if ($lang==='lg-vlca') {
			$lang = 'lg-cat';
		}

		# Calculate values (is calculated once)
		self::get_ar_label($lang);		

		if(!isset(label::$ar_label[$lang][$name])) {
			#return "Sorry, $name is untranslated";
			#return '<span class="untranslated">'.$name .'</span>';
			return component_common::decore_untranslated($name);			
		}
		#dump(label::$ar_label,'label::$ar_label');

		return label::$ar_label[$lang][$name];
	}


	/**
	* GET VAR FROM LABEL
	* @param $label
	*	String label like 'Relaciones'
	* Resolve inverse label
	*/
	public static function get_var_from_label($label, $lang=DEDALO_APPLICATION_LANG) {

		if ($lang==='lg-vlca') {
			$lang = 'lg-cat';
		}

		# Calculate values (is calculated once)
		self::get_ar_label($lang);		

		if(!isset(label::$ar_label[$lang])) return NULL;

		# Search in array to resolve
		foreach (label::$ar_label[$lang] as $key => $value) {
			#echo $key .'<br>';
			if ( strtolower($value) === strtolower($label) ) {
				return $key;
			}
		}
	}



	/**
	* SET STATIC VARS
	* Calculate an fix all labels values from structure (all terms with model 'label')
	*/
	protected static function set_static_label_vars( $lang=DEDALO_APPLICATION_LANG ) {

		if(SHOW_DEBUG===true) $start_time=microtime(1);

		if ($lang==='lg-vlca') {
			$lang = 'lg-cat';
		}
		
		if(SHOW_DEBUG===true) {
			global$TIMER;$TIMER[__METHOD__.'_IN_'.microtime(1)]=microtime(1);			
		}		
		
		$ar_terminoID_by_modelo_name = (array)RecordObj_dd::get_ar_terminoID_by_modelo_name($modelo_name='label'); 
			#dump($ar_terminoID_by_modelo_name,'$ar_terminoID_by_modelo_name',"label: label ");

		$ar_label = array();
		$cached   = true;
		$fallback = true;
		if(SHOW_DEBUG===true) {
			#$cached=false;
		}
		foreach ($ar_terminoID_by_modelo_name as $current_terminoID) {
			
			$RecordObj_dd 	= new RecordObj_dd($current_terminoID);			
			$propiedades 	= $RecordObj_dd->get_propiedades();
			$vars_obj 		= json_decode($propiedades);

			# No data in field 'propiedades'
			if(empty($vars_obj) || empty($vars_obj->name)) {
				trigger_error("Term $current_terminoID with model 'label' dont't have properly configurated 'propiedades'. Please solve this ASAP");
				continue;
			}			

			# Set value			
			$ar_label[$vars_obj->name] 	= RecordObj_dd::get_termino_by_tipo($current_terminoID, $lang, $cached, $fallback);
		}		

		if(SHOW_DEBUG===true) {
			global$TIMER;$TIMER[__METHOD__.'_OUT_'.microtime(1)]=microtime(1);
			#error_log("Calculated labels ".count($ar_terminoID_by_modelo_name));
			debug_log(__METHOD__." for lang: $lang ".exec_time_unit($start_time,'ms').' ms');
		}

			
		return $ar_label;
	}//end set_static_label_vars



	/**
	* GET_TERMINOID_FROM_LABEL
	* Resolve terminoID from label propiedades property 'label'
	*/
	public static function get_terminoID_from_label( $label ) {

		if(SHOW_DEBUG===true) $start_time=microtime(1);

		$terminoID = null;	
		
		if(SHOW_DEBUG===true) {
			global$TIMER;$TIMER[__METHOD__.'_IN_'.microtime(1)]=microtime(1);			
		}		
		
		$ar_terminoID_by_modelo_name = (array)RecordObj_dd::get_ar_terminoID_by_modelo_name($modelo_name='label'); 
			#dump($ar_terminoID_by_modelo_name,'$ar_terminoID_by_modelo_name',"label: label ");
		
		foreach ($ar_terminoID_by_modelo_name as $current_terminoID) {
			
			$RecordObj_dd 	= new RecordObj_dd($current_terminoID);			
			$propiedades 	= $RecordObj_dd->get_propiedades();
			$vars_obj 		= json_decode($propiedades);

			# No data in field 'propiedades'
			if(empty($vars_obj) || empty($vars_obj->name)) {
				trigger_error("Term $current_terminoID with model 'label' dont't have properly configurated 'propiedades'. Please solve this ASAP");
				continue;
			}			

			if ($vars_obj->name===$label) {
				$terminoID = $current_terminoID;
				break;
			}
		}		

		if(SHOW_DEBUG===true) {
			global$TIMER;$TIMER[__METHOD__.'_OUT_'.microtime(1)]=microtime(1);
			#error_log("Calculated labels ".count($ar_terminoID_by_modelo_name));
			debug_log(__METHOD__." Total  ".exec_time_unit($start_time,'ms').' ms');
		}

			
		return $terminoID;
	}//end get_terminoID_from_label




}
?>