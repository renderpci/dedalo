<?php declare(strict_types=1);
require_once dirname(dirname(__FILE__)) . '/bootstrap.php';

/**
* TS_NODE_REPOSITORY_ORDER_TEST
* The order component is a dataframe: one entry per parent, paired by id_key to the
* child's parent-link locator. Reading the order under a given parent must select the
* entry whose id_key matches that parent's link — NOT array index 0, which may hold a
* stale pre-dataframe value. These tests pin the parent-aware resolution used by the
* tree read path (ts_node_repository::fetch_node_info / ts_object::parse_child_data).
*/
final class ts_node_repository_order_test extends BaseTestCase {


	/**
	* Real-world data shape observed in matrix_ontology: three coexisting generations
	* of order entries (legacy unkeyed, section-coords keyed, id_key keyed).
	* The id_key entry is authoritative because the write path (sort_children →
	* update_value_by_id_key) only ever updates it.
	*/
	public function test_picks_id_key_entry_not_index_zero() : void {

		// child dd0_15 ("Time machine") under parent dd0_207 ("Administration")
		$order_items = [
			(object)['id'=>1, 'value'=>2],                                                  // legacy unkeyed (index 0) — stale
			(object)['id'=>2, 'value'=>6, 'section_id_key'=>207, 'section_tipo_key'=>'dd0'], // intermediate section-coords
			(object)['id'=>3, 'value'=>7, 'id_key'=>3]                                       // current id_key entry — authoritative
		];
		$parent_items = [
			(object)['id'=>3, 'type'=>'dd47', 'section_id'=>'207', 'section_tipo'=>'dd0', 'from_component_tipo'=>'ontology15']
		];

		$value = ts_node_repository::pick_order_value_for_parent($order_items, $parent_items, 'dd0', 207);

		$this->assertSame(7, $value, 'must read the id_key-matched entry (7), not index 0 (2)');
	}


	/**
	* Falls back to the section-coords entry when no id_key entry exists yet
	* (node reordered in the intermediate era but not since the id_key migration).
	*/
	public function test_falls_back_to_section_coords_entry() : void {

		$order_items = [
			(object)['id'=>1, 'value'=>2],
			(object)['id'=>2, 'value'=>9, 'section_id_key'=>207, 'section_tipo_key'=>'dd0']
		];
		$parent_items = [
			(object)['id'=>2, 'section_id'=>'207', 'section_tipo'=>'dd0']
		];

		$value = ts_node_repository::pick_order_value_for_parent($order_items, $parent_items, 'dd0', 207);

		$this->assertSame(9, $value, 'must read the section-coords entry (9) when no id_key entry');
	}


	/**
	* Legacy single-parent node (one unkeyed entry) must still resolve to its value —
	* backward compatibility for nodes never touched by the dataframe write path.
	*/
	public function test_legacy_unkeyed_entry_resolves_to_index_zero() : void {

		$order_items  = [ (object)['id'=>1, 'value'=>5] ];
		$parent_items = [ (object)['id'=>1, 'section_id'=>'207', 'section_tipo'=>'dd0'] ];

		$value = ts_node_repository::pick_order_value_for_parent($order_items, $parent_items, 'dd0', 207);

		$this->assertSame(5, $value, 'legacy single-value node keeps its value');
	}


	/**
	* A different parent must not read another parent's order entry. Multiparent node
	* with two id_key entries; resolving under parent B returns B's value.
	*/
	public function test_multiparent_reads_correct_parent_entry() : void {

		$order_items = [
			(object)['id'=>1, 'value'=>4, 'id_key'=>1],  // under parent A (link id 1)
			(object)['id'=>2, 'value'=>9, 'id_key'=>2]   // under parent B (link id 2)
		];
		$parent_items = [
			(object)['id'=>1, 'section_id'=>'100', 'section_tipo'=>'dd0'],
			(object)['id'=>2, 'section_id'=>'200', 'section_tipo'=>'dd0']
		];

		$value = ts_node_repository::pick_order_value_for_parent($order_items, $parent_items, 'dd0', 200);

		$this->assertSame(9, $value, 'must read parent B entry (9), not parent A (4)');
	}


	/**
	* No order data at all resolves to null (matches the empty-component contract:
	* fetch_node_info formats null to null, ts_object treats it as unset order).
	*/
	public function test_empty_order_items_returns_null() : void {

		$value = ts_node_repository::pick_order_value_for_parent([], [], 'dd0', 207);

		$this->assertNull($value, 'no order entries → null');
	}


	/**
	* When the parent cannot be resolved (absent from the child's parent relation) and
	* no entry carries a usable key, fall back to the first entry — best-effort, legacy
	* single-parent behaviour — rather than returning null and dropping the node's order.
	*/
	public function test_unresolvable_parent_falls_back_to_first_entry() : void {

		$order_items = [
			(object)['id'=>1, 'value'=>4, 'id_key'=>1],
			(object)['id'=>2, 'value'=>9, 'id_key'=>2]
		];
		$parent_items = []; // parent link not present

		$value = ts_node_repository::pick_order_value_for_parent($order_items, $parent_items, 'dd0', 999);

		$this->assertSame(4, $value, 'unresolvable parent falls back to the first entry value');
	}
}
