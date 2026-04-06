<?php declare(strict_types=1);

// bootstrap
require_once dirname(dirname(__FILE__)) . '/bootstrap.php';



/**
 * TEST CHANGED_DATA ID-BASED FLOW
 * 
 * Verifies that the `update_data_value()` method in `component_common`
 * correctly handles `changed_data` objects with `id` property instead of `key`.
 * 
 * Tests the full JS→API→PHP data flow where JS components send
 * `{action, id, value}` objects and PHP processes them correctly.
 * 
 * @package Dedalo
 * @subpackage Test
 */
final class component_common_changed_data_test extends BaseTestCase {



	/**
	 * TEST_UPDATE_DATA_VALUE_WITH_ID
	 * Verify that update action with valid id updates the correct entry
	 * and does NOT append a new entry.
	 * @return void
	 */
	public function test_update_data_value_with_id() : void {

		$this->user_login();

		$component = component_common::get_instance(
			'component_text_area',
			'test17',
			1,
			'edit',
			DEDALO_DATA_NOLAN,
			'test3',
			false
		);

		// Set initial data with known IDs
		$initial_data = [
			(object)['value' => 'first entry',  'id' => 101, 'lang' => DEDALO_DATA_NOLAN],
			(object)['value' => 'second entry', 'id' => 102, 'lang' => DEDALO_DATA_NOLAN],
			(object)['value' => 'third entry',  'id' => 103, 'lang' => DEDALO_DATA_NOLAN]
		];
		$component->set_data($initial_data);

		// Verify initial state
		$data_before = $component->get_data();
		$this->assertCount(3, $data_before, 'Initial data should have 3 entries');

		// Build changed_data with id targeting the second entry
		$changed_data = (object)[
			'action' => 'update',
			'id'     => 102,
			'value'  => (object)['value' => 'UPDATED second entry', 'id' => 102, 'lang' => DEDALO_DATA_NOLAN]
		];

		// Call update_data_value (public method)
		$result = $component->update_data_value($changed_data);

		// Verify result
		$this->assertTrue($result, 'update_data_value should return true');

		// Clear data_resolved to force get_data() to fetch updated data
		unset($component->data_resolved);

		// Verify entry count unchanged (update, not append)
		$data_after = $component->get_data();
		$this->assertCount(3, $data_after, 'Entry count should remain 3 after update');

		// Verify the correct entry was updated
		$found_updated = false;
		foreach ($data_after as $entry) {
			if ($entry->id === 102) {
				$this->assertEquals('UPDATED second entry', $entry->value, 'Entry 102 should have updated value');
				$found_updated = true;
			}
		}
		$this->assertTrue($found_updated, 'Updated entry with id 102 should exist');

		// Verify other entries unchanged
		$found_first = false;
		$found_third = false;
		foreach ($data_after as $entry) {
			if ($entry->id === 101 && $entry->value === 'first entry') $found_first = true;
			if ($entry->id === 103 && $entry->value === 'third entry') $found_third = true;
		}
		$this->assertTrue($found_first, 'First entry should be unchanged');
		$this->assertTrue($found_third, 'Third entry should be unchanged');

	}//end test_update_data_value_with_id



	/**
	 * TEST_UPDATE_DATA_VALUE_WITH_ID_NOT_FOUND
	 * When id doesn't exist in data, should append as new entry with warning.
	 * @return void
	 */
	public function test_update_data_value_with_id_not_found() : void {

		$this->user_login();

		$component = component_common::get_instance(
			'component_text_area',
			'test17',
			1,
			'edit',
			DEDALO_DATA_NOLAN,
			'test3',
			false
		);

		$initial_data = [
			(object)['value' => 'existing', 'id' => 201, 'lang' => DEDALO_DATA_NOLAN]
		];
		$component->set_data($initial_data);

		// Try to update non-existent id
		$changed_data = (object)[
			'action' => 'update',
			'id'     => 999, // doesn't exist
			'value'  => (object)['value' => 'new via update', 'id' => 999, 'lang' => DEDALO_DATA_NOLAN]
		];

		$result = $component->update_data_value($changed_data);

		$this->assertTrue($result, 'update_data_value should return true even when id not found');

		unset($component->data_resolved);
		$data_after = $component->get_data();
		$this->assertCount(2, $data_after, 'Should have 2 entries (original + appended)');

	}//end test_update_data_value_with_id_not_found



