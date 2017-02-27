<?php
#require_once(DEDALO_LIB_BASE_PATH . '/diffusion/class.diffusion_mysql.php');

/*
* CLASS DIFUSSION
*/

// abstract 
abstract class diffusion  {

	protected $domain;
	public $ar_diffusion_map;	


	/**
	* CONSTRUCT
	* @param object $options . Default null
	*/
	function __construct($options=null) {
		#$this->ar_diffusion_map 	= $this->get_ar_diffusion_map();
		#self::$ar_database 		= $this->get_ar_database();
		#self::$ar_table_data = array();

		$this->domain = DEDALO_DIFFUSION_DOMAIN;
	}

	
	
	/**
	* GET HTML CODE . RETURN INCLUDE FILE __CLASS__.PHP
	* @return string $html
	*	Get standar path file "DEDALO_LIB_BASE_PATH .'/'. $class_name .'/'. $class_name .'.php'" (ob_start)
	*	and return rendered html code
	*/
	public function get_html() {
		
		if(SHOW_DEBUG) $start_time = start_time();
		
		# Class name is called class (ex. component_input_text), not this class (common)
		$class_name	= get_called_class();	#dump($class_name,'$class_name');

		$file = DEDALO_LIB_BASE_PATH .'/diffusion/'. $class_name .'/'. $class_name .'.php' ; 	#dump("$class_name");		
	
		ob_start();
		include ( $file );
		$html =  ob_get_clean();

		if(SHOW_DEBUG) {
			#$GLOBALS['log_messages'] .= exec_time($start_time, __METHOD__. ' [element '.$class_name.']', "html");
			global$TIMER;$TIMER[__METHOD__.'_'.get_called_class().'_'.microtime(1)]=microtime(1);
		}
		
		return $html;
	}//end get_html



	/**
	* CLEAN_DUPLICATES
	* @return array
	*/
	public static function clean_duplicates( $ar_locators ) {

		$ar_temp = array();
		foreach ($ar_locators as $key => $locator) {

			if (is_object($locator)) {				
			
				$section_tipo 	= $locator->section_tipo;
				$section_id 	= $locator->section_id;

				if(in_array($section_tipo.'_'.$section_id, $ar_temp)) {
					unset($ar_locators[$key]);
					#debug_log(__METHOD__." UNSETED locator: {$section_tipo}_{$section_id} - key:".to_string($key), logger::DEBUG);
				}
				$ar_temp[] = $section_tipo.'_'.$section_id;

			}else{

				if(in_array($locator, $ar_temp)) {
					unset($ar_locators[$key]);
					#debug_log(__METHOD__." UNSETED locator: {$locator} - key:".to_string($key), logger::DEBUG);
				}
			}
		}

		return array_values($ar_locators);
	}#end clean_duplicates



