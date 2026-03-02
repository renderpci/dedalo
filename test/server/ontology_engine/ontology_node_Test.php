<?php declare(strict_types=1);
require_once dirname(dirname(__FILE__)) . '/bootstrap.php';

/**
 * ONTOLOGY_NODE TEST
 */
final class ontology_node_test extends BaseTestCase {

	public static $model = 'ontology_node';

	public function test_get_instance() {
		$this->user_login();
		$node = ontology_node::get_instance('dd1');
		$this->assertInstanceOf('ontology_node', $node);
		$this->assertEquals('dd1', $node->get_tipo());
	}

	public function test_load_data() {
		$this->user_login();
		$node = ontology_node::get_instance('dd1');
		$result = $node->load_data();
		$this->assertIsBool($result);
	}

	public function test_get_data() {
		$this->user_login();
		$node = ontology_node::get_instance('dd1');
		$data = $node->get_data();
		$this->assertIsObject($data);
	}

	public function test_get_tipo() {
		$this->user_login();
		$node = ontology_node::get_instance('dd1');
		$this->assertEquals('dd1', $node->get_tipo());
	}

	public function test_get_parent() {
		$this->user_login();
		$node = ontology_node::get_instance('dd1');
		$parent = $node->get_parent();
		if ($parent !== null) {
			$this->assertIsString($parent);
		} else {
			$this->assertNull($parent);
		}
	}

	public function test_get_term_data() {
		$this->user_login();
		$node = ontology_node::get_instance('dd1');
		$term_data = $node->get_term_data();
		if ($term_data !== null) {
			$this->assertIsObject($term_data);
		} else {
			$this->assertNull($term_data);
		}
	}

	public function test_get_term() {
		$this->user_login();
		$node = ontology_node::get_instance('dd1');
		$term = $node->get_term('lg-eng');
		$this->assertIsString($term);
	}

	public function test_get_model() {
		$this->user_login();
		$node = ontology_node::get_instance('dd6'); // section model
		$model = $node->get_model();
		if ($model !== null) {
			$this->assertIsString($model);
		} else {
			$this->assertNull($model);
		}
	}

	public function test_get_order_number() {
		$this->user_login();
		$node = ontology_node::get_instance('dd1');
		$order = $node->get_order_number();
		if ($order !== null) {
			$this->assertIsInt($order);
		} else {
			$this->assertNull($order);
		}
	}

	public function test_get_relations() {
		$this->user_login();
		$node = ontology_node::get_instance('dd1');
		$relations = $node->get_relations();
		if ($relations !== null) {
			$this->assertIsArray($relations);
		} else {
			$this->assertNull($relations);
		}
	}

	public function test_get_tld() {
		$this->user_login();
		$node = ontology_node::get_instance('dd1');
		$tld = $node->get_tld();
		$this->assertEquals('dd', $tld);
	}

	public function test_get_properties() {
		$this->user_login();
		$node = ontology_node::get_instance('dd1');
		$props = $node->get_properties();
		if ($props !== null) {
			$this->assertIsObject($props);
		} else {
			$this->assertNull($props);
		}
	}

	public function test_get_model_tipo() {
		$this->user_login();
		$node = ontology_node::get_instance('dd1');
		$model_tipo = $node->get_model_tipo();
		if ($model_tipo !== null) {
			$this->assertIsString($model_tipo);
		} else {
			$this->assertNull($model_tipo);
		}
	}

	public function test_get_is_model() {
		$this->user_login();
		$node = ontology_node::get_instance('dd6'); // section
		$is_model = $node->get_is_model();
		$this->assertTrue($is_model);
	}

	public function test_get_is_translatable() {
		$this->user_login();
		$node = ontology_node::get_instance('dd1');
		$is_translatable = $node->get_is_translatable();
		$this->assertIsBool($is_translatable);
	}

	public function test_get_translatable() {
		$this->user_login();
		$is_translatable = ontology_node::get_translatable('dd1');
		$this->assertIsBool($is_translatable);
	}

	public function test_get_propiedades() {
		$this->user_login();
		$node = ontology_node::get_instance('dd1');
		$propiedades = $node->get_propiedades();
		if ($propiedades !== null) {
			$this->assertTrue(is_string($propiedades) || is_object($propiedades) || is_array($propiedades));
		} else {
			$this->assertNull($propiedades);
		}
	}

