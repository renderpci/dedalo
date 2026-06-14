<?php declare(strict_types=1);
// bootstrap
require_once dirname(dirname(__FILE__)) . '/bootstrap.php';



/**
 * COMPONENT_COUNTER_CONCURRENCY_TEST
 * Tests for the atomic item id allocator (section_record::allocate_component_ids).
 * Item ids are the dataframe pairing keys: they must be unique per component
 * per section record even when concurrent processes hold stale in-memory
 * counters. The allocator re-reads the persisted counter under a PostgreSQL
 * advisory lock, which these tests simulate by resetting the in-memory
 * counter between allocations.
 */
final class component_counter_concurrency_test extends BaseTestCase {



	public static $section_tipo	= 'test3';
	public static $section_id	= 1;
	// synthetic component tipo: the meta counter key is arbitrary per tipo,
	// using one no real component owns keeps the fixture data untouched
	public static $tipo			= 'test9999';



	private function build_section_record() : section_record {

		$this->user_login();

		return section_record::get_instance(
			self::$section_tipo,
			self::$section_id
		);
	}//end build_section_record



	///////////// ⬇︎ test start ⬇︎ ////////////////



	/**
	* TEST_allocate_returns_sequential_unique_ids
	* @return void
	*/
	public function test_allocate_returns_sequential_unique_ids() {

		$record = $this->build_section_record();

		$base = $record->get_component_counter(self::$tipo);

		$ids = $record->allocate_component_ids(self::$tipo, 3);

		$this->assertIsArray($ids);
		$this->assertCount(3, $ids);
		// sequential block above the in-memory counter (the persisted counter
		// may be ahead of the in-memory one: the allocator starts from the max)
		$this->assertEquals(range($ids[0], $ids[0]+2), $ids);
		$this->assertGreaterThan($base, $ids[0]);

		// counter advanced to the last allocated id
		$this->assertEquals($ids[2], $record->get_component_counter(self::$tipo));

		// zero / negative counts allocate nothing
		$this->assertEquals([], $record->allocate_component_ids(self::$tipo, 0));
	}//end test_allocate_returns_sequential_unique_ids



	/**
	* TEST_allocation_survives_stale_in_memory_counter
	* Simulates the concurrent-editor race: a second process loads the record
	* (stale counter), then allocates. The allocator must re-read the
	* persisted counter under the lock and never re-issue taken ids.
	* @return void
	*/
	public function test_allocation_survives_stale_in_memory_counter() {

		$record = $this->build_section_record();

		// first "process" allocates and persists
		$ids_first = $record->allocate_component_ids(self::$tipo, 3);

		// simulate a second process with a STALE in-memory counter
		// (set_component_counter only touches the in-memory state)
		$record->set_component_counter(self::$tipo, 0);

		$ids_second = $record->allocate_component_ids(self::$tipo, 2);

		// no overlap: the persisted counter won over the stale in-memory one
		$this->assertEmpty(
			array_intersect($ids_first, $ids_second),
			'Allocator re-issued ids already taken: ' . json_encode([$ids_first, $ids_second])
		);
		$this->assertGreaterThan(max($ids_first), min($ids_second));
	}//end test_allocation_survives_stale_in_memory_counter



	/**
	* TEST_raise_component_counter_absorbs_explicit_ids
	* Imported / migrated data carries explicit item ids: the counter is
	* raised atomically so later allocations cannot reuse them.
	* @return void
	*/
	public function test_raise_component_counter_absorbs_explicit_ids() {

		$record = $this->build_section_record();

		$current = $record->get_component_counter(self::$tipo);

		// absorb an explicit id far above the counter (import scenario)
		$explicit_max_id = $current + 10;
		$raised = $record->raise_component_counter(self::$tipo, $explicit_max_id);
		$this->assertEquals($explicit_max_id, $raised);

		// raising below the current value is a no-op
		$this->assertEquals($explicit_max_id, $record->raise_component_counter(self::$tipo, 1));

		// the next allocation continues above the absorbed id
		$ids = $record->allocate_component_ids(self::$tipo, 1);
		$this->assertEquals([$explicit_max_id+1], $ids);
	}//end test_raise_component_counter_absorbs_explicit_ids



	/**
	* TEST_set_data_mints_unique_ids_via_allocator
	* Component set_data stamps missing item ids through the allocator:
	* items keep explicit ids; new items never collide with them.
	* @return void
	*/
	public function test_set_data_mints_unique_ids_via_allocator() {

		$this->user_login();

		$component = component_common::get_instance(
			'component_input_text',
			'test52',
			self::$section_id,
			'edit',
			DEDALO_DATA_LANG,
			self::$section_tipo
		);

		// mixed: one explicit id, two server-minted
		$component->set_data([
			(object)['id' => 1, 'value' => 'Explicit'],
			(object)['value' => 'Minted A'],
			(object)['value' => 'Minted B']
		]);

		$data = $component->get_data();
		$this->assertCount(3, $data);

		$ids = array_map(fn($item) => $item->id, $data);
		$this->assertCount(3, array_unique($ids), 'Item ids must be unique: ' . json_encode($ids));
		$this->assertEquals(1, $data[0]->id);
	}//end test_set_data_mints_unique_ids_via_allocator



}//end class component_counter_concurrency_test
