<?php declare(strict_types=1);
/**
* CLASS SEARCH
* TRAIT WHERE
*
*/
trait where {



	/**
	* BUILD_MAIN_WHERE
	* Build and fix main_where_sql filter.
	* @return void
	*/
	public function build_main_where() : void {

		// section_tipo is always and array
		$ar_section_tipo = $this->ar_section_tipo;

		// main section tipo filter
		$this->sql_obj->main_where[] = count($ar_section_tipo) > 1
			? '(' . $this->main_section_tipo_alias.'.section_tipo IN (\'' . implode('\',\'', $ar_section_tipo) . '\'))'
			: '(' . $this->main_section_tipo_alias.'.section_tipo = \'' . $ar_section_tipo[0] . '\')';

		// avoid root user to be include in the results
		if ($this->main_section_tipo === DEDALO_SECTION_USERS_TIPO) {
			$this->sql_obj->main_where[] = $this->main_section_tipo_alias.'.section_id > 0';
		}
	}//end build_main_where



	/**
	* BUILD_FILTER_BY_USER_RECORDS
	* Build and fix filter_by_user_records filter.
	* Used by WHERE clause to filter records by logged user permissions.
	* This filter is only applied when DEDALO_FILTER_USER_RECORDS_BY_ID constant is defined and true.
	* The filter is applied as restriction of the WHERE clause, joining with AND operator.
	* @return void
	*/
	public function build_filter_by_user_records() : void {

		$user_id = logged_user_id(); // Logged user id
		// stop the process if user_id is not logged
		if (empty($user_id)) {
			debug_log(__METHOD__
				. " Error: user id unavailable (logged_user_id). Unabe to build filter_by_user_records " . PHP_EOL
				. to_string(logged_user_id())
				, logger::ERROR
			);
			return;
		}

		// FILTER_USER_RECORDS_BY_ID
		if (defined('DEDALO_FILTER_USER_RECORDS_BY_ID') && DEDALO_FILTER_USER_RECORDS_BY_ID===true) {
			
			$section_tipo		= $this->main_section_tipo;
			$section_alias		= $this->main_section_tipo_alias;

			$filter_user_records_by_id = filter::get_filter_user_records_by_id( $user_id );
			if ( isset($filter_user_records_by_id[$section_tipo]) ) {			
				
				$filter_by_user_records = '';

				if(SHOW_DEBUG===true || DEVELOPMENT_SERVER===true) {
					$filter_by_user_records .= "\n-- filter_user_records_by_id --".PHP_EOL;
				}

				$filter = implode( ',', $filter_user_records_by_id[$section_tipo] );
				$filter_by_user_records .= $section_alias . '.section_id IN ( ' . $filter . ' )';
				
				$this->sql_obj->where[] = $filter_by_user_records;
			}
		}
	}//end build_main_where



	/**
	* BUILD_SQL_FILTER
	* @return void
	*/
	public function build_sql_filter() : void {

		if (empty($this->sqo->filter)) {
			return;
		}

		$operator	= array_key_first(get_object_vars($this->sqo->filter));		
		$ar_value	= $this->sqo->filter->{$operator};
		
		if(!empty($ar_value)) {

			// Duplicated caller
			// if the skip duplicated control is in true
			// the caller is inside of the component with duplicated search operator(!!)
			// the call is inside the build_search_object_sql() of the component
			// it need the filter of other components to be applied into the duplicated search
			// but it can't include itself in the filter, so, here remove all duplicated search components
			// it ensure that other search will applied to get the duplicates.
			if( isset($this->sqo->skip_duplicated) && $this->sqo->skip_duplicated === true ){
				$ar_value = array_filter($ar_value, function($item){
					$duplicated = $item->duplicated ?? false;
					return $duplicated===false;
				});
				// remove the key of the array (added by the array filter)
				$ar_value = array_values($ar_value);
				// reset the skip control for the next calls.
				$this->skip_duplicated = false;
			}


			$this->sql_obj->where[] = $this->filter_parser($operator, $ar_value);			
		}
	}//end build_sql_filter