	/**
	 * TEST_UPDATE_DATA_VALUE_REMOVE_WITH_ID
	 * Remove single entry by id - only that entry should be removed.
	 * @return void
	 */
	public function test_update_data_value_remove_with_id() : void {

		$this->user_login();

		$component = component_common::get_instance(
			'component_text_area',
			'test17',
			1,
			'edit',
			DEDALO_DATA_NOLAN,
			'test3',
			false
		);

		$initial_data = [
			(object)['value' => 'keep first',  'id' => 301, 'lang' => DEDALO_DATA_NOLAN],
			(object)['value' => 'remove this',  'id' => 302, 'lang' => DEDALO_DATA_NOLAN],
			(object)['value' => 'keep third',   'id' => 303, 'lang' => DEDALO_DATA_NOLAN]
		];
		$component->set_data($initial_data);

		// Remove middle entry by id
		$changed_data = (object)[
			'action' => 'remove',
			'id'     => 302,
			'value'  => null
		];

		$result = $component->update_data_value($changed_data);

		$this->assertTrue($result, 'update_data_value should return true on successful remove');

		unset($component->data_resolved);
		$data_after = $component->get_data();
		$this->assertCount(2, $data_after, 'Should have 2 entries after removing 1');

		// Verify correct entries remain
		$ids_remaining = array_map(fn($e) => $e->id, $data_after);
		$this->assertContains(301, $ids_remaining, 'Entry 301 should remain');
		$this->assertContains(303, $ids_remaining, 'Entry 303 should remain');
		$this->assertNotContains(302, $ids_remaining, 'Entry 302 should be removed');

	}//end test_update_data_value_remove_with_id



	/**
	 * TEST_UPDATE_DATA_VALUE_REMOVE_WITH_NULL_ID
	 * Remove with null id should clear ALL entries.
	 * @return void
	 */
	public function test_update_data_value_remove_with_null_id() : void {

		$this->user_login();

		$component = component_common::get_instance(
			'component_text_area',
			'test17',
			1,
			'edit',
			DEDALO_DATA_NOLAN,
			'test3',
			false
		);

		$initial_data = [
			(object)['value' => 'first', 'id' => 401, 'lang' => DEDALO_DATA_NOLAN],
			(object)['value' => 'second', 'id' => 402, 'lang' => DEDALO_DATA_NOLAN],
			(object)['value' => 'third', 'id' => 403, 'lang' => DEDALO_DATA_NOLAN]
		];
		$component->set_data($initial_data);

		// Remove all with null id
		$changed_data = (object)[
			'action' => 'remove',
			'id'     => null,
			'value'  => null
		];

		$result = $component->update_data_value($changed_data);

		$this->assertTrue($result, 'update_data_value should return true on remove all');

		unset($component->data_resolved);
		$data_after = $component->get_data();
		$this->assertEmpty($data_after, 'All entries should be cleared when id is null');

	}//end test_update_data_value_remove_with_null_id



	/**
	 * TEST_UPDATE_DATA_VALUE_INSERT_WITH_NULL_ID
	 * Insert action with null id should append new entry.
	 * @return void
	 */
	public function test_update_data_value_insert_with_null_id() : void {

		$this->user_login();

		$component = component_common::get_instance(
			'component_text_area',
			'test17',
			1,
			'edit',
			DEDALO_DATA_NOLAN,
			'test3',
			false
		);

		$initial_data = [
			(object)['value' => 'existing', 'id' => 501, 'lang' => DEDALO_DATA_NOLAN]
		];
		$component->set_data($initial_data);

		// Insert new entry
		$changed_data = (object)[
			'action' => 'insert',
			'id'     => null,
			'value'  => (object)['value' => 'new entry', 'id' => null, 'lang' => DEDALO_DATA_NOLAN]
		];

		$result = $component->update_data_value($changed_data);

		$this->assertTrue($result, 'update_data_value should return true on insert');

		unset($component->data_resolved);
		$data_after = $component->get_data();
		$this->assertCount(2, $data_after, 'Should have 2 entries after insert');

		// Verify new entry was appended
		$last_entry = end($data_after);
		$this->assertEquals('new entry', $last_entry->value, 'Last entry should be the new one');

	}//end test_update_data_value_insert_with_null_id



