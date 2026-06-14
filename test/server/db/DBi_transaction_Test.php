<?php declare(strict_types=1);
// bootstrap
require_once dirname(dirname(__FILE__)) . '/bootstrap.php';



final class DBi_transaction_test extends BaseTestCase {



	/**
	* SETUP_TEMP_TABLE
	* Creates (or empties) a connection scoped temp table used as the
	* mutation target for transaction assertions.
	* @return void
	*/
	private function setup_temp_table() : void {

		$conn = DBi::_getConnection();
		pg_query($conn, 'CREATE TEMP TABLE IF NOT EXISTS dd_tx_test (id int)');
		pg_query($conn, 'TRUNCATE dd_tx_test');
	}//end setup_temp_table



	/**
	* INSERT_ROW
	* @param int $id
	* @return void
	*/
	private function insert_row( int $id ) : void {

		$conn = DBi::_getConnection();
		pg_query_params($conn, 'INSERT INTO dd_tx_test (id) VALUES ($1)', [$id]);
	}//end insert_row



	/**
	* COUNT_ROWS
	* @return int
	*/
	private function count_rows() : int {

		$conn	= DBi::_getConnection();
		$result	= pg_query($conn, 'SELECT count(*) AS n FROM dd_tx_test');

		return (int)pg_fetch_result($result, 0, 'n');
	}//end count_rows



	/**
	* CONNECTION_IS_IDLE
	* @return bool
	*/
	private function connection_is_idle() : bool {

		$conn = DBi::_getConnection();

		return pg_transaction_status($conn)===PGSQL_TRANSACTION_IDLE;
	}//end connection_is_idle



	/**
	* TEST_COMMIT_PERSISTS
	* @return void
	*/
	public function test_commit_persists() : void {

		$this->setup_temp_table();

		$this->assertTrue(
			DBi::begin_transaction(),
			'expected begin_transaction true'
		);
		$this->assertTrue(
			DBi::in_transaction(),
			'expected in_transaction true after begin'
		);

		$this->insert_row(1);

		$this->assertTrue(
			DBi::commit_transaction(),
			'expected commit_transaction true'
		);

		$this->assertSame(
			1,
			$this->count_rows(),
			'expected committed row to persist'
		);
		$this->assertTrue(
			$this->connection_is_idle(),
			'expected connection idle after commit'
		);
		$this->assertFalse(
			DBi::in_transaction(),
			'expected in_transaction false after commit'
		);
	}//end test_commit_persists



	/**
	* TEST_ROLLBACK_RESTORES
	* @return void
	*/
	public function test_rollback_restores() : void {

		$this->setup_temp_table();

		DBi::begin_transaction();
		$this->insert_row(1);

		$this->assertTrue(
			DBi::rollback_transaction(),
			'expected rollback_transaction true'
		);

		$this->assertSame(
			0,
			$this->count_rows(),
			'expected rolled back row to disappear'
		);
		$this->assertTrue(
			$this->connection_is_idle(),
			'expected connection idle after rollback'
		);
	}//end test_rollback_restores



	/**
	* TEST_SAVEPOINT_NESTING
	* Inner rollback undoes only the inner block; outer commit persists the rest.
	* @return void
	*/
	public function test_savepoint_nesting() : void {

		$this->setup_temp_table();

		DBi::begin_transaction();		// depth 1 (BEGIN)
		$this->insert_row(1);

		DBi::begin_transaction();		// depth 2 (SAVEPOINT)
		$this->insert_row(2);
		$this->assertTrue(
			DBi::rollback_transaction(),	// rollback inner only
			'expected inner rollback true'
		);

		$this->assertTrue(
			DBi::in_transaction(),
			'expected outer transaction still active after inner rollback'
		);

		$this->assertTrue(
			DBi::commit_transaction(),	// commit outer
			'expected outer commit true'
		);

		$this->assertSame(
			1,
			$this->count_rows(),
			'expected only the outer row to persist (inner rolled back)'
		);
		$this->assertTrue(
			$this->connection_is_idle(),
			'expected connection idle after outer commit'
		);
	}//end test_savepoint_nesting



	/**
	* TEST_NESTED_COMMIT_THEN_OUTER_ROLLBACK
	* Inner commit (savepoint release) is still undone by an outer rollback.
	* @return void
	*/
	public function test_nested_commit_then_outer_rollback() : void {

		$this->setup_temp_table();

		DBi::begin_transaction();		// depth 1
		DBi::begin_transaction();		// depth 2
		$this->insert_row(1);
		DBi::commit_transaction();		// release savepoint
		DBi::rollback_transaction();	// outer rollback

		$this->assertSame(
			0,
			$this->count_rows(),
			'expected outer rollback to undo inner committed savepoint'
		);
		$this->assertTrue(
			$this->connection_is_idle(),
			'expected connection idle'
		);
	}//end test_nested_commit_then_outer_rollback



	/**
	* TEST_TRANSACTION_CALLABLE_COMMITS
	* @return void
	*/
	public function test_transaction_callable_commits() : void {

		$this->setup_temp_table();

		$result = DBi::transaction(function() {
			$this->insert_row(1);
			return 'done';
		});

		$this->assertSame(
			'done',
			$result,
			'expected transaction() to return the callable result'
		);
		$this->assertSame(
			1,
			$this->count_rows(),
			'expected row committed by transaction()'
		);
		$this->assertTrue(
			$this->connection_is_idle(),
			'expected connection idle after transaction()'
		);
	}//end test_transaction_callable_commits



	/**
	* TEST_TRANSACTION_CALLABLE_RETHROWS_AND_ROLLS_BACK
	* @return void
	*/
	public function test_transaction_callable_rethrows_and_rolls_back() : void {

		$this->setup_temp_table();

		$thrown = null;
		try {
			DBi::transaction(function() {
				$this->insert_row(1);
				throw new RuntimeException('boom');
			});
		} catch (Throwable $e) {
			$thrown = $e;
		}

		$this->assertInstanceOf(
			RuntimeException::class,
			$thrown,
			'expected the callable exception to be rethrown'
		);
		$this->assertSame(
			'boom',
			$thrown->getMessage(),
			'expected original exception message'
		);
		$this->assertSame(
			0,
			$this->count_rows(),
			'expected the insert to be rolled back'
		);
		$this->assertTrue(
			$this->connection_is_idle(),
			'expected connection idle after rollback'
		);
		$this->assertFalse(
			DBi::in_transaction(),
			'expected in_transaction false after rollback'
		);
	}//end test_transaction_callable_rethrows_and_rolls_back



	/**
	* TEST_ACQUIRE_NODE_LOCK_REQUIRES_TRANSACTION
	* @return void
	*/
	public function test_acquire_node_lock_requires_transaction() : void {

		// outside a transaction the lock is refused (it would be released
		// immediately and protect nothing)
		$this->assertFalse(
			matrix_db_manager::acquire_node_lock('test3', 1),
			'expected acquire_node_lock false outside a transaction'
		);

		// inside a transaction the lock is acquired
		$result = DBi::transaction(function() {
			return matrix_db_manager::acquire_node_lock('test3', 1);
		});
		$this->assertTrue(
			$result,
			'expected acquire_node_lock true inside a transaction'
		);
		$this->assertTrue(
			$this->connection_is_idle(),
			'expected connection idle (lock released with transaction)'
		);
	}//end test_acquire_node_lock_requires_transaction



}//end class DBi_transaction_test
