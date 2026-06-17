<?php declare(strict_types=1);
// bootstrap
require_once dirname(dirname(__FILE__)) . '/bootstrap.php';



/**
* ONTOLOGY_ORDER_SYNC_TEST
* The ontology menu builds sibling order from dd_ontology.order_number
* (ontology_node::get_ar_children_of_this → dd_ontology_db_manager::search ORDER BY
* order_number ASC). A tree reorder (dd_ts_api::save_order) only writes the order
* COMPONENT, so the menu stays stale. ontology::sync_order_to_dd_ontology() must push
* the exact new per-parent order into dd_ontology so the menu matches the tree.
* Runs against a duplicated dd_ontology_test table so real ontology data is untouched.
*/
final class ontology_order_sync_test extends BaseTestCase {



	/**
	* SET_UP_BEFORE_CLASS
	* Redirect dd_ontology writes to an isolated copy of the table.
	* @return void
	*/
	public static function setUpBeforeClass(): void {

		dd_ontology_db_manager::$table = 'dd_ontology_test';

		$conn = DBi::_getConnection();
		$sql = "
			DROP TABLE IF EXISTS dd_ontology_test CASCADE;
			DROP SEQUENCE IF EXISTS dd_ontology_test_id_seq;
			SELECT duplicate_table_with_independent_sequences('dd_ontology', 'dd_ontology_test', true);
		";
		pg_query($conn, $sql);
	}//end setUpBeforeClass



	/**
	* TEAR_DOWN_AFTER_CLASS
	* @return void
	*/
	public static function tearDownAfterClass(): void {

		$conn = DBi::_getConnection();
		pg_query($conn, "
			DROP TABLE IF EXISTS dd_ontology_test CASCADE;
			DROP SEQUENCE IF EXISTS dd_ontology_test_id_seq;
		");

		dd_ontology_db_manager::$table = 'dd_ontology';
	}//end tearDownAfterClass



	/**
	* LOCATOR
	* Builds a node locator. section_tipo carries the tld (e.g. 'dd1' → tld 'dd'), so
	* ontology::get_term_id_from_locator resolves "{tld}{section_id}" without a DB read.
	* @param string $section_tipo
	* @param int $section_id
	* @return object
	*/
	private function locator( string $section_tipo, int $section_id ) : object {
		$locator = new locator();
			$locator->set_section_tipo($section_tipo);
			$locator->set_section_id($section_id);
		return $locator;
	}//end locator



	/**
	* TEST_SYNC_ORDER_TO_DD_ONTOLOGY_UPDATES_MENU_ORDER
	* A tree reorder that swaps two siblings must update their dd_ontology.order_number
	* to the exact per-parent values the reorder computed.
	* @return void
	*/
	public function test_sync_order_to_dd_ontology_updates_menu_order() : void {

		$parent_tipo = 'dd900001';
		$child_a     = 'dd900010';
		$child_b     = 'dd900011';

		// seed: child_a=1, child_b=2 under the same parent
		dd_ontology_db_manager::create($parent_tipo, (object)['tld'=>'dd']);
		dd_ontology_db_manager::create($child_a, (object)['parent'=>$parent_tipo, 'tld'=>'dd', 'order_number'=>1]);
		dd_ontology_db_manager::create($child_b, (object)['parent'=>$parent_tipo, 'tld'=>'dd', 'order_number'=>2]);

		// reorder result shape returned by component_relation_children::sort_children:
		// the tree swapped them — child_a is now position 2, child_b position 1
		$changed = [
			(object)['value'=>2, 'locator'=>$this->locator('dd1', 900010)],
			(object)['value'=>1, 'locator'=>$this->locator('dd1', 900011)]
		];

		$updated = ontology::sync_order_to_dd_ontology($changed, 'dd1', 900001);

		$this->assertSame(2, $updated, 'expected both dd_ontology rows updated');
		$this->assertSame(
			2,
			dd_ontology_db_manager::read($child_a)['order_number'],
			'child_a dd_ontology order_number must follow the tree (2)'
		);
		$this->assertSame(
			1,
			dd_ontology_db_manager::read($child_b)['order_number'],
			'child_b dd_ontology order_number must follow the tree (1)'
		);
	}//end test_sync_order_to_dd_ontology_updates_menu_order



	/**
	* TEST_SYNC_ORDER_SKIPS_ROWS_UNDER_A_DIFFERENT_PARENT
	* dd_ontology holds one order_number per node (single menu hierarchy). A reorder under
	* parent X must NOT overwrite the order of a row that hangs under a different parent.
	* @return void
	*/
	public function test_sync_order_skips_rows_under_a_different_parent() : void {

		$parent_x = 'dd900100';
		$parent_y = 'dd900200';
		$child    = 'dd900110'; // lives under parent_y in dd_ontology

		dd_ontology_db_manager::create($parent_x, (object)['tld'=>'dd']);
		dd_ontology_db_manager::create($parent_y, (object)['tld'=>'dd']);
		dd_ontology_db_manager::create($child, (object)['parent'=>$parent_y, 'tld'=>'dd', 'order_number'=>7]);

		// a reorder under parent_x that references the child must not touch it
		$changed = [
			(object)['value'=>1, 'locator'=>$this->locator('dd1', 900110)]
		];

		$updated = ontology::sync_order_to_dd_ontology($changed, 'dd1', 900100);

		$this->assertSame(0, $updated, 'no rows should be updated for a non-matching parent');
		$this->assertSame(
			7,
			dd_ontology_db_manager::read($child)['order_number'],
			'order_number under a different parent must stay untouched'
		);
	}//end test_sync_order_skips_rows_under_a_different_parent



}//end class ontology_order_sync_test
