<?php declare(strict_types=1);
require_once dirname(dirname(__FILE__)) . '/bootstrap.php';
require_once __DIR__ . '/class.diffusion_test_helper.php';

/**
* DIFFUSION_UTILS_TEST
* Tests the v7 core resolution: the flat virtual diffusion tree and the
* helpers built on it. Guarded: skips when the database has no usable
* diffusion ontology.
*/
final class diffusion_utils_Test extends BaseTestCase {

	public static $model = 'diffusion_utils';

	protected function setUp(): void {
		parent::setUp();
		$this->user_login();
		diffusion_utils::reset_cache();
	}



	/**
	* TEST_VIRTUAL_TREE_SHAPE
	* The flat virtual tree is the single resolution system: every node is
	* a flat object {tipo, model, label, parents, children_tipos}.
	*/
	public function test_virtual_tree_shape(): void {

		diffusion_test_helper::require_diffusion_ontology($this);

		$tree = diffusion_utils::get_virtual_diffusion_tree();

		$this->assertIsArray($tree);
		$this->assertNotEmpty($tree, 'Virtual diffusion tree is empty');

		foreach ($tree as $vnode) {
			$this->assertObjectHasProperty('tipo',				$vnode);
			$this->assertObjectHasProperty('model',				$vnode);
			$this->assertObjectHasProperty('label',				$vnode);
			$this->assertObjectHasProperty('parents',			$vnode);
			$this->assertObjectHasProperty('children_tipos',	$vnode);
			$this->assertIsArray($vnode->parents);
		}

		// at least one diffusion element and one database node exist
		$models = array_unique(array_map(fn($n) => $n->model, $tree));
		$this->assertTrue(
			in_array('diffusion_element', $models) || in_array('diffusion_element_alias', $models),
			'No diffusion element in the virtual tree'
		);
	}//end test_virtual_tree_shape



	/**
	* TEST_SECTION_DIFFUSION_NODES
	*/
	public function test_section_diffusion_nodes(): void {

		$config = diffusion_test_helper::require_diffusion_ontology($this);

		$nodes = diffusion_utils::get_section_diffusion_nodes($config->section_tipo);
		$this->assertNotEmpty($nodes, "No diffusion nodes for section {$config->section_tipo}");

		// at least one node belongs to the guarded element (parents path)
		$found_element = false;
		foreach ($nodes as $node) {
			foreach ($node->parents as $path_item) {
				if ($path_item->model==='diffusion_element' || $path_item->model==='diffusion_element_alias') {
					$this->assertObjectHasProperty('type', $path_item, 'Element path item without diffusion type');
					$found_element = true;
				}
			}
		}
		$this->assertTrue($found_element, 'No node carries a diffusion element in its parents path');
	}//end test_section_diffusion_nodes



	/**
	* TEST_ELEMENT_RESOLUTION
	* get_section_node_for_element + get_database_name_for_element +
	* get_table_tipo + get_table_fields agree with each other.
	*/
	public function test_element_resolution(): void {

		$config = diffusion_test_helper::require_diffusion_ontology($this);

		$node = diffusion_utils::get_section_node_for_element($config->element_tipo, $config->section_tipo);
		$this->assertIsObject($node, 'get_section_node_for_element resolved nothing');
		$this->assertNotEmpty($node->label, 'Section node without label (published table name)');

		$table_tipo = diffusion_utils::get_table_tipo($config->element_tipo, $config->section_tipo);
		$this->assertSame($node->tipo, $table_tipo, 'get_table_tipo disagrees with the section node');

		$database_name = diffusion_utils::get_database_name_for_element($config->element_tipo);
		$this->assertNotEmpty($database_name, 'No database resolved for the SQL element');
		if (!empty($config->database_name)) {
			$this->assertSame($config->database_name, $database_name, 'Virtual tree database differs from diffusion map database');
		}

		$fields = diffusion_utils::get_table_fields($config->element_tipo, $config->section_tipo);
		$this->assertIsArray($fields);
		foreach ($fields as $field) {
			$this->assertObjectHasProperty('tipo', $field);
			$this->assertObjectHasProperty('label', $field);
		}
	}//end test_element_resolution



	/**
	* TEST_SECTIONS_FROM_ELEMENT_TYPE_AGNOSTIC
	* Regression test: SQL elements MUST resolve their sections from the
	* virtual tree (the v6 per-class dispatch silently returned [] for sql
	* and hid the diffusion tool button).
	*/
	public function test_sections_from_element_type_agnostic(): void {

		$config = diffusion_test_helper::require_diffusion_ontology($this);

		$sections = diffusion_utils::get_diffusion_sections_from_diffusion_element($config->element_tipo);
		$this->assertNotEmpty($sections, 'SQL element resolves no sections (v6 dispatch regression)');
		$this->assertContains($config->section_tipo, $sections);
	}//end test_sections_from_element_type_agnostic



