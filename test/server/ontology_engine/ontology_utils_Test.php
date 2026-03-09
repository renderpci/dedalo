<?php declare(strict_types=1);
require_once dirname(dirname(__FILE__)) . '/bootstrap.php';

/**
 * ONTOLOGY_UTILS TEST
 */
final class ontology_utils_test extends BaseTestCase {

	public static $model = 'ontology_utils';

	public function test_get_ar_tipo_by_model(): void {
		$this->user_login();
		$model_name = 'section';
		$tipos = ontology_utils::get_ar_tipo_by_model($model_name);

		$this->assertIsArray($tipos);
		$this->assertNotEmpty($tipos);
		// activity2 matches 'section' model
		$this->assertContains('activity2', $tipos);
	}

	public function test_get_ar_all_models(): void {
		$this->user_login();
		$models = ontology_utils::get_ar_all_models();

		$this->assertIsArray($models);
		$this->assertNotEmpty($models);
		$this->assertContains('dd6', $models); // dd6 = section model
	}

	public function test_get_ar_all_tipo_of_model_tipo(): void {
		$this->user_login();
		$model_tipo = 'dd6'; // section model
		$tipos = ontology_utils::get_ar_all_tipo_of_model_tipo($model_tipo);

		$this->assertIsArray($tipos);
		// activity2 should be a section (model_tipo dd6)
		$this->assertContains('activity2', $tipos);
	}

	public function test_check_tipo_is_valid(): void {
		$this->user_login();
		// dd6 is a model definition. activity2 is a valid instance of section.
		$this->assertTrue(ontology_utils::check_tipo_is_valid('activity2'));

		// invalid scenarios
		$this->assertFalse(ontology_utils::check_tipo_is_valid('non_existent_tipo_123'));
		$this->assertFalse(ontology_utils::check_tipo_is_valid(null));
		$this->assertFalse(ontology_utils::check_tipo_is_valid('invalid-tipo!!!')); // not safe_tipo
	}

	public function test_get_active_tlds(): void {
		$this->user_login();

		// Ensure cache array returns true regardless of DDBB read
		ontology_utils::$active_tlds_cache = null;

		$tlds = ontology_utils::get_active_tlds();

		$this->assertIsArray($tlds);
		$this->assertContains('dd', $tlds);
		// activity is a TLD
		$this->assertContains('activity', $tlds);

		// second call assertions check the cache
		$tlds_cached = ontology_utils::get_active_tlds();
		$this->assertIsArray($tlds_cached);
		$this->assertContains('dd', $tlds_cached);
	}

	public function test_check_active_tld(): void {
		$this->user_login();
		$this->assertTrue(ontology_utils::check_active_tld('dd6'));
		$this->assertTrue(ontology_utils::check_active_tld('activity2'));
		$this->assertTrue(ontology_utils::check_active_tld('section_id')); // exception case

		$this->assertFalse(ontology_utils::check_active_tld('invalidtld999'));
	}

	public function test_delete_tld_nodes_unsafe_tld(): void {
		$this->user_login();
		// Test defensive mechanism
		$result = ontology_utils::delete_tld_nodes('unsafe_*_tld; DROP TABLE dd_ontology;');
		$this->assertFalse($result, 'Deletion of unsafe TLD should abort and return false.');
	}

	public function test_backup_and_restore_empty_inputs(): void {
		$this->user_login();
		// Test new edge cases
		$res1 = ontology_utils::create_bk_table([]);
		$this->assertFalse($res1, 'create_bk_table should return false for empty tlds array');

		$res2 = ontology_utils::restore_from_bk_table([]);
		$this->assertFalse($res2, 'restore_from_bk_table should return false for empty tlds array');
	}

	public function test_backup_and_restore(): void {
		$this->user_login();
		$test_tld = 'testtld';
		$conn     = DBi::_getConnection();
		$table    = ontology_node::$table;

		// 0. Ensure test record exists
		$sql_insert = "INSERT INTO \"{$table}\" (tipo, tld, term) VALUES ('testtld1', 'testtld', '{\"lg-spa\": \"test\"}') ON CONFLICT DO NOTHING;";
		pg_query($conn, $sql_insert);

		// 1. Create backup
		$res = ontology_utils::create_bk_table([$test_tld]);
		$this->assertTrue($res, 'Backup table creation failed');

		// 2. Modify original (delete)
		$res = ontology_utils::delete_tld_nodes($test_tld);
		$this->assertTrue($res, 'Deletion of TLD nodes failed');

		// Verify it's gone
		ontology_utils::$active_tlds_cache = null; // Clear cache to force reload
		dd_cache::delete_cache_files([ontology_utils::$active_tlds_cache_file_name]);

		$tlds = ontology_utils::get_active_tlds();
		$this->assertNotContains($test_tld, $tlds, 'TLD should be deleted from active list');

		// 3. Restore from backup
		$res = ontology_utils::restore_from_bk_table([$test_tld]);
		$this->assertTrue($res, 'Restore from backup failed');

		// Verify it's back
		ontology_utils::$active_tlds_cache = null; // Clear cache to force reload
		dd_cache::delete_cache_files([ontology_utils::$active_tlds_cache_file_name]);

		$tlds = ontology_utils::get_active_tlds();
		$this->assertContains($test_tld, $tlds, 'TLD should be restored to active list');

		// 4. Cleanup backup table
		$res = ontology_utils::delete_bk_table();
		$this->assertTrue($res, 'Backup table deletion failed');

		// Final cleanup of the test record
		ontology_utils::delete_tld_nodes($test_tld);
	}

