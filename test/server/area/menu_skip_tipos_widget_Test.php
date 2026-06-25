<?php declare(strict_types=1);

use PHPUnit\Framework\TestCase;

require_once DEDALO_CORE_PATH . '/area_maintenance/widgets/menu_skip_tipos/class.menu_skip_tipos.php';

final class menu_skip_tipos_widget_Test extends TestCase {

	public function test_prepare_list_drops_area_root() : void {
		$root = ontology_utils::get_ar_tipo_by_model('area_root')[0] ?? null;
		$this->assertNotNull($root, 'area_root tipo must resolve in this ontology');
		$out = menu_skip_tipos::prepare_list([$root]);
		$this->assertNotContains($root, $out->tipos);
		$this->assertContains($root, $out->removed);
	}

	public function test_prepare_list_rejects_invalid_tipo() : void {
		$out = menu_skip_tipos::prepare_list(['zzz_not_a_tipo_999']);
		$this->assertSame([], $out->tipos);
		$this->assertContains('zzz_not_a_tipo_999', $out->invalid);
	}

	public function test_prepare_list_dedupes_and_keeps_valid_tipo() : void {
		// dd69 (Activities) is a valid area tipo in a standard ontology
		$out = menu_skip_tipos::prepare_list(['dd69', 'dd69']);
		$this->assertSame(['dd69'], $out->tipos);
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
