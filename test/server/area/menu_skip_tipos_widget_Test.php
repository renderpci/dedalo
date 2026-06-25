<?php declare(strict_types=1);

use PHPUnit\Framework\TestCase;

require_once DEDALO_CORE_PATH . '/area_maintenance/widgets/menu_skip_tipos/class.menu_skip_tipos.php';

final class menu_skip_tipos_widget_Test extends TestCase {

	public function test_prepare_list_drops_top_level_areas() : void {
		// Skipping a top-level area (e.g. dd69 = Activities) would promote its children into the
		// top menu bar and deform it, so every area::get_ar_root_area_tipos() entry is rejected.
		$roots = area::get_ar_root_area_tipos();
		$this->assertNotEmpty($roots, 'root area tipos must resolve in this ontology');
		$out = menu_skip_tipos::prepare_list($roots);
		$this->assertSame([], $out->tipos, 'no top-level area should survive');
		foreach ($roots as $root) {
			$this->assertContains($root, $out->removed, "$root must be reported as removed");
		}
	}

	public function test_prepare_list_rejects_invalid_tipo() : void {
		$out = menu_skip_tipos::prepare_list(['zzz_not_a_tipo_999']);
		$this->assertSame([], $out->tipos);
		$this->assertContains('zzz_not_a_tipo_999', $out->invalid);
	}

	public function test_prepare_list_dedupes_and_keeps_valid_sub_grouping() : void {
		// dd349 is a sub-grouping area (model 'area', not a top-level area) — valid + kept.
		$out = menu_skip_tipos::prepare_list(['dd349', 'dd349']);
		$this->assertSame(['dd349'], $out->tipos);
	}

	public function test_get_value_shape() : void {
		$response = menu_skip_tipos::get_value();
		$this->assertTrue($response->result !== false, $response->msg);
		$value = $response->result;
		$this->assertObjectHasProperty('areas', $value);
		$this->assertObjectHasProperty('skip_tipos', $value);
		$this->assertObjectHasProperty('writable', $value);
		$this->assertIsArray($value->areas);
		$this->assertIsArray($value->skip_tipos);
	}
}
