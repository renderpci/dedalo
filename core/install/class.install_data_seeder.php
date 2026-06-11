<?php declare(strict_types=1);

include_once __DIR__ . '/class.install_config_manager.php';

/**
 * CLASS INSTALL_DATA_SEEDER
 * Encapsulates seeding of default data: root user,
 * main project, profiles, and test record.
 *
 * @package Dedalo
 * @subpackage Install
 */
class install_data_seeder {

	/**
	* CREATE_ROOT_USER
	* @return object $response
	*/
	public static function create_root_user() : object {

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed '.__METHOD__;

		// short vars
			$config				= install_config_manager::get_config();
			$db_install_conn	= install_config_manager::get_db_install_conn();
			$exec				= true;

		// v7 schema: data distributed across typed columns
		// data column: section-level metadata
			$data = json_encode((object)[
				'label'             => 'Usuarios',
				'section_tipo'      => 'dd128',
				'created_date'      => '2022-09-30 13:48:31',
				'modified_date'     => '2022-09-30 13:48:31',
				'created_by_user_id' => -1,
				'modified_by_user_id' => -1
			]);
		// relation column: locators grouped by from_component_tipo
			$relation = json_encode((object)[
				'dd131' => [
					(object)['id' => 1, 'type' => 'dd151', 'section_id' => '1', 'section_tipo' => 'dd64', 'from_component_tipo' => 'dd131']
				],
				'dd200' => [
					(object)['id' => 1, 'type' => 'dd151', 'section_id' => '-1', 'section_tipo' => 'dd128', 'from_component_tipo' => 'dd200']
				],
				'dd197' => [
					(object)['id' => 1, 'type' => 'dd151', 'section_id' => '-1', 'section_tipo' => 'dd128', 'from_component_tipo' => 'dd197']
				],
				'dd244' => [
					(object)['id' => 1, 'type' => 'dd151', 'section_id' => '2', 'section_tipo' => 'dd64', 'from_component_tipo' => 'dd244']
				],
				'dd1725' => [
					(object)['id' => 1, 'type' => 'dd151', 'section_id' => '2', 'section_tipo' => 'dd234', 'from_component_tipo' => 'dd1725']
				]
			]);
		// string column: string values (component_input_text, component_password) with id+value+lang wrapper
			$string = json_encode((object)[
				'dd132' => [
					(object)['id' => 1, 'value' => 'root', 'lang' => 'lg-nolan']
				],
				'dd133' => [] // password is null by default, set via set_root_pw
			]);
		// date column: date values with id property
			$date = json_encode((object)[
				'dd199' => [
					(object)['id' => 1, 'start' => (object)['day' => 30, 'hour' => 12, 'time' => 64772914091, 'year' => 2022, 'month' => 9, 'minute' => 8, 'second' => 11]]
				],
				'dd201' => [
					(object)['id' => 1, 'start' => (object)['day' => 30, 'hour' => 12, 'time' => 64772914091, 'year' => 2022, 'month' => 9, 'minute' => 8, 'second' => 11]]
				]
			]);
		// meta column: counters per component tipo
			$meta = json_encode((object)[
				'dd131'  => [(object)['count' => 1]],
				'dd200'  => [(object)['count' => 1]],
				'dd197'  => [(object)['count' => 1]],
				'dd244'  => [(object)['count' => 1]],
				'dd1725' => [(object)['count' => 1]],
				'dd132'  => [(object)['count' => 1]],
				'dd199'  => [(object)['count' => 1]],
				'dd201'  => [(object)['count' => 1]]
			]);
		$sql = '
			TRUNCATE "matrix_users";
			ALTER SEQUENCE matrix_users_id_seq RESTART WITH 1;
			INSERT INTO "matrix_users" ("section_id", "section_tipo", "data", "relation", "string", "date", "meta")
			VALUES (\'-1\', \'dd128\', \''.$data.'\', \''.$relation.'\', \''.$string.'\', \''.$date.'\', \''.$meta.'\');
		';
		debug_log(__METHOD__." Executing DB query ".to_string($sql), logger::WARNING);
		if ($exec) {
			$result   = pg_query($db_install_conn, $sql);
			if (!$result) {
				$msg = " Error on db execution (matrix_counter): ".pg_last_error($db_install_conn);
				debug_log(__METHOD__.$msg, logger::ERROR);
				$response->msg = $msg;
				return $response;
			}
		}

		$response->result	= true;
		$response->msg		= 'OK. Request done '.__METHOD__;

		return $response;
	}//end create_root_user

	/**
	* CREATE_MAIN_PROJECT
	* @return object $response
	*/
	public static function create_main_project() : object {

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed '.__METHOD__;

		// short vars
			$config				= install_config_manager::get_config();
			$db_install_conn	= install_config_manager::get_db_install_conn();
			$exec				= true;

		// v7 schema: data distributed across typed columns
		// data column: section-level metadata
			$data = json_encode((object)[
				'label'              => 'Proyectos',
				'section_tipo'       => 'dd153',
				'created_date'       => '2010-02-15 00:00:00',
				'modified_date'      => '2018-12-10 16:12:02',
				'diffusion_info'     => null,
				'created_by_user_id' => -1,
				'modified_by_user_id' => -1
			]);
		// relation column: locators grouped by from_component_tipo
			$relation = json_encode((object)[
				'dd200' => [
					(object)['id' => 1, 'type' => 'dd151', 'section_id' => '-1', 'section_tipo' => 'dd128', 'from_component_tipo' => 'dd200']
				],
				'dd197' => [
					(object)['id' => 1, 'type' => 'dd151', 'section_id' => '-1', 'section_tipo' => 'dd128', 'from_component_tipo' => 'dd197']
				]
			]);
		// string column: string values (component_input_text) with id+value+lang wrapper
			$string = json_encode((object)[
				'dd155' => [
					(object)['id' => 1, 'value' => '001', 'lang' => 'lg-nolan']
				],
				'dd156' => [
					(object)['id' => 1, 'value' => 'General project', 'lang' => 'lg-eng']
				]
			]);
		// date column: date values with id property
			$date = json_encode((object)[
				'dd199' => [
					(object)['id' => 1, 'start' => (object)['day' => 15, 'hour' => 0, 'time' => 64606896000, 'year' => 2010, 'month' => 2, 'minute' => 0, 'second' => 0]]
				],
				'dd201' => [
					(object)['id' => 1, 'start' => (object)['day' => 10, 'hour' => 16, 'time' => 64890432722, 'year' => 2018, 'month' => 12, 'minute' => 12, 'second' => 2]]
				]
			]);
		// meta column: counters per component tipo
			$meta = json_encode((object)[
				'dd200' => [(object)['count' => 1]],
				'dd197' => [(object)['count' => 1]],
				'dd155' => [(object)['count' => 1]],
				'dd156' => [(object)['count' => 1]],
				'dd199' => [(object)['count' => 1]],
				'dd201' => [(object)['count' => 1]]
			]);
		$sql = '
			TRUNCATE "matrix_projects";
			ALTER SEQUENCE matrix_projects_id_seq RESTART WITH 1;
			INSERT INTO "matrix_projects" ("section_id", "section_tipo", "data", "relation", "string", "date", "meta")
			VALUES (\'1\', \'dd153\', \''.$data.'\', \''.$relation.'\', \''.$string.'\', \''.$date.'\', \''.$meta.'\');
		';
		debug_log(__METHOD__." Executing DB query ".to_string($sql), logger::WARNING);
		if ($exec) {
			$result   = pg_query($db_install_conn, $sql);
			if (!$result) {
				$msg = " Error on db execution (matrix_counter): ".pg_last_error($db_install_conn);
				debug_log(__METHOD__.$msg, logger::ERROR);
				$response->msg = $msg;
				return $response;
			}
		}

		$response->result	= true;
		$response->msg		= 'OK. Request done '.__METHOD__;

		return $response;
	}//end create_main_project

	/**
	* CREATE_MAIN_PROFILES
	* @return object $response
	*/
	public static function create_main_profiles() : object {

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed '.__METHOD__;

		// short vars
			$config				= install_config_manager::get_config();
			$db_install_conn	= install_config_manager::get_db_install_conn();
			$exec				= true;

		// Profile 1: Admin (section_id=1)
			$data1 = json_encode((object)[
				'label'              => 'Profiles',
				'section_tipo'       => 'dd234',
				'created_date'       => '2016-03-21 20:26:56',
				'modified_date'      => '2017-05-08 14:27:58',
				'diffusion_info'     => null,
				'created_by_user_id' => -1,
				'modified_by_user_id' => -1
			]);
		$relation1 = json_encode((object)[
				'dd200' => [
					(object)['id' => 1, 'type' => 'dd151', 'section_id' => '-1', 'section_tipo' => 'dd128', 'from_component_tipo' => 'dd200']
				],
				'dd197' => [
					(object)['id' => 1, 'type' => 'dd151', 'section_id' => '-1', 'section_tipo' => 'dd128', 'from_component_tipo' => 'dd197']
				]
			]);
		$string1 = json_encode((object)[
			'dd237' => [
				(object)['id' => 1, 'value' => 'Admin', 'lang' => 'lg-eng']
			],
			'dd238' => [
				(object)['id' => 1, 'value' => '<p>Admin general</p>', 'lang' => 'lg-eng']
			]
		]);
		$date1 = json_encode((object)[
			'dd199' => [
				(object)['id' => 1, 'start' => (object)['day' => 21, 'hour' => 20, 'time' => 64803010979, 'year' => 2016, 'month' => 3, 'minute' => 22, 'second' => 59]]
			],
			'dd201' => [
				(object)['id' => 1, 'start' => (object)['day' => 8, 'hour' => 14, 'time' => 64839364078, 'year' => 2017, 'month' => 5, 'minute' => 27, 'second' => 58]]
			]
		]);
		$meta1 = json_encode((object)[
			'dd200' => [(object)['count' => 1]],
			'dd197' => [(object)['count' => 1]],
			'dd237' => [(object)['count' => 1]],
			'dd238' => [(object)['count' => 1]],
			'dd199' => [(object)['count' => 1]],
			'dd201' => [(object)['count' => 1]]
		]);

		// Profile 2: User (section_id=2)
			$data2 = json_encode((object)[
				'label'              => 'Profiles',
				'section_tipo'       => 'dd234',
				'created_date'       => '2016-03-21 20:26:56',
				'modified_date'      => '2017-05-08 14:27:58',
				'diffusion_info'     => null,
				'created_by_user_id' => -1,
				'modified_by_user_id' => -1
			]);
		$relation2 = json_encode((object)[
				'dd200' => [
					(object)['id' => 1, 'type' => 'dd151', 'section_id' => '-1', 'section_tipo' => 'dd128', 'from_component_tipo' => 'dd200']
				],
				'dd197' => [
					(object)['id' => 1, 'type' => 'dd151', 'section_id' => '-1', 'section_tipo' => 'dd128', 'from_component_tipo' => 'dd197']
				]
			]);
		$string2 = json_encode((object)[
			'dd237' => [
				(object)['id' => 1, 'value' => 'User', 'lang' => 'lg-eng']
			],
			'dd238' => [
				(object)['id' => 1, 'value' => '<p>Generic user</p>', 'lang' => 'lg-eng']
			]
		]);
		$date2 = json_encode((object)[
			'dd199' => [
				(object)['id' => 1, 'start' => (object)['day' => 21, 'hour' => 20, 'time' => 64803011216, 'year' => 2016, 'month' => 3, 'minute' => 26, 'second' => 56]]
			],
			'dd201' => [
				(object)['id' => 1, 'start' => (object)['day' => 8, 'hour' => 14, 'time' => 64839364078, 'year' => 2017, 'month' => 5, 'minute' => 27, 'second' => 58]]
			]
		]);
		$meta2 = json_encode((object)[
			'dd200' => [(object)['count' => 1]],
			'dd197' => [(object)['count' => 1]],
			'dd237' => [(object)['count' => 1]],
			'dd238' => [(object)['count' => 1]],
			'dd199' => [(object)['count' => 1]],
			'dd201' => [(object)['count' => 1]]
		]);
		$sql = '
			TRUNCATE "matrix_profiles";
			ALTER SEQUENCE matrix_profiles_id_seq RESTART WITH 1;
			INSERT INTO "matrix_profiles" ("section_id", "section_tipo", "data", "relation", "string", "date", "meta") VALUES (\'1\', \'dd234\', \''.$data1.'\', \''.$relation1.'\', \''.$string1.'\', \''.$date1.'\', \''.$meta1.'\');
			INSERT INTO "matrix_profiles" ("section_id", "section_tipo", "data", "relation", "string", "date", "meta") VALUES (\'2\', \'dd234\', \''.$data2.'\', \''.$relation2.'\', \''.$string2.'\', \''.$date2.'\', \''.$meta2.'\');
		';
		debug_log(__METHOD__." Executing DB query ".to_string($sql), logger::WARNING);
		if ($exec) {
			$result   = pg_query($db_install_conn, $sql);
			if (!$result) {
				$msg = " Error on db execution (matrix_counter): ".pg_last_error($db_install_conn);
				debug_log(__METHOD__.$msg, logger::ERROR);
				$response->msg = $msg;
				return $response;
			}
		}

		$response->result	= true;
		$response->msg		= 'OK. Request done '.__METHOD__;

		return $response;
	}//end create_main_profiles

	/**
	* CREATE_TEST_RECORD
	* This record it's necessary to run unit_test checks
	* Table 'matrix_test' must to exists
	* @return object $response
	*/
	public static function create_test_record() : object {

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed '.__METHOD__;

		// short vars
			$config				= install_config_manager::get_config();
			$db_install_conn	= install_config_manager::get_db_install_conn();
			$exec				= true;
			$section_tipo		= 'test3';
			$table				= 'matrix_test';

		// v7 schema: data distributed across typed columns
			$data = json_encode((object)[
				'modified_date'      => '2022-10-07 11:16:43',
				'diffusion_info'     => null,
				'modified_by_user_id' => 1
			]);
		$sql = '
			TRUNCATE "'.$table.'";
			ALTER SEQUENCE '.$table.'_id_seq RESTART WITH 1;
			INSERT INTO "'.$table.'" ("section_id", "section_tipo", "data") VALUES (\'1\', \''.$section_tipo.'\', \''.$data.'\');
		';
		debug_log(__METHOD__." Executing DB query ".to_string($sql), logger::WARNING);
		if ($exec) {
			$result   = pg_query($db_install_conn, $sql);
			if (!$result) {
				$msg = " Error on db execution (matrix_counter): ".pg_last_error($db_install_conn);
				debug_log(__METHOD__.$msg, logger::ERROR);
				$response->msg = $msg;
				return $response;
			}
		}

		$response->result	= true;
		$response->msg		= 'OK. Request done '.__METHOD__;

		return $response;
	}//end create_test_record

}//end class install_data_seeder
