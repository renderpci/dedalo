<?php
/*
* CLASS DIFFUSION_SECTION_STATS
*/
#require_once 'class.activity_preprocess.php';
#require_once 'class.section_preprocess.php';

# tipo de las secciones de estadísticas diarias
define('DEDALO_DAILY_STATS_SECTION_TIPO', 'dd70');



class diffusion_section_stats extends diffusion {
	
	protected $section_tipo;
	protected $caller_section_tipo;
	protected $section_stats_tipo;		# Like dd70
	protected $ar_diffusion_section;
	#protected $ar_diffusion_map;	

	protected $fecha;

	static $geoip_mm;

	protected $diffusion_map_object;	# Current stored diffusion_map data
	protected $js_ar_obj;	# Final object for send to javascript diffusion_section_stats.build_charts


	/**
	* CONSTRUCT
	*/
	function __construct( $caller_section_tipo=NULL, $fecha ) {

		if (empty($caller_section_tipo)) {
			#throw new Exception("Error Processing Request. Empty caller_section_tipo", 1);
		}		
		$this->caller_section_tipo = $caller_section_tipo;
		$this->fecha = $fecha;


		$this->domain = 'dedalo';
		//parent::__construct();
	}


	/**
	* GET_AR_DIFFUSION_MAP
	* Retrieves the configuration defined in the thesaurus (structure) for the given section statistics (ar_section_top_tipo)
	* Format example:
	* ..
	*/
	public function get_ar_diffusion_map( $ar_section_top_tipo=array() ) {	
		#dump($ar_section_top_tipo,'$ar_section_top_tipo');

		if (isset($this->ar_diffusion_map)) {
			return $this->ar_diffusion_map;
		}

		#if(SHOW_DEBUG) $start_time = start_time();

		$ar_diffusion_map = array();

		# DIFFUSION STRUCTURE

			# DIFFUSION_DOMAIN : Get structure tipo of current ('dedalo') diffusion_section_stats
			$diffusion_domain = diffusion::get_my_diffusion_domain( $this->domain ,get_called_class());
				#dump($diffusion_domain,'$diffusion_domain');

			# SECTION_STATS_TIPO (Like dd70)
			$this->section_stats_tipo = RecordObj_dd::get_ar_terminoID_by_modelo_name_and_relation($diffusion_domain, 'section', 'children')[0];
				#dump($this->section_stats_tipo,'$section_stats_tipo');

			#
			# DIFFUSION_SECTIONS : Get all sections defined in structure to view
			$this->ar_diffusion_section = (array)RecordObj_dd::get_ar_terminoID_by_modelo_name_and_relation($this->section_stats_tipo, $modelo_name='component_stats', $relation_type='children');
				#dump($this->ar_diffusion_section,'$this->ar_diffusion_section');

				foreach ($this->ar_diffusion_section as $current_diffusion_section_tipo) {

					# Real section pointed by current stats element
					$current_real_section_tipo = RecordObj_dd::get_ar_terminoID_by_modelo_name_and_relation($current_diffusion_section_tipo, $modelo_name='section', $relation_type='termino_relacionado')[0];
						#dump($current_real_section_tipo,'$current_real_section_tipo');
					
					# current_real_section_tipo : Verify
					if (empty($current_real_section_tipo)) {
						throw new Exception("Error Processing Request get_ar_diffusion_section_map: diffusion section related is empty. Please configure structure with one diffusion section related", 1);
					}

					# Filterd mode Skip not desired sections
					if(!empty($ar_section_top_tipo)) {
						if (!in_array($current_real_section_tipo, (array)$ar_section_top_tipo)) continue; 	# Skip not desired sections
					}

					# LIST 
					$RecordObj_dd = new RecordObj_dd($current_diffusion_section_tipo);
					$ar_childrens = $RecordObj_dd->get_ar_childrens_of_this();
						#dump($ar_childrens,"ar_childrens ");
					
					# $THIS->AR_DIFFUSION_MAP
					$ar_diffusion_map[$current_diffusion_section_tipo] = new stdClass();
					$ar_diffusion_map[$current_diffusion_section_tipo]->section = $current_real_section_tipo;
					foreach ($ar_childrens as $current_children) {
						$ar_diffusion_map[$current_diffusion_section_tipo]->components[$current_children] = RecordObj_dd::get_ar_terminoID_by_modelo_name_and_relation($current_children, $modelo_name='component', $relation_type='termino_relacionado');
					}	
				
				}#end foreach ($ar_diffusion_section as $current_diffusion_section_tipo
				#dump($ar_diffusion_map,"this->ar_diffusion_map ");#die();

		#if(SHOW_DEBUG) dump( exec_time($start_time, __METHOD__) );

		# Fix
		$this->ar_diffusion_map = $ar_diffusion_map;
			#dump($this->ar_diffusion_map,"this->ar_diffusion_map ");#die();

		return $this->ar_diffusion_map;
	}


	/**
	* GET_DATES_SQL_FROM_RANGE
	*/
	public static function get_dates_sql_from_range($start, $end, $date_format='Y-m-d') {
		$dates_sql_from_range='';

		$interval = new DateInterval('P1D');

		$realEnd = new DateTime($end);
		$realEnd->add($interval);

		$period = new DatePeriod(
			 new DateTime($start),
			 $interval,
			 $realEnd
		);
		
		if (count($period)>0) {
			foreach($period as $date) {
				$current_date 	= $date->format($date_format);
				#$array[] 		= $current_date;
				$dates_sql_from_range .= " datos#>>'{created_date}' LIKE '$current_date%' OR \n";				
			}
			$dates_sql_from_range = substr($dates_sql_from_range, 1, -5);
			$dates_sql_from_range = "\n($dates_sql_from_range)";
		}
		return $dates_sql_from_range;
	}