	/**
	 * TEST_UPDATE_DATA_VALUE_SET_DATA
	 * Set data action should replace all entries.
	 * @return void
	 */
	public function test_update_data_value_set_data() : void {

		$this->user_login();

		$component = component_common::get_instance(
			'component_text_area',
			'test17',
			1,
			'edit',
			DEDALO_DATA_NOLAN,
			'test3',
			false
		);

		$initial_data = [
			(object)['value' => 'old1', 'id' => 601, 'lang' => DEDALO_DATA_NOLAN],
			(object)['value' => 'old2', 'id' => 602, 'lang' => DEDALO_DATA_NOLAN]
		];
		$component->set_data($initial_data);

		$new_data = [
			(object)['value' => 'replacement1', 'id' => 701, 'lang' => DEDALO_DATA_NOLAN],
			(object)['value' => 'replacement2', 'id' => 702, 'lang' => DEDALO_DATA_NOLAN],
			(object)['value' => 'replacement3', 'id' => 703, 'lang' => DEDALO_DATA_NOLAN]
		];

		$changed_data = (object)[
			'action' => 'set_data',
			'id'     => null,
			'value'  => $new_data
		];

		$result = $component->update_data_value($changed_data);

		$this->assertTrue($result, 'update_data_value should return true on set_data');

		unset($component->data_resolved);
		$data_after = $component->get_data();
		$this->assertCount(3, $data_after, 'Should have exactly 3 entries after set_data');

		// Verify old entries are gone
		$ids = array_map(fn($e) => $e->id, $data_after);
		$this->assertNotContains(601, $ids, 'Old entry 601 should be gone');
		$this->assertNotContains(602, $ids, 'Old entry 602 should be gone');
		$this->assertContains(701, $ids, 'New entry 701 should exist');
		$this->assertContains(703, $ids, 'New entry 703 should exist');

	}//end test_update_data_value_set_data



	/**
	 * TEST_SAVE_WITH_ID_BASED_CHANGED_DATA
	 * Full integration: build changed_data with id, save, reload, verify persistence.
	 * @return void
	 */
	public function test_save_with_id_based_changed_data() : void {

		$this->user_login();

		$component = component_common::get_instance(
			'component_text_area',
			'test17',
			1,
			'edit',
			DEDALO_DATA_NOLAN,
			'test3',
			false
		);

		// Set initial data
		$initial_data = [
			(object)['value' => 'original value', 'id' => 801, 'lang' => DEDALO_DATA_NOLAN]
		];
		$component->set_data($initial_data);
		$component->save();

		// Now update using changed_data with id
		$component2 = component_common::get_instance(
			'component_text_area',
			'test17',
			1,
			'edit',
			DEDALO_DATA_NOLAN,
			'test3',
			false
		);

		$changed_data = (object)[
			'action' => 'update',
			'id'     => 801,
			'value'  => (object)['value' => 'updated via save', 'id' => 801, 'lang' => DEDALO_DATA_NOLAN]
		];

		// Call update_data_value then save
		$component2->update_data_value($changed_data);
		$save_result = $component2->save();

		$this->assertTrue($save_result, 'Save should return true');

		// Reload and verify
		$component3 = component_common::get_instance(
			'component_text_area',
			'test17',
			1,
			'edit',
			DEDALO_DATA_NOLAN,
			'test3',
			false
		);

		$data = $component3->get_data();
		$this->assertCount(1, $data, 'Should still have exactly 1 entry');
		$this->assertEquals('updated via save', $data[0]->value, 'Value should be updated');
		$this->assertEquals(801, $data[0]->id, 'ID should be preserved');

	}//end test_save_with_id_based_changed_data