	/**
	* GET_AR_DEDALO_COUNTRIES
	* Return array of dedalo_countries for request tipo ts
	* In mode 'columns' ($options->request='columns') return a simple array of standar 'dedalo_countries' like (country,autonomous_community,province,..)
	* In mode 'fields' ($options->request='fields') return a asociative array resolved for request lang like ([country] => España, [autonomous_community] => País Vasco, ..)
	* Note: current source element column will be replaced by its correspondence in dedalo_countries
	* @param object $options
	* @return array $ar_dedalo_countries 
	*/
	protected static function get_ar_dedalo_countries( $request_options ) {

		$ar_dedalo_countries=array();

		$options = new stdClass();				
			$options->ts_map 				= false; # name of ts_map from propiedades
			$options->curent_children_tipo  = false; # tipo of diffusion element
			$options->request 				= false; # type of request (fields / columns)
			$options->parent 				= false; # parent id matrix
			$options->lang 					= false; # current iterate lang
			$options->section_tipo 			= null;
			
			foreach ($request_options as $key => $value) {if (property_exists($options, $key)) $options->$key = $value;}
		
		# TS_MAP . Calculate ts_map
		$ts_map = Tesauro::get_ar_ts_map( $options->ts_map );
			#dump($ts_map, ' ts_map +');die();


		switch ($options->request) {

			case 'columns':
				# Add all elements of first ts_map element as columns like array('country','autonomous_community','province'..)
				foreach ((array)reset($ts_map) as $dedalo_country => $ar_value) {
					$ar_dedalo_countries[] = $dedalo_country;
				}
				#dump($ar_dedalo_countries, '$ar_dedalo_countries ++ '.to_string());die();
				break;
			
			case 'fields':

				# POINTER TARGET COMPONENT (Normally component_autocomplete_ts)
				$target_component_tipo  = RecordObj_dd::get_ar_terminos_relacionados($options->curent_children_tipo, true, true)[0];
				$modelo_name 			= RecordObj_dd::get_modelo_name_by_tipo($target_component_tipo,true); 
				$section_tipo 			= $options->section_tipo;
				if (empty($section_tipo)) {
					$section_tipo = RecordObj_dd::get_ar_terminoID_by_modelo_name_and_relation($target_component_tipo, 'section', 'parent')[0];
						#dump($section_tipo, ' var ++ calculated from '.$modelo_name.' - '.to_string($target_component_tipo));
				}
				$target_component 	 	= component_common::get_instance($modelo_name,	// component_autocomplete_ts
																		 $target_component_tipo,
																		 $options->parent,
																		 'edit',
																		 $options->lang,
																		 $section_tipo,
																		 false );
				$dato   				= $target_component->get_dato(); # Dato is a ts term like 'es623'
				if (is_array($dato)) {

					# CASE VERSION >= 4.0.0	

					$dato_untouch = $dato;				
					$ar_locator   = $dato_untouch;
					#$dato 	 		= $locator->section_tipo; // New format of component_autocomplete_ts is a locator for compatibility with future thesaurus

					foreach ((array)$ar_locator as $key => $locator) {						
					
						if (!empty($locator) && !isset($locator->section_tipo)) debug_log(__METHOD__." section_tipo is not set ".to_string(), logger::WARNING);					
						if (!empty($locator) && !isset($locator->section_id))   debug_log(__METHOD__." section_id is not set ".to_string(), logger::WARNING);

						if (isset($locator->section_tipo) && isset($locator->section_id)) {
							$prefix 	= RecordObj_dd::get_prefix_from_tipo($locator->section_tipo);
							$terminoID 	= $prefix . $locator->section_id;
						}else{
							# Empty record case
							$prefix 	= null;
							$terminoID 	= null;
						}
						break; // Only one by now
					}					
					#debug_log(__METHOD__." Dato is not as expected type string (current: ". gettype($dato_untouch) ."). Changed to: $dato from: ".to_string($dato_untouch), logger::DEBUG);					
				
				}elseif (is_string($dato)) {

					# CASE VERSION < 4.0.0	

					$prefix = RecordObj_dd::get_prefix_from_tipo($dato);
					if(empty($prefix) || !isset($ts_map[$prefix])) throw new Exception("Error Processing Request. Prefix $prefix is not defined in ts_map ($options->ts_map)", 1);
					$terminoID = $dato ; // Pre 4.0 versions
				}
				#dump($dato, ' dato ++ '.to_string($dato_untouch));				

				
				if(empty($prefix)) {
					
					// Filled with empty values
					foreach ((array)reset($ts_map) as $dedalo_country => $ar_value) {
						$ar_dedalo_countries[$dedalo_country] = '';
					}

				}else if(!isset($ts_map[$prefix])) {

					// Filled with the same value
					$first_ts_map = reset($ts_map);					
					foreach ((array)$first_ts_map as $dedalo_country => $ar_value) {
						$ar_dedalo_countries[$dedalo_country] = strip_tags( RecordObj_ts::get_termino_by_tipo($terminoID,$options->lang) );												
					}					

				}else{

					$RecordObj_ts 	= new RecordObj_ts($terminoID);
					$ts_parents  	= (array)$RecordObj_ts->get_ar_parents_of_this();
					# Add self dato to ts parents
					$ts_parents[] 	= $terminoID;
						#dump($ts_parents, ' ts_parents');

					foreach ((array)$ts_map[$prefix] as $dedalo_country => $ar_value) {

						$ar_dedalo_countries[$dedalo_country] = (string)''; # Defined and Empty default

						foreach ($ts_parents as $current_parent) {
							$RecordObj_ts 	= new RecordObj_ts($current_parent);
							$modelo 	  	= $RecordObj_ts->get_modelo();	# Model of parent like 'es8869'
							if (in_array($modelo, $ar_value)) {
								$ar_dedalo_countries[$dedalo_country] = strip_tags( RecordObj_ts::get_termino_by_tipo($current_parent,$options->lang) );
							}else{
								#$ar_dedalo_countries[$dedalo_country] = '';
							}
						}

					}#end foreach
				}
				#dump($ar_dedalo_countries, ' ar_dedalo_countries for parent:'.$options->parent);
				break;
		}#end switch $options->request
		#dump($ar_dedalo_countries, ' ar_dedalo_countries ++ '.to_string($options));	
		
		return (array)$ar_dedalo_countries;
	}#end get_ar_dedalo_countries