	/**
	* GET_DATE_SQL
	* Build sql code of full range from date_in to date_out
	*/
	public static function get_date_sql($date_in, $date_out=null) {
		$date_sql='';

		if ( empty($date_out) || (strlen($date_in) != strlen($date_out)) ) {
			# ONE DATE ONLY (IN)
			#$date_sql = "datos#>>'{created_date}' LIKE '$date_in%'";
			$date_in_zero = substr($date_in, 0, 10)." 00:00:00";
			$date_sql .= "date >= '$date_in_zero'::timestamp";
		}else{
			# TWO DATES (RANGE IN/OUT)
			#$date_sql = self::get_dates_sql_from_range($date_in, $date_out);
			$date_sql .= "date BETWEEN '$date_in'::timestamp AND '$date_out'::timestamp ";
		}
		$date_sql = "\n-- filter_by_date --\nAND $date_sql";

		return (string)$date_sql;
	}


	/**
	* GET_STATS
	*/
	protected function get_stats( $options_received=null ) {
		$start_time=microtime(1);

		$options = new stdClass();
			$options->section_tipo  = $this->caller_section_tipo;
			$options->fecha 		= array(
											component_date::get_timestamp_now_for_db( array('sub'=>'P365D') ), # 7 days ago
											component_date::get_timestamp_now_for_db()	# Today
											);

			# options_received overwrite options defaults
			if(!empty($options_received)) foreach ((object)$options_received as $key => $value) {
				# Si la propiedad recibida en el array options_received existe en sql_options, la sobreescribimos
				#if (isset($options->$key)) {
				if (property_exists($options, $key)) {
					$options->$key = $value;
					#dump($value, "key: $key changed from ", array());
				}
			}
			#dump($options,"options");

		# AR_DIFFUSION_MAP : Full map
		$ar_diffusion_map = $this->get_ar_diffusion_map( $options->section_tipo );	#$options->section_tipo - dd542
			#dump($ar_diffusion_map,'$ar_diffusion_map '); die();

		$this->diffusion_map_object = new stdClass();		

		# ITERATE ALL SECTIONS (included activity)
		foreach ($ar_diffusion_map as $stats_tipo => $current_obj) {

			$section_tipo = $current_obj->section;
			$this->diffusion_map_object->$section_tipo = new stdClass();

			$cn=0;foreach ($current_obj->components as $current_component_tipo => $current_component_target_tipo) {
				
				if ($current_component_tipo=='dd1093') continue; # Skip field 'dato' stats
				#if ($current_component_tipo=='dd1071') continue; # skip quien (2 values)
				/*
				if ($current_component_tipo=='dd1070') continue; # skip ip
				if ($current_component_tipo=='dd1071') continue; # skip quien (2 values)
				if ($current_component_tipo=='dd1072') continue; # skip que
				if ($current_component_tipo=='dd1073') continue; # skip donde
				if ($current_component_tipo=='dd1074') continue; # skip when
				*/
				#if ($current_component_tipo!='dd1061') continue; 
				#if ($current_component_tipo=='dd1061') continue;

				$RecordObj_dd 				= new RecordObj_dd($current_component_tipo);	
				$propiedades 				= $RecordObj_dd->get_propiedades();				

				#
				# DIFFUSION_MAP_OBJECT
				#
				$current_obj->title		 	= (string)RecordObj_dd::get_termino_by_tipo($current_component_tipo, DEDALO_DATA_LANG, true);
				$current_obj->graph_type 	= (string)RecordObj_dd::get_modelo_name_by_tipo($current_component_tipo);
				$current_obj->propiedades 	= json_handler::decode($propiedades);
					#dump($ar_diffusion_map,'$ar_diffusion_map '); die();


				$ar_related_component_tipo 	= $current_obj->components[$current_component_tipo];
					#dump($ar_related_component_tipo,'$ar_related_component_tipo '); die();
				#
				# SQL
				$sql_columns='';
				$sql_group='';
				$change_section = false;
					
					$i=0;foreach ($ar_related_component_tipo as $current_column_tipo) {
						$current_column_tipo_orig = $current_column_tipo;
						# current_lang
						$RecordObj_dd 	= new RecordObj_dd($current_column_tipo);
						$model_name 	= $RecordObj_dd->get_modelo_name();	
						$traducible 	= $RecordObj_dd->get_traducible();
						if ($traducible!='si') {
							$current_lang = DEDALO_DATA_NOLAN;
						}else{
							$current_lang = DEDALO_DATA_LANG;
						}
						#dump($model_name,'$model_name '); die();
						
						#
						# PORTALES
						# Case portals change sql query and current column tipo
						if($model_name == 'component_portal'){
							$current_column_tipo = $current_obj->propiedades->portal_list[0];
							$RecordObj_dd 		 = new RecordObj_dd($current_column_tipo);
							$model_name 		 = $RecordObj_dd->get_modelo_name();	
							$traducible 		 = $RecordObj_dd->get_traducible();
							if ($traducible!='si') {
								$current_lang = DEDALO_DATA_NOLAN;
							}else{
								$current_lang = DEDALO_DATA_LANG;
							}
							$change_section = true;
							$section_tipo_portal = component_common::get_section_tipo_from_component_tipo($current_column_tipo);
							#dump($section_tipo,'$section_tipo');							
						}

						# COLUMNS
						if ($i<1) {
						$sql_columns .= "\n COUNT (datos#>>'{components, $current_column_tipo, dato, $current_lang}') AS count,";
						}
						switch (true) {

							case ($current_component_tipo=='dd1074') : # 'When' column (activity time is grouped by hour like '2014-10-23 21:56:49' => '21')
								$sql_columns .= "\n substr(datos#>>'{components, $current_column_tipo, dato, $current_lang}', 12, 2) AS $current_column_tipo";	
								break;
							
							default:
								$sql_columns .= "\n datos#>>'{components, $current_column_tipo, dato, $current_lang}' AS $current_column_tipo";	
						}											

						# GROUP BY 
						if ($i<1) {
						$sql_group .= "\nGROUP BY";
						}
						#$sql_group .= "\n datos#>>'{components, $current_column_tipo, dato, $current_lang}'";
						$sql_group .= " $current_column_tipo";

						if ($current_column_tipo_orig != end($ar_related_component_tipo)) {
							$sql_columns .= ',';
							$sql_group .= ',';
						}

					$i++;}
					
						# DATE
						if ($section_tipo==DEDALO_ACTIVITY_SECTION_TIPO) {
						$date_filter = self::get_date_sql(
											$options->fecha[0],
											$options->fecha[1]
										);
						}else{
						$date_filter = '';	
						}
						

			
					$current_matrix_table 	= common::get_matrix_table_from_tipo($section_tipo);
					$filter_options = new stdClass();
					/*
					* If the model of the component is a portal the reference of the top tipo (creator top tipo) is the filter, because some portals can have the same info for two types of Heritage or OH
					*/
					if ($change_section){
						$filter_by_section_tipo = "\n-- section_creator_top_tipo -- \n datos@>'{\"section_creator_top_tipo\":\"$section_tipo\"}'::jsonb ";
						$filter_options->section_tipo 	= $section_tipo_portal;			

					}else{
						$filter_by_section_tipo = "\n-- filter_by_section_tipo -- \n section_tipo = '$section_tipo' ";
						$filter_options->section_tipo 	= $section_tipo;			
						
					}
			
					$filter_by_projects		= filter::get_sql_filter($filter_options);
					$filter_by_date			= $date_filter;
					$filter_group			= $sql_group;
					$strQuery ="\nSELECT $sql_columns \n FROM \"$current_matrix_table\" \nWHERE $filter_by_section_tipo $filter_by_projects $filter_by_date $filter_group ORDER BY count DESC\n";
						#dump($strQuery,"strQuery");
						#echo "<pre>$strQuery</pre><hr>";
					#dump($strQuery,'$strQuery');
					$result	= JSON_RecordObj_matrix::search_free($strQuery);
					
					$sql_time = round(microtime(1)-$start_time,3);
					
					#
					# 1 Construimos el array de la tabla temporal en base a los registros obtenidos en el query	
					$ar_stats=array();
					$stats_obj=new stdClass();
					# Rows
					$r=0; while ($rows = pg_fetch_assoc($result)) {
						
						# Columns
						$c=0; while ($c < pg_num_fields($result)) {

							$fieldName = pg_field_name($result, $c);	# Select column left to right
								#dump($fieldName, 'fieldName', array());							
							$ar_stats[$r][$fieldName] = $rows[$fieldName];
							
						$c++;}
						if(empty($ar_stats[$r]['count']) ){
							unset($ar_stats[$r]);
						}else{
							$ar_stats[$r] = array_reverse($ar_stats[$r]);
						};
					
							#dump($ar_stats[$r], '$ar_stats[$r]', array());
						
					$r++;}
					#dump($ar_stats,'$ar_stats '); #die();
					#
					# EXAMPLE RESULT FORMAT OF 'ar_stats'
					# Array (
					#    [0] => Array
					#        (
					#            [dd544] => 192.168.0.7
					#            [count] => 14
					#        )
					#    [1] => Array
					#        (
					#            [dd544] => localhost
					#            [count] => 7
					#        )    
					# )
					# dump($ar_stats, 'ar_stats', array());

					# JS_AR_OBJ : Configure and store current element of array for js build charts
					$js_obj = new stdClass();
						$js_obj->title 		= $current_obj->title ;
						$js_obj->tipo 		= $current_component_tipo ;
						if(SHOW_DEBUG) {
							$js_obj->title .=  " <span>($current_obj->graph_type)</span>";
						}
						$js_obj->graph_type = $current_obj->graph_type;						
						$js_obj->data 		= $this->washer($ar_stats, $current_component_tipo, $current_obj->propiedades);
					$this->js_ar_obj[] = $js_obj;

					# DIFFUSION_MAP_OBJECT					
					#$this->diffusion_map_object = new stdClass();
					#$this->diffusion_map_object->$section_tipo = new stdClass();
					$this->diffusion_map_object->$section_tipo->$current_component_tipo = new stdClass();		
					$this->diffusion_map_object->$section_tipo->$current_component_tipo->ar_stats 	= $ar_stats;
					$this->diffusion_map_object->$section_tipo->$current_component_tipo->js_obj 	= $js_obj;

					# Debug
					$this->diffusion_map_object->$section_tipo->$current_component_tipo->debug = new stdClass();
					$this->diffusion_map_object->$section_tipo->$current_component_tipo->debug->sql_time = $sql_time;	
					$this->diffusion_map_object->$section_tipo->$current_component_tipo->debug->strQuery = $strQuery;					

				$cn++;
				#if ($cn>=1) 
				#break;								
			}
			
			break;
		}
		#dump($this->diffusion_map_object, 'this->diffusion_map_object', array());

		if(SHOW_DEBUG) {
			echo "<span style=\"float:left\">Time To Generate stats ".round(microtime(1)-$start_time,3)."</span>";
			#dump( $this->diffusion_map_object, 'var', array());;
		}
		
		return $this->js_ar_obj;

	}#end get_stats


