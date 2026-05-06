<?php
// tests/BaseTestCase.php
use PHPUnit\Framework\TestCase;

class BaseTestCase extends TestCase
{



    public $last_section_id = 1;
	public static $model;



	/**
	* SETUP
	* Ensure test user is logged in and has permissions on test sections
	* @return void
	*/
	protected function setUp(): void {
		parent::setUp();

		// Ensure user is logged in
		$this->user_login();

		// Force global admin and developer privileges for the test user
		// (force_login may set these to false if the security cache is not
		// yet built; tests expect TEST_USER_ID to have full privileges)
		$_SESSION['dedalo']['auth']['is_global_admin'] = true;
		$_SESSION['dedalo']['auth']['is_developer']    = true;

		// Grant permissions on test sections to prevent cascade failures
		// across API, component, security, and tool tests
		if (class_exists('component_security_access')) {
			$test_sections = ['test3', 'oh1', 'rsc197', 'dd88'];
			if (defined('DEDALO_ONTOLOGY_SECTION_TIPO')) {
				$test_sections[] = DEDALO_ONTOLOGY_SECTION_TIPO;
			}
			component_security_access::set_section_permissions((object)[
				'ar_section_tipo' => $test_sections,
				'user_id'         => TEST_USER_ID,
				'permissions'     => 2
			]);
			// Rebuild permissions cache from updated component data
			security::reset_permissions_table();

			// Directly populate the in-memory permissions table cache
			// to bypass any remaining file-cache invalidation issues
			$permissions_table = [];
			foreach ($test_sections as $section_tipo) {
				$permissions_table[$section_tipo . '_' . $section_tipo] = 2;
				$real_section = section::get_section_real_tipo_static($section_tipo);
				$ar_children = section::get_ar_children_tipo_by_model_name_in_section(
					$real_section,
					['component', 'button', 'section_group', 'relation_list', 'time_machine_list'],
					true, false, true, false
				);
				foreach ($ar_children as $child_tipo) {
					$permissions_table[$section_tipo . '_' . $child_tipo] = 2;
				}
			}
			security::$permissions_table_cache = $permissions_table;
		}
	}//end setUp



    /**
	 * EXECUTION_TIMING
	 * @return void
	 */
	protected function execution_timing(string $action, callable $callback, int|float $estimated_time, int $from = 1, int $n = 10000): void
	{

		$start_time = start_time();

		$to = $from + $n;
		for ($i = $from; $i < $to; $i++) {
			$callback($i);
			$this->last_section_id = $i;
		}
		// Check the time consuming.
		$total_time = exec_time_unit($start_time);
		$max_time = $estimated_time * 1.6;
		debug_log(
			__METHOD__
				. " (" . strtoupper($action) . ") total_time ms: " . $total_time . " - average ms: $total_time/$n = " . $total_time / $n,
			logger::WARNING
		);
		$eq = $total_time < $max_time;

		$icon = $eq ? '✅' : '❌';

        echo PHP_EOL . ". $icon Execution time ($action) total_time ms: " . $total_time . " - average ms: $total_time/$n = " . $total_time / $n . " - estimated_time ms: $estimated_time" . PHP_EOL . PHP_EOL;

		$this->assertTrue(
			$eq,
			"massive ($action) expected execution time rows bellow $max_time ms" . PHP_EOL
				. 'total_time ms: ' . $total_time . PHP_EOL
				. 'estimated_time ms: ' . $estimated_time
		);
	}//end execution_timing



	/**
	* USER_LOGIN
	* @return bool
	*/
	protected function user_login() : bool {

		$user_id = TEST_USER_ID; // Defined in bootstrap

		$result = login::is_logged();
		if ($result===false) {
			login_test::force_login($user_id);
			$result = login::is_logged();
		}

		return $result;
	}//end user_login



	/**
	* GET_SAMPLE_DATA
	* @return array
	*/
	public function get_sample_data( string $model ) : array {

		// load sample data
		$json_data = file_get_contents(
			DEDALO_CORE_PATH . '/'.$model.'/samples/data.json'
		);
		$result = json_decode($json_data);

		return $result;
	}//end get_sample_data



}//end BaseTestCase
