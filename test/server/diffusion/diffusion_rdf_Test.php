<?php declare(strict_types=1);
require_once dirname(dirname(__FILE__)) . '/bootstrap.php';
require_once __DIR__ . '/class.diffusion_test_helper.php';

/**
* DIFFUSION_RDF_TEST
* Deterministic RDF file naming: one canonical file per record, shared by
* publish (update_record) and delete (delete_record_file).
* Guarded: skips when no fully-configured RDF element exists.
*/
final class diffusion_rdf_Test extends BaseTestCase {

	public static $model = 'diffusion_rdf';

	private const FABRICATED_ID = 99900178;

	protected function setUp(): void {
		parent::setUp();
		$this->user_login();
	}



	/**
	* TEST_GET_RECORD_FILE_PATH_DETERMINISTIC
	*/
	public function test_get_record_file_path_deterministic(): void {

		$config = diffusion_test_helper::require_rdf_ontology($this);

		$file_info = diffusion_rdf::get_record_file_path($config->element_tipo, $config->section_tipo, self::FABRICATED_ID);

		$this->assertIsObject($file_info);
		foreach (['service_name','sub_path','file_name','file_path','file_url'] as $key) {
			$this->assertObjectHasProperty($key, $file_info);
			$this->assertNotEmpty($file_info->{$key}, "file_info->$key is empty");
		}

		// deterministic name: {rdf_name}_{section_tipo}_{section_id}.rdf — no user, no timestamp
		$this->assertStringEndsWith(
			'_' . $config->section_tipo . '_' . self::FABRICATED_ID . '.rdf',
			$file_info->file_name,
			'RDF file name is not the deterministic {rdf_name}_{section_tipo}_{section_id}.rdf shape'
		);
		$this->assertStringStartsWith('/rdf/' . $file_info->service_name . '/', $file_info->sub_path);
		$this->assertStringContainsString($file_info->file_name, $file_info->file_path);
		$this->assertStringContainsString($file_info->file_name, $file_info->file_url);

		// determinism: same inputs, same path (no date/user component)
		$file_info_2 = diffusion_rdf::get_record_file_path($config->element_tipo, $config->section_tipo, self::FABRICATED_ID);
		$this->assertSame($file_info->file_path, $file_info_2->file_path);
	}//end test_get_record_file_path_deterministic



	/**
	* TEST_DELETE_REMOVES_LEGACY_VARIANTS
	* Pre-migration installs keep timestamped files: delete must remove the
	* canonical file AND any legacy {base}_*.rdf variants.
	*/
	public function test_delete_removes_legacy_variants(): void {

		$config = diffusion_test_helper::require_rdf_ontology($this);

		$file_info = diffusion_rdf::get_record_file_path($config->element_tipo, $config->section_tipo, self::FABRICATED_ID);
		$dir = dirname($file_info->file_path);
		if (!is_dir($dir)) {
			mkdir($dir, 0777, true);
		}

		$base = pathinfo($file_info->file_name, PATHINFO_FILENAME);
		$legacy_path = $dir . '/' . $base . '_1_2024-01-01 10_00_00.rdf';

		file_put_contents($file_info->file_path, '<rdf:RDF/>');
		file_put_contents($legacy_path, '<rdf:RDF/>');

		$response = diffusion_rdf::delete_record_file($config->element_tipo, $config->section_tipo, self::FABRICATED_ID);

		$this->assertTrue($response->result);
		$this->assertFileDoesNotExist($file_info->file_path, 'Canonical file not removed');
		$this->assertFileDoesNotExist($legacy_path, 'Legacy timestamped variant not removed');
	}//end test_delete_removes_legacy_variants



}//end class diffusion_rdf_Test
