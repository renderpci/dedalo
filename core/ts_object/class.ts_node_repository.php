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
* (!) IMPORTANT: every public method returns null when anything cannot be resolved
* (unknown table, missing section_map, query failure). Callers MUST fall back
* to the legacy component-based path in that case — never assume the batch
* succeeded. Output parity with the legacy path is covered by
* test/server/ts_object/ts_object_Test.php and component_relation_children_Test.php.
*
* This class holds no instance state; all methods are static. It is not
* auto-loaded by the standard per-directory convention — ts_object.php
* explicitly requires it with require_once before use.
*
* @package Dédalo
* @subpackage Core
*/
class ts_node_repository {



	/**
	* FETCH_NODE_INFO
	* Resolves order value and is_indexable flag for a set of node locators
	* with one query per section_tipo group, replacing per-child component
	* instantiations in the ts_object hot path.
	*
	* The returned order value is formatted to match exactly what
	* component_number::set_format_form_type produces so that sort order is
	* identical to the legacy path. The is_indexable flag replicates the
	* ts_object::is_indexable logic: hierarchy/ontology roots, sections with no
	* resolvable model, and sections with no is_indexable tipo in their section_map
	* are always false.
	*
	* Nodes that have no matrix row (e.g. never saved) are filled in with
	* { order: null, is_indexable: false }, matching what the legacy component
	* path returns for empty data.
	*
	* @param array $locators
	* 	Array of objects with section_tipo and section_id properties
	* @return array|null $info
	* 	Map keyed by "{section_tipo}_{section_id}" of objects:
	* 	{ order: int|float|string|null, is_indexable: bool }
	* 	null when resolution failed (caller must fall back to the legacy path)
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
			// common::get_matrix_table_from_tipo resolves the physical PostgreSQL
			// table name from the section tipo (e.g. 'dd1' → 'matrix'). Returns
			// null/empty for sections that have no matrix table (e.g. virtual types).
				$table = common::get_matrix_table_from_tipo($section_tipo);
				if (empty($table)) {
					return null;
				}

			// section_map tipos. Same source the legacy component path uses.
			// order_tipo and is_indexable_tipo come from the thesaurus sub-object
			// of the section_map, which is configured per-project in the ontology.
			// safe_tipo() validates the regex pattern [a-z]{2,}[0-9]+ and returns
			// false on invalid input; a false result means we cannot safely embed
			// the tipo in SQL, so we abort the whole batch.
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
			// When the order_tipo is missing we skip the ontology lookup entirely.
				$order_number_type		= null;
				$order_number_precision	= 2;
				if ($safe_order_tipo!==null) {
					$order_node_properties	= ontology_node::get_instance($safe_order_tipo)->get_properties();
					$order_number_type		= $order_node_properties->type ?? null;
					$order_number_precision	= $order_node_properties->precision ?? 2;
				}

			// is_indexable section level rules (replicated from ts_object::is_indexable):
			// hierarchy/ontology roots are never indexable; missing or false map → false.
			// Checking the model here avoids issuing the query for section tipos that
			// the legacy path would also silently skip.
				$indexable_possible = $safe_indexable_tipo!==null
					&& strpos($section_tipo, 'hierarchy')!==0
					&& strpos($section_tipo, 'ontology')!==0
					&& !empty(ontology_node::get_model_by_tipo($section_tipo, true));

			// one query for the whole group
			// Both columns are extracted directly from the JSONB matrix column using
			// the ->>'key' operator. NULL is projected when the tipo key is absent.
			// The ANY($2::int[]) predicate lets us pass the full id list as a single
			// PostgreSQL array parameter, avoiding one round-trip per node.
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
					// pg_fetch_assoc always returns strings; cast to native numeric
					// before formatting so round() receives the right type.
					$order_value = $row['order_value'];
					if ($order_value!==null && is_numeric($order_value)) {
						$order_value = $order_value + 0; // restore native int|float
					}
					$order_value = self::format_number_value($order_value, $order_number_type, $order_number_precision);

					// is_indexable. The legacy path loads the component and checks
					// whether the first stored locator has section_id === 1 (the
					// "indexable" sentinel value). We replicate the same integer
					// comparison here against the raw JSONB value.
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
	*
	* Used by ts_object::has_children_of_type to determine whether any child is
	* a descriptor-type or non-descriptor-type term without instantiating one
	* component per grandchild. The sentinel values (1/2) match the relation
	* component's section_id convention for descriptor classification.
	*
	* Sections whose model cannot be resolved or whose section_map lacks an
	* is_descriptor tipo are assigned null flags (matching the legacy skip
	* behaviour) rather than causing the whole batch to abort. This is different
	* from fetch_node_info, which aborts on the first unresolvable section.
	*
	* @param array $locators
	* 	Array of objects with section_tipo and section_id properties
	* @return array|null $flags
	* 	Map keyed by "{section_tipo}_{section_id}" of int|null flag values.
	* 	null when resolution failed (caller must fall back to the legacy path)
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
			// Unlike fetch_node_info, a missing is_descriptor tipo per section is
			// not a fatal error — the entire section's nodes are assigned null so
			// the caller can handle them the same way the legacy loop does (skip).
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
			// Extracts the section_id of the first stored locator under the
			// is_descriptor relation key directly from the JSONB column.
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
	*
	* The type and precision arguments must be read from the order component's
	* ontology node properties (properties->type and properties->precision) so
	* that the output matches the formatted value produced by component_number.
	*
	* When $value is empty and not the integer 0, null is returned — matching
	* the component's behaviour for unset data. The default precision of 2
	* mirrors the component_number default.
	*
	* @param mixed $value
	* 	Raw string extracted from PostgreSQL JSONB (pg_fetch_assoc always returns strings)
	* @param string|null $type
	* 	The order component ontology properties->type ('int'|'float'|null).
	* 	Null defaults to float formatting.
	* @param int|float $precision = 2
	* 	Decimal places to use when rounding a float value.
	* @return int|float|string|null
	* 	Formatted numeric value, or null for missing/empty input
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
	*
	* Each locator must be an object with both section_tipo (string) and
	* section_id (numeric) properties. Any malformed locator causes the entire
	* grouping to fail (returns null) so callers fall back to the legacy path
	* rather than silently operating on a partial set.
	*
	* @param array $locators
	* 	Array of objects with section_tipo and section_id properties
	* @return array|null $groups
	* 	Map section_tipo => array of int section_ids, or null on invalid input
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
