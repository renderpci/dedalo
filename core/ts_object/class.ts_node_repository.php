<?php declare(strict_types=1);
/**
* CLASS TS_NODE_REPOSITORY
* Batched, read-only access to the raw matrix rows backing thesaurus tree nodes.
*
* The tree hot path (dd_ts_api get_children_data → ts_object::parse_child_data)
* previously instantiated several components per child (order, is_indexable)
* and one component per grandchild (is_descriptor flags in has_children_of_type),
* producing N+1 query patterns on wide nodes.
*
* This repository replaces those per-node component loads with one SQL query
* per section_tipo group, resolving the SAME raw values the components read:
* - order:        number  -> {order_tipo}        -> first item -> value
* - is_indexable: relation -> {is_indexable_tipo} -> first locator -> section_id == 1
* - is_descriptor: relation -> {is_descriptor_tipo} -> first locator -> section_id (1|2)
*
* IMPORTANT: every public method returns null when anything cannot be resolved
* (unknown table, missing section_map, query failure). Callers MUST fall back
* to the legacy component-based path in that case — never assume the batch
* succeeded. Output parity with the legacy path is covered by
* test/server/ts_object/ts_object_Test.php and component_relation_children_Test.php.
*/
class ts_node_repository {



	/**
	* FETCH_NODE_INFO
	* Resolves order value and is_indexable flag for a set of node locators
	* with one query per section_tipo group.
	* @param array $locators
	* 	Array of objects with section_tipo and section_id properties
	* @return array|null $info
	* 	Map keyed by "{section_tipo}_{section_id}" of objects:
	* 	{ order: int|float|string|null, is_indexable: bool }
	* 	null when resolution failed (caller must use the legacy path)
	*/
	public static function fetch_node_info( array $locators ) : ?array {

		$groups = self::group_locators($locators);
		if ($groups===null) {
			return null;
		}

		$conn = DBi::_getConnection();
		if ($conn===false) {
			return null;
		}

		$info = [];
		foreach ($groups as $section_tipo => $section_ids) {

			// table
				$table = common::get_matrix_table_from_tipo($section_tipo);
				if (empty($table)) {
					return null;
				}

			// section_map tipos. Same source the legacy component path uses.
				$section_map		= section::get_section_map($section_tipo);
				$order_tipo			= $section_map->thesaurus->order ?? null;
				$is_indexable_tipo	= $section_map->thesaurus->is_indexable ?? null;
				$safe_order_tipo	= !empty($order_tipo) ? safe_tipo((string)$order_tipo) : null;
				$safe_indexable_tipo= (!empty($is_indexable_tipo) && $is_indexable_tipo!==false) ? safe_tipo((string)$is_indexable_tipo) : null;
				if ($safe_order_tipo===false || $safe_indexable_tipo===false) {
					return null;
				}

			// order component number format. component_number::get_data formats
			// every value (set_format_form_type); read the same ontology
			// properties so output types match the legacy path exactly.
				$order_number_type		= null;
				$order_number_precision	= 2;
				if ($safe_order_tipo!==null) {
					$order_node_properties	= ontology_node::get_instance($safe_order_tipo)->get_properties();
					$order_number_type		= $order_node_properties->type ?? null;
					$order_number_precision	= $order_node_properties->precision ?? 2;
				}

			// is_indexable section level rules (replicated from ts_object::is_indexable):
			// hierarchy/ontology roots are never indexable; missing or false map → false
				$indexable_possible = $safe_indexable_tipo!==null
					&& strpos($section_tipo, 'hierarchy')!==0
					&& strpos($section_tipo, 'ontology')!==0
					&& !empty(ontology_node::get_model_by_tipo($section_tipo, true));

			// one query for the whole group
				$order_select = $safe_order_tipo!==null
					? "number->'".$safe_order_tipo."'->0->>'value'"
					: 'NULL';
				$indexable_select = $safe_indexable_tipo!==null
					? "relation->'".$safe_indexable_tipo."'->0->>'section_id'"
					: 'NULL';

				$sql = '
					SELECT section_id,
						'.$order_select.' AS order_value,
						'.$indexable_select.' AS indexable_value
					FROM "'.$table.'"
					WHERE section_tipo = $1
					AND section_id = ANY($2::int[])
				';
				$result = pg_query_params($conn, $sql, [
					$section_tipo,
					'{' . implode(',', $section_ids) . '}'
				]);
				if ($result===false) {
					debug_log(__METHOD__
						. ' Error. Batch node info query failed' . PHP_EOL
						. ' section_tipo: ' . $section_tipo . PHP_EOL
						. ' error: ' . pg_last_error($conn)
						, logger::ERROR
					);
					return null;
				}

				while ($row = pg_fetch_assoc($result)) {

					// order. The legacy path reads component get_data()[0]->value
					// which component_number formats; apply the same formatting.
					$order_value = $row['order_value'];
					if ($order_value!==null && is_numeric($order_value)) {
						$order_value = $order_value + 0; // restore native int|float
					}
					$order_value = self::format_number_value($order_value, $order_number_type, $order_number_precision);

					$is_indexable = $indexable_possible
						&& $row['indexable_value']!==null
						&& (int)$row['indexable_value']===1;

					$info[$section_tipo . '_' . $row['section_id']] = (object)[
						'order'			=> $order_value,
						'is_indexable'	=> $is_indexable
					];
				}

			// missing rows: nodes without a matrix row resolve like the legacy
			// path does (no data → order null, not indexable)
				foreach ($section_ids as $section_id) {
					$key = $section_tipo . '_' . $section_id;
					if (!isset($info[$key])) {
						$info[$key] = (object)[
							'order'			=> null,
							'is_indexable'	=> false
						];
					}
				}
		}

		return $info;
	}//end fetch_node_info



