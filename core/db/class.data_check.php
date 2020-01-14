<?php
/**
* DATA_CHECK
*
*
*/
class data_check {



	/**
	* CHECK_SEQUENCES
	* @return stdClass object $response
	*/
	public function check_sequences() {

		$response = new stdClass();
			$response->result 	= true;
			$response->msg 	 	= '';

		try {

			// SHOW server_version;
			$sql 	 		= " SHOW server_version; ";
			$result_v 		= JSON_RecordObj_matrix::search_free($sql);
			$server_version = pg_fetch_result($result_v, 0, 'server_version');
			$ar_parts 		= explode('.', $server_version);
			$server_major_version = (int)$ar_parts[0];
				#dump($server_major_version, ' server_version ++ '.to_string());

			$response->msg .= "TEST ALL SEQUENCES IN DATABASE: ".DEDALO_DATABASE_CONN;

			$ar_skip_tables = array(); // 'sqlmapfile','sqlmapoutput'


			# Find and iterate all db tables
			$sql 	= " SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name ASC ";
			$result = JSON_RecordObj_matrix::search_free($sql);
			while ($rows = pg_fetch_assoc($result)) {

				$table_name = $rows['table_name'];

				if (in_array($table_name, $ar_skip_tables)) {
					continue; // Skip table
				}

				// Detected  sqlmap tables. 'sqlmapfile','sqlmapoutput'
				if (strpos($table_name, 'sqlmap')!==false) {
					throw new Exception("Error Processing Request. Security sql injection warning", 1);
				}

				# Find last id in table
				$sql 	 = " SELECT id FROM $table_name ORDER BY id DESC LIMIT 1 ";
				$result2 = JSON_RecordObj_matrix::search_free($sql);
				if (pg_num_rows($result2) === 0) {
					continue;	// Skip empty tables
				}
				$last_id = pg_fetch_result($result2, 0, 'id');

				# Find vars in current sequence
				if ($server_major_version>=10) {
					$search_table = 'sequencename';
					$sql = " SELECT last_value, start_value FROM pg_sequences WHERE $search_table = '".$table_name."_id_seq' ; ";
				}else{
					$search_table = $table_name."_id_seq";
					$sql = " SELECT last_value, start_value FROM $search_table ; ";
				}
				$result_seq 	= JSON_RecordObj_matrix::search_free($sql);
				if (pg_num_rows($result_seq) === 0) {
					debug_log(__METHOD__." Warning. {$table_name}_id_seq not found in $search_table ".to_string(), logger::WARNING);
					continue;	// Skip empty tables
				}
				$last_value 	= pg_fetch_result($result_seq, 0, 'last_value');
				$start_value 	= pg_fetch_result($result_seq, 0, 'start_value');

				$response->msg .= "<hr><b>$table_name</b> - start_value: $start_value - seq last_value: $last_value ";
				if ($last_value!=$last_id) {
					#$response->msg .= "<span style=\"color:#b97800\">[last id: $last_id] ALTER SEQUENCE {$table_name}_id_seq RESTART WITH $last_id;</span>";
					$response->msg .= "<span style=\"color:#b97800\">[last id: $last_id] SELECT setval('public.{$table_name}_id_seq', $last_id, true);</span>";
				}else{
					$response->msg .= "[last id: $last_id]";
				}


				if ($last_id>$last_value) {
					$response->msg .= "<br><b>   WARNING: seq last_id > last_value [$last_id > $last_value]</b>";
					$response->msg .= "<br>FIX AUTOMATIC TO $last_id start</pre>";
					#$response->msg .= "Use: <pre>SELECT setval('public.{$table_name}_id_seq', $last_id, true);</pre>";

					$sql2 	 = "SELECT setval('public.{$table_name}_id_seq', $last_id, true);";
					$result2 = JSON_RecordObj_matrix::search_free($sql2);
					if (!$result2) {
						$response->msg .= "Use: <b>SELECT setval('public.{$table_name}_id_seq', $last_id, true);</b>";
					}

					$response->result = false;
				}

				if ($start_value!=1) {
					$response->msg .= "<br><b>   WARNING: seq start_value != 1</b>";
					$response->msg .= "Use: <b>ALTER SEQUENCE {$table_name}_id_seq START WITH 1 ;</b>";

					$response->result = false;
				}

			}//end while ($rows = pg_fetch_assoc($result))


		} catch (Exception $e) {
			$response->result 	= false;
			$response->msg 		= 'Caught exception: ' .  $e->getMessage();
			return $response;
		}


		return (object)$response;
	}//end check_sequences



}//end data_check