	/**
	* TEST_HAVE_SECTION_DIFFUSION
	*/
	public function test_have_section_diffusion(): void {

		$config = diffusion_test_helper::require_diffusion_ontology($this);

		$this->assertTrue(
			diffusion_utils::have_section_diffusion($config->section_tipo),
			"Section {$config->section_tipo} is diffusion-targeted but have_section_diffusion is false (tool button would be hidden)"
		);

		// the activity log section is never a diffusion target
		$this->assertFalse(
			diffusion_utils::have_section_diffusion('dd1758'),
			'dd1758 must not report diffusion'
		);
	}//end test_have_section_diffusion



	/**
	* TEST_SECTION_DIFFUSION_MAP_PARITY
	* The persistent map must answer have_section_diffusion identically to the
	* legacy per-section walk (get_section_diffusion_nodes + parents element test)
	* for every section_tipo.
	*/
	public function test_section_diffusion_map_parity(): void {

		$config = diffusion_test_helper::require_diffusion_ontology($this);

		// legacy oracle (the old have_section_diffusion body, still callable)
		$oracle = function(string $section_tipo) : bool {
			$nodes = diffusion_utils::get_section_diffusion_nodes($section_tipo);
			foreach ($nodes as $node) {
				foreach ($node->parents ?? [] as $path_item) {
					if ($path_item->model==='diffusion_element' || $path_item->model==='diffusion_element_alias') {
						return true;
					}
				}
			}
			return false;
		};

		$map = diffusion_utils::get_section_diffusion_map();
		$this->assertIsArray($map);
		$this->assertArrayHasKey($config->section_tipo, $map, 'Diffusion section missing from map');

		// every mapped section + known negatives must match the oracle
		$samples = array_merge(
			array_keys($map),
			['dd1758', 'dd1324', 'dd996', $config->section_tipo]
		);
		$samples = array_values(array_unique($samples));

		foreach ($samples as $section_tipo) {
			$this->assertSame(
				$oracle($section_tipo),
				diffusion_utils::have_section_diffusion($section_tipo),
				"Map/oracle mismatch for section_tipo: $section_tipo"
			);
		}
	}//end test_section_diffusion_map_parity



	/**
	* TEST_SECTION_DIFFUSION_MAP_CACHE_PERSIST
	* The map is written to a persistent wrapper file, honored on the next read
	* (even when empty), and removed by delete_section_map_cache_file.
	*/
	public function test_section_diffusion_map_cache_persist(): void {

		diffusion_test_helper::require_diffusion_ontology($this);

		$base_path = DEDALO_CACHE_MANAGER['files_path'] ?? null;
		if (empty($base_path) || !is_dir($base_path)) {
			$this->markTestSkipped('Cache files path not available');
		}
		$file_path = $base_path . '/' . diffusion_utils::get_section_diffusion_map_cache_name();

		// build + persist
		diffusion_utils::delete_section_map_cache_file();
		$map = diffusion_utils::get_section_diffusion_map();
		$this->assertFileExists($file_path, 'Map cache file was not persisted');

		// payload is a wrapper, never a bare array
		$payload = include $file_path;
		$this->assertIsArray($payload);
		$this->assertSame(DEDALO_DIFFUSION_DOMAIN, $payload['domain'] ?? null, 'Map payload missing domain wrapper');
		$this->assertArrayHasKey('map', $payload);
		$this->assertSame($map, $payload['map']);

		// read again (request static reset) must be honored from file, no rebuild diff
		diffusion_utils::reset_cache();
		$map_2 = diffusion_utils::get_section_diffusion_map();
		$this->assertSame($map, $map_2, 'Map differs when served from the persistent file');

		// invalidation removes the file
		diffusion_utils::delete_section_map_cache_file();
		$this->assertFileDoesNotExist($file_path, 'delete_section_map_cache_file did not remove the cache file');
	}//end test_section_diffusion_map_cache_persist



	/**
	* TEST_GET_DDO_MAP
	*/
	public function test_get_ddo_map(): void {

		$config = diffusion_test_helper::require_diffusion_ontology($this);

		$node	= diffusion_utils::get_section_node_for_element($config->element_tipo, $config->section_tipo);
		$fields	= $node->children ?? [];
		if (empty($fields)) {
			$this->markTestSkipped('Section node has no field children to build a ddo_map from');
		}

		$ddo_map = diffusion_utils::get_ddo_map($fields[0]->tipo, $config->section_tipo);

		$this->assertIsArray($ddo_map);
		foreach ($ddo_map as $ddo) {
			$this->assertInstanceOf(dd_object::class, $ddo);
			$this->assertNotSame('self', $ddo->section_tipo ?? null, "'self' was not resolved in ddo_map");
			$this->assertNotSame('self', $ddo->parent ?? null, "'self' was not resolved in ddo_map");
		}
	}//end test_get_ddo_map



	/**
	* TEST_RESET_CACHE
	* Cache rebuild is safe: resolutions are identical before/after reset.
	*/
	public function test_reset_cache(): void {

		diffusion_test_helper::require_diffusion_ontology($this);

		$tree_1 = diffusion_utils::get_virtual_diffusion_tree();
		diffusion_utils::reset_cache();
		$tree_2 = diffusion_utils::get_virtual_diffusion_tree();

		$this->assertSame(
			json_encode($tree_1),
			json_encode($tree_2),
			'Virtual tree resolution is not stable across cache resets'
		);
	}//end test_reset_cache



}//end class diffusion_utils_Test