	/**
	* WASHER
	*/
	/* Schema output example
	[ 
	  {
	    key: 'Series1',
	    values: [
	      { 
	        "label" : "Group A" ,
	        "value" : -1.8746444827653
	      } , 
	      { 
	        "label" : "Group B" ,
	        "value" : -8.0961543492239
	      }	     
	    ]
	  }
	]
	*/
	public function washer($ar_stats, $component_tipo, $propiedades) {
		$ar_stats_obj_resolved 	= array();

		$x_axis = 'x';
		$y_axis = 'y';
		$added_extras=false;

		if ( !isset($ar_stats[0]) || count($ar_stats[0])>2 ) {
			trigger_error("Sorry, not implemented yet for complex graphs");
			return false;
		}

		$ar_data=array();
			
			$current_obj=new stdClass();
			$current_obj->key 	 =  "Series1";
			$current_obj->values =  array();

				#dump($ar_stats,"ar_stats");
				foreach ((array)$ar_stats as $ar_value) {					

					# Get first value of current array element. Ex. 'lg-eng' for
					# (
					#	[dd27] => lg-eng
					#	[count] => 13
					# )
					$key 		= reset($ar_value);  

					# Get first key of current array element. Ex. 'dd27' for
					# (
					#	[dd27] => lg-eng
					#	[count] => 13
					# )
					$first_key 	= key($ar_value);

					# Get last value of current array element. Ex. '13' for
					# (
					#	[dd27] => lg-eng
					#	[count] => 13
					# )
					$value 		= end($ar_value);

					# Get model name when is applicable (used to discriminate options)
					$modelo_name=false;
					#if (strpos($first_key, 'dd')===0) {
						$modelo_name = RecordObj_dd::get_modelo_name_by_tipo($first_key,true);
					#}
						#dump($modelo_name,'$modelo_name');
					switch (true) { 
						
						# ACTIVITY : IP Address
						case ($component_tipo=='dd1070'):
							$current_value_obj=new stdClass();
							$current_value_obj->$x_axis = (string)$key;
							$current_value_obj->$y_axis = (int)$value;
							$current_obj->values[] = $current_value_obj;
							break;
						
						# ACTIVITY : WHEN : Activity time
						case ($component_tipo=='dd1074'):						
							if (!$added_extras) {
								for ($i=0; $i < count($ar_stats) ; $i++) {
									$ar_existing_hours[] = $ar_stats[$i]['dd547'];
								}
								# Breakdown for 24 hours	
								$range = range(0,23);
								foreach ($range as $current_hour) {
									if (!in_array($current_hour, $ar_existing_hours)) {
										$current_value_obj=new stdClass();
										$current_value_obj->$x_axis = (string)$current_hour;
										$current_value_obj->$y_axis = intval(0);
										$current_obj->values[] = $current_value_obj;
									}
								}
								$added_extras=true;
							}
							$current_value_obj=new stdClass();
							$current_value_obj->$x_axis = (string)$key;
							$current_value_obj->$y_axis = intval($value);
							$current_obj->values[] = $current_value_obj;
							break;

						# ACTIVITY : Who
						case ($component_tipo=='dd1071'):
							$key = json_decode($key);
							$component_current = component_common::get_instance('component_input_text', DEDALO_USER_NAME_TIPO, $key->section_id, 'edit', DEDALO_DATA_NOLAN,$key->section_tipo);
							$component_value	= $component_current->get_valor(); 	#dump($component_value,"component_value for $first_key - $key - $modelo_name");
							if (empty($component_value)) {
								$component_value='na';
							}
							$current_value_obj=new stdClass();
							$current_value_obj->$x_axis = (string)$component_value;
							$current_value_obj->$y_axis = intval($value);
							$current_obj->values[] = $current_value_obj;
							break;

						# PROJECTS : components with model component_filter
						case ($modelo_name=='component_filter'):
							if(!isset($table_temp)) $table_temp=array();
							# Convert json data like '{"2": "2", "4": "2"}' to php array and get only keys like 'Array("2","4")' 
							$ar_keys = array_keys( (array)json_handler::decode($key,true) );
								#dump($ar_keys, 'ar_keys', array());
								#dump($value, 'value', array());
							if(is_array($ar_keys)) foreach ($ar_keys as $current_kvalue) {
								if (!isset($table_temp[$current_kvalue])) {
									$table_temp[$current_kvalue]  = (int)1 * $value;
								}else{
									$table_temp[$current_kvalue] += (int)$value;
								}								
							}else{
								error_log("WARNING: ar_keys expected array. Instead, given: ".gettype($ar_keys) );
							}							

							if ( $ar_value == end($ar_stats) ) {
								#dump($ar_value, ' ar_value'); dump($key, "key first_key: $first_key - value : $value");
								foreach ($table_temp as $tkey => $tvalue) {
									
									# Get value of 'component_input_text' from section project id (tipo is fixed: DEDALO_PROJECTS_NAME_TIPO)
									$component_filter = component_common::get_instance('component_input_text', DEDALO_PROJECTS_NAME_TIPO, $tkey, 'edit', DEDALO_DATA_LANG, DEDALO_SECTION_PROJECTS_TIPO);								
									$component_value  = $component_filter->get_valor();
									$component_dato   = $component_filter->get_dato();
									
									#$component_filter = component_common::get_instance($modelo_name, $first_key, null);
									#$component_filter->set_dato($key);					
									#$component_value  = $component_filter->get_valor();

									if(SHOW_DEBUG) {
										#dump($component_filter, 'valor para $tkey:'.$tkey.' - tvalue:'.$tvalue.' - DEDALO_PROJECTS_NAME_TIPO:'.DEDALO_PROJECTS_NAME_TIPO);
									}										

									$current_value_obj=new stdClass();
									$current_value_obj->$x_axis = (string)$component_value;
									if(SHOW_DEBUG) {
										$current_value_obj->$x_axis .= " [$tkey]";
									}
									$current_value_obj->$y_axis = (int)$tvalue;
									$current_obj->values[] = $current_value_obj;
								}
							}							
							break;
						
						# COMPONENT SELECT : component_select, component_select_lang
						case ($modelo_name=='component_dateXX'):
							$current_component 	= component_common::get_instance($modelo_name, $first_key, NULL, 'list', DEDALO_DATA_NOLAN);
							$current_component->set_dato($key);
							#$key_resolved 		= $current_component->get_valor();							
							$key_resolved 	= $current_component->get_valor_local();
								dump($key_resolved, "key_resolved - key: $key - value: ".$value);

								$current_value_obj=new stdClass();
								$current_value_obj->$x_axis = (string)$key_resolved;								
								$current_value_obj->$y_axis = (int)$tvalue;
								$current_obj->values[] = $current_value_obj;				
							break;
						# DEFAULT BEHAVIOR
						default:
							
							#dump($key, "key first_key: $first_key - value : $value");
							if ($key!='count') {//&& strpos($key, 'dd')===0
								try {
									if (intval($key) >0) {
										$current_component 	= component_common::get_instance($modelo_name, $first_key, NULL, 'list');
										$current_component->set_dato($key);
										$key_resolved 		= $current_component->get_valor();
										//dump($first_key, ' first_key');
									}else{
										# Resolve key name ($key_resolved) by get_termino_by_tipo 
										#if( is_string($key) && strlen($key)>2 ) {
										$prefix_from_tipo = RecordObj_dd::get_prefix_from_tipo($key);
										#}										
										if (in_array($prefix_from_tipo, unserialize(DEDALO_PREFIX_TIPOS))) {
											# DEDALO TIPOS (Managed by RecordObj_dd)
											$key_resolved = RecordObj_dd::get_termino_by_tipo( $key, DEDALO_DATA_LANG, true );
										}else{
											# TESAURUS TIPOS (Managed by RecordObj_dd)
											if( is_string($key) && strlen($key)>2 )
											$key_resolved = RecordObj_ts::get_termino_by_tipo( $key, DEDALO_DATA_LANG, true );
										}
										#$key_resolved = RecordObj_ts::get_termino_by_tipo( $key, DEDALO_DATA_LANG, true );										
									}									
								} catch (Exception $e) {
									//dump($first_key, ' first_key');
									if(SHOW_DEBUG) {
										#$first_key_resolved = RecordObj_ts::get_termino_by_tipo( $first_key, DEDALO_DATA_LANG, true );
										#trigger_error("Error on get_termino_by_tipo key:$key, first_key:$first_key, value:$value, modelo_name:$modelo_name, first_key_resolved:$first_key_resolved");
									}else{
										#trigger_error("Error on get_termino_by_tipo key:$key ");
									}
									$key_resolved = $key;
									#dump($key_resolved ,'$key_resolved '.$modelo_name);
									# Get value of 'component_input_text' from section project id (tipo is fixed: DEDALO_PROJECTS_NAME_TIPO)

									$current_component 	= component_common::get_instance($modelo_name, $first_key, NULL, 'list', DEDALO_DATA_LANG);
									$current_component->set_dato($key);
									$key_resolved 		= $current_component->get_valor();
									if ($modelo_name == 'component_date') {
										$key_resolved 	= $current_component->get_valor_local();
									}
								}
							}else{
								$key_resolved = $key;
							}
							
							$key_resolved = strip_tags($key_resolved);
								#dump($key_resolved, ' key_resolved '.$value);
								if (empty($value)) {
									continue; 	# Skip empty data
								}

							#$stats_value_resolved = component_autocomplete_ts::get_stats_value_resolved( $first_key, $ar_stats, 'stats_bar' ,$propiedades ) ;
							#dump($stats_value_resolved, 'stats_value_resolved', array());

							$current_value_obj=new stdClass();
							$current_value_obj->$x_axis = (string)$key_resolved;
							if (empty($current_value_obj->$x_axis)) {
								$current_value_obj->$x_axis = (string)'no avaliable';
							}
							$current_value_obj->$y_axis = (int)$value;
							$current_obj->values[] = $current_value_obj;

							break;

					}#end switch
					
				}#end foreach ((array)$ar_stats as $ar_value)

				# SORT OBJECT ELEMENTS BY X ASC				
				usort($current_obj->values, 'self::sort_elements_by_x');
					#dump($current_obj,"current_obj");
			
			$ar_data[] = $current_obj;		


			#
			# PROPIEDADES OPTIONS
			/*
			if (!empty($propiedades) && is_object($propiedades)) {
				# Propiedades model of js data
				throw new Exception("Error Processing Request. Use of 'propiedades' is not implemented yet", 1);
				#$ar_stats_obj_resolved->key = "Pepe";
				#$ar_stats_obj_resolved->values = $ar_data;

			}else{
				# Default x, y
				$ar_stats_obj_resolved = $ar_data;
			}
			#dump($ar_stats_obj_resolved,"ar_stats_obj_resolved ...");
			*/
			$ar_stats_obj_resolved = $ar_data;

		return $ar_stats_obj_resolved;
	}