	/**
	* GET_DIFFUSION_DOMAINS
	* Get array of ALL diffusion domains in struture
	*/
	public static function get_diffusion_domains() {

		$diffusion_domains = RecordObj_dd::get_ar_terminoID_by_modelo_name_and_relation(DEDALO_DIFFUSION_TIPO, $modelo_name='diffusion_domain', $relation_type='children');
			#dump($tipo_filter_master,'$tipo_filter_master');

		return $diffusion_domains;
	}
	


	/**
	* GET_MY_DIFFUSION_DOMAIN
	* Get only one diffusion domain by tipo
	* Note: Define 'class_name' in propiedades of current desired diffusion element like {"class_name":"diffusion_index_ts"}
	* @param string $diffusion_domain_name like 'dedalo'
	* @param string $current_children like 'diffusion_index_ts'
	* @return string $current_children like 'dd15'
	*/
	public static function get_my_diffusion_domain($diffusion_domain_name, $caller_class_name) {
		#return (array)$caller_class_name;
	
		# Array of all diffusion domains
		$diffusion_domains = (array)diffusion::get_diffusion_domains();
			#dump($diffusion_domains,'$diffusion_domains');

		foreach ($diffusion_domains as $current_tipo) {
			
			$current_name = RecordObj_dd::get_termino_by_tipo($current_tipo,null,true);

			if($current_name===$diffusion_domain_name) {				

				/**/
				#
				# NUEVO MODO (más rápido) : Por propiedad 'class_name' . Evita la necesidad de utilizar el modelo cuando no es un modelo estándar de Dédalo
				$ar_childrens = RecordObj_dd::get_ar_childrens($current_tipo);
				foreach ($ar_childrens as $current_children) {
				 	
				 	$RecordObj_dd = new RecordObj_dd($current_children);
					$propiedades  = json_decode( $RecordObj_dd->get_propiedades() );
						#dump($propiedades, ' propiedades '.$current_children);

					if ($propiedades && property_exists($propiedades->diffusion, 'class_name') && $propiedades->diffusion->class_name===$caller_class_name) {
						return (string)$current_children;
					}
				}

				/* OLD WORLD
				$my_diffusion_domain = RecordObj_dd::get_ar_terminoID_by_modelo_name_and_relation($current_tipo, $modelo_name=$caller_class_name, $relation_type='children');
					dump($my_diffusion_domain, "current_name:$current_name - diffusion_domain_name:$diffusion_domain_name - caller_class_name:$caller_class_name");

				return (array)$my_diffusion_domain;
				*/
			}
		}
	}//end get_my_diffusion_domain



