<?php
/**
* PROCESS_RESULT
* Util abstract class to manage data process_result 
* Only static function are defined here 
*/
abstract class process_result {



	/**
	* add_parents_and_children_recursive
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
			$children_sentences = array_map(function($item){
				return 'section_id = ' . (int)$item;
			}, $ar_section_id);
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



}//end class process_result