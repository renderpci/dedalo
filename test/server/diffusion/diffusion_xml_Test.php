<?php declare(strict_types=1);
require_once dirname(dirname(__FILE__)) . '/bootstrap.php';
require_once __DIR__ . '/class.diffusion_test_helper.php';

/**
* DIFFUSION_XML_TEST
* Deterministic XML file naming/delete (guarded: skips without a fully
* configured xml element) + pure logic tests of the v7 fixes:
* row grouping by related record and language splitting from inner items.
*/
final class diffusion_xml_Test extends BaseTestCase {

	public static $model = 'diffusion_xml';

	private const FABRICATED_ID = 99900179;

	protected function setUp(): void {
		parent::setUp();
		$this->user_login();
	}



	/**
	* TEST_GET_RECORD_FILE_PATH_DETERMINISTIC (guarded)
	*/
	public function test_get_record_file_path_deterministic(): void {

		$config = diffusion_test_helper::require_xml_ontology($this);

		$file_info = diffusion_xml::get_record_file_path($config->element_tipo, $config->section_tipo, self::FABRICATED_ID);

		$this->assertIsObject($file_info);
		$this->assertSame($config->section_tipo .'_'. self::FABRICATED_ID .'.xml', $file_info->file_name);
		$this->assertSame('/xml/'. $file_info->service_name .'/', $file_info->sub_path);
		$this->assertStringContainsString($file_info->file_name, $file_info->file_path);

		// determinism: same inputs, same path
		$file_info_2 = diffusion_xml::get_record_file_path($config->element_tipo, $config->section_tipo, self::FABRICATED_ID);
		$this->assertSame($file_info->file_path, $file_info_2->file_path);
	}//end test_get_record_file_path_deterministic



	/**
	* TEST_DELETE_RECORD_FILE (guarded)
	* Idempotent + removes canonical and legacy flat variants.
	*/
	public function test_delete_record_file(): void {

		$config = diffusion_test_helper::require_xml_ontology($this);

		// no file → idempotent success
		$response = diffusion_xml::delete_record_file($config->element_tipo, $config->section_tipo, self::FABRICATED_ID);
		$this->assertTrue($response->result);
		$this->assertEmpty($response->deleted_files);

		// staged canonical + legacy flat variant → both removed
		$file_info = diffusion_xml::get_record_file_path($config->element_tipo, $config->section_tipo, self::FABRICATED_ID);
		if (!is_dir(dirname($file_info->file_path))) {
			mkdir(dirname($file_info->file_path), 0777, true);
		}
		$legacy_dir = DEDALO_MEDIA_PATH . '/xml';
		if (!is_dir($legacy_dir)) {
			mkdir($legacy_dir, 0777, true);
		}
		$legacy_path = $legacy_dir .'/'. $config->section_tipo .'_'. self::FABRICATED_ID .'_1_2024-01-01.xml';

		file_put_contents($file_info->file_path, '<records/>');
		file_put_contents($legacy_path, '<records/>');

		$response = diffusion_xml::delete_record_file($config->element_tipo, $config->section_tipo, self::FABRICATED_ID);
		$this->assertTrue($response->result);
		$this->assertFileDoesNotExist($file_info->file_path, 'Canonical file not removed');
		$this->assertFileDoesNotExist($legacy_path, 'Legacy flat variant not removed');
	}//end test_delete_record_file



	/**
	* TEST_RESOLVE_ROW_KEY (pure)
	* Rows group by the related record (wrapper or inner section scoping).
	*/
	public function test_resolve_row_key(): void {

		// wrapper-level scoping
		$wrapper = new diffusion_data_object((object)['tipo' => 'c1', 'value' => 'x']);
		$wrapper->section_tipo	= 'rsc1';
		$wrapper->section_id	= 100;
		$key = PHPUnitUtil::callMethod(new diffusion_xml(), 'resolve_row_key', [$wrapper]);
		$this->assertSame('rsc1_100', $key);

		// inner-item scoping
		$inner = new diffusion_data_object((object)['tipo' => 'c1', 'lang' => null, 'value' => 'x', 'id' => null]);
		$inner->section_tipo	= 'rsc1';
		$inner->section_id		= 200;
		$wrapper2 = new diffusion_data_object((object)['diffusion_tipo' => 'oh85', 'value' => [$inner]]);
		$key2 = PHPUnitUtil::callMethod(new diffusion_xml(), 'resolve_row_key', [$wrapper2]);
		$this->assertSame('rsc1_200', $key2);

		// no scoping → single default row
		$plain = new diffusion_data_object((object)['tipo' => 'c1', 'value' => 'x']);
		$key3 = PHPUnitUtil::callMethod(new diffusion_xml(), 'resolve_row_key', [$plain]);
		$this->assertSame('', $key3);
	}//end test_resolve_row_key



	/**
	* TEST_FLATTEN_TO_INNER_ITEMS (pure)
	* Wrappers flatten to their inner items (langs normalized: null → nolan);
	* plain items pass through.
	*/
	public function test_flatten_to_inner_items(): void {

		$inner_eng = new diffusion_data_object((object)['tipo' => 'c1', 'lang' => 'lg-eng', 'value' => 'Hello', 'id' => 'a']);
		$inner_nolan = new diffusion_data_object((object)['tipo' => 'c2', 'lang' => null, 'value' => 'CODE', 'id' => null]);
		$wrapper = new diffusion_data_object((object)['diffusion_tipo' => 'oh85', 'value' => [$inner_eng, $inner_nolan]]);

		$flat = PHPUnitUtil::callMethod(new diffusion_xml(), 'flatten_to_inner_items', [[$wrapper]]);

		$this->assertCount(2, $flat);
		$this->assertSame('lg-eng', $flat[0]->lang);
		$this->assertSame('Hello', $flat[0]->value);
		$this->assertSame(DEDALO_DATA_NOLAN, $flat[1]->lang, 'null lang must normalize to nolan');
		// originals untouched (cloned)
		$this->assertNull($inner_nolan->lang);
	}//end test_flatten_to_inner_items



}//end class diffusion_xml_Test