	/**
	 * TEST_SAVE_UPDATE_EXISTING_ENTRY_NOT_DUPLICATED
	 * CRITICAL: Verify that updating an entry by id does NOT create a duplicate.
	 * This is the core regression test for the key→id fix.
	 * @return void
	 */
	public function test_save_update_existing_entry_not_duplicated() : void {

		$this->user_login();

		// Create component with 2 entries
		$component = component_common::get_instance(
			'component_text_area',
			'test17',
			1,
			'edit',
			DEDALO_DATA_NOLAN,
			'test3',
			false
		);

		$initial_data = [
			(object)['value' => 'entry one',   'id' => 1001, 'lang' => DEDALO_DATA_NOLAN],
			(object)['value' => 'entry two',    'id' => 1002, 'lang' => DEDALO_DATA_NOLAN]
		];
		$component->set_data($initial_data);
		$component->save();

		// Reload and update first entry by id
		$component2 = component_common::get_instance(
			'component_text_area',
			'test17',
			1,
			'edit',
			DEDALO_DATA_NOLAN,
			'test3',
			false
		);

		$changed_data = (object)[
			'action' => 'update',
			'id'     => 1001,
			'value'  => (object)['value' => 'entry one UPDATED', 'id' => 1001, 'lang' => DEDALO_DATA_NOLAN]
		];

		$component2->update_data_value($changed_data);
		$component2->save();

		// Reload fresh instance
		$component3 = component_common::get_instance(
			'component_text_area',
			'test17',
			1,
			'edit',
			DEDALO_DATA_NOLAN,
			'test3',
			false
		);

		$data = $component3->get_data();

		// CRITICAL ASSERTION: Must be exactly 2 entries, NOT 3
		$this->assertCount(2, $data,
			'CRITICAL: Should have exactly 2 entries after update. Got ' . count($data) .
			' - this indicates the update was treated as an insert (key/id bug)');

		// Verify first entry was updated
		$found_updated = false;
		$found_unchanged = false;
		foreach ($data as $entry) {
			if ($entry->id === 1001) {
				$this->assertEquals('entry one UPDATED', $entry->value, 'Entry 1001 should be updated');
				$found_updated = true;
			}
			if ($entry->id === 1002) {
				$this->assertEquals('entry two', $entry->value, 'Entry 1002 should be unchanged');
				$found_unchanged = true;
			}
		}

		$this->assertTrue($found_updated, 'Updated entry 1001 should exist');
		$this->assertTrue($found_unchanged, 'Unchanged entry 1002 should exist');

	}//end test_save_update_existing_entry_not_duplicated



	/**
	 * TEST_SAVE_REMOVE_SINGLE_ENTRY
	 * CRITICAL: Verify that removing an entry by id removes ONLY that entry.
	 * @return void
	 */
	public function test_save_remove_single_entry() : void {

		$this->user_login();

		// Create component with 3 entries
		$component = component_common::get_instance(
			'component_text_area',
			'test17',
			1,
			'edit',
			DEDALO_DATA_NOLAN,
			'test3',
			false
		);

		$initial_data = [
			(object)['value' => 'keep me 1',    'id' => 2001, 'lang' => DEDALO_DATA_NOLAN],
			(object)['value' => 'delete me',     'id' => 2002, 'lang' => DEDALO_DATA_NOLAN],
			(object)['value' => 'keep me 2',    'id' => 2003, 'lang' => DEDALO_DATA_NOLAN]
		];
		$component->set_data($initial_data);
		$component->save();

		// Reload and remove middle entry by id
		$component2 = component_common::get_instance(
			'component_text_area',
			'test17',
			1,
			'edit',
			DEDALO_DATA_NOLAN,
			'test3',
			false
		);

		$changed_data = (object)[
			'action' => 'remove',
			'id'     => 2002,
			'value'  => null
		];

		$component2->update_data_value($changed_data);
		$component2->save();

		// Reload fresh instance
		$component3 = component_common::get_instance(
			'component_text_area',
			'test17',
			1,
			'edit',
			DEDALO_DATA_NOLAN,
			'test3',
			false
		);

		$data = $component3->get_data();

		// CRITICAL: Should have exactly 2 entries, NOT 0
		$this->assertCount(2, $data,
			'CRITICAL: Should have exactly 2 entries after removing 1. Got ' . count($data) .
			' - this indicates the remove cleared all data (key/id bug)');

		// Verify correct entries remain
		$ids = array_map(fn($e) => $e->id, $data);
		$this->assertContains(2001, $ids, 'Entry 2001 should remain');
		$this->assertContains(2003, $ids, 'Entry 2003 should remain');
		$this->assertNotContains(2002, $ids, 'Entry 2002 should be removed');

	}//end test_save_remove_single_entry



