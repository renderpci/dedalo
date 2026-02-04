<?php declare(strict_types=1);
// bootstrap
require_once dirname(dirname(__FILE__)) . '/bootstrap.php';

final class ontology_node_test extends BaseTestCase {

	public $tipo = 'dd6'; // section model

	/**
	* TEST__CONSTRUCT
	* @return void
	*/
	public function test__construct(): void {

		$_ENV['DEDALO_LAST_ERROR'] = null; // reset

		$ontology_node = new ontology_node($this->tipo);

		$this->assertTrue(
			empty($_ENV['DEDALO_LAST_ERROR']),
			'expected running without errors. DEDALO_LAST_ERROR: ' .$_ENV['DEDALO_LAST_ERROR']
		);

		$this->assertInstanceOf(ontology_node::class, $ontology_node);
		$this->assertEquals($this->tipo, $ontology_node->get_tipo());
	}

	/**
	* TEST_LOAD_DATA
	* @return void
	*/
	public function test_load_data(): void {

		$_ENV['DEDALO_LAST_ERROR'] = null; // reset

		$ontology_node = ontology_node::get_instance($this->tipo);
		$result = $ontology_node->load_data();

		$this->assertTrue($result, 'expected load_data to return true');
		$this->assertTrue(
			empty($_ENV['DEDALO_LAST_ERROR']),
			'expected running without errors. DEDALO_LAST_ERROR: ' .$_ENV['DEDALO_LAST_ERROR']
		);

		$data = $ontology_node->get_data();
		$this->assertIsObject($data);
		$this->assertEquals($this->tipo, $data->tipo);
	}

	/**
	* TEST_GET_TERM
	* @return void
	*/
	public function test_get_term(): void {

		$ontology_node = ontology_node::get_instance($this->tipo);
		$term = $ontology_node->get_term(DEDALO_STRUCTURE_LANG);

		$this->assertNotEmpty($term);
		$this->assertEquals('section', $term);
	}

	/**
	* TEST_GET_MODEL
	* @return void
	*/
	public function test_get_model(): void {

		$ontology_node = ontology_node::get_instance('activity2');
		$model = $ontology_node->get_model();

		// For activity2, get_model returns 'section'
		$this->assertEquals('section', $model);
	}

    /**
	* TEST_GET_AR_CHILDREN_OF_THIS
	* @return void
	*/
	public function test_get_ar_children_of_this(): void {

		$ontology_node = ontology_node::get_instance('hierarchymtype12');
		$ar_children = $ontology_node->get_ar_children_of_this();

		$this->assertIsArray($ar_children);
		$this->assertNotEmpty($ar_children);
        $this->assertContains('activity2', $ar_children);
	}

    /**
	* TEST_GET_AR_RECURSIVE_CHILDREN_OF_THIS
	* @return void
	*/
	public function test_get_ar_recursive_children_of_this(): void {

		$ontology_node = new ontology_node('hierarchymtype12');
		$ar_children = $ontology_node->get_ar_recursive_children_of_this('hierarchymtype12');

		$this->assertIsArray($ar_children);
		$this->assertNotEmpty($ar_children);
        $this->assertContains('activity2', $ar_children);
	}

    /**
	* TEST_GET_AR_TIPO_BY_MODEL_AND_RELATION
	* @return void
	*/
	public function test_get_ar_tipo_by_model_and_relation(): void {

		$ar_tipos = ontology_node::get_ar_tipo_by_model_and_relation('hierarchymtype12', 'section', 'children', true);

		$this->assertIsArray($ar_tipos);
		$this->assertNotEmpty($ar_tipos);
		$this->assertContains('activity2', $ar_tipos);
	}
}