	/**
	* BATCH_DESCRIPTOR_FLAGS
	* Resolves the is_descriptor flag (1 = descriptor, 2 = non descriptor) for
	* a set of node locators with one query per section_tipo group.
	* Replicates the legacy per-node read: first locator of the is_descriptor
	* relation group → (int)section_id.
	* @param array $locators
	* 	Array of objects with section_tipo and section_id properties
	* @return array|null $flags
	* 	Map keyed by "{section_tipo}_{section_id}" of int|null flag values.
	* 	null when resolution failed (caller must use the legacy path)
	*/
	public static function batch_descriptor_flags( array $locators ) : ?array {

		$groups = self::group_locators($locators);
		if ($groups===null) {
			return null;
		}

		$conn = DBi::_getConnection();
		if ($conn===false) {
			return null;
		}

		$flags = [];
		foreach ($groups as $section_tipo => $section_ids) {

			// model check (legacy skips sections whose model cannot be resolved)
				$model = ontology_node::get_model_by_tipo($section_tipo, true);
				if (empty($model)) {
					// legacy behavior: nodes of this section are skipped (flag null)
					foreach ($section_ids as $section_id) {
						$flags[$section_tipo . '_' . $section_id] = null;
					}
					continue;
				}

			// section_map is_descriptor tipo
				$section_map		= section::get_section_map($section_tipo);
				$is_descriptor_tipo	= $section_map->thesaurus->is_descriptor ?? null;
				if (empty($is_descriptor_tipo)) {
					// legacy behavior: invalid section_map → nodes skipped (flag null)
					foreach ($section_ids as $section_id) {
						$flags[$section_tipo . '_' . $section_id] = null;
					}
					continue;
				}
				$safe_descriptor_tipo = safe_tipo((string)$is_descriptor_tipo);
				if ($safe_descriptor_tipo===false) {
					return null;
				}

			// table
				$table = common::get_matrix_table_from_tipo($section_tipo);
				if (empty($table)) {
					return null;
				}

			// one query for the whole group
				$sql = '
					SELECT section_id,
						relation->\''.$safe_descriptor_tipo.'\'->0->>\'section_id\' AS descriptor_value
					FROM "'.$table.'"
					WHERE section_tipo = $1
					AND section_id = ANY($2::int[])
				';
				$result = pg_query_params($conn, $sql, [
					$section_tipo,
					'{' . implode(',', $section_ids) . '}'
				]);
				if ($result===false) {
					debug_log(__METHOD__
						. ' Error. Batch descriptor flags query failed' . PHP_EOL
						. ' section_tipo: ' . $section_tipo . PHP_EOL
						. ' error: ' . pg_last_error($conn)
						, logger::ERROR
					);
					return null;
				}

				while ($row = pg_fetch_assoc($result)) {
					$flags[$section_tipo . '_' . $row['section_id']] = $row['descriptor_value']!==null
						? (int)$row['descriptor_value']
						: null;
				}

			// missing rows resolve to null (legacy: empty data → skipped)
				foreach ($section_ids as $section_id) {
					$key = $section_tipo . '_' . $section_id;
					if (!array_key_exists($key, $flags)) {
						$flags[$key] = null;
					}
				}
		}

		return $flags;
	}//end batch_descriptor_flags



	/**
	* FORMAT_NUMBER_VALUE
	* Replicates component_number::set_format_form_type so batched order values
	* carry exactly the same type and rounding as the legacy component reads.
	* @param mixed $value
	* @param string|null $type
	* 	The order component ontology properties->type ('int'|'float'|null)
	* @param int|float $precision
	* @return int|float|string|null
	*/
	private static function format_number_value( mixed $value, ?string $type, int|float $precision=2 ) : int|float|string|null {

		if( empty($value) && $value!==0 ) {
			return null;
		}

		if (empty($type)) {
			// default format is float
			return (float)$value;
		}

		switch ($type) {
			case 'int':
				return (int)$value;

			case 'float':
			default:
				if (gettype($value)==='string' && strpos($value,',')===false && strpos($value,'.')===false) {
					$value = (int)$value;
				}
				if (gettype($value)!=='integer' && gettype($value)!=='double') {
					$value = (int)$value;
				}
				return is_numeric($value)
					? (float)round($value, (int)$precision)
					: (float)$value;
		}
	}//end format_number_value



	/**
	* GROUP_LOCATORS
	* Groups locator section_ids by section_tipo, validating shape.
	* @param array $locators
	* @return array|null $groups
	* 	Map section_tipo => array of int section_ids, null on invalid input
	*/
	private static function group_locators( array $locators ) : ?array {

		$groups = [];
		foreach ($locators as $locator) {
			if (!is_object($locator) || !isset($locator->section_tipo) || !isset($locator->section_id)) {
				return null;
			}
			if (!is_numeric($locator->section_id)) {
				return null;
			}
			$groups[$locator->section_tipo][] = (int)$locator->section_id;
		}

		return $groups;
	}//end group_locators



}//end class ts_node_repository