	// ONTOLOGY_NODE TESTS

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

	public function test_legacy_get_instance(): void {
		$this->user_login();
		$_ENV['DEDALO_LAST_ERROR'] = null; // reset

		$ontology_node = ontology_node::get_instance('dd6');

		$this->assertTrue(
			empty($_ENV['DEDALO_LAST_ERROR']),
			'expected running without errors. DEDALO_LAST_ERROR: ' . ($_ENV['DEDALO_LAST_ERROR'] ?? '')
		);

		$this->assertInstanceOf(ontology_node::class, $ontology_node);
		$this->assertEquals('dd6', $ontology_node->get_tipo());
	}

	public function test_legacy_load_data(): void {
		$this->user_login();
		$_ENV['DEDALO_LAST_ERROR'] = null; // reset

		$ontology_node = ontology_node::get_instance('dd6');
		$result = $ontology_node->load_data();

		$this->assertTrue($result, 'expected load_data to return true');
		$this->assertTrue(
			empty($_ENV['DEDALO_LAST_ERROR']),
			'expected running without errors. DEDALO_LAST_ERROR: ' . ($_ENV['DEDALO_LAST_ERROR'] ?? '')
		);

		$data = $ontology_node->get_data();
		$this->assertIsObject($data);
		$this->assertEquals('dd6', $data->tipo);
	}

	public function test_legacy_get_term(): void {
		$this->user_login();
		$ontology_node = ontology_node::get_instance('dd6');
		$term = $ontology_node->get_term(DEDALO_STRUCTURE_LANG);

		$this->assertNotEmpty($term);
		$this->assertEquals('section', $term);
	}

	public function test_legacy_get_model(): void {
		$this->user_login();
		$ontology_node = ontology_node::get_instance('activity2');
		$model = $ontology_node->get_model();

		// For activity2, get_model returns 'section'
		$this->assertEquals('section', $model);
	}

	public function test_legacy_get_ar_children_of_this(): void {
		$this->user_login();
		$ontology_node = ontology_node::get_instance('hierarchymtype12');
		$ar_children = $ontology_node->get_ar_children_of_this();

		$this->assertIsArray($ar_children);
		$this->assertNotEmpty($ar_children);
        $this->assertContains('activity2', $ar_children);
	}

	public function test_legacy_get_ar_recursive_children_of_this(): void {
		$this->user_login();
		$ontology_node = ontology_node::get_instance('hierarchymtype12');
		$ar_children = $ontology_node->get_ar_recursive_children_of_this('hierarchymtype12');

		$this->assertIsArray($ar_children);
		$this->assertNotEmpty($ar_children);
        $this->assertContains('activity2', $ar_children);
	}

	public function test_legacy_get_ar_tipo_by_model_and_relation(): void {
		$this->user_login();
		$ar_tipos = ontology_node::get_ar_tipo_by_model_and_relation('hierarchymtype12', 'section', 'children', true);

		$this->assertIsArray($ar_tipos);
		$this->assertNotEmpty($ar_tipos);
		$this->assertContains('activity2', $ar_tipos);
	}

	public function test_legacy_setters_and_getters(): void {
		$this->user_login();
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

	public function test_legacy_insert_and_delete(): void {
		$this->user_login();
		$test_tipo = 'ddtest997';
		// cleanup before
		dd_ontology_db_manager::delete($test_tipo);

		$node = ontology_node::get_instance($test_tipo);
		$node->set_term_data((object)['lg-eng' => 'DB Test Node']);
		$node->set_model('section');

		// Insert
		$result = $node->insert();
		$this->assertTrue($result, 'Insert should return true');

		// Verify exists in DB by clearing static cache and re-fetching
		ontology_node::$instances = [];
		$node_db = ontology_node::get_instance($test_tipo);
		$node_db->load_data();
		$this->assertEquals('DB Test Node', $node_db->get_term('lg-eng'));
		$this->assertEquals('section', $node_db->get_model());

		// Delete
		$delete_result = $node_db->delete();
		$this->assertTrue($delete_result, 'Delete should return true');

		// Verify gone
		ontology_node::$instances = [];
		$node_gone = ontology_node::get_instance($test_tipo);
		$node_gone->load_data();
		$this->assertNull($node_gone->get_data()->tipo ?? null);
	}

	public function test_legacy_hierarchy_helpers(): void {
		$this->user_login();
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

	public function test_legacy_get_term_fallback(): void {
		$this->user_login();
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

	public function test_legacy_get_color(): void {
		$this->user_login();
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

	public function test_legacy_static_and_legacy_helpers(): void {
		$this->user_login();
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
