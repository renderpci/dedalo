<?php
// include_once(DEDALO_LIB_BASE_PATH.'/config/core_functions.php');

/**
* PROCESS_RESULT
* Util abstract class to manage data process_result
* Only static function are defined here
*/
abstract class process_result {



	/**
	* ADD_PARENTS_AND_CHILDREN_RECURSIVE
	* Resolves the parents and children of the search result and merges them with the result data
	* @return object $ar_data
	*/
	public static function add_parents_and_children_recursive($ar_data, $options, $sql_options) {

		$columns = $options->columns;

		// $ar_section_id = array_map(function($el){
		// 	return $el['section_id'];
		// }, $ar_data);

		// ar_section_id
			$ar_section_id = [];
			$ar_parent_sentences = [];
			foreach ($ar_data as $key => $row) {

				// row
				foreach ($columns as $column_obj) {

					$column_name = $column_obj->name;

					if (isset($row[$column_name])) {
						$value = json_decode($row[$column_name]);
						if (!empty($value)) {
							foreach ($value as $section_id) {
								if (!in_array($section_id, $ar_section_id)) {
									$ar_section_id[] = $section_id;
								}
							}
						}
					}

					$ar_parent_sentences[] = $column_name . ' LIKE \'%"'. $row['section_id'] .'"%\'';
				}
			}//foreach ($ar_data as $key => $row)


		// search 2
			// $children_sentences = array_map(function($item){
			// 	return 'section_id = ' . (int)$item;
			// }, $ar_section_id);
			$children_sentences[] = 'section_id IN (' . implode(',', $ar_section_id). ')';

			$all_sentences = array_merge($children_sentences, $ar_parent_sentences);
			$sql_filter = implode(' OR ', $all_sentences);

			$sql_options = clone $sql_options;
				$sql_options->process_result	= false; // avoid recursion
				$sql_options->sql_filter		= $sql_filter;
				$sql_options->count 			= false;

			$rows_data = web_data::get_rows_data($sql_options);

		// final merged result (avoiding duplicates)
			// $new_ar_data = array_merge($ar_data, $rows_data->result);
			$new_ar_data = $ar_data;
			foreach ($rows_data->result as $key => $value) {
				if (!in_array($value, $new_ar_data)) {
					$new_ar_data[] = $value;
				}
			}

			// check duplicates debug
				// $a = array_map(function($el){
				// 	return $el['section_id'];
				// }, $new_ar_data);
				// dump($a, ' a ++ '.to_string("1022"));

		// response
			$response = new stdClass();
				$response->ar_data = $new_ar_data;


		return $response;
	}//end add_parents_and_children_recursive



	/**
	* BREAK_DOWN_TOTALS
	* Split and recaulculate totals in a list of rows
	* Used for example to split mdcat interview informants place of birth when more than one informant or place exists
	* Like this case:
	* ref_lloc_naixement							ref_lloc_naixement_geojson
	* ["es1_3117"] | ["es1_3117"] | ["es1_3117"]	[{"layer_id":1,"text":"","layer_data":{"type":"FeatureCollection","features":[{"type":"Feature","properties":{},"geometry":{"type":"Point","coordinates":[2.821287,41.979888]}}]}}] | [{"layer_id":1,"text":"","layer_data":{"type":"FeatureCollection","features":[{"type":"Feature","properties":{},"geometry":{"type":"Point","coordinates":[2.821287,41.979888]}}]}}] | [{"layer_id":1,"text":"","layer_data":{"type":"FeatureCollection","features":[{"type":"Feature","properties":{},"geometry":{"type":"Point","coordinates":[2.821287,41.979888]}}]}}]
	* @return object $ar_data
	*/
	public static function break_down_totals($ar_data, $options, $sql_options) {

		// options
			$base_column	= $options->base_column; // name of the source column like 'ref_lloc_naixement'
			$total_column	= $options->total_column ?? 'total'; // name of the totals column like 'total'
			$split_colums	= $options->split_colums ?? null; // array of columns to split synchronized with the base column
			$separator		= $options->separator ?? ' | ';

		// rows
			$new_ar_data	= [];
			$length			= count($ar_data);
			for ($i=0; $i < $length; $i++) {

				$row = $ar_data[$i];

				$base_value		= $row[$base_column];
				$total_value	= $row[$total_column];

				// dump($row, ' row ++ '.to_string($i ." - $total_value - $base_value "));


				if (strpos($base_value, $separator)===false) {

					$found_key = array_search($base_value, array_column($new_ar_data, $base_column));

					if ($found_key!==false) {
						// sum totals
						$new_ar_data[$found_key][$total_column] = (int)$new_ar_data[$found_key][$total_column] + (int)$total_value;

					}else{
						// add untouched
						$new_ar_data[] = $row;
					}

				}else{


					// split
					$ar_beats = explode($separator, $base_value); // like ["es1_3117"] | ["es1_3118"]
					// if (!empty($split_colums)) {
					// 	$split_colums_beats = array_map(function(){
					// 	explode(' | ', $base_value);
					// 	}, $split_colums);
					// }

					foreach ($ar_beats as $b_value) {

						$found_key = array_search($b_value, array_column($new_ar_data, $base_column));

						if ($found_key!==false) {
							$new_ar_data[$found_key][$total_column] = (int)$new_ar_data[$found_key][$total_column] + $total_value;
						}else{
							// clone row
							$new_row = $row;

							$new_row[$base_column]	= $b_value;
							$new_row[$total_column]	= $total_value;

							$new_ar_data[] = $new_row;
						}
					}//end foreach ($ar_beats as $b_value)
				}

			}//end for ($i=0; $i < $length; $i++)


		// response
			$response = new stdClass();
				$response->ar_data = $new_ar_data;

		return $response;
	}//end break_down_totals



}//end class process_result