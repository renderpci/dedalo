<?php declare(strict_types=1);
/**
* CLASS SEARCH
* TRAIT ORDER
* Order methods
*/
trait order {



	/**
	* BUILD_SQL_QUERY_ORDER
	* Generates the SQL ORDER BY and SELECT clauses based on the `search_query_object` sorting criteria.
	*
	* This method processes the `$this->sqo->order` array to construct the necessary SQL fragments:
	* 1. Extracting the required sorting component paths and directions.
	* 2. Determining if the sorting target is a special column (like date), a direct column (like section_id), or a regular component.
	* 3. For regular components, it delegates to the component's model (e.g., `build_order_select`) to generate a `jsonb_path_query_first`
	*    expression to extract the specific value for ordering, addressing multi-language and structured data formats.
	* 4. Appending the generated expressions to `$this->sql_obj->select` (to expose the extracted sort column) and `$this->sql_obj->order` (for the actual ORDER BY clause).
	* 5. Fallback to a default order using `section_id` if no specific order is requested or to establish a consistent tie-breaker.
	*
	* @return void
	*/
	public function build_sql_query_order() : void {

		$sql_query_order = '';
		if (!empty($this->sqo->order)) {

			// order default
				$ar_order = [];
				foreach ($this->sqo->order as $order_obj) {

					$direction		= strtoupper($order_obj->direction);
					$path			= $order_obj->path;
					$end_path		= end($path);
					$component_tipo	= $end_path->component_tipo;
					$column			= $end_path->column ?? null; // special optional full definition column (e.g. date)

					if( isset($column) ) {

						// column case. Special optional full definition column (e.g. date)

						$alias = $component_tipo . '_order';

						// Add to select columns
						$select_sentence = $column . ' as ' . $alias; // add alias name;
						$this->sql_obj->select[] = $select_sentence;

						// Order sentence
						$order_sentence = $alias . ' ' . $direction;

					}else if (true===in_array($component_tipo, search::$ar_direct_columns)) {

						// direct column case

						$column = $component_tipo;

						// Order sentence
						$order_sentence = $column . ' ' . $direction;

					}else{

						// default case

						// Add join if not exists
						$table_name = $this->build_sql_join($path);
						if(empty($table_name)) {
							$table_name = $this->main_section_tipo_alias;
						}

						$model = $order_obj->model ?? ontology_node::get_model_by_tipo($component_tipo);
						$column = section_record_data::$column_map[$model] ?? null;

						$alias = $component_tipo . '_order';

						$lang = $order_obj->lang ??
							(ontology_node::get_translatable($component_tipo) ? DEDALO_DATA_LANG : DEDALO_DATA_NOLAN);

						// build_order_select. Each model could have its own custom builder or use component common.
						// E.g.:
						// jsonb_path_query_first(
						// 	rs197_rs279_dd64.string->'dd62',
						// 	'$[*] ? (@.lang == \$lang).value',
						// 	'{"lang": "lg-spa"}'
						// ) #>> '{}' AS sort_val  -- expose sort column
						$select_sentence = $model::build_order_select((object)[
							'table_name'		=> $table_name,
							'column'			=> $column,
							'lang'			 	=> $lang,
							'component_tipo'	=> $component_tipo,
							'alias'			 	=> $alias
						]);

						// Add to select columns
						$this->sql_obj->select[] = $select_sentence;

						// Order sentence. Using the alias defined for select (using window in parse_sql_default)
						$order_sentence = $alias . ' ' . $direction;
					}

					// line add
					$ar_order[] = $order_sentence;
				}

			// flat SQL sentences array
			$sql_query_order = implode(',', $ar_order);

			// add NULLS LAST for convenience
			if (!empty($sql_query_order)) {
				$sql_query_order .= ' NULLS LAST';
				if (strpos($sql_query_order, 'section_id')===false) {
					$sql_query_order .= ', section_id ASC';
				}
			}

			$this->sql_obj->order[] = $sql_query_order;
		}

		// default order
		$section_tipo				= $this->main_section_tipo;
		$default_order				= ($section_tipo===DEDALO_ACTIVITY_SECTION_TIPO) ? 'DESC' : 'ASC';
		$sql_query_order_default	= $this->main_section_tipo_alias.'.section_id '.$default_order;

		$sentence = SHOW_DEBUG
			? $sql_query_order_default . ' -- default order'
			: $sql_query_order_default;

		$this->sql_obj->order_default[] = $sentence;
	}//end build_sql_query_order



	/**
	* BUILD_SQL_FILTER_BY_LOCATORS_ORDER
	* @return void
	*/
	public function build_sql_filter_by_locators_order() : void {

		if ( empty($this->sqo->filter_by_locators) ) {
			return;
		}

		$ar_values = [];
		foreach ($this->sqo->filter_by_locators as $key => $current_locator) {

			$value  = '(\''.$current_locator->section_tipo.'\'';
			$value .= ','.$current_locator->section_id;
			$value .= ','.($key+1).')';

			$ar_values[] = $value;
		}

		$string_query = 'LEFT JOIN (VALUES ' . implode(',', $ar_values) . ') as x(ordering_section, ordering_id, ordering) ON main_select.section_id=x.ordering_id AND main_select.section_tipo=x.ordering_section ORDER BY x.ordering ASC';

		$this->sql_obj->join[] = $string_query;
	}//end build_sql_filter_by_locators_order



}//end order