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
	}//end __construct


	/**
	* GET_AR_DIFFUSION_MAP_SECTION_STATS
	* Retrieves the configuration defined in the thesaurus (structure) for the given section statistics (ar_section_top_tipo)
	* Format example:
	* ..
	*/
	public function get_ar_diffusion_map_section_stats( $ar_section_top_tipo=array() ) {
		#dump($ar_section_top_tipo,'$ar_section_top_tipo');

		if (isset($this->ar_diffusion_map)) {
			return $this->ar_diffusion_map;
		}

		#if(SHOW_DEBUG===true) $start_time = start_time();

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

		#if(SHOW_DEBUG===true) dump( exec_time($start_time, __METHOD__) );

		# Fix
		$this->ar_diffusion_map = $ar_diffusion_map;
			#dump($this->ar_diffusion_map,"this->ar_diffusion_map ");#die();

		return $this->ar_diffusion_map;
	}//end get_ar_diffusion_map_section_stats



	/**
	* GET_DATES_SQL_FROM_RANGE
	*//*
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
	}//end get_dates_sql_from_range
	*/



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
	}//end get_date_sql


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
				if (property_exists($options, $key)) {
					$options->$key = $value;
				}
			}
			#dump($options,"options");

		# AR_DIFFUSION_MAP : Full map
		$ar_diffusion_map = $this->get_ar_diffusion_map_section_stats( $options->section_tipo );
			#dump($ar_diffusion_map,'$ar_diffusion_map '); die();

		$this->diffusion_map_object = new stdClass();

		/*
		#SEARCH FROM USER SELECTION
		$search_options_session_key = 'section_'.$options->section_tipo;

		#SELECT THE SEARCH SESION FROM USER
		if (!empty($_SESSION['dedalo']['config']['search_options'][$search_options_session_key])) {

			$options_search_sesion 	  = (object)$_SESSION['dedalo']['config']['search_options'][$search_options_session_key];
			$options_search_from_user = clone($options_search_sesion); // Important: clone session object

			$options_search_from_user->search_options_session_key 	= 'current_edit';
			$options_search_from_user->modo 						= 'edit';
			$options_search_from_user->offset 						= false;
			$options_search_from_user->layout_map					= array();

			#dump($options_search_from_user,'$options_search_from_user'); die();
		}*/

		// Allways new search options (21-2-2018)
		$options_search_from_user = new stdClass();
			$options_search_from_user->section_tipo 				= $options->section_tipo;
			$options_search_from_user->search_options_session_key 	= 'current_edit';
			$options_search_from_user->layout_map					= array();
			$options_search_from_user->modo 						= 'edit';

		# ITERATE ALL SECTIONS (included activity)
		foreach ($ar_diffusion_map as $stats_tipo => $current_obj) {

			$section_tipo = $current_obj->section;
			$this->diffusion_map_object->$section_tipo = new stdClass();

			$cn=0;foreach ($current_obj->components as $current_component_tipo => $current_component_target_tipo) {

				if ($current_component_tipo==='dd1093') continue; # Skip stats field 'dato' stats
				if ($current_component_tipo==='dd551') continue; # Skip real field 'dato' stats
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

				$RecordObj_dd	= new RecordObj_dd($current_component_tipo);
				$properties		= $RecordObj_dd->get_properties();

				#
				# DIFFUSION_MAP_OBJECT
				#
				$current_obj->title		 	= (string)RecordObj_dd::get_termino_by_tipo($current_component_tipo, DEDALO_DATA_LANG, true);
				$current_obj->graph_type 	= (string)RecordObj_dd::get_modelo_name_by_tipo($current_component_tipo,true);
				$current_obj->properties 	= $properties;
					#dump($current_obj,'$current_obj '); continue;

				# ar_related_component_tipo
				$ar_related_component_tipo 	= $current_obj->components[$current_component_tipo];
					#dump($ar_related_component_tipo,' ar_related_component_tipo '.$current_component_tipo); #die();

				$related_modelo_name = RecordObj_dd::get_modelo_name_by_tipo(reset($ar_related_component_tipo),true);

				#
				# SQL
				$sql_columns 	= '';
				$sql_group 		= '';
				$change_section = false;

					if ($section_tipo===DEDALO_ACTIVITY_SECTION_TIPO && $related_modelo_name!=='component_filter') {

						$i=0;foreach ($ar_related_component_tipo as $current_column_tipo) {

							# Set section_tipo for search in query
							$section_tipo 				= $current_obj->section;
							$current_column_tipo_orig 	= $current_column_tipo;
							$filter_custom 				= " (section_tipo = '$section_tipo') ";
							# current_lang
							$RecordObj_dd 	= new RecordObj_dd($current_column_tipo);
							$model_name 	= $RecordObj_dd->get_modelo_name();
							$traducible 	= $RecordObj_dd->get_traducible();
							$current_lang 	= ($traducible!=='si') ? DEDALO_DATA_NOLAN : DEDALO_DATA_LANG;
								#dump($model_name, ' $model_name ++ '.to_string($current_lang)); continue;


							#
							# PORTALES
							# Case portals change sql query and current column tipo
							if (isset($current_obj->properties->stats_look_at)) {
								#dump($current_obj->properties->stats_look_at);

								#$options_search_portal = clone($options_search_sesion);
								$options_search_portal = clone($options_search_from_user);

								$options_search_portal->layout_map 					= array($current_column_tipo);
								$options_search_portal->limit						= false;
								$options_search_portal->offset						= false;
								$options_search_portal->search_options_session_key 	= 'current_edit';
								$options_search_portal->modo 						= 'edit';

								$section_rows = search::get_records_data($options_search_portal);
									#dump($section_rows->result, ' section_rows->result ++ '.to_string()); #dump( reset(array_values($section_rows->result)), 'array_values() ++ '.to_string());

								$filtro_portal_sql = '';
								foreach ((array)$section_rows->result as $key => $ar_value) foreach ($ar_value as $tipo => $dato) {

										if (empty($dato[$current_column_tipo])) continue;

										$ar_locators = json_decode($dato[$current_column_tipo]);
										foreach ((array)$ar_locators as $current_key => $current_locator) {

											switch ($model_name) {
												case 'component_filter':
													# Change the dato of the proyect with standar locator
													$current_locator = new stdClass();
														$current_locator->section_id   = $current_key;
														$current_locator->section_tipo = DEDALO_SECTION_PROJECTS_TIPO;

													# Change section_tipo for search in query
													#$filter_custom = " section_tipo = '".DEDALO_SECTION_PROJECTS_TIPO."'";
													$section_tipo = DEDALO_SECTION_PROJECTS_TIPO;

												default:
													if (!isset($current_locator->section_tipo) || !isset($current_locator->section_id)) continue 2;
													$filtro_portal_sql .= "\n(section_id = ".$current_locator->section_id." AND section_tipo = '".$current_locator->section_tipo."') OR";
													#Change section_tipo for serarch in query
													$section_tipo = $current_locator->section_tipo;
													break;
											}//end switch ($model_name) {

										}//end foreach ((array)$ar_locators as $current_key => $current_locator) {

								}//end foreach ($result as $key => $ar_value) {

								#$filter_custom = '';
								if (!empty($filtro_portal_sql)) {
									$filter_custom = "\n(".substr($filtro_portal_sql, 0,-3).") ";
								}
								#dump($filtro_portal_sql ,'$filtro_portal_sql');

								$current_column_tipo = $current_obj->properties->stats_look_at[0];
								$RecordObj_dd 		 = new RecordObj_dd($current_column_tipo);
								$model_name 		 = $RecordObj_dd->get_modelo_name();
								$traducible 		 = $RecordObj_dd->get_traducible();
								$current_lang 		 = ($traducible!=='si') ? DEDALO_DATA_NOLAN : DEDALO_DATA_LANG;
								$change_section 	 = true;
								#$section_tipo_portal = component_common::get_section_tipo_from_component_tipo($current_column_tipo);
									#dump($section_tipo,'$section_tipo - current_column_tipo:'.$current_column_tipo);
							}//if (isset($current_obj->properties->stats_look_at)){

							#PROPERTIES MODIFICATOR
							#In properties is poosible put one modificator of the value. for ex: valor_arguments : year
							#this value change the query for sql going to the depper into the value of the component.

							# properties valor_arguments
							if(isset($current_obj->properties->valor_arguments)) {
								$valor_arguments = ', '.$current_obj->properties->valor_arguments;
							}else{
								$valor_arguments = '';
							}

							#
							# COLUMNS
							if ($i<1) {
								switch (true) {
									case ($current_column_tipo==='dd543') : // component_autocomplete who
										$sql_columns .= "\n COUNT (datos#>>'{relations}') AS count,";
										break;
									default:
										$sql_columns .= "\n COUNT (datos#>>'{components, $current_column_tipo, dato, $current_lang $valor_arguments}') AS count,";
								}
							}

							switch (true) {
								case ($current_column_tipo==='dd543') : // component_autocomplete who
									$sql_columns .= "\n datos#>>'{relations}' AS $current_column_tipo";
									break;
								case ($current_component_tipo==='dd1074') : # 'When' column (activity time is grouped by hour like '2014-10-23 21:56:49' => '21')
									$sql_columns .= "\n substr(datos#>>'{components, $current_column_tipo, dato, $current_lang}', 12, 2) AS $current_column_tipo";
									break;
								default:
									$sql_columns .= "\n datos#>>'{components, $current_column_tipo, dato, $current_lang $valor_arguments}' AS $current_column_tipo";
							}

							#
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

						$i++;}//end $i=0;foreach ($ar_related_component_tipo as $current_column_tipo)

						$date_filter = self::get_date_sql(
											$options->fecha[0],
											$options->fecha[1]
										);

						$current_matrix_table = common::get_matrix_table_from_tipo($section_tipo);
						$filter_options = new stdClass();

							#* If the model of the component is a portal the reference of the top tipo (creator top tipo) is the filter, because some portals can have the same info for two types of Heritage or OH

							#if ($change_section){
							#	$filter_by_section_tipo = "\n-- section_creator_top_tipo -- \n datos@>'{\"section_creator_top_tipo\":\"$section_tipo\"}'::jsonb ";
							#	$filter_options->section_tipo 	= $section_tipo_portal;
							#
							#}else{
							#	$filter_by_section_tipo = "\n-- filter_by_section_tipo -- \n section_tipo = '$section_tipo' ";
							#	$filter_options->section_tipo 	= $section_tipo;
							#
							#}

						$filter_by_date			= $date_filter;
						$group_by				= $sql_group;

						$options_search_from_user->sql_columns 	= $sql_columns;
						$options_search_from_user->matrix_table	= $current_matrix_table;
						$options_search_from_user->group_by		= $group_by;
						$options_search_from_user->limit		= '';
						$options_search_from_user->order_by		= 'count';
						$options_search_from_user->filter_custom= $filter_custom;
							#dump($options_search_from_user,'$options_search_from_user');die();
						$section_rows 	= search::get_records_data($options_search_from_user);
							#dump($section_rows,'$section_rows');

						$result	= $section_rows->result;

						# Construimos el array de la tabla temporal en base a los registros obtenidos en el query
						$ar_stats = [];
						foreach ($result as $key => $ar_value) {
							foreach ($ar_value as $value) {
								if(empty($value['count'])) continue;

								#$ar_stats[] = array_reverse($value);
								$item = new stdClass();
									$item->tipo  = $current_column_tipo;
									$item->value = $value[$current_column_tipo];
									$item->count = $value['count'];

								$ar_stats[] = $item;
							}
						}
						#dump($ar_stats,'ar_stats');


						// New search with search_development2
							$column_path = "datos#>>'{components,$current_column_tipo,dato,lg-nolan}'";
							$search_count_options = new stdClass();
								$search_count_options->column_tipo  = $current_column_tipo;
								$search_count_options->column_path  = $column_path;
								$search_count_options->section_tipo = $section_tipo;

							#$ar_rows = search_development2::search_count($search_count_options);
							#	dump($ar_rows, ' ar_rows ++ '.to_string());


						$limit_viewed = 100;

					}else{

						// stats. Calculate stats using components
							$ar_stats = [];
							foreach ($ar_related_component_tipo as $current_column_tipo) {

								$modelo_name = RecordObj_dd::get_modelo_name_by_tipo($current_column_tipo,true);
					            $ar_clean 	 = $modelo_name::parse_stats_values($current_column_tipo, $section_tipo, $properties);

								// Add to ar_stats
								foreach ($ar_clean as $c_uid => $c_item) {
									$ar_stats[] = $c_item;
								}
							}
							#dump($ar_stats, ' ar_stats ++ '.to_string($current_column_tipo));

						$limit_viewed = 20;

					}//end if ($section_tipo===DEDALO_ACTIVITY_SECTION_TIPO)

					// Limit total elements viewed
						if ($limit_viewed>0 && count($ar_stats)>$limit_viewed) {

							// Sort big counts first
							usort($ar_stats, function($a, $b) {
								// compare numbers only
								return $b->count - $a->count;
							});
							// Select others group
							$ar_others = array_slice($ar_stats, $limit_viewed);
							// Select first part of array
							$ar_stats = array_slice($ar_stats, 0, $limit_viewed);

							if (count($ar_others)>0) {
								$others_count = 0;
								foreach ($ar_others as $item) {
									$others_count = $others_count + (int)$item->count;
									if (!isset($others_tipo)) {
										$others_tipo  = $item->tipo;
									}
								}
								$item = new stdClass();
									$item->tipo  = $others_tipo;
									$item->value = 'others';
									$item->count = $others_count;
								$ar_stats[] = $item;
							}
							#dump($ar_stats, ' ar_stats 2 ++ '.to_string($current_column_tipo));
						}//end if ($limit_viewed>0 && count($ar_stats)>$limit_viewed)

					// Washer data
						$data = $this->washer($ar_stats, $current_component_tipo, $current_obj->properties, $section_tipo);

					// JS_AR_OBJ : Configure and store current element of array for js build charts
						$js_obj = new stdClass();
							$js_obj->title 		= $current_obj->title;
							$js_obj->tipo 		= $current_component_tipo ;
							if(SHOW_DEBUG===true) {
								$js_obj->title .=  " <span>($current_obj->graph_type)</span>";
								$js_obj->query = isset($section_rows->strQuery) ? $section_rows->strQuery : '';
							}
							$js_obj->graph_type = $current_obj->graph_type;
							$js_obj->data 		= $data;
						$this->js_ar_obj[] = $js_obj;

					// Diffusion_map_object
						$this->diffusion_map_object = new stdClass();
						$this->diffusion_map_object->$section_tipo = new stdClass();
						$this->diffusion_map_object->$section_tipo->$current_component_tipo = new stdClass();
							$this->diffusion_map_object->$section_tipo->$current_component_tipo->ar_stats = $ar_stats;
							$this->diffusion_map_object->$section_tipo->$current_component_tipo->js_obj   = $js_obj;

					// Debug
						$sql_time = round(microtime(1)-$start_time,3);
						$this->diffusion_map_object->$section_tipo->$current_component_tipo->debug = new stdClass();
							$this->diffusion_map_object->$section_tipo->$current_component_tipo->debug->sql_time = $sql_time;
							$this->diffusion_map_object->$section_tipo->$current_component_tipo->debug->strQuery = isset($section_rows->strQuery) ? $section_rows->strQuery : '';

			$cn++;}
			break;
		}
		#dump($this->diffusion_map_object, 'this->diffusion_map_object', array());

		if(SHOW_DEBUG===true) {
			echo "<span style=\"float:left\">Time To Generate stats ".round(microtime(1)-$start_time,3)."</span>"; # <br>".$section_rows->strQuery;
			#dump( $this->diffusion_map_object, 'var', array());;
			#dump($section_rows->strQuery, '$section_rows->strQuery');
			#dump($this->js_ar_obj, '$this->js_ar_obj ++ '.to_string());
		}

		return $this->js_ar_obj;
	}//end get_stats



	/**
	* WASHER
	* Parses ar data to build final array for js lib
	* Schema output example
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
	public function washer($ar_stats, $component_tipo, $properties, $section_tipo) {
		$ar_stats_obj_resolved 	= array();

		$x_axis = 'x';
		$y_axis = 'y';
		$added_extras=false;

		$total = count($ar_stats);
		if ($total<1) {
			if(SHOW_DEBUG===true) {
				//trigger_error("Sorry, not implemented yet for complex graphs");
			}
			return false;
		}

		$data_obj = new stdClass();
			$data_obj->key 	 = "Series1";
			$data_obj->values = array();

		#dump($ar_stats,"ar_stats $component_tipo");
		$item_n=1;
		foreach ((array)$ar_stats as $item) {

			# Get first value of current array element. Ex. 'lg-eng' for
				# (
				#	[dd27] => lg-eng
				#	[count] => 13
				# )
			#$key 		= reset($ar_value);
			$key 		= $item->value;

			# Get first key of current array element. Ex. 'dd27' for
				# (
				#	[dd27] => lg-eng
				#	[count] => 13
				# )
			#$first_key = key($ar_value);
			$column_tipo = $item->tipo;

			# Get last value of current array element. Ex. '13' for
				# (
				#	[dd27] => lg-eng
				#	[count] => 13
				# )
			#$value 	= end($ar_value);
			$count 		= $item->count;

			# Get model name when is applicable (used to discriminate options)
				$modelo_name = RecordObj_dd::get_modelo_name_by_tipo($column_tipo,true);

			if($section_tipo===DEDALO_ACTIVITY_SECTION_TIPO && $modelo_name!=='component_filter') {

				switch (true) {

					# ACTIVITY : IP Address
					case ($component_tipo==='dd1070'):
						$current_value_obj=new stdClass();
						$current_value_obj->$x_axis = (string)$key;
						$current_value_obj->$y_axis = (int)$count;
						$data_obj->values[] = $current_value_obj;
						break;

					# ACTIVITY : WHEN : Activity time
					case ($component_tipo==='dd1074'):
						if ($added_extras!==true) {
							$len = count($ar_stats);
							$ar_existing_hours = [];
							for ($i=0; $i < $len; $i++) {
								#$ar_existing_hours[] = $ar_stats[$i]['dd547'];
								$ar_existing_hours[] = str_pad($ar_stats[$i]->value, 2, '0', STR_PAD_LEFT);
							}
							# Breakdown for 24 hours
							$range = range(0,23);
							foreach ($range as $current_hour) {
								$current_hour = str_pad($current_hour, 2, '0', STR_PAD_LEFT);
								if (!in_array($current_hour, $ar_existing_hours)) {
									$current_value_obj = new stdClass();
										$current_value_obj->$x_axis = (string)$current_hour;
										$current_value_obj->$y_axis = intval(0);
									$data_obj->values[] = $current_value_obj;
								}
							}
							$added_extras=true;
						}
						$current_value_obj = new stdClass();
							$current_value_obj->$x_axis = (string)$key;
							$current_value_obj->$y_axis = intval($count);
						$data_obj->values[] = $current_value_obj;
						break;

					# ACTIVITY : Who
					case ($component_tipo==='dd1071'):
						$key = json_decode($key);
						if (is_object($key)) { // old values
							# old format is not array. Nothing to do
						}else if(is_array($key)) {
							$key = reset($key); // New format is array of object
						}else{
							#dump($key, ' key ++ '.to_string());
						}

						if (is_object($key)) {
							$component_current = component_common::get_instance('component_input_text', DEDALO_USER_NAME_TIPO, $key->section_id, 'edit', DEDALO_DATA_NOLAN, $key->section_tipo);
							$component_value	= $component_current->get_valor(); 	#dump($component_value,"component_value for $column_tipo - $key - $modelo_name");
							if (empty($component_value)) {
								$component_value='na';
							}
							$current_value_obj=new stdClass();
							$current_value_obj->$x_axis = (string)$component_value;
							$current_value_obj->$y_axis = intval($count);
							$data_obj->values[] = $current_value_obj;
						}

						break;

					# ACTIVITY : WHERE : Activity dónde
					case ($component_tipo==='dd1073'):
						#dump($key, ' value ++ '.to_string());
						if (strpos($key, '_')!==false) {
							$ar_parts = explode('_', $key);
							if(SHOW_DEBUG===true) {
								$msg = sprintf("Bad data received for component_tipo dd1073: %s . Explode and use %s instead",$key,$ar_parts[0]) ;
								error_log($msg);
							}
							$key = $ar_parts[0];
						}
						$key_resolved = RecordObj_dd::get_termino_by_tipo( $key, DEDALO_DATA_LANG, true );

						$current_value_obj=new stdClass();
							$current_value_obj->$x_axis = (string)$key_resolved;
							if (empty($current_value_obj->$x_axis)) {
								$current_value_obj->$x_axis = (string)'no avaliable';
								if(SHOW_DEBUG===true) {
									$current_value_obj->$x_axis .= " [key_resolved:".to_string($key_resolved)." - key:".to_string($key)."]";
								}
							}
							$current_value_obj->$y_axis = (int)$count;
							$data_obj->values[] = $current_value_obj;
						break;

					# PROJECTS : components with model component_filter
					case ($modelo_name==='component_filter999'):
						if(!isset($table_temp)) $table_temp=array();

						# Convert json data like '{"2": "2", "4": "2"}' to php array and get only keys like 'Array("2","4")'
						$ar_keys = array_keys( (array)json_handler::decode($key,true) );
							#dump($ar_keys, 'ar_keys', array());
							#dump($count, 'value', array());
						if(is_array($ar_keys)) foreach ($ar_keys as $current_kvalue) {
							if (!isset($table_temp[$current_kvalue])) {
								$table_temp[$current_kvalue]  = (int)1 * $count;
							}else{
								$table_temp[$current_kvalue] += (int)$count;
							}
						}else{
							error_log("WARNING: ar_keys expected array. Instead, given: ".gettype($ar_keys) );
						}

						// if ( $item === end($ar_stats) ) {
						if ( $item_n===$total ) {
							#dump($ar_value, ' ar_value'); dump($key, "key first_key: $column_tipo - value : $count");
							foreach ($table_temp as $tkey => $tvalue) {

								# Get value of 'component_input_text' from section project id (tipo is fixed: DEDALO_PROJECTS_NAME_TIPO)
								$component_filter = component_common::get_instance('component_input_text', DEDALO_PROJECTS_NAME_TIPO, $tkey, 'edit', DEDALO_DATA_LANG, DEDALO_SECTION_PROJECTS_TIPO);
								$component_value  = $component_filter->get_valor();
								$component_dato   = $component_filter->get_dato();

								#$component_filter = component_common::get_instance($modelo_name, $column_tipo, null);
								#$component_filter->set_dato($key);
								#$component_value  = $component_filter->get_valor();

								if(SHOW_DEBUG===true) {
									#dump($component_filter, 'valor para $tkey:'.$tkey.' - tvalue:'.$tvalue.' - DEDALO_PROJECTS_NAME_TIPO:'.DEDALO_PROJECTS_NAME_TIPO);
								}

								$current_value_obj=new stdClass();
								$current_value_obj->$x_axis = (string)$component_value;
								if(SHOW_DEBUG===true) {
									$current_value_obj->$x_axis .= " [$tkey]";
								}
								$current_value_obj->$y_axis = (int)$tvalue;
								$data_obj->values[] = $current_value_obj;
							}
						}
						break;

					# COMPONENT_DATE
					case ($modelo_name==='component_date'):
						#dump($tvalue,'$tvalue');
						if(isset($properties->valor_arguments)){
							$key_resolved = $key;

						}else{
							$current_component 	= component_common::get_instance($modelo_name, $column_tipo, NULL, 'list', DEDALO_DATA_NOLAN);
							$current_component->set_dato($key);
							#$key_resolved 		= $current_component->get_valor();
							$key_resolved 	= $current_component->get_valor_local();
								#dump($key_resolved, "key_resolved - key: $key - value: ".$count);
						}
							$current_value_obj=new stdClass();
							$current_value_obj->$x_axis = (string)$key_resolved;
							$current_value_obj->$y_axis = (int)$count;
							$data_obj->values[] = $current_value_obj;
						break;

					# COMPONENT_AUTOCOMPLETE_TS
					case ($modelo_name==='component_autocomplete_ts'):
						#dump($key, ' key ++ modelo_name: '.to_string($modelo_name));
						$key_json = json_decode($key);
						if ($key_json && is_array($key_json)) {
							foreach ($key_json as $current_locator) {

								$c_terminoID = component_autocomplete_ts::get_terminoID_by_locator( $current_locator );
								#dump($c_terminoID, ' c_terminoID ++ '.to_string($key_json));
								$key_resolved = RecordObj_dd::get_termino_by_tipo($c_terminoID, DEDALO_DATA_LANG, true, true); //$terminoID, $lang=NULL, $from_cache=false, $fallback=true
								$key_resolved = strip_tags($key_resolved);
								$current_value_obj=new stdClass();
									$current_value_obj->$x_axis = (string)$key_resolved;
									$current_value_obj->$y_axis = (int)$count;
								$data_obj->values[] = $current_value_obj;
									#dump($current_value_obj, ' current_value_obj ++ '.to_string());

								break; // For now only first element..
							}
						}else{
							$key_resolved = RecordObj_dd::get_termino_by_tipo($key, DEDALO_DATA_LANG, true, true); //$terminoID, $lang=NULL, $from_cache=false, $fallback=true
							$key_resolved = strip_tags($key_resolved);
							$current_value_obj=new stdClass();
									$current_value_obj->$x_axis = (string)$key_resolved;
									$current_value_obj->$y_axis = (int)$count;
								$data_obj->values[] = $current_value_obj;
						}
						break;

					# DEFAULT BEHAVIOR
					default:

						#dump($key, "key first_key: $column_tipo - value : $count");
						if ($key!=='count') {//&& strpos($key, 'dd')===0

							try {

								switch (true) {
									case ($key_json_decoded = json_decode($key)!==null):
										# Lang case for now
										$lang = lang::get_lang_name_by_locator($key_json_decoded, DEDALO_DATA_LANG, true);
										if (!empty($lang)) {
											$key_resolved = $lang;
										}else{
											$key_resolved = '';
											debug_log(__METHOD__." Unable resolve locator ".to_string($key), logger::ERROR);
										}
										debug_log(__METHOD__." key_json_decoded ".to_string($key_json_decoded), logger::WARNING);
										break;
									case (intval($key)>0):
										$current_component 	= component_common::get_instance($modelo_name,
																							 $column_tipo,
																						 	 NULL,
																						 	 'list'
																						 	 );
										#$current_component 	= new $modelo_name($column_tipo, NULL, 'list', DEDALO_DATA_LANG);
										$current_component->set_dato($key);
										$key_resolved 		= $current_component->get_valor();
										//dump($column_tipo, ' first_key');
										break;
									default:
										# Resolve key name ($key_resolved) by get_termino_by_tipo
										#if( is_string($key) && strlen($key)>2 ) {
										$prefix_from_tipo = RecordObj_dd::get_prefix_from_tipo($key);
										#}
										if (in_array($prefix_from_tipo, unserialize(DEDALO_PREFIX_TIPOS))) {
											# DEDALO TIPOS (Managed by RecordObj_dd)
											$key_resolved = RecordObj_dd::get_termino_by_tipo( $key, DEDALO_DATA_LANG, true );
										}else{
											# TESAURUS TIPOS (Managed by RecordObj_ts)
											if( is_string($key) && strlen($key)>2 )
											$key_resolved = RecordObj_ts::get_termino_by_tipo( $key, DEDALO_DATA_LANG, true );
										}
										#$key_resolved = RecordObj_ts::get_termino_by_tipo( $key, DEDALO_DATA_LANG, true );
										#dump($key_resolved, ' key_resolved');
										break;
								}

							} catch (Exception $e) {
								#dump($column_tipo, ' first_key');
								if(SHOW_DEBUG===true) {
									#$column_tipo_resolved = RecordObj_ts::get_termino_by_tipo( $column_tipo, DEDALO_DATA_LANG, true );
									#trigger_error("Error on get_termino_by_tipo key:$key, first_key:$column_tipo, value:$count, modelo_name:$modelo_name, first_key_resolved:$column_tipo_resolved");
								}else{
									#trigger_error("Error on get_termino_by_tipo key:$key ");
								}
								$key_resolved = $key;
								#dump($key_resolved ,'$key_resolved '.$modelo_name);
								# Get value of 'component_input_text' from section project id (tipo is fixed: DEDALO_PROJECTS_NAME_TIPO)

								$current_key_obj = json_decode($key);
									#dump($current_key_obj, '$current_key_obj ++ '.to_string());

								$current_section_tipo = (is_array($current_key_obj) && isset(reset($current_key_obj)->section_tipo)) ? reset($current_key_obj)->section_tipo : null;
								if(SHOW_DEBUG===true) {
									if ($current_section_tipo==='dd861') {
										#dump($current_key_obj, ' var ++ '.to_string($column_tipo));
									}
									if ($current_section_tipo===null) {
										#dump($current_key_obj, "ERROR: current_section_tipo is null $column_tipo + ".to_string($count)); #die();
										debug_log(__METHOD__." ERROR: current_section_tipo is null $column_tipo ".to_string($count), logger::ERROR);
									}
								}

								if (empty($current_section_tipo)) {
									$key_resolved = '';
								}else{
									$current_component 	= component_common::get_instance($modelo_name,
																						 $column_tipo,
																						 NULL,
																						 'list',
																						 DEDALO_DATA_LANG,
																						 $current_section_tipo);		//dump($key, "$column_tipo + ".to_string($count));
									#$current_component 	= new $modelo_name($column_tipo, NULL, 'list');
									$current_component->set_dato($key);
									$key_resolved 		= $current_component->get_valor();
									#dump($key_resolved ,'$key_resolved for: '.$key);
									if ($modelo_name === 'component_date') {
										$key_resolved 	= $current_component->get_valor_local();
									}
								}//end if (empty($current_section_tipo))
							}

						}else{
							$key_resolved = $key;
						}


						$key_resolved = isset($key_resolved) ? strip_tags($key_resolved) : null;
							#dump($key_resolved, ' key_resolved '.$count);
							if (empty($count)) {
								continue 2; 	# Skip empty data
							}

						#$stats_value_resolved = component_autocomplete_ts::get_stats_value_resolved( $column_tipo, $ar_stats, 'stats_bar' ,$properties ) ;
						#dump($stats_value_resolved, 'stats_value_resolved', array());

						$current_value_obj=new stdClass();
						$current_value_obj->$x_axis = (string)$key_resolved;
						if (empty($current_value_obj->$x_axis)) {
							$current_value_obj->$x_axis = (string)'no avaliable';
							if(SHOW_DEBUG===true) {
								$current_value_obj->$x_axis .= " default [key_resolved:".to_string($key_resolved)." - key:".to_string($key)."]";
							}
						}
						$current_value_obj->$y_axis = (int)$count;
						$data_obj->values[] = $current_value_obj;

						break;

				}#end switch

			}else{

				$current_value_obj=new stdClass();
				$current_value_obj->$x_axis = (string)$key; // Name
				if (empty($current_value_obj->$x_axis)) {
					$current_value_obj->$x_axis = (string)'not available';
					if(SHOW_DEBUG===true) {
						#$current_value_obj->$x_axis .= " [key:".to_string($key)."] $modelo_name - $component_tipo";
					}
				}
				$current_value_obj->$y_axis = (int)$count; // Counter
				$data_obj->values[] = $current_value_obj;
			}

		$item_n++;
		}#end foreach ((array)$ar_stats as $ar_value)

		# SORT OBJECT ELEMENTS BY X ASC
			if ($added_extras===true) {
				usort($data_obj->values, 'self::sort_elements_by_x');
					#dump($data_obj,"current_obj");
			}

		// Set as array of objects (one)
			$ar_stats_obj_resolved = array($data_obj);
				#dump($data_obj, ' data_obj ++ '.to_string());

		return $ar_stats_obj_resolved;
	}//end washer



	/**
	* SORT_ELEMENTS_BY_X
	*/
	static function sort_elements_by_x($a, $b) {
		if($a->x == $b->x){ return 0 ; }
		return ($a->x < $b->x) ? -1 : 1;
	}//end sort_elements_by_x

}