	/**
	* FILTER_PARSER
	* @param string $op
	* @param array $ar_value
	* @return string $string_query
	*/
	public function filter_parser(string $op, array $ar_value) : string {

		$string_query = '';

		$total		= count($ar_value);
		$operator	= strtoupper( substr($op, 1) );

		foreach ($ar_value as $key => $search_object) {

			if (!property_exists($search_object, 'path')) {

				// Case operator

				$op2 = array_key_first(get_object_vars($search_object));

				$ar_value2 	= $search_object->$op2;

				// recursion filter_parser
				$parsed_string = $this->filter_parser($op2, $ar_value2);
				if (!empty($parsed_string)) {
					$string_query .= ' (' . $parsed_string . ' )';

					if ($key+1 < $total) {
						$string_query .= ' '.$operator.' ';
					}
				}

			}else{

				// Case elements

				$n_levels = count($search_object->path);
				if ($n_levels>1) {
					$this->build_sql_join($search_object->path);
				}

				$string_query .= $this->build_search_object_sql($search_object);

				// if the where get empty value don' add operator
				if ($key+1 !== $total && !empty($string_query)) {
					$string_query .= ' '.$operator.' ';
				}
			
			}

		}//end foreach ($ar_value as $key => $search_object)

		return $string_query;
	}//end filter_parser



	/**
	* BUILD_SQL_JOIN
	* Builds one table join based on requested path
	* @param array $path
	*  sample:
	*	[
	*		{
	*			"name": "Publication",
	*			"model": "component_publication",
	*			"section_tipo": "rsc167",
	*			"component_tipo": "rsc20"
	*		},
	*		{
	*			"name": "Value",
	*			"model": "component_input_text",
	*			"section_tipo": "dd64",
	*			"component_tipo": "dd62"
	*		}
	*	]
	* @return bool true
	*/
	public function build_sql_join(array $path) : bool {

		$ar_key_join	= [];
		$base_key		= '';
		$total_paths	= count($path);

		foreach ($path as $key => $step_object) {

			if ($key===0) {
				$base_key		= $this->main_section_tipo_alias; //self::trim_tipo($step_object->section_tipo);
				$ar_key_join[]	= self::trim_tipo($step_object->section_tipo) .'_'. self::trim_tipo($step_object->component_tipo);
				continue;
			}

			$current_key = ($key===1)
				? $base_key
				: implode('_', $ar_key_join);

			$ar_key_join[] = ($key === $total_paths-1)
				? self::trim_tipo($step_object->section_tipo)
				: self::trim_tipo($step_object->section_tipo) .'_'. self::trim_tipo($step_object->component_tipo);

			$matrix_table		= common::get_matrix_table_from_tipo($step_object->section_tipo);
			// Ignore invalid empty matrix tables
			if (empty($matrix_table)) {
				debug_log(__METHOD__
					. " Ignored invalid empty matrix table " . PHP_EOL
					. ' step_object->section_tipo: ' . $step_object->section_tipo
					, logger::ERROR
				);
				continue;
			}

			$t_name		= implode('_', $ar_key_join);
			$t_relation	= 'rel'.$key;

			// if (!isset($this->ar_sql_joins[$t_name])) {

				$sql_join  = "\n";
				if(SHOW_DEBUG===true) {
					$section_name = ontology_node::get_term_by_tipo($step_object->section_tipo, null, true, false);
					$sql_join  .= "-- JOIN GROUP $matrix_table - $t_name - $section_name\n";
				}

				$component_tipo = $path[$key-1]->component_tipo;
				$sql_lateral = "JOIN LATERAL jsonb_array_elements({$current_key}.relation->'{$component_tipo}') AS {$t_relation} on true";
				
				$sql_join = "JOIN {$matrix_table} AS {$t_name} ON 
					{$t_name}.section_id = ({$t_relation}->>'section_id')::bigint
					AND {$t_name}.section_tipo =({$t_relation}->>'section_tipo')";


				$this->sql_obj->join[] = $sql_lateral.PHP_EOL.$sql_join;
			// }
		}//end foreach ($path as $key => $step_object)



		return true;
	}//end build_sql_join



	/**
	* PARSE_SEARCH_OBJECT_SQL
	* Builds a SQL query string base on given filter search object
	* @param object $search_object
	* @return string|null $sql
	*/
	public function parse_search_object_sql( object $search_object ) : ?string {

		// sample object
			// {
			//   "q": "'.*\[".*ana.*'",						// the regex, text, number, etc that the component created
			//   "unaccent":true,							// true or false
			//   "operator":"~*",							// the operator for query
			//   "type": "string",							// string or jsonb
			//   "lang": "lg-nolan",						// if not defined lang = all langs, if defined lang = the lang sent
			//   "path": [									// path for locate the component into the joins
			//     {
			//       "section_tipo": "oh1",
			//       "component_tipo": "oh24"
			//     },
			//     {
			//       "section_tipo": "rsc197",
			//       "component_tipo": "rsc453"
			//     }
			//   ],
			//   "sentence": "string",						// mandatory a sql sentence to be parsed with he params as placeholders _Q1_, _Q2_, ...
			//   "params": associative array				// mandatory params for the sentence as ['_Q1_' => value1, '_Q2_' => value2, ...]
			// }

		// set initial sql with search_object sentence
		$sql = $search_object->sentence ?? null;

		if (empty($sql)) {
			return null;
		}

		foreach ($search_object->params as $key => $value) {
			// Gets current param key (default is 1 and increases by 1 after each use)
			$current_param_key = $this->params_counter++;
			// Replace param placeholder by current param key. E.g.: $1, $2, $3, ...
			$placeholder = '$' . $current_param_key;
			// Update sql string with new placeholder
			$sql = str_replace( $key, $placeholder, $sql );
			// Add param value to main params array
			$this->params[] = $value;
		}


		return $sql;
	}//end parse_search_object_sql



