<?php declare(strict_types=1);
// bootstrap
require_once dirname(dirname(__FILE__)) . '/bootstrap.php';



/**
* LOCK_COMPONENTS_TEST
* Covers the hardened component-lock behaviour:
*  - lazy garbage collection: a stale lock is pruned the next time the registry is touched
*  - short TTL: clean_locks_garbage() removes entries older than LOCK_TTL_SECONDS
*  - get_lock_status(): read-only status used by the notify-on-release client poll
*
* The registry lives in a single row (id=1) of matrix_notifications. setUp() resets that
* row to an empty array so each test runs in isolation.
*/
final class lock_components_test extends BaseTestCase {



	const TABLE  = 'matrix_notifications';
	const ROW_ID = 1;



	/**
	* SET_REGISTRY
	* Overwrite the lock registry row with the given list of event elements.
	* @param array $entries
	* @return void
	*/
	private function set_registry( array $entries ) : void {

		$conn = DBi::_getConnection();
		$json = json_encode(array_values($entries));
		pg_query_params(
			$conn,
			'INSERT INTO "'.self::TABLE.'" (id, data) VALUES ($1, $2)
				ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data',
			[self::ROW_ID, $json]
		);
	}//end set_registry



	/**
	* GET_REGISTRY
	* Read back the current lock registry as a PHP array of stdClass entries.
	* @return array
	*/
	private function get_registry() : array {

		$conn	= DBi::_getConnection();
		$res	= pg_query_params($conn, 'SELECT data FROM "'.self::TABLE.'" WHERE id = $1', [self::ROW_ID]);
		$data	= ($res===false || pg_num_rows($res)<1) ? '[]' : pg_fetch_result($res, 0, 0);

		return json_decode($data) ?? [];
	}//end get_registry



	/**
	* EVENT
	* Build a lock event element. $date defaults to now; pass an older timestamp to
	* simulate a stale lock.
	* @return object
	*/
	private function event( string $action, string $section_id, string $section_tipo, string $component_tipo, int $user_id, ?string $date=null ) : object {

		$e = new stdClass();
			$e->section_id		= $section_id;
			$e->section_tipo	= $section_tipo;
			$e->component_tipo	= $component_tipo;
			$e->action			= $action;
			$e->user_id			= $user_id;
			$e->full_username	= 'user_'.$user_id;
			$e->date			= $date ?? date('Y-m-d H:i:s');

		return $e;
	}//end event



	/**
	* SETUP
	* @return void
	*/
	protected function setUp(): void {
		parent::setUp();
		// isolate each test: empty the lock registry
		$this->set_registry([]);
	}//end setUp



	/**
	* TEARDOWNAFTERCLASS
	* @return void
	*/
	public static function tearDownAfterClass(): void {
		$conn = DBi::_getConnection();
		pg_query_params(
			$conn,
			'INSERT INTO "'.self::TABLE.'" (id, data) VALUES ($1, $2)
				ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data',
			[self::ROW_ID, '[]']
		);
	}//end tearDownAfterClass



	/**
	* TEST_FOCUS_PRUNES_EXPIRED_LOCK
	* A focus event must prune an unrelated, expired lock from another user (lazy GC).
	* @return void
	*/
	public function test_focus_prunes_expired_lock(): void {

		// stale lock from another user, dated 1 hour ago (well beyond the short TTL)
		$stale = $this->event('focus', '999', 'test3', 'testX', 99999, date('Y-m-d H:i:s', time() - 3600));
		$this->set_registry([$stale]);

		// fresh focus from the test user on a different component
		$fresh = $this->event('focus', '1', 'test3', 'test94', -1);
		lock_components::update_lock_components_state($fresh);

		$registry  = $this->get_registry();
		$has_stale = false;
		foreach ($registry as $e) {
			if ($e->user_id == 99999 && $e->component_tipo === 'testX') {
				$has_stale = true;
			}
		}

		$this->assertFalse(
			$has_stale,
			'expected the expired lock to be pruned on focus (lazy GC)'
		);
	}//end test_focus_prunes_expired_lock



	/**
	* TEST_CLEAN_LOCKS_GARBAGE_REMOVES_SHORT_TTL_STALE
	* clean_locks_garbage() must remove a lock older than the short TTL.
	* @return void
	*/
	public function test_clean_locks_garbage_removes_short_ttl_stale(): void {

		// 10-minute-old lock: fresh under the legacy 5h TTL, stale under the new short TTL
		$stale = $this->event('focus', '5', 'test3', 'testY', 99998, date('Y-m-d H:i:s', time() - 600));
		$this->set_registry([$stale]);

		lock_components::clean_locks_garbage();

		$this->assertCount(
			0,
			$this->get_registry(),
			'expected a 10-minute-old lock removed under the short TTL'
		);
	}//end test_clean_locks_garbage_removes_short_ttl_stale



	/**
	* TEST_GET_LOCK_STATUS_REPORTS_HOLDER_AND_RELEASE
	* get_lock_status() must report a live holder, and report free after the holder blurs.
	* @return void
	*/
	public function test_get_lock_status_reports_holder_and_release(): void {

		// user 1234 holds the component
		$focus = $this->event('focus', '1', 'test3', 'test94', 1234);
		lock_components::update_lock_components_state($focus);

		// user 5678 (blocked) asks for the status of the same triple
		$asker  = $this->event('focus', '1', 'test3', 'test94', 5678);
		$status = lock_components::get_lock_status($asker);

		$this->assertTrue(
			$status->in_use,
			'expected in_use true while held by another user'
		);
		$this->assertSame(
			'user_1234',
			$status->full_username,
			'expected the holder full_username'
		);

		// holder releases
		$blur = $this->event('blur', '1', 'test3', 'test94', 1234);
		lock_components::update_lock_components_state($blur);

		$status2 = lock_components::get_lock_status($asker);
		$this->assertFalse(
			$status2->in_use,
			'expected in_use false after the holder blurs'
		);
	}//end test_get_lock_status_reports_holder_and_release



	/**
	* TEST_GET_LOCK_STATUS_IGNORES_EXPIRED
	* An expired holder must report as not in use (so the blocked user is released).
	* @return void
	*/
	public function test_get_lock_status_ignores_expired(): void {

		$stale = $this->event('focus', '1', 'test3', 'test94', 4321, date('Y-m-d H:i:s', time() - 3600));
		$this->set_registry([$stale]);

		$asker  = $this->event('focus', '1', 'test3', 'test94', 5678);
		$status = lock_components::get_lock_status($asker);

		$this->assertFalse(
			$status->in_use,
			'expected an expired holder to report not in use'
		);
	}//end test_get_lock_status_ignores_expired



}//end class lock_components_test