	public function test_setters_and_insert_delete() {
		$this->user_login();

		// Create a dummy node
		$dummy_tipo = 'ddtest999999';

		// First, clean up in case a previous test failed
		dd_ontology_db_manager::delete($dummy_tipo);

		$node = ontology_node::get_instance($dummy_tipo);
		$node->load_data();

		// Test setters
		$node->set_parent('dd1');
		$this->assertEquals('dd1', $node->get_parent());

		$term = (object)['lg-eng' => 'Test', 'lg-spa' => 'Prueba'];
		$node->set_term_data($term);
		$this->assertEquals('Test', $node->get_term('lg-eng'));

		$node->set_model('component_input_text');
		$this->assertEquals('component_input_text', $node->get_model());

		$node->set_order_number(123);
		$this->assertEquals(123, $node->get_order_number());

		$relations = [(object)['tipo' => 'dd2']];
		$node->set_relations($relations);
		$this->assertIsArray($node->get_relations());

		$node->set_tld('dd');
		$this->assertEquals('dd', $node->get_tld());

		$props = (object)['color' => '#ff0000'];
		$node->set_properties($props);
		$this->assertIsObject($node->get_properties());

		$node->set_model_tipo('dd15');
		$this->assertEquals('dd15', $node->get_model_tipo());

		$node->set_is_model(false);
		$this->assertFalse($node->get_is_model());

		$node->set_is_translatable(true);
		$this->assertTrue($node->get_is_translatable());

		$node->set_propiedades('{"foo":"bar"}');
		$this->assertIsString($node->get_propiedades());

		// Test insert
		$insert_result = $node->insert();
		$this->assertTrue($insert_result);

		// Test delete
		$delete_result = $node->delete();
		$this->assertTrue($delete_result);
	}

	public function test_get_ar_children_of_this() {
		$this->user_login();
		$node = ontology_node::get_instance('dd1');
		$children = $node->get_ar_children_of_this();
		$this->assertIsArray($children);
	}

	public function test_get_ar_children() {
		$this->user_login();
		$children = ontology_node::get_ar_children('dd1');
		$this->assertIsArray($children);
	}

	public function test_get_ar_recursive_children_of_this() {
		$this->user_login();
		$node = ontology_node::get_instance('dd1');
		$recursive_children = $node->get_ar_recursive_children_of_this('dd1');
		$this->assertIsArray($recursive_children);
	}

	public function test_get_ar_recursive_children() {
		$this->user_login();
		$recursive_children = ontology_node::get_ar_recursive_children('dd1');
		$this->assertIsArray($recursive_children);
	}

	public function test_get_ar_parents_of_this() {
		$this->user_login();
		$node = ontology_node::get_instance('dd12'); // section id
		$parents = $node->get_ar_parents_of_this();
		$this->assertIsArray($parents);
	}

	public function test_get_ar_siblings_of_this() {
		$this->user_login();
		$node = ontology_node::get_instance('dd12'); // section id
		$siblings = $node->get_ar_siblings_of_this();
		$this->assertIsArray($siblings);
	}

	public function test_get_relation_nodes() {
		$this->user_login();
		$relations = ontology_node::get_relation_nodes('dd1');
		$this->assertIsArray($relations);
	}

	public function test_get_ar_tipo_by_model_and_relation() {
		$this->user_login();
		// Test 'children' relation type
		$result = ontology_node::get_ar_tipo_by_model_and_relation('dd8', 'section', 'children');
		$this->assertIsArray($result);
	}

	public function test_get_color() {
		$this->user_login();
		$color = ontology_node::get_color('dd1');
		$this->assertIsString($color);
	}

	public function test_get_term_by_tipo() {
		$this->user_login();
		$term = ontology_node::get_term_by_tipo('dd1', 'lg-eng');
		$this->assertIsString($term);
	}

	public function test_get_model_by_tipo() {
		$this->user_login();
		$model = ontology_node::get_model_by_tipo('dd6'); // section
		if ($model !== null) {
			$this->assertIsString($model);
		} else {
			$this->assertNull($model);
		}
	}

	public function test_get_legacy_model_by_tipo() {
		$this->user_login();
		$legacy_model = ontology_node::get_legacy_model_by_tipo('dd6');
		if ($legacy_model !== null) {
			$this->assertIsString($legacy_model);
		} else {
			$this->assertNull($legacy_model);
		}
	}

	public function test_get_legacy_model() {
		$this->user_login();
		$node = ontology_node::get_instance('dd6');
		$legacy_model = $node->get_legacy_model();
		if ($legacy_model !== null) {
			$this->assertIsString($legacy_model);
		} else {
			$this->assertNull($legacy_model);
		}
	}

	public function test_get_tipo_from_model() {
		$this->user_login();
		// use 'section' because test cases above rely on it being model dd6
		$tipo = ontology_node::get_tipo_from_model('section');
		$this->assertEquals('dd6', $tipo);
	}
}
