<?php declare(strict_types=1);

/**
 * CLASS INSTALL_DATA_SEEDER
 * Seeds the mandatory bootstrap rows needed for a fresh Dédalo v7 installation.
 *
 * Responsibilities:
 * - Inserts the root user (section_id -1, section_tipo 'dd128') into matrix_users.
 * - Inserts the default "General project" (section_id 1, section_tipo 'dd153') into matrix_projects.
 * - Inserts the two baseline profiles "Admin" (id 1) and "User" (id 2) into matrix_profiles,
 *   both under section_tipo 'dd234'.
 * - Inserts a minimal fixture row into matrix_test that unit tests rely on.
 *
 * Each method truncates its target table and resets the PK sequence before inserting, so
 * these operations are idempotent when re-run against a blank install database.
 *
 * All SQL is executed against the install database connection obtained from
 * install_config_manager::get_db_install_conn() — NOT the production connection.
 *
 * Data is stored in the Dédalo v7 typed-column matrix schema:
 *   - data     (JSONB) — section-level metadata (label, dates, user ids)
 *   - relation (JSONB) — outbound locators keyed by from_component_tipo
 *   - string   (JSONB) — string-type component values (input_text, password), keyed by tipo
 *   - date     (JSONB) — date-type component values, keyed by tipo
 *   - meta     (JSONB) — per-component item counts, keyed by tipo
 *
 * This class has no constructor (static utility). It is called during installation
 * and collaborates with install_config_manager for config and connection details.
 *
 * @package Dédalo
 * @subpackage Install
 */
final class install_data_seeder {

	/**
	* Private constructor to prevent instantiation (static utility class)
	*/
	private function __construct() {}

