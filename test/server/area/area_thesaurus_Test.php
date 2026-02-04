<?php declare(strict_types=1);
// bootstrap
require_once dirname(dirname(__FILE__)) . '/bootstrap.php';
require_once DEDALO_CORE_PATH . '/area_thesaurus/class.area_thesaurus.php';

final class area_thesaurus_Test extends BaseTestCase {

	public static $model	= 'area_thesaurus';
	public static $tipo		= 'dd87'; // Default for area_thesaurus

	/**
	* TEST_USER_LOGIN
	* @return void
	*/
	public function test_user_login() {

		$user_id = TEST_USER_ID; // Defined in bootstrap

		if (login::is_logged()===false) {
			login_test::force_login($user_id);
		}

		$this->assertTrue(
			login::is_logged()===true ,
			'expected login true'
		);
	}//end test_user_login

	private function get_instance() {
		$tipo = ontology_utils::get_ar_tipo_by_model(self::$model)[0] ?? self::$tipo;
		return area_thesaurus::get_instance(self::$model, $tipo);
	}

	/**
	* TEST_get_hierarchy_section_tipo
	*/
	public function test_get_hierarchy_section_tipo() {
		$instance = $this->get_instance();
		$result = $instance->get_hierarchy_section_tipo();
		$this->assertIsString($result);
		$this->assertEquals(DEDALO_HIERARCHY_SECTION_TIPO, $result);
	}

	/**
	* TEST_get_main_table
	*/
	public function test_get_main_table() {
		$instance = $this->get_instance();
		$result = $instance->get_main_table();
		$this->assertIsString($result);
		$this->assertEquals(hierarchy::$main_table, $result);
	}

	/**
	* TEST_get_hierarchy_sections
	*/
	public function test_get_hierarchy_sections() {
		$instance = $this->get_instance();
		$result = $instance->get_hierarchy_sections();
		$this->assertIsArray($result);
		// If there are hierarchies, check structure
		if (!empty($result)) {
			$item = $result[0];
			$this->assertObjectHasProperty('section_id', $item);
			$this->assertObjectHasProperty('section_tipo', $item);
			$this->assertObjectHasProperty('target_section_tipo', $item);
		}
	}

	/**
	* TEST_get_typology_name_and_cache
	*/
	public function test_get_typology_name_and_cache() {
		$instance = $this->get_instance();
		$typologies = $instance->get_hierarchy_typologies();

		$this->assertIsArray($typologies, 'get_hierarchy_typologies should return an array');

		if (!empty($typologies)) {
			$typology = $typologies[0];

			$typology_section_id = null;
			if (is_object($typology) && isset($typology->section_id)) {
				$typology_section_id = $typology->section_id;
			} elseif (is_array($typology) && isset($typology['section_id'])) {
				$typology_section_id = $typology['section_id'];
			} elseif (is_numeric($typology) || is_string($typology)) {
				$typology_section_id = $typology;
			}

			$this->assertNotNull($typology_section_id, 'typology_section_id should not be null. Typology data: ' . print_r($typology, true));

			$name = $instance->get_typology_name($typology_section_id);
			$this->assertIsString($name);

			// Check cache
			$this->assertArrayHasKey($typology_section_id, area_thesaurus::$typology_names_cache);
			$this->assertEquals($name, area_thesaurus::$typology_names_cache[$typology_section_id]);
		}
	}

	/**
	* TEST_get_hierarchy_terms_sqo
	*/
	public function test_get_hierarchy_terms_sqo() {
		$instance = $this->get_instance();
		$terms = [
			(object)['value' => [(object)['section_tipo' => 'dd43', 'section_id' => '2']]]
		];
		$sqo = $instance->get_hierarchy_terms_sqo($terms);
		$this->assertInstanceOf('search_query_object', $sqo);
		$this->assertEquals('thesaurus', $sqo->id);
		$this->assertContains('dd43', $sqo->section_tipo);
	}

	/**
	* TEST_search_thesaurus
	*/
	public function test_search_thesaurus() {
		$instance = $this->get_instance();

		// Create a basic SQO
		$sqo = new search_query_object();
		$sqo->section_tipo = ['hierarchy1']; // Use a common hierarchy section
		$sqo->limit = 1;

		$response = $instance->search_thesaurus($sqo);

		$this->assertIsObject($response);
		$this->assertObjectHasProperty('result', $response);
		$this->assertObjectHasProperty('total', $response);

		if ($response->total > 0) {
			$this->assertIsArray($response->result);
			$this->assertNotEmpty($response->result);
		}
	}
}
