<?php declare(strict_types=1);
/**
* UNIT_TEST
* Server peer of the area_maintenance `unit_test` widget.
*
* Owns the widget's own maintenance action (create_test_record), dispatched from
* the browser through dd_area_maintenance_api::widget_request (source.model =
* 'unit_test'). The long-process stress test is intentionally NOT here: it is a
* shared background-process / SSE test utility (area_maintenance::long_process_stream,
* also used by core/lab and gated by the background process runner), so it stays
* at the area level.
*
* @package Dédalo
* @subpackage Core
*/
class unit_test {



	/**
	* Allowlist of public API actions callable through widget_request (SEC-044).
	* Only these method names may be dispatched by the widget request handler.
	* @var array<int,string>
	*/
	const API_ACTIONS = [
		'create_test_record'
	];



	/**
	* CREATE_TEST_RECORD
	* Provisions a clean, known-state row in `matrix_test` so client/server unit
	* tests run against a predictable dataset.
	*
	* The bundled `test_data.json` (in this widget directory) is a v7 columnar
	* fixture: a JSON object whose keys are the v7 typed columns (`data`, `relation`,
	* `string`, `date`, `number`, `geo`, `media`, `iri`, `misc`, `meta`,
	* `relation_search`). Each key's value is the JSONB payload for that column.
	*
	* The operation runs three sequential SQL statements:
	*   1. TRUNCATE matrix_test       — removes any leftover rows from prior runs.
	*   2. ALTER SEQUENCE … RESTART   — resets the id auto-increment to 1 so test
	*                                   assertions on section_id are stable.
	*   3. INSERT INTO matrix_test    — inserts a single row distributing the
	*                                   fixture JSON across the v7 typed columns.
	*
	* Precondition: the `matrix_test` table and its sequence `matrix_test_id_seq`
	* must already exist in PostgreSQL (created by the DB install scripts).
	*
	* @param object $options - widget request options (unused; signature required by the widget API)
	* @return object - {result: bool, msg: string}; result is false if any SQL step
	*                  fails, with msg containing the pg_last_error() details.
	*/
	public static function create_test_record( object $options ) : object {

		$response = new stdClass();
		$response->result = false;
		$response->msg = 'Error. Request failed ' . __METHOD__;

		// short vars
		$db_conn = DBi::_getConnection();
		$section_tipo = 'test3';
		$table = 'matrix_test';

		// test data (v7 columnar fixture)
		// The file is a JSON object keyed by v7 column name. Only columns present
		// in the fixture and allowed by matrix_db_manager::$columns are written;
		// every other column stays NULL.
		$test_data_raw	= file_get_contents(dirname(__FILE__) . '/test_data.json');
		$test_data		= json_handler::decode($test_data_raw);
		if ($test_data === null) {
			$msg = ' Error decoding test_data.json';
			debug_log(__METHOD__ . $msg, logger::ERROR);
			$response->msg = $msg;
			return $response;
		}

		// exec SQL
		// Statement 1: TRUNCATE table
		$sql1 = 'TRUNCATE TABLE ' . $table;
		$result = pg_query($db_conn, $sql1);
		if (!$result) {
			$msg = " Error on TRUNCATE: " . pg_last_error($db_conn);
			debug_log(
				__METHOD__
				. $msg . PHP_EOL
				. ' SQL: ' . $sql1
				,
				logger::ERROR
			);
			$response->msg = $msg;
			return $response;
		}

		// Statement 2: Reset sequence
		$sql2 = 'ALTER SEQUENCE ' . $table . '_id_seq RESTART WITH 1';
		$result = pg_query($db_conn, $sql2);
		if (!$result) {
			$msg = " Error on ALTER SEQUENCE: " . pg_last_error($db_conn);
			debug_log(
				__METHOD__
				. $msg . PHP_EOL
				. ' SQL: ' . $sql2
				,
				logger::ERROR
			);
			$response->msg = $msg;
			return $response;
		}

		// Statement 3: INSERT data
		// Builds a prepared INSERT distributing the fixture across the v7 typed
		// columns. JSONB columns receive a $N::jsonb cast; section_id/section_tipo
		// are plain scalars. Columns are validated against matrix_db_manager to
		// reject any unexpected key in the fixture.
		$columns	= ['section_id', 'section_tipo'];
		$placeholders = ['$1', '$2'];
		$params		= ['1', $section_tipo];
		$idx		= 2;
		foreach ($test_data as $column => $value) {
			if (!isset(matrix_db_manager::$columns[$column])) {
				debug_log(__METHOD__ . " Skipped unknown column '$column' in test_data.json", logger::WARNING);
				continue;
			}
			if ($value === null || $value === []) continue;
			$idx++;
			$columns[]		= '"' . $column . '"';
			$placeholders[]	= '$' . $idx . '::jsonb';
			$params[]		= json_handler::encode($value);
		}

		$sql3 = 'INSERT INTO ' . $table
			. ' (' . implode(', ', $columns) . ')'
			. ' VALUES (' . implode(', ', $placeholders) . ')';
		$result = pg_query_params($db_conn, $sql3, $params);
		if (!$result) {
			$msg = " Error on INSERT: " . pg_last_error($db_conn);
			debug_log(
				__METHOD__
				. $msg . PHP_EOL
				. ' SQL: ' . $sql3
				,
				logger::ERROR
			);
			$response->msg = $msg;
			return $response;
		}

		$response->result = true;
		$response->msg = 'OK. Request done ' . __METHOD__;


		return $response;
	}//end create_test_record



}//end unit_test