	/**
	* CREATE_ROOT_USER
	* Truncates matrix_users, resets its PK sequence, and inserts the built-in root
	* user with section_id -1 (a sentinel value that bypasses normal save guards).
	*
	* The inserted row encodes:
	*   - string['dd132']: username = 'root' (lang lg-nolan, language-neutral)
	*   - string['dd133']: password array is intentionally left empty — the actual
	*     encrypted password is written later by install_config_manager::set_root_pw().
	*   - relation['dd131']: points to project section_id=1 (the main project, dd64).
	*   - relation['dd244']: points to profile section_id=2 (the "User" profile, dd64).
	*   - relation['dd1725']: points to profile section_id=2 in the profiles table (dd234).
	*   - relation['dd200'/'dd197']: self-referencing locators (created_by / modified_by).
	*   - date['dd199'/'dd201']: created_date / modified_date as structured date objects.
	*
	* (!) The $exec flag is hard-coded to true; it was originally a dry-run toggle and
	*     is never set false in production. Do not remove it — it serves as a pattern
	*     for future dry-run support.
	*
	* @return object $response - stdClass with bool result and string msg
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
		// 'label' is the human-readable table name shown in DB management views; not a user-visible field
			$data = json_encode((object)[
				'label'             => 'Usuarios',
				'section_tipo'      => 'dd128',
				'created_date'      => '2022-09-30 13:48:31',
				'modified_date'     => '2022-09-30 13:48:31',
				'created_by_user_id' => -1,
				'modified_by_user_id' => -1
			]);
		// relation column: locators grouped by from_component_tipo
		// Each locator is an object with: id (position in the component array), type (relation type ontology term),
		// section_id (target record), section_tipo (target section's ontology tipo), from_component_tipo (the component owning this relation).
		// dd131 = projects membership; dd200 = created_by; dd197 = modified_by;
		// dd244 = profile (via dd64 projects table); dd1725 = profile (via dd234 profiles table)
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
		// dd132 = username; dd133 = password — empty array intentionally: password is written later by set_root_pw()
			$string = json_encode((object)[
				'dd132' => [
					(object)['id' => 1, 'value' => 'root', 'lang' => 'lg-nolan']
				],
				'dd133' => [] // password is null by default, set via set_root_pw
			]);
		// date column: date values with id property
		// 'time' is a Dédalo internal epoch (seconds since a custom epoch, not Unix epoch)
		// dd199 = created_date; dd201 = modified_date — both set to the same instant on initial seed
			$date = json_encode((object)[
				'dd199' => [
					(object)['id' => 1, 'start' => (object)['day' => 30, 'hour' => 12, 'time' => 64772914091, 'year' => 2022, 'month' => 9, 'minute' => 8, 'second' => 11]]
				],
				'dd201' => [
					(object)['id' => 1, 'start' => (object)['day' => 30, 'hour' => 12, 'time' => 64772914091, 'year' => 2022, 'month' => 9, 'minute' => 8, 'second' => 11]]
				]
			]);
		// meta column: counters per component tipo
		// Each entry tracks how many items exist for a given component in this section row.
		// The count drives pagination, display-order resolution, and next-id generation.
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
		// TRUNCATE + SEQUENCE RESET ensures idempotency: re-running this during a reinstall
		// always produces the same row with the same id and section_id values.
		// (!) section_id is explicitly set to '-1' rather than relying on the sequence,
		//     because -1 is a hard-coded sentinel used throughout the codebase to identify root.
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
				$msg = " Error on db execution (matrix_users): ".pg_last_error($db_install_conn);
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
	* Truncates matrix_projects, resets its PK sequence, and inserts the default
	* "General project" record (section_id 1, section_tipo 'dd153').
	*
	* The project row encodes:
	*   - string['dd155']: project code = '001' (language-neutral identifier)
	*   - string['dd156']: project name = 'General project' (English)
	*   - relation['dd200'/'dd197']: created_by / modified_by pointing to root user (section_id -1, dd128)
	*   - date['dd199']: created_date = 2010-02-15
	*   - date['dd201']: modified_date = 2018-12-10
	*   - data['diffusion_info']: null — not yet diffused to any publication target
	*
	* All users and records must belong to at least one project. This seed row
	* ensures there is always a project to assign during the install flow.
	*
	* @return object $response - stdClass with bool result and string msg
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
		// 'diffusion_info' is null until the project is published via the diffusion subsystem
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
		// dd200 = created_by; dd197 = modified_by — both point back to root (section_id -1, dd128)
			$relation = json_encode((object)[
				'dd200' => [
					(object)['id' => 1, 'type' => 'dd151', 'section_id' => '-1', 'section_tipo' => 'dd128', 'from_component_tipo' => 'dd200']
				],
				'dd197' => [
					(object)['id' => 1, 'type' => 'dd151', 'section_id' => '-1', 'section_tipo' => 'dd128', 'from_component_tipo' => 'dd197']
				]
			]);
		// string column: string values (component_input_text) with id+value+lang wrapper
		// dd155 = project code (language-neutral, stored under lg-nolan); dd156 = project name (English)
			$string = json_encode((object)[
				'dd155' => [
					(object)['id' => 1, 'value' => '001', 'lang' => 'lg-nolan']
				],
				'dd156' => [
					(object)['id' => 1, 'value' => 'General project', 'lang' => 'lg-eng']
				]
			]);
		// date column: date values with id property
		// dd199 = created_date; dd201 = modified_date
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
				$msg = " Error on db execution (matrix_projects): ".pg_last_error($db_install_conn);
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
	* Truncates matrix_profiles, resets its PK sequence, and inserts two baseline
	* access profiles required by the permission system (section_tipo 'dd234'):
	*
	*   - Profile 1 (section_id 1): "Admin" — intended for superuser-level access grants.
	*   - Profile 2 (section_id 2): "User" — the generic default profile for standard accounts.
	*
	* For each profile the row encodes:
	*   - string['dd237']: profile name (English)
	*   - string['dd238']: profile description as HTML paragraph
	*   - relation['dd200'/'dd197']: created_by / modified_by, both referencing root (section_id -1)
	*   - date['dd199'/'dd201']: creation and modification timestamps
	*
	* Both profiles are inserted in a single pg_query call to keep the operation atomic.
	* The root user seed row (create_root_user) already references profile 2 via
	* relation['dd1725'] — so this method must be called after create_root_user in
	* the install sequence, or the FK-equivalent reference will point to a non-existent row.
	*
	* @return object $response - stdClass with bool result and string msg
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
		// dd237 = profile name; dd238 = profile description (HTML)
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
		// dd237 = profile name; dd238 = profile description (HTML)
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
		// Both profiles are inserted in one pg_query call; if either fails, neither row is committed.
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
				$msg = " Error on db execution (matrix_profiles): ".pg_last_error($db_install_conn);
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
	* Truncates matrix_test, resets its PK sequence, and inserts a minimal fixture row
	* (section_id 1, section_tipo 'test3') required by the Dédalo unit-test suite.
	*
	* The row only populates the 'data' column (modified_date, diffusion_info, modified_by_user_id).
	* No string, relation, date, or meta columns are written — unit tests that need those columns
	* populate them programmatically at test time.
	*
	* (!) The table 'matrix_test' must already exist in the install database before this method
	*     is called. It is created by install_database_manager earlier in the install sequence.
	*
	* @return object $response - stdClass with bool result and string msg
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
		// Only the data column is seeded for the test record; component columns remain null.
		// 'diffusion_info' is null — test records are never published to a diffusion target.
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
				$msg = " Error on db execution (".$table."): ".pg_last_error($db_install_conn);
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