	/**
	 * TEST_DATA_FLOW_UPDATE_THEN_RELOAD
	 * Full data flow: set data → save → update by id → save → reload → verify.
	 * @return void
	 */
	public function test_data_flow_update_then_reload() : void {

		$this->user_login();

		$model  = 'component_text_area';
		$tipo   = 'test17';
		$sec_id = 1;
		$sec_tipo = 'test3';

		// Phase 1: Set initial data
		$c1 = component_common::get_instance($model, $tipo, $sec_id, 'edit', DEDALO_DATA_NOLAN, $sec_tipo, false);
		$c1->set_data([
			(object)['value' => 'alpha', 'id' => 3001, 'lang' => DEDALO_DATA_NOLAN],
			(object)['value' => 'beta',  'id' => 3002, 'lang' => DEDALO_DATA_NOLAN],
			(object)['value' => 'gamma', 'id' => 3003, 'lang' => DEDALO_DATA_NOLAN]
		]);
		$c1->save();

		// Phase 2: Update middle entry by id
		$c2 = component_common::get_instance($model, $tipo, $sec_id, 'edit', DEDALO_DATA_NOLAN, $sec_tipo, false);
		$c2->update_data_value((object)[
			'action' => 'update',
			'id'     => 3002,
			'value'  => (object)['value' => 'BETA UPDATED', 'id' => 3002, 'lang' => DEDALO_DATA_NOLAN]
		]);
		$c2->save();

		// Phase 3: Reload and verify
		$c3 = component_common::get_instance($model, $tipo, $sec_id, 'edit', DEDALO_DATA_NOLAN, $sec_tipo, false);
		$data = $c3->get_data();

		$this->assertCount(3, $data, 'Entry count should be preserved');

		$values = [];
		foreach ($data as $entry) {
			$values[$entry->id] = $entry->value;
		}

		$this->assertEquals('alpha', $values[3001] ?? null, 'Entry 3001 unchanged');
		$this->assertEquals('BETA UPDATED', $values[3002] ?? null, 'Entry 3002 updated');
		$this->assertEquals('gamma', $values[3003] ?? null, 'Entry 3003 unchanged');

	}//end test_data_flow_update_then_reload



	/**
	 * TEST_DATA_FLOW_REMOVE_THEN_RELOAD
	 * Full data flow: set data → save → remove by id → save → reload → verify.
	 * @return void
	 */
	public function test_data_flow_remove_then_reload() : void {

		$this->user_login();

		$model  = 'component_text_area';
		$tipo   = 'test17';
		$sec_id = 1;
		$sec_tipo = 'test3';

		// Phase 1: Set initial data
		$c1 = component_common::get_instance($model, $tipo, $sec_id, 'edit', DEDALO_DATA_NOLAN, $sec_tipo, false);
		$c1->set_data([
			(object)['value' => 'first',  'id' => 4001, 'lang' => DEDALO_DATA_NOLAN],
			(object)['value' => 'second', 'id' => 4002, 'lang' => DEDALO_DATA_NOLAN],
			(object)['value' => 'third',  'id' => 4003, 'lang' => DEDALO_DATA_NOLAN]
		]);
		$c1->save();

		// Phase 2: Remove entry by id
		$c2 = component_common::get_instance($model, $tipo, $sec_id, 'edit', DEDALO_DATA_NOLAN, $sec_tipo, false);
		$c2->update_data_value((object)[
			'action' => 'remove',
			'id'     => 4002,
			'value'  => null
		]);
		$c2->save();

		// Phase 3: Reload and verify
		$c3 = component_common::get_instance($model, $tipo, $sec_id, 'edit', DEDALO_DATA_NOLAN, $sec_tipo, false);
		$data = $c3->get_data();

		$this->assertCount(2, $data, 'Should have 2 entries after remove');

		$ids = array_map(fn($e) => $e->id, $data);
		$this->assertContains(4001, $ids, 'Entry 4001 should remain');
		$this->assertNotContains(4002, $ids, 'Entry 4002 should be removed');
		$this->assertContains(4003, $ids, 'Entry 4003 should remain');

	}//end test_data_flow_remove_then_reload