	/**
	* GET_SINGLE_DIFFUSION_MAP
	* Get diffusion mapa of current only one section
	* @return 
	*/
	public function get_single_diffusion_map( $section_tipo ) {
		$diffusion_map = array();	

		$domain = $this->domain;
		
		$domain = 'diffusion_index_ts';


		# DIFFUSION_DOMAIN : Get structure tipo of current ('dedalo') diffusion_index_ts
		$diffusion_domain = diffusion::get_my_diffusion_domain($domain, get_called_class());
			dump($diffusion_domain, ' diffusion_domain ++ '.to_string($domain));

		# DIFFUSION_SECTIONS : Get sections defined in structure to view
		$ar_diffusion_section = RecordObj_dd::get_ar_terminoID_by_modelo_name_and_relation($diffusion_domain, 'diffusion_section', 'children');	
			dump($ar_diffusion_section, ' ar_diffusion_section ++ '.to_string());

		# DIFFUSION_SECTIONS : Recorremos las secciones de difusión para localizar las coincidencias con los tipos de sección de las indexaciones
		foreach ($ar_diffusion_section as $diffusion_section_tipo) {
							
			# diffusion_section_tipo ar_relateds_terms
			$ar_current_section_tipo = RecordObj_dd::get_ar_terminoID_by_modelo_name_and_relation($diffusion_section_tipo, 'section', 'termino_relacionado');
			$current_section_tipo 	 = $ar_current_section_tipo[0];
			
			if ($current_section_tipo === $section_tipo) {

				# HEAD 
				$diffusion_head_tipo 		 = RecordObj_dd::get_ar_terminoID_by_modelo_name_and_relation($diffusion_section_tipo, $modelo_name='diffusion_head', $relation_type='children')[0];
					#dump($diffusion_section_tipo,'$diffusion_section_tipo');				
				$ar_diffusion_head_childrens = RecordObj_dd::get_ar_terminoID_by_modelo_name_and_relation($diffusion_head_tipo, $modelo_name='diffusion_component', $relation_type='children');
					#dump($ar_diffusion_head_childrens,'$ar_diffusion_head_childrens');
				$diffusion_map['head'][$current_section_tipo] =  $ar_diffusion_head_childrens ;
					#dump($diffusion_map,'$diffusion_map');

				return $diffusion_map;
				break;
			}
		}

		return false;
	}#end get_single_diffusion_map


	
	/**
	* GET_ALL_TS_RECORDS
	* @return array
	*/
	public static function get_all_ts_records( $table, $root=0 ) {

		$start_time = start_time();

		$root_tipo = $table.$root;
		$RecordObj_ts = new RecordObj_ts( $root_tipo );
		$options = new stdClass();
			#$options->visible 		= 'si';
			$options->esmodelo 		= 'no';
			#$options->esdescriptor 	= 'si';	// deactivated to allow non descriptors
		$ar_childrens = $RecordObj_ts->get_ar_recursive_childrens_with_options($root_tipo, 0, $options); // $terminoID, $is_recursion=0, $options=null
			#dump($ar_childrens, ' ar_childrens ++ '.$root_tipo.' - '.to_string($options));

		if(empty($ar_childrens)) {
			debug_log(__METHOD__." 0 terms was found in thesaurus. Please review column 'visible' is set to 'si' to publish ".to_string($options), logger::WARNING);
		}	
		debug_log(__METHOD__." exec_time secs: [".count($ar_childrens)." items] ".exec_time_unit($start_time,'secs')." - memory_get_usage: ".memory_get_usage(), logger::DEBUG);
		

		return $ar_childrens;
	}#end get_all_ts_records
	


