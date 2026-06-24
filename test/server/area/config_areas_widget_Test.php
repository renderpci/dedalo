<?php declare(strict_types=1);

use PHPUnit\Framework\TestCase;

require_once DEDALO_CORE_PATH . '/area_maintenance/widgets/config_areas/class.config_areas.php';

final class config_areas_widget_Test extends TestCase {

	public function test_prepare_lists_strips_guarded_root_models_from_deny() : void {
		$admin_tipo = ontology_utils::get_ar_tipo_by_model('area_admin')[0];
		$out = config_areas::prepare_lists([$admin_tipo], []);
		$this->assertNotContains($admin_tipo, $out->areas_deny);
		$this->assertContains($admin_tipo, $out->removed_guarded);
	}

	public function test_prepare_lists_rejects_invalid_tipo() : void {
		$out = config_areas::prepare_lists(['zzz_not_a_tipo_999'], []);
		$this->assertSame([], $out->areas_deny);
		$this->assertContains('zzz_not_a_tipo_999', $out->invalid);
	}

	public function test_prepare_lists_dedupes_and_keeps_valid_tipo() : void {
		// dd137 is the canonical default-denied section; valid in any standard ontology
		$out = config_areas::prepare_lists(['dd137', 'dd137'], []);
		$this->assertSame(['dd137'], $out->areas_deny);
	}

	public function test_get_value_shape() : void {
		$response = config_areas::get_value();
		$this->assertTrue($response->result !== false);
		$value = $response->result;
		$this->assertObjectHasProperty('areas', $value);
		$this->assertObjectHasProperty('areas_deny', $value);
		$this->assertObjectHasProperty('areas_allow', $value);
		$this->assertObjectHasProperty('writable', $value);
		$this->assertIsArray($value->areas);
	}
}