	/**
	* BUILD_SQL_FILTER_BY_LOCATORS
	* @return void
	*/
	public function build_sql_filter_by_locators() : void {

		if (empty($this->sqo->filter_by_locators)) {
			return;
		}

		$table = $this->main_section_tipo_alias;

		$ar_parts = [];
		foreach ($this->sqo->filter_by_locators as $current_locator) {

			$ar_current = [];

			// section_id (int)
				if (property_exists($current_locator, 'section_id') && !empty($current_locator->section_id)) {
					$ar_current[] = $table.'.section_id='.$current_locator->section_id;
				}

			// section_tipo (string)
				if (property_exists($current_locator, 'section_tipo') && !empty($current_locator->section_tipo)) {
					$ar_current[] = $table.'.section_tipo=\''.$current_locator->section_tipo.'\'';
				}

			// tipo (string). time machine case (column 'tipo' exists)
				if (property_exists($current_locator, 'tipo') && !empty($current_locator->tipo)) {
					if ($this->matrix_table==='matrix_time_machine') {
						$ar_current[] = $table.'.tipo=\''.$current_locator->tipo.'\'';
					}else{
						debug_log(__METHOD__
							." Ignored property 'tipo' in locator because is only allowed in time machine table."
							, logger::WARNING
						);
					}
				}

			// type (string)
				if (property_exists($current_locator, 'type') && !empty($current_locator->type)) {
					$ar_current[] = $table.'.type='.$current_locator->type;
				}

			// lang (string). time machine case (column 'lang' exists)
				if (property_exists($current_locator, 'lang') && !empty($current_locator->lang)) {
					if ($this->matrix_table==='matrix_time_machine') {
						$ar_current[] = $table.'.lang=\''.$current_locator->lang.'\'';
					}else{
						debug_log(__METHOD__
							." Ignored property 'lang' in locator because is only allowed in time machine table."
							, logger::WARNING
						);
					}
				}

			// matrix_id (int). time machine case (column 'id' exists and is used)
				if (property_exists($current_locator, 'matrix_id') && !empty($current_locator->matrix_id)) {
					if ($this->matrix_table==='matrix_time_machine') {
						$ar_current[] = $table.'.id='.$current_locator->matrix_id;
					}else{
						debug_log(__METHOD__
							." Ignored property 'matrix_id' in locator because is only allowed in time machine table."
							, logger::WARNING
						);
					}
				}

			$ar_parts[] = '(' . implode(' AND ', $ar_current) . ')';
		}

		// Add to where clause
		$this->sql_obj->where[] = PHP_EOL . '-- filter_by_locators' . PHP_EOL . implode(' OR ', $ar_parts);
	}//end build_sql_filter_by_locators