	/**
	* GET_AR_DIFFUSION_MAP
	* Get and set ar_diffusion_map of current domain ($this->domain)
	* @param string $diffusion_domain_name . Like 'aup'
	* @return object $entity_diffusion_tables
	*/
	public static function get_ar_diffusion_map( $diffusion_domain_name=DEDALO_DIFFUSION_DOMAIN ) {

		static $ar_diffusion_map;

		if (isset($ar_diffusion_map)) {
			return $ar_diffusion_map;
		}

		$ar_diffusion_map = new stdClass();

		#
		# DIFFUSION DOMAIN
		# Find all diffusion domains and select the domain name equal to $diffusion_domain_name
		$ar_all_diffusion_domains = diffusion::get_diffusion_domains();
		foreach ($ar_all_diffusion_domains as $current_diffusion_domain_tipo) {
			$name = RecordObj_dd::get_termino_by_tipo($current_diffusion_domain_tipo, DEDALO_STRUCTURE_LANG, true, false); 
			if ($name===$diffusion_domain_name) {
				$diffusion_domain_tipo = $current_diffusion_domain_tipo;
					#dump($diffusion_domain_tipo, ' $diffusion_domain_tipo ++ '.to_string($diffusion_domain_name));
			}
		}
		if (!isset($diffusion_domain_tipo)) return $ar_diffusion_map; // Not found entity name as diffusion domain

		#
		# DIFFUSION_GROUP
		# Search inside current diffusion_domain and iterate all diffusion_group
		$ar_diffusion_group = RecordObj_dd::get_ar_terminoID_by_modelo_name_and_relation($diffusion_domain_tipo, $modelo_name='diffusion_group', $relation_type='children', $search_exact=true);
			#dump($ar_diffusion_element_tipo, ' ar_diffusion_element_tipo ++ '.to_string());
		foreach ($ar_diffusion_group as $diffusion_group_tipo) {

			$ar_diffusion_map->{$diffusion_group_tipo} = array();

			#
			# DIFFUSION_ELEMENT
			# Search inside current diffusion_group and iterate all diffusion_element
			$ar_diffusion_element_tipo = RecordObj_dd::get_ar_terminoID_by_modelo_name_and_relation($diffusion_group_tipo, $modelo_name='diffusion_element', $relation_type='children', $search_exact=true);
				#dump($ar_diffusion_element_tipo, ' ar_diffusion_element_tipo ++ '.to_string());
			foreach ($ar_diffusion_element_tipo as $element_tipo) {
				
				$RecordObj_dd = new RecordObj_dd($element_tipo);
					$propiedades  = json_decode($RecordObj_dd->get_propiedades());					
					$diffusion_class_name = isset($propiedades->diffusion->class_name) ? $propiedades->diffusion->class_name : null;
					$name = RecordObj_dd::get_termino_by_tipo($element_tipo, DEDALO_STRUCTURE_LANG, true, false);

					# Database of current diffusion element
					$ar_children 			 = RecordObj_dd::get_ar_terminoID_by_modelo_name_and_relation($element_tipo, $modelo_name='database', $relation_type='children', $search_exact=true);
					$diffusion_database_name = RecordObj_dd::get_termino_by_tipo(reset($ar_children), DEDALO_STRUCTURE_LANG, true, false);

					$data = new stdClass();
						$data->element_tipo = $element_tipo;
						$data->name 		= $name;
						$data->class_name 	= $diffusion_class_name;
						$data->database_name= $diffusion_database_name;
							#dump($ar_diffusion_map->$diffusion_group_tipo[]=4, ' ar_diffusion_map_elements ++ '.to_string());				
				
					$ar_diffusion_map->{$diffusion_group_tipo}[] = $data;

			}#foreach ($ar_diffusion_element_tipo as $element_tipo)			

		}//end foreach ($ar_diffusion_group as $diffusion_group_tipo)		

		return (object)$ar_diffusion_map;		
	}#end get_ar_diffusion_map



	/**
	* GET_AR_DIFFUSION_MAP_ELEMENTS
	* @return array $ar_diffusion_map_elements
	*/
	public static function get_ar_diffusion_map_elements( $diffusion_domain_name=DEDALO_DIFFUSION_DOMAIN ) {
		
		$ar_diffusion_map = self::get_ar_diffusion_map($diffusion_domain_name);
		
		# Get only diffusion_elements, ignore groups
		$ar_diffusion_map_elements=array();
		foreach ($ar_diffusion_map as $ar_value) foreach ($ar_value as $group_tipo => $obj_value) {			
			$ar_diffusion_map_elements[$obj_value->element_tipo] = $obj_value;					
		}		

		return $ar_diffusion_map_elements;
	}#end get_ar_diffusion_map_elements
	


	/**
	* UPDATE_RECORD
	*/
	public function update_record( $request_options, $resolve_references=false ) {
		// Override in every heritage class
		throw new Exception("Error Processing Request", 1);		
	}



	/**
	* DIFFUSION_COMPLETE_DUMP
	* @return 
	*/
	public function diffusion_complete_dump($diffusion_element, $resolve_references = true) {
		// Override in every heritage class
		throw new Exception("Error Processing Request", 1);	
	}#end diffusion_complete_dump

	


}//end class
?>