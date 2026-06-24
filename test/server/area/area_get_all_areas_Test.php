<?php declare(strict_types=1);

use PHPUnit\Framework\TestCase;

final class area_get_all_areas_Test extends TestCase {

	public function test_get_all_areas_is_superset_of_get_areas() : void {
		$all      = area::get_all_areas();
		$filtered = area::get_areas();
		$this->assertNotEmpty($all);
		// unfiltered tree has at least as many nodes as the deny-filtered one
		$this->assertGreaterThanOrEqual(count($filtered), count($all));
	}

	public function test_every_node_has_state_consistent_with_deny_list() : void {
		$deny = area::get_config_areas()->areas_deny;
		foreach (area::get_all_areas() as $node) {
			$this->assertObjectHasProperty('tipo', $node);
			$this->assertObjectHasProperty('denied', $node);
			$this->assertObjectHasProperty('allowed', $node);
			$this->assertSame(in_array($node->tipo, $deny, true), $node->denied, "denied flag wrong for {$node->tipo}");
		}
	}

	public function test_denied_root_areas_are_still_present_in_full_tree() : void {
		// get_areas() drops denied roots entirely; get_all_areas() must keep them so they are re-enableable
		$all_tipos = array_map(fn($n) => $n->tipo, area::get_all_areas());
		foreach (area::get_ar_root_area_tipos() as $root_tipo) {
			$this->assertContains($root_tipo, $all_tipos, "root {$root_tipo} missing from full tree");
		}
	}
}
