<?php declare(strict_types=1);
/**
* CLASS SEARCH
* TRAIT ORDER
* Order methods
*/
trait order {

	/**
	* BUILD_SQL_QUERY_ORDER
	* Creates the SQL to order based on search_query_object order property
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

						$alias	= $component_tipo . '_order';
						$column	.= ' as ' . $alias; // add alias name

						// Add to global order columns (necessary for order...)
						// This array is added when query select is calculated
						$this->order_columns[] = $column;

						$line = $alias . ' ' . $direction;

					}else if (true===in_array($component_tipo, search::$ar_direct_columns)) {

						// direct column case

						$line = $component_tipo . ' ' . $direction;

					}else{

						// default case

						// Add join if not exists
							$this->build_sql_join($path);

						// add sentence to line
							$alias	= $component_tipo . '_order';
							$line	= $alias . ' ' . $direction;

						// column
							$selector		= implode(',', $order_obj->component_path);
							$table_alias	= $this->get_table_alias_from_path($path);
							$base			= $table_alias . '.datos#>>\'{'.$selector.'}\'';
							$column			= $base .' as '. $alias;
							// Add to global order columns (necessary for order...)
							// This array is added when query select is calculated
							$this->order_columns[] = $column;
					}

					// line add
					$ar_order[] = $line;
				}
				// flat SQL sentences array
				$sql_query_order = implode(',', $ar_order);
		

			// add NULLS LAST for convenience
			if (!empty($sql_query_order)) {
				$sql_query_order .= ' NULLS LAST';
				if (strpos($sql_query_order, 'section_id')===false) {
					$sql_query_order .= ' , section_id ASC';
				}
			}

			$this->sql_obj->order[] = $sql_query_order;
		}

		// default order
		$section_tipo				= $this->main_section_tipo;
		$default_order				= ($section_tipo===DEDALO_ACTIVITY_SECTION_TIPO) ? 'DESC' : 'ASC';
		$sql_query_order_default	= $this->main_section_tipo_alias.'.section_id '.$default_order;
		
		$sentence = SHOW_DEBUG 
			? '-- order by default: ' . PHP_EOL . $sql_query_order_default 
			: $sql_query_order_default;	

		$this->sql_obj->order_default[] = PHP_EOL. $sentence;		

		return;
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