	# SORT_ELEMENTS_BY_X
	static function sort_elements_by_x($a, $b) {
		if($a->x == $b->x){ return 0 ; }
		return ($a->x < $b->x) ? -1 : 1;
	}

















































	


	####################### OLD WORLD ###################################################################################################################


	/**
	* GET_MATRIX_STATS
	* Recupera los datos completos de estadísticas de 'matrix_stats' que ya se guardaron con el trigger del cron
	*/
	protected function get_matrix_stats_DEPRECATED( $caller_section_tipo, $fecha_de_los_datos_custom=false ) {
		#$fecha_de_los_datos_custom = "2014-04-26";

		if ($fecha_de_los_datos_custom!==false) {
			# CUSTOM DATE
			# Se le pasa una fecha específica
			# Verificamos el formato de fecha
			preg_match("/\d{4}-\d{2}-\d{2}/", $fecha_de_los_datos_custom, $output_array);
			if (empty($output_array[0])) {
				throw new Exception("Error Processing Request. Wrong date format. Use YYY-MM-DD", 1);
			}
			$fecha_de_los_datos = $fecha_de_los_datos_custom;
		}else{
			# YESTERDAY DATE
			# Por defecto
			$date_yesterday		= component_date::get_timestamp_now_for_db( array('sub'=>'P1D') );
			$fecha_de_los_datos	= date("Y-m-d", strtotime($date_yesterday));				
		}

		# DIFFUSION_DOMAIN : Get structure tipo of current ('dedalo') diffusion_section_stats
			$diffusion_domain = diffusion::get_my_diffusion_domain('dedalo',get_called_class());
				#dump($diffusion_domain,'$diffusion_domain');

			# SECTION_STATS_TIPO
			$section_stats_tipo = RecordObj_dd::get_ar_terminoID_by_modelo_name_and_relation($diffusion_domain, $modelo_name='section', $relation_type='children')[0];
				#dump($section_stats_tipo,'$section_stats_tipo');die();

			# FIX $section_stats_tipo
			$this->section_stats_tipo = $section_stats_tipo;

			# COMPONENT_DATE
			#$component_date = RecordObj_dd::get_ar_terminoID_by_modelo_name_and_relation($section_stats_tipo, $modelo_name='component_date', $relation_type='children')[0];

			# BUSCAMOS CON LA FECHA DADA
			$arguments=array();
			$arguments['strPrimaryKeyName']	= 'parent';
			$arguments['dato:%like%']		= $fecha_de_los_datos ;	#date("Y-m-d", strtotime($timestamp));
			$arguments['parent:not_like']	= 0;
			$matrix_table 					= common::get_matrix_table_from_tipo($section_stats_tipo);
			$RecordObj_matrix				= new RecordObj_matrix($matrix_table,NULL);
			$ar_records						= $RecordObj_matrix->search($arguments);
				#dump($ar_records,"ar_records ".print_r($arguments,true),array('arguments'=>$arguments)); dump(end($ar_records)); return;


			if( empty($ar_records[0]) ) {
				if(SHOW_DEBUG) dump($arguments,'$arguments '.$matrix_table.' '.print_r($ar_records,true));
				$msg = "<div class=\"warning\">Warning. Date $fecha_de_los_datos not found [$matrix_table]</div>";
				#throw new Exception($msg, 1);
				#echo $msg;
				return ;
			} 
			#dump( $ar_records ,'$ar_records');

			# Si hay varios, cogeremos el mas moderno que estará más actualizado
			$parent = end($ar_records);

			# AR_DIFFUSION_MAP : Full map
			$ar_diffusion_map = $this->get_ar_diffusion_section_map( null );
				#dump($ar_diffusion_map,'$ar_diffusion_map');
			
			$ar_final=array();

			foreach ($ar_diffusion_map as $key => $ar_value) {
				
				$related_section_tipo = RecordObj_dd::get_ar_terminoID_by_modelo_name_and_relation($key, $modelo_name='section', $relation_type='termino_relacionado')[0];
					#dump($related_section_tipo,'$related_section_tipo');
				
				$ar_map_related = array();
				foreach ($ar_value as $stats_tipo) {
					
					$related_component_tipo = RecordObj_dd::get_ar_terminoID_by_modelo_name_and_relation($stats_tipo, $modelo_name='component_', $relation_type='termino_relacionado')[0];
						#dump($related_component_tipo,'related_component_tipo ' );
						
						$related_component_modelo = RecordObj_dd::get_modelo_name_by_tipo($related_component_tipo);

						# PORTAL : CASO PORTALES (El tipo es referido por 'portal_list' y definido en propiedades del puntero)
						if ($related_component_modelo=='component_portal') {
							$RecordObj_dd 	= new RecordObj_dd($stats_tipo);
							$propiedades 	= $RecordObj_dd->get_propiedades();
							$propiedades 	= json_decode($propiedades);

							$related_component_tipo = $propiedades->portal_list[0];
								#dump($related_component_tipo,'$related_component_tipo');
						}
					
					$current_modelo = RecordObj_dd::get_modelo_name_by_tipo($stats_tipo);
						#dump($current_modelo,'current_modelo '." $key - ". print_r($stats_tipo,true ) );

					$RecordObj_dd 	= new RecordObj_dd($stats_tipo);
					$propiedades 	= $RecordObj_dd->get_propiedades();
					$propiedades 	= json_decode($propiedades);	
						#dump($propiedades,'propiedades');

					$ar_map_related[$related_component_tipo] = array( 'modelo' => $current_modelo, 'propiedades' => $propiedades );	
				}

				
				##########
				# SECTION : Current section stats from matrix_stats
				if ($related_section_tipo==$caller_section_tipo  ) {
					
					# COMPONENT_STATS
					$component_stats = component_common::get_instance('component_stats', $key,$parent,'stats');
						#dump($component_stats,'component_stats');

					$dato = $component_stats->get_dato()[$related_section_tipo];
						#dump($dato,'dato');

					# FILTER : Apply filter to result
						# Filter records
						$ar_records_filtered = array();
						$ar_records = filter::get_ar_filter($related_section_tipo);
							#dump($ar_records,'ar_records');

						foreach ($ar_records as $key => $current_section_id) {
							if (array_key_exists($current_section_id, $dato)) {
								$ar_records_filtered[$current_section_id] = $dato[$current_section_id];
							}							
						}
						#dump($ar_records_filtered,'$ar_records_filtered');

					
					# PRIMERA PASADA (Suma los valores)
						$results=array();
						$total_records = count($ar_records_filtered);
						foreach ($ar_records_filtered as $ar_value) 
						foreach ($ar_value as $current_component_tipo => $value) {
							
							#dump($current_component_tipo,'$current_component_tipo '.$current_component_tipo);

							$component_modelo_name = RecordObj_dd::get_modelo_name_by_tipo($current_component_tipo);
								#dump($component_modelo_name,'$component_modelo_name');
							$results[$current_component_tipo] = $component_modelo_name::get_stats_value($current_component_tipo, $value);

						}
						#dump($results,'$results');


					# SEGUNDA PASADA (Resuelve los keys)
						$ar_resolved=array();
						foreach ($results as $current_component_tipo => $value) {

							$component_modelo_name 	= RecordObj_dd::get_modelo_name_by_tipo($current_component_tipo);

							# RECUPERA EL MODELO DE GRÁFICO A MOSTRAR (PIE, BAR ...) Y LAS PROPIEDADES
							if ( array_key_exists($current_component_tipo, $ar_map_related) ) {
								$stats_model 		= $ar_map_related[$current_component_tipo]['modelo'];		
								$stats_propiedades 	= $ar_map_related[$current_component_tipo]['propiedades'];
									#dump($stats_model,'stats_model');	
							}
							#dump($component_modelo_name,'component_modelo_name - $current_component_tipo:'.$current_component_tipo." key:".$key);						

							$valor 					= $component_modelo_name::get_stats_value_resolved($current_component_tipo, $results[$current_component_tipo], $stats_model ,$stats_propiedades);
							#$ar_final[] 			= $valor;
							$ar_resolved = array_merge($ar_resolved, $valor);
						}
						$ar_final = array_merge($ar_final, $ar_resolved);
						#dump($ar_final,'$ar_final');

					
				}#end if ($related_section_tipo==$caller_section_tipo) 


				###########
				# ACTIVITY
				if($related_section_tipo==DEDALO_ACTIVITY_SECTION_TIPO ) {

					# COMPONENT_STATS
					$component_stats = component_common::get_instance('component_stats', $key, $parent, 'stats');
						#dump($component_stats,'component_stats');

					$dato = $component_stats->get_dato();
						#dump($dato,'dato');

					$path = array_key_path('section_tipo:'.$caller_section_tipo, $dato);
						#dump($path,'$path');

					if (!$path) {
						#return "No activity data exists for this section";
						return null;
					}

					$ar_section_activity =& array_path($dato, $path);
						#dump($ar_section_activity,'$ar_section_activity section '.$caller_section_tipo);					

					# FILTER
					# Filter records
						$ar_records_filtered = array();
						$ar_records = filter::get_ar_filter(DEDALO_SECTION_USERS_TIPO);
							#dump($ar_records,'ar_records');

						foreach ($ar_records as $key => $current_section_id) {

							if (array_key_exists('userID:'.$current_section_id, $ar_section_activity)) {
								$ar_records_filtered[$current_section_id] = $ar_section_activity['userID:'.$current_section_id];								
							}							
						}
						#dump($ar_records_filtered,'$ar_records_filtered');


					# PRIMERA PASADA (Suma los valores)
						$ar_results=array();
						$total_records 	= count($ar_records_filtered);						
						foreach ($ar_records_filtered as $userID => $ar_value1)
						foreach ($ar_value1 as $key => $ar_value) 
						foreach ($ar_value as $name => $value) {

							if(isset($ar_results[$key][$name]))
								$ar_results[$key][$name] = $ar_results[$key][$name] + $value;
							else
								$ar_results[$key][$name] = $value;
							#dump($value,'value name:'.$name." key:$key");
						}
						#dump($ar_results,'$ar_results');


					# SEGUNDA PASADA (Resuelve los keys)
						$ar_resolved=array();
						foreach ($ar_results as $current_action => $ar_value) {

							$current_action_resolved = label::get_label($current_action);

							switch (true) {
								case ($current_action=='que') :
									foreach ($ar_value as $key => $value) {
										$key_resolved = RecordObj_dd::get_termino_by_tipo( explode(':', $key)[1] );
										$ar_resolved[$current_action_resolved.':stats_pie'][$key_resolved] = $value;
									}
									break;
								case ($current_action=='ip') :
									foreach ($ar_value as $key => $value) {
										
										# GEOIP LIB
										if (empty(self::$geoip_mm)) {
											require_once(DEDALO_ROOT."/lib/geoip/geoipcity.inc");
											require_once(DEDALO_ROOT."/lib/geoip/geoipregionvars.php");
											self::$geoip_mm = geoip_open(DEDALO_ROOT."/lib/geoip/data/GeoLiteCity.dat",GEOIP_STANDARD);
										}
										$record 			= geoip_record_by_addr(self::$geoip_mm,$key);
										if($record) {
											$code 			= $record->country_code ;		
											$city			= utf8_encode($record->city) ;
											$country_name 	= $record->country_name ;
											#$region 		= $record->region ;
											#if($code && $region)
											#$region_name	= $GEOIP_REGION_NAME[$code][$region];
											#$continent_code	= $record->continent_code ;

											$key_resolved = "$key - $city ($country_name)";
										}else{
											$key_resolved = $key;
										}
										#dump($record ,'$record ip '.$key);
										
										$ar_resolved[$current_action_resolved.':stats_bar_horizontal'][$key_resolved] = $value;
											#dump($ar_resolved[$current_action_resolved.':stats_bar'][$key_resolved], " -$key ");
									}
									break;
								case ($current_action=='donde') :
									foreach ($ar_value as $key => $value) {
										$key_resolved = RecordObj_dd::get_termino_by_tipo( $key );
										$ar_resolved[$current_action_resolved.':stats_pie'][$key_resolved] = $value;
									}
									break;
								case ($current_action=='proyecto') :									
									foreach ($ar_value as $key => $value) {
										$key_resolved = component_filter::get_stats_value_resolved_activity( $key );
											#dump($key_resolved,'key_resolved '.$key);
										$ar_resolved[$current_action_resolved.':stats_pie'][$key_resolved] = $value;
									}									
									break;
								case ($current_action=='registros_modificados') :
								case ($current_action=='registros_visualizados') :
									foreach ($ar_value as $key => $value) {
										$section 		= section::get_instance($key,$caller_section_tipo);
										$key_resolved 	= $section->get_section_id();

										$ar_resolved[$current_action_resolved.':stats_pie'][$key_resolved] = $value;
									}
									break;
								case ($current_action=='actividad_horaria') :
									$range = range(0,23);
									foreach ($range as $current_hour) {

										$key_resolved 	= $current_hour.'h';

										if( array_key_exists($current_hour, $ar_value) ) {
											$value = $ar_value[$current_hour];
										}else{
											$value = null;
										}
										$ar_resolved[$current_action_resolved.':stats_bar'][$key_resolved] = $value;
									}																			
									break;	
								default:
									foreach ($ar_value as $key => $value) {
										$key_resolved 	= $key;
										$ar_resolved[$current_action_resolved.':stats_pie'][$key_resolved] = $value;	
									}
									break;
							}							
							$ar_final = array_merge($ar_final, $ar_resolved);
														
						}
						#$ar_final = $results;
						#dump($ar_final,'$ar_final');



				}#end if($related_section_tipo==$this->caller_section_tipo) {


			}#end foreach ($ar_diffusion_map as $key => $value) {

			


			return $ar_final;
	}



	/**
	* SET_MATRIX_STATS
	*
	* Guarda en db 'matrix_stats' los datos actuales de secciones y actividad a modo de 'snap-shot'
	* Este es el método lanzado pr el trigger del cron
	* @param $fecha_de_los_datos_custom . default false. Fecha específica opcional para procesar las estadisticas. Si no se le pasa ninguna, se usará la por defecto:
	* @see Para tener el histórico completo del día, se ejecuta cron a partir de las 00:01 y se almacenan los registros del día completo de ayer (por defecto)
	* En lo posible intentar hacerla a primera hora del día siguiente (00:01 por ejemplo) para asegurarnos de que está el día completo y aprovechar horas de bajo uso del servidor
	* ya que el script puede consumir muchos recursos en el procesado de inventarios grandes
	*/
	public function set_matrix_stats__DEPRECATED( $fecha_de_los_datos_custom=false, $delete_previous_versions=true ) {

		if ($fecha_de_los_datos_custom!==false) {
			# CUSTOM DATE
			# Se le pasa una fecha específica
			# Verificamos el formato de fecha
			preg_match("/\d{4}-\d{2}-\d{2}/", $fecha_de_los_datos_custom, $output_array);
			if (empty($output_array[0])) {
				throw new Exception("Error Processing Request. Wrong date format. Use YYY-MM-DD", 1);
			}
			$fecha_de_los_datos = $fecha_de_los_datos_custom;
		}else{
			# YESTERDAY DATE
			# Para tener el histórico completo del día, se ejecuta cron a las 00:01 y se almacenan
			# los registros del día completo de ayer (por defecto)
			$date_yesterday		= component_date::get_timestamp_now_for_db( array('sub'=>'P1D') );
			$fecha_de_los_datos	= date("Y-m-d", strtotime($date_yesterday));				
		}

		# AR_DIFFUSION_MAP : Full map
		$ar_diffusion_map = $this->get_ar_diffusion_section_map( null );
			#dump($ar_diffusion_map,'$ar_diffusion_map'); die();		

		
		# ITERATE ALL SECTIONS (included activity)
		foreach ($ar_diffusion_map as $section_tipo => $ar_childrens) {
			
			# REAL SECTION TIPO
			$related_section_tipo = RecordObj_dd::get_ar_terminoID_by_modelo_name_and_relation($section_tipo, $modelo_name='section', $relation_type='termino_relacionado')[0];
				dump($related_section_tipo,"ar_data - $section_tipo ".DEDALO_ACTIVITY_SECTION_TIPO);

			switch (true) {
				case ($related_section_tipo==DEDALO_ACTIVITY_SECTION_TIPO) :
					# SECTION DEDALO_ACTIVITY_SECTION_TIPO
					$matrix_section_data = section_preprocess::get_matrix_section_data_activity( $section_tipo, $ar_diffusion_map[$section_tipo], $fecha_de_los_datos );
					$ar_data["ACTIVITY"][$related_section_tipo.":".$section_tipo] = array( $related_section_tipo => activity_preprocess::preprocess_data( $matrix_section_data ) );
					break;
				
				default:
					# STANDAR SECTION STATS
					$matrix_section_data = section_preprocess::get_matrix_section_data( $section_tipo, $ar_diffusion_map[$section_tipo], $fecha_de_los_datos );
					$ar_data["SECTIONS"][$related_section_tipo.":".$section_tipo] = array( $related_section_tipo => $matrix_section_data );
					break;
			}
			dump($matrix_section_data,'matrix_section_data '.$section_tipo); die();

			
			/*
			if($related_section_tipo==DEDALO_ACTIVITY_SECTION_TIPO) {
			# SECTION DEDALO_ACTIVITY_SECTION_TIPO
				$ar_data["ACTIVITY"][$related_section_tipo.":".$section_tipo] = array( $related_section_tipo => activity_preprocess::preprocess_data( $matrix_section_data ) );
			}else{
			# STANDAR SECTION STATS
				$ar_data["SECTIONS"][$related_section_tipo.":".$section_tipo] = array( $related_section_tipo => $matrix_section_data );
			}
			*/
		}
		#dump($ar_data,'$ar_data');
		#return 'not saved. Test only';

				# DELETE PREVIOUS VERSIONS OF STATS FOR THIS DATE
				# Eliminamos posibles versiones de estadísticas para este día (evita redundancia innecesaria ya que los datos se pueden regenerar en cualquier momento)
				# true por defecto
				if($delete_previous_versions) {
					$arguments=array();
					$arguments['strPrimaryKeyName']	= 'parent';
					$arguments['dato:%like%']		= $fecha_de_los_datos ;	#date("Y-m-d", strtotime($timestamp));
					$arguments['parent:not_like']	= 0;
					$matrix_table 					= common::get_matrix_table_from_tipo(DEDALO_DAILY_STATS_SECTION_TIPO);
					$RecordObj_matrix				= new RecordObj_matrix($matrix_table,NULL);
					$ar_records						= $RecordObj_matrix->search($arguments);
					if(!empty($ar_records)) {
						foreach ($ar_records as $current_section_id) {
							# Creamos una sección con el id encontrado y ella ya se encarga de eliminar todos sus hijos
							$section = section::get_instance($current_section_id,DEDALO_DAILY_STATS_SECTION_TIPO);	# ($id=NULL, $tipo=false, $modo='edit')
							$section->Delete('delete_record');
						}
					}
				}
				

				#
				# NEW SECTION
				# Save collected data into new section 
				# date component saves always yesterday date (today -1 day)
				$section 	= section::get_instance(NULL, $this->section_stats_tipo);
				$section_id = $section->Save();
					#dump($section_id,'$section_id');

				if( intval($section_id)<1 ) throw new Exception("Error Processing Request. Error on create new section ($this->section_stats_tipo)", 1);


				# COMPONENT_DATE : TIMESTAMP NOW
				# Guarda la fecha de los datos del 'snap-shot', no confundir confundir con la fecha de creación del registro
				$component_timestamp_tipo 	= RecordObj_dd::get_ar_terminoID_by_modelo_name_and_relation($this->section_stats_tipo, $modelo_name='component_date', $relation_type='children')[0];
				$current_component 			= component_common::get_instance('component_date', $component_timestamp_tipo, $section_id, 'stats');
				$timestamp 					= $fecha_de_los_datos." 00:00:00";	#component_date::get_timestamp_now_for_db( array('sub'=>'P1D') ); # Date of yesterday !important
				$current_component->set_dato( $timestamp );

				$current_component->Save();

				# COMPONENT_STATS : ONE FOR SECTION TIPO
				foreach ($ar_data as $stat_name => $ar_data_section) 
				foreach ($ar_data_section as $component_tipo => $component_dato) {

					$component_tipo = explode(':', $component_tipo)[1];
					
					$current_component = component_common::get_instance('component_stats', $component_tipo, $section_id, 'stats');
					$current_component->set_dato($component_dato);
						#dump($current_component,'$current_component' );
					$current_component->Save();
				}
				
				return $section_id;
	}

	

	

	

	


	
	
}
?>