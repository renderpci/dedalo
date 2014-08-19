<?php
require_once( dirname(dirname(__FILE__)) .'/config/config4.php');
require_once(DEDALO_LIB_BASE_PATH . '/db/class.RecordObj_ts.php');

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
 	public static function get_ar_label() {

 		# DEBUG NOT STORE SESSION LABELS
 		#if(SHOW_DEBUG) unset($ar_label);

 		if(isset(static::$ar_label)) return static::$ar_label;		


		switch (true) {

			# using DEDALO_CACHE_MANAGER as cache
			case (DEDALO_CACHE_MANAGER && CACHE_LABELS) :

				$cache_key_name = DEDALO_DATABASE_CONN.'_label_'.DEDALO_APPLICATION_LANG;;
				if (cache::exists($cache_key_name)) {
					#error_log("INFO: readed data from label cache key: $cache_key_name");
					static::$ar_label = unserialize(cache::get($cache_key_name));
				}else{
					# Calculate label for current lang and store
					static::$ar_label = self::set_static_label_vars();
					cache::set($cache_key_name, serialize( static::$ar_label ));
				}
				break;

			# Using php session as cache
			default:
				if(!empty($_SESSION['config4']['ar_label'][DEDALO_APPLICATION_LANG]) ) {		
					static::$ar_label = $_SESSION['config4']['ar_label'][DEDALO_APPLICATION_LANG];		
				}else{
					# Calculate label for current lang and store
					static::$ar_label = self::set_static_label_vars();	
					$_SESSION['config4']['ar_label'][DEDALO_APPLICATION_LANG] = static::$ar_label;				
				}
		}

		return static::$ar_label;
 	}
 	

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
	public static function get_label($name) {

		# Calculate values (is calculated once)
		self::get_ar_label();		

		if(!isset(static::$ar_label[$name])) {
			#return "Sorry, $name is untranslated";
			#return '<span class="untranslated">'.$name .'</span>';
			return component_common::decore_untranslated($name);			
		}
		#dump(static::$ar_label,'static::$ar_label');

		return static::$ar_label[$name];
	}


	/**
	* GET VAR FROM LABEL
	* @param $label
	*	String label like 'Relaciones'
	* Resolve inverse label
	*/
	public static function get_var_from_label($label) {

		# Calculate values (is calculated once)
		self::get_ar_label();		

		if(!isset(static::$ar_label)) return NULL;

		# Search in array to resolve
		foreach (static::$ar_label as $key => $value) {
			#echo $key .'<br>';
			if ( strtolower($value) == strtolower($label) ) {
				return $key;
			}
		}
	}



	/**
	* SET STATIC VARS
	* Calculate an fix all labels values from structure (all terms with model 'label')
	*/
	protected static function set_static_label_vars() {

		global$TIMER;$TIMER[__METHOD__.'_IN_'.microtime(1)]=microtime(1);
		
		$ar_terminoID_by_modelo_name = RecordObj_ts::get_ar_terminoID_by_modelo_name($modelo_name='label'); 
			#dump($ar_terminoID_by_modelo_name,'$ar_terminoID_by_modelo_name',"label: label ");

		$ar_label = array();
		if(is_array($ar_terminoID_by_modelo_name)) foreach ($ar_terminoID_by_modelo_name as $current_terminoID) {
			
			$RecordObj_ts 	= new RecordObj_ts($current_terminoID);			
			$propiedades 	= $RecordObj_ts->get_propiedades();

			$vars_obj 		= json_decode($propiedades);

			# No data in field 'propiedades'
			if(empty($vars_obj) || empty($vars_obj->name)) {
				trigger_error("Term $current_terminoID with model 'label' dont't have properly configurated 'propiedades'. Please solve this ASAP");
				continue;
			}			

			# Set value
			$ar_label[$vars_obj->name] 	= RecordObj_ts::get_termino_by_tipo($current_terminoID, DEDALO_APPLICATION_LANG);
		}
		#dump($ar_label,'$ar_label');
		#error_log("INFO: calculated labels from structure");

		global$TIMER;$TIMER[__METHOD__.'_OUT_'.microtime(1)]=microtime(1);
			
		return $ar_label;

	}




}
?>