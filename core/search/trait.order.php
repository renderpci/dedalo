<?php declare(strict_types=1);
/**
* CLASS SEARCH
* TRAIT ORDER
*
*/
trait order {

	/**
	* BUILD_SQL_QUERY_ORDER
	* Creates the SQL to order based on search_query_object order property
	* Could be 'order_custom' when is special full defined order or default 'order'
	* @return string $sql_query_order
	*/
	public function build_sql_query_order() : string {

		$sql_query_order = '';

		if ( !empty($this->sqo->order_custom) ) {

			// custom order
				$ar_custom_query		= [];
				$ar_custom_query_order	= [];
				foreach ($this->sqo->order_custom as $item_key => $order_item) {

					$column_section_tipo	= '\''.$order_item->section_tipo.'\''; // added 21-08-2019
					$column_name			= $order_item->column_name;
					$column_values			= $order_item->column_values;
					$table					= ($item_key>0) ? 'x'.$item_key : 'x';

					$pairs = [];
					foreach ($column_values as $key => $value) {
						$value		= is_string($value) ? "'" . $value . "'" : $value;
						$pair		= '('.$column_section_tipo.','.$value.','.($key+1).')';
						$pairs[]	= $pair;
					}
					// Join like: LEFT JOIN (VALUES (7,1),(1,2)) as x(ordering_id, ordering) ON main_select.section_id = x.ordering_id ORDER BY x.ordering ASC
					$ar_custom_query[]			= 'LEFT JOIN (VALUES '.implode(',', $pairs).') as '.$table.'(ordering_section_tipo, ordering_id, ordering) ON main_select.'.$column_name.'='.$table.'.ordering_id AND main_select.section_tipo='.$table.'.ordering_section_tipo'; // added 21-08-2019
					$ar_custom_query_order[]	= 'ORDER BY '.$table.'.ordering ASC';
				}

			// flat and set. Note that no $sql_query_order value is filled and returned
				$this->sql_query_order_custom = implode(' ', $ar_custom_query) . ' ' . implode(',', $ar_custom_query_order);

		}elseif (!empty($this->sqo->order)) {

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
		}

		// add NULLS LAST for convenience
			if (!empty($sql_query_order)) {
				$sql_query_order .= ' NULLS LAST';
				if (strpos($sql_query_order, 'section_id')===false) {
					$sql_query_order .= ' , section_id ASC';
				}
			}
		// debug
			// if(SHOW_DEBUG===true) {
			// 	debug_log(__METHOD__." sql_query_order: ".to_string($sql_query_order), logger::DEBUG);
			// }


		return $sql_query_order;
	}//end build_sql_query_order


}//end order