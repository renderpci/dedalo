<?php declare(strict_types=1);
// bootstrap
require_once dirname(dirname(__FILE__)) . '/bootstrap.php';

final class ontology_node_test extends BaseTestCase {

	public $tipo = 'dd6'; // section model

	/**
	* TEST_get_instance
	* @return void
	*/
	public function test_get_instance(): void {

		$_ENV['DEDALO_LAST_ERROR'] = null; // reset

		$ontology_node = ontology_node::get_instance($this->tipo);

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

		$ontology_node = ontology_node::get_instance('hierarchymtype12');
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

	/**
	 * TEST_SETTERS_AND_GETTERS
	 * Tests in-memory data manipulation
	 */
	public function test_setters_and_getters(): void {
		$test_tipo = 'ddtest998';
		$node = ontology_node::get_instance($test_tipo);
		$node->load_data();

		// Term data
		$term_obj = (object)['lg-eng' => 'Test Node', 'lg-spa' => 'Nodo de Prueba'];
		$node->set_term_data($term_obj);
		$this->assertEquals($term_obj, $node->get_term_data());
		$this->assertEquals('Test Node', $node->get_term('lg-eng'));
		$this->assertEquals('Nodo de Prueba', $node->get_term('lg-spa'));

		// Parent
		$node->set_parent('ddtestparent998');
		$this->assertEquals('ddtestparent998', $node->get_parent());

		// Model
		$node->set_model('section');
		$this->assertEquals('section', $node->get_model());

		// Order
		$node->set_order_number(10);
		$this->assertEquals(10, $node->get_order_number());

		// Relations
		$relations = [['tipo' => 'dd2']];
		$node->set_relations($relations);
		$this->assertEquals($relations, $node->get_relations());

		// Properties
		$props = (object)['color' => '#ff0000'];
		$node->set_properties($props);
		$this->assertEquals($props, $node->get_properties());

		// Flags
		$node->set_is_model(true);
		$this->assertTrue($node->get_is_model());

		$node->set_is_translatable(true);
		$this->assertTrue($node->get_is_translatable());
	}

	/**
	 * TEST_INSERT_AND_DELETE
	 * Tests DB persistence
	 */
	public function test_insert_and_delete(): void {
		$test_tipo = 'ddtest997';
		$node = ontology_node::get_instance($test_tipo);
		$node->set_term_data((object)['lg-eng' => 'DB Test Node']);
		$node->set_model('section');

		// Insert
		$result = $node->insert();
		$this->assertTrue($result, 'Insert should return true');

		// Verify exists in DB by clearing static cache and re-fetching
		ontology_node::$instances = [];
		$node_db = ontology_node::get_instance($test_tipo);
		$this->assertEquals('DB Test Node', $node_db->get_term('lg-eng'));
		$this->assertEquals('section', $node_db->get_model());

		// Delete
		$delete_result = $node_db->delete();
		$this->assertTrue($delete_result, 'Delete should return true');

		// Verify gone
		ontology_node::$instances = [];
		$node_gone = ontology_node::get_instance($test_tipo);
		$this->assertNull($node_gone->get_data()->tipo ?? null);
	}

	/**
	 * TEST_HIERARCHY_HELPERS
	 */
	public function test_hierarchy_helpers(): void {
		// Use known existing relationships or create temporary ones
		// We'll use 'activity2' which we know is a child of 'hierarchymtype12'
		$node = ontology_node::get_instance('activity2');

		// Parents
		$parents = $node->get_ar_parents_of_this();
		$this->assertNotEmpty($parents);
		$this->assertContains('hierarchymtype12', $parents);

		// Siblings
		$siblings = $node->get_ar_siblings_of_this();
		$this->assertNotEmpty($siblings);
		$this->assertContains('activity2', $siblings, 'Siblings list should include self in current implementation');
	}

	/**
	 * TEST_GET_TERM_FALLBACK
	 */
	public function test_get_term_fallback(): void {
		$test_tipo = 'ddtestfb2';
		$node = ontology_node::get_instance($test_tipo);
		$node->load_data();
		$node->set_term_data((object)['lg-eng' => 'English Only Item']);

		// Request missing lang with fallback
		$term = $node->get_term('lg-spa', true);
		$this->assertEquals('English Only Item', $term, 'Should fallback to first available term');

		// Request missing lang WITHOUT fallback
		$term_no_fb = $node->get_term('lg-spa', false);
		$this->assertNull($term_no_fb, 'Should return null without fallback');
	}

	/**
	 * TEST_GET_COLOR
	 */
	public function test_get_color(): void {
		$test_tipo = 'ddtestcolor2';
		$node = ontology_node::get_instance($test_tipo);
		$node->load_data();
		$node->set_properties((object)['color' => '#123456']);
		$node->insert();

		$color = ontology_node::get_color($test_tipo);
		$this->assertEquals('#123456', $color);

		// Default color
		$default_color = ontology_node::get_color('ddnonexistent999');
		$this->assertEquals('#b9b9b9', $default_color);

		$node->delete();
	}

	/**
	 * TEST_STATIC_AND_LEGACY_HELPERS
	 */
	public function test_static_and_legacy_helpers(): void {
		// get_tipo_from_model
		$tipo = ontology_node::get_tipo_from_model('section');
		$this->assertEquals('dd6', $tipo);

		// get_legacy_model
		$node = ontology_node::get_instance('activity2');
		$node->load_data();
		$legacy = $node->get_legacy_model();
		$this->assertEquals('section', $legacy);

		// get_propiedades (legacy column)
		$node->set_propiedades('{"test":1}');
		$this->assertEquals('{"test":1}', $node->get_propiedades(false));
		$this->assertEquals(1, $node->get_propiedades(true)->test);
	}
}