	/**
	* BUILD_SQL_PROJECTS_FILTER
	* Create the SQL sentence for filter records by user projects
	* It is based on user permissions and current section_tipo
	* @param bool $force_calculate = false
	* 	Optional force param for debug purposes
	* @return string $sql_projects_filter
	*/
	public function build_sql_projects_filter( bool $force_calculate=false ) : void {

		// skip_projects_filter
			if ($this->sqo->skip_projects_filter===true) {
				return;
			}

		// short vars
			$section_tipo		= $this->main_section_tipo;
			$section_alias		= $this->main_section_tipo_alias;

			$user_id			= logged_user_id(); // Logged user id
			if (empty($user_id)) {
				debug_log(__METHOD__
					. " Error: user id unavailable (logged_user_id)"				
					, logger::ERROR
				);
				return;
			}

		// only for non global admins
			$is_global_admin = (bool)security::is_global_admin($user_id);
			if ($is_global_admin!==true || $force_calculate===true) {

				$sql_filter = '';

				switch (true) {
					##### PROFILES ########################################################
					case ($section_tipo===DEDALO_SECTION_PROFILES_TIPO) :
						if(SHOW_DEBUG===true || DEVELOPMENT_SERVER===true) {
							$sql_filter .= "\n-- filter_profiles [PROFILES SECTION] (no filter is used here) -- \n";
						}
						break;
					##### PROJECTS ########################################################
					case ($section_tipo===DEDALO_FILTER_SECTION_TIPO_DEFAULT) :
						if(SHOW_DEBUG===true || DEVELOPMENT_SERVER===true) {
							$sql_filter .= "\n-- filter_user_created [PROJECTS SECTION] -- (no filter is used here since 31-03-2018) -- \n";
						}
						break;
					##### USERS ###########################################################
					case ($section_tipo===DEDALO_SECTION_USERS_TIPO) :

						# AREAS FILTER
							if(SHOW_DEBUG===true || DEVELOPMENT_SERVER===true) {
								$sql_filter .= "\n-- filter_users_by_profile_areas -- ";
							}
							$sql_filter .= PHP_EOL .'AND '.$section_alias.'.section_id > 0 AND ';
							$sql_filter .= PHP_EOL . $section_alias.'.'.$datos_container.' @>\'{"created_by_userID":'.$user_id.'}\'::jsonb OR ' .PHP_EOL;
							$sql_filter .= '((';

						# PROJECTS FILTER
							$component_filter_master_model	= ontology_node::get_model_by_tipo(DEDALO_FILTER_MASTER_TIPO,true);
							$component_filter_master		= component_common::get_instance(
								$component_filter_master_model, // 'component_filter_master',
								DEDALO_FILTER_MASTER_TIPO,
								$user_id,
								'list',
								DEDALO_DATA_NOLAN,
								DEDALO_SECTION_USERS_TIPO
							);
							$filter_master_dato = (array)$component_filter_master->get_dato();
							// check empty ar_area_tipo case
								if (empty($filter_master_dato)) {
									debug_log(__METHOD__
										." Filter master without data!! "
										, logger::ERROR
									);
									throw new Exception("Error Processing Request. Invalid filter master data", 1);
								}
							if(SHOW_DEBUG===true) {
								$sql_filter .= "\n-- filter_by_projects --";
							}
							# Filter by any of user projects
							$ar_query = [];
							foreach ((array)$filter_master_dato as $current_project_locator) {
								$search_locator = new locator();
									$search_locator->set_section_tipo($current_project_locator->section_tipo);
									$search_locator->set_section_id($current_project_locator->section_id);
									$search_locator->set_type($current_project_locator->type);

								$ar_query[] = $section_alias.'.'.$datos_container.'#>\'{relations}\'@>\'['.json_encode($search_locator).']\'::jsonb';
							}
							$sql_filter .= PHP_EOL . 'AND (' . implode(' OR ',$ar_query) . ')';

							$sql_filter .= ')';
						break;
					##### DEFAULT #########################################################
					default:
						if(SHOW_DEBUG===true || DEVELOPMENT_SERVER===true) {
							$sql_filter .= "\n-- filter_by_projects --";
						}

						# SECTION FILTER TIPO : Actual component_filter of this section
						$ar_component_filter = section::get_ar_children_tipo_by_model_name_in_section(
							$section_tipo, // string section_tipo
							['component_filter'], // array ar_model name_required
							true, // bool from_cache
							true, // bool resolve_virtual
							true, // bool recursive
							true // bool search_exact
						);
						if (!isset($ar_component_filter[0])) {
							$section_name = ontology_node::get_term_by_tipo($section_tipo);
							debug_log(__METHOD__
								." Error Processing Request. Filter not found is this section ($section_tipo) $section_name "
								, logger::ERROR
							);
							return;
						}
						
						$component_filter_tipo = $ar_component_filter[0];						

						$ar_projects = filter::get_user_projects($user_id); // return array of locators
						if (empty($ar_projects)) {

							// Invalid filter case
							$this->sql_obj->where[] = $section_alias.'.relation ? \'IMPOSSIBLE VALUE (User without projects)\' ';

						}else{

							// Default case. Filter by any of user projects
							$ar_section_id = [];
							foreach ($ar_projects as $current_project_locator) {
								$ar_section_id[] = $current_project_locator->section_id;								
							}
							$search_ids = implode("','", $ar_section_id);

							$this->sql_obj->where[] = "EXISTS ( SELECT 1
								FROM jsonb_array_elements({$section_alias}.relation::jsonb->'{$component_filter_tipo}') AS item 
								WHERE item->>'section_id' IN ('{$search_ids}')
							)";
						}
						break;
				}	//end switch (true)	
			}//end if ($is_global_admin!==true) {

		// cache
			// $sql_projects_filter_data[$uid] = $sql_projects_filter;
	}//end build_sql_projects_filter



}//end where