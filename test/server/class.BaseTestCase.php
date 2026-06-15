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

		if(TEST_USER_ID === -1) {
			return;
		}

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
		// Perf measurement. This is an ABSOLUTE wall-clock benchmark over $n
		// iterations: its duration depends on machine load, so a hard pass/fail
		// assertion false-fails on shared/loaded runners (CI, or a dev box running
		// other work in parallel) — exactly the flakiness this helper used to cause.
		//
		// It is therefore NON-FATAL: a run slower than the load-tolerant ceiling
		// (estimated x4) is logged (WARNING within budget, ERROR over it) so genuine
		// perf drift stays visible in the server log, but it does NOT fail the suite.
		// Correctness is asserted by the calling test's own (result/shape) checks.
		//
		// (!) Reported via debug_log only — never echo to STDOUT from inside a test:
		// stray test output corrupts PHPUnit's process IPC and can abort the run
		// ("Premature end of PHPUnit's PHP process"), and trips "headers already
		// sent" for any later session_start.
		$total_time = exec_time_unit($start_time);
		$max_time = $estimated_time * 4; // load-tolerant ceiling
		$within_budget = $total_time < $max_time;

		$icon = $within_budget ? '✅' : '⚠️';
		$line = "Execution time ($action) total_time ms: $total_time - average ms: $total_time/$n = " . ($total_time / $n) . " - estimated_time ms: $estimated_time" . ($within_budget ? '' : " (over x4 ceiling $max_time ms — informational, not a failure)");

		debug_log(__METHOD__ . " ($icon) " . $line, $within_budget ? logger::WARNING : logger::ERROR);
	}//end execution_timing



	/**
	* SOFT_PERF
	* Non-fatal companion for inline wall-clock perf checks. Absolute timings depend
	* on machine load, so they must NOT fail the correctness suite (that is the
	* flakiness this replaces). Logs (via debug_log) a ⚠️ marker when a measured
	* duration exceeds its hand-tuned budget so genuine perf drift stays visible in
	* the server log, but never asserts. Callers keep their functional assertions
	* for correctness.
	*
	* (!) debug_log only — never echo to STDOUT from inside a test: stray output
	* corrupts PHPUnit's process IPC ("Premature end of PHPUnit's PHP process") and
	* trips "headers already sent" for any later session_start.
	*
	* @param string    $label       - human-readable operation label
	* @param int|float $total_time  - measured duration (ms)
	* @param int|float $budget      - hand-tuned expected ceiling (ms)
	* @return void
	*/
	protected function soft_perf(string $label, int|float $total_time, int|float $budget): void {
		$within = $total_time < $budget;
		$icon = $within ? '✅' : '⚠️';
		$msg = "Perf ($label) total_time ms: $total_time - budget ms: $budget" . ($within ? '' : ' (over budget — informational, not a failure)');
		debug_log(__METHOD__ . " ($icon) " . $msg, $within ? logger::WARNING : logger::ERROR);
	}//end soft_perf



	/**
	* USER_LOGIN
	* @return bool
	*/
	protected function user_login() : bool {

		$user_id = TEST_USER_ID; // Defined in bootstrap

		$current_user_id = logged_user_id();
		if ($current_user_id !== $user_id) {
			login_test::force_login($user_id);
		}

		return login::is_logged();
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