	/**
	 * TEST_MULTI_COMPONENT_TYPES
	 * Run the same update-by-id test across multiple component types
	 * to verify the base class behavior works for all.
	 * @return void
	 */
	public function test_multi_component_types() : void {

		$this->user_login();

		$test_components = [
			['model' => 'component_text_area', 'tipo' => 'test17'],
			['model' => 'component_date',      'tipo' => 'test145'],
			['model' => 'component_email',     'tipo' => 'test208']
		];

		foreach ($test_components as $tc) {
			$model = $tc['model'];
			$tipo  = $tc['tipo'];

			$component = component_common::get_instance(
				$model, $tipo, 1, 'edit', DEDALO_DATA_NOLAN, 'test3', false
			);

			// Build test data appropriate for the component type
			$initial_data = [(object)['value' => 'original', 'id' => 9001, 'lang' => DEDALO_DATA_NOLAN]];
			$component->set_data($initial_data);

			// Update by id
			$changed_data = (object)[
				'action' => 'update',
				'id'     => 9001,
				'value'  => (object)['value' => 'updated_' . $model, 'id' => 9001, 'lang' => DEDALO_DATA_NOLAN]
			];

			$result = $component->update_data_value($changed_data);

			$this->assertTrue($result, "$model: update_data_value should return true");

			unset($component->data_resolved);
			$data_after = $component->get_data();
			$this->assertNotNull($data_after, "$model: Data should not be null after update");
			$this->assertCount(1, $data_after,
				"$model: Should have 1 entry after update, got " . count($data_after));

			$this->assertEquals('updated_' . $model, $data_after[0]->value,
				"$model: Value should be updated");
		}

	}//end test_multi_component_types



	/**
	 * TEST_UPDATE_DATA_VALUE_PRESERVES_ENTRY_ORDER
	 * Verify that updating an entry by id preserves the original array order.
	 * @return void
	 */
	public function test_update_data_value_preserves_entry_order() : void {

		$this->user_login();

		$component = component_common::get_instance(
			'component_text_area',
			'test17',
			1,
			'edit',
			DEDALO_DATA_NOLAN,
			'test3',
			false
		);

		$initial_data = [
			(object)['value' => 'position_0', 'id' => 5001, 'lang' => DEDALO_DATA_NOLAN],
			(object)['value' => 'position_1', 'id' => 5002, 'lang' => DEDALO_DATA_NOLAN],
			(object)['value' => 'position_2', 'id' => 5003, 'lang' => DEDALO_DATA_NOLAN],
			(object)['value' => 'position_3', 'id' => 5004, 'lang' => DEDALO_DATA_NOLAN]
		];
		$component->set_data($initial_data);

		// Update the entry at index 2 (id 5003)
		$changed_data = (object)[
			'action' => 'update',
			'id'     => 5003,
			'value'  => (object)['value' => 'UPDATED_position_2', 'id' => 5003, 'lang' => DEDALO_DATA_NOLAN]
		];

		$component->update_data_value($changed_data);

		unset($component->data_resolved);
		$data = $component->get_data();

		// Verify order is preserved
		$this->assertEquals(5001, $data[0]->id, 'Index 0 should still be id 5001');
		$this->assertEquals(5002, $data[1]->id, 'Index 1 should still be id 5002');
		$this->assertEquals(5003, $data[2]->id, 'Index 2 should still be id 5003');
		$this->assertEquals(5004, $data[3]->id, 'Index 3 should still be id 5004');

		// Verify the value was updated at the correct position
		$this->assertEquals('UPDATED_position_2', $data[2]->value, 'Index 2 should have updated value');

	}//end test_update_data_value_preserves_entry_order



	/**
	 * TEST_UPDATE_DATA_VALUE_HANDLES_EMPTY_ENTRIES
	 * Verify behavior when updating with id on empty data array.
	 * @return void
	 */
	public function test_update_data_value_handles_empty_entries() : void {

		$this->user_login();

		$component = component_common::get_instance(
			'component_text_area',
			'test17',
			1,
			'edit',
			DEDALO_DATA_NOLAN,
			'test3',
			false
		);

		$component->set_data([]);

		// Try to update non-existent entry
		$changed_data = (object)[
			'action' => 'update',
			'id'     => 6001,
			'value'  => (object)['value' => 'should be appended', 'id' => 6001, 'lang' => DEDALO_DATA_NOLAN]
		];

		$result = $component->update_data_value($changed_data);

		$this->assertTrue($result, 'update_data_value should return true');

		unset($component->data_resolved);
		$data = $component->get_data();
		$this->assertCount(1, $data, 'Should have 1 entry (appended since id not found)');
		$this->assertEquals('should be appended', $data[0]->value, 'Value should be appended');

	}//end test_update_data_value_handles_empty_entries



}//end class component_common_changed_data_test
