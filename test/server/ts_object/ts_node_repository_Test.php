<?php declare(strict_types=1);
// bootstrap
require_once dirname(dirname(__FILE__)) . '/bootstrap.php';



/**
* TS_NODE_REPOSITORY_TEST
* Parity tests: the batched raw-row reads of ts_node_repository MUST resolve
* exactly the same values as the legacy per-node component loads they replace.
* Samples real thesaurus rows from the installation (read-only).
*/
final class ts_node_repository_test extends BaseTestCase {



	/**
	* SETUP
	* ts_node_repository is required by class.ts_object.php (same directory,
	* outside the one-class-per-dir autoload convention): force the load.
	* @return void
	*/
	protected function setUp(): void {
		parent::setUp();
		class_exists('ts_object');
	}//end setUp



	/**
	* SAMPLE_LOCATORS
	* Picks up to $limit real node locators of a thesaurus section that has
	* rows in this installation. Returns [] when no thesaurus data exists.
	* @param int $limit
	* @return array
	*/
	private function sample_locators( int $limit=25 ) : array {

		$conn = DBi::_getConnection();

		// pick the thesaurus section with most rows (skip pure test fixtures)
		$result = pg_query($conn, "
			SELECT section_tipo, count(*) AS n
			FROM matrix_hierarchy
			GROUP BY section_tipo
			ORDER BY n DESC
			LIMIT 1
		");
		$row = $result ? pg_fetch_assoc($result) : null;
		if (empty($row)) {
			return [];
		}
		$section_tipo = $row['section_tipo'];

		$result = pg_query_params($conn, '
			SELECT section_id
			FROM matrix_hierarchy
			WHERE section_tipo = $1
			ORDER BY section_id ASC
			LIMIT '.(int)$limit.'
		', [$section_tipo]);

		$locators = [];
		while ($r = pg_fetch_assoc($result)) {
			$locators[] = (object)[
				'section_tipo'	=> $section_tipo,
				'section_id'	=> (int)$r['section_id']
			];
		}

		return $locators;
	}//end sample_locators



	/**
	* TEST_FETCH_NODE_INFO_PARITY
	* order + is_indexable from the batched query must equal the legacy
	* component based resolution for every sampled node.
	*
	* This exercises the parent-less call (no $parent_locator), whose order contract
	* is the first order item — identical to the legacy $data[0]->value read. The
	* parent-aware order resolution (one value per parent, by id_key) is covered
	* separately by ts_node_repository_order_Test.
	* @return void
	*/
	public function test_fetch_node_info_parity() : void {

		$locators = $this->sample_locators();
		if (empty($locators)) {
			$this->markTestSkipped('No thesaurus rows available in this installation');
		}

		$info = ts_node_repository::fetch_node_info($locators);
		$this->assertNotNull(
			$info,
			'expected batched fetch_node_info to resolve'
		);

		$section_tipo	= $locators[0]->section_tipo;
		$order_tipo		= ts_object::get_component_order_tipo($section_tipo);
		$order_model	= !empty($order_tipo) ? ontology_node::get_model_by_tipo($order_tipo) : null;

		foreach ($locators as $locator) {

			$key = $locator->section_tipo . '_' . $locator->section_id;
			$this->assertArrayHasKey($key, $info, "expected info for node $key");

			// legacy order resolution (per-node component load)
			$legacy_order = null;
			if (!empty($order_model) && !empty($order_tipo)) {
				$component = component_common::get_instance(
					$order_model,
					$order_tipo,
					$locator->section_id,
					'list',
					DEDALO_DATA_NOLAN,
					$locator->section_tipo
				);
				$data = $component->get_data() ?? [];
				$legacy_order = $data[0]->value ?? null;
			}

			$this->assertEquals(
				$legacy_order,
				$info[$key]->order,
				"order parity failed for node $key : legacy=" . to_string($legacy_order)
					. ' batched=' . to_string($info[$key]->order)
			);
			// strict type parity: JSON output must not change (int vs string)
			$this->assertSame(
				gettype($legacy_order),
				gettype($info[$key]->order),
				"order TYPE parity failed for node $key"
			);

			// legacy is_indexable resolution
			$legacy_is_indexable = ts_object::is_indexable($locator->section_tipo, $locator->section_id);

			$this->assertSame(
				$legacy_is_indexable,
				$info[$key]->is_indexable,
				"is_indexable parity failed for node $key"
			);
		}
	}//end test_fetch_node_info_parity



	/**
	* TEST_BATCH_DESCRIPTOR_FLAGS_PARITY
	* Flag values from the batched query must equal the legacy per-node
	* is_descriptor component reads.
	* @return void
	*/
	public function test_batch_descriptor_flags_parity() : void {

		$locators = $this->sample_locators();
		if (empty($locators)) {
			$this->markTestSkipped('No thesaurus rows available in this installation');
		}

		$flags = ts_node_repository::batch_descriptor_flags($locators);
		$this->assertNotNull(
			$flags,
			'expected batched descriptor flags to resolve'
		);

		$section_tipo		= $locators[0]->section_tipo;
		$section_map		= section::get_section_map($section_tipo);
		$is_descriptor_tipo	= $section_map->thesaurus->is_descriptor ?? null;
		if (empty($is_descriptor_tipo)) {
			$this->markTestSkipped('No is_descriptor component configured for ' . $section_tipo);
		}
		$model_name = ontology_node::get_model_by_tipo($is_descriptor_tipo, true);

		foreach ($locators as $locator) {

			$key = $locator->section_tipo . '_' . $locator->section_id;

			// legacy resolution (per-node component load)
			$component = component_common::get_instance(
				$model_name,
				$is_descriptor_tipo,
				$locator->section_id,
				'list',
				DEDALO_DATA_NOLAN,
				$locator->section_tipo
			);
			$data = $component->get_data();
			$legacy_flag = (isset($data[0]) && isset($data[0]->section_id))
				? (int)$data[0]->section_id
				: null;

			$this->assertSame(
				$legacy_flag,
				$flags[$key] ?? null,
				"descriptor flag parity failed for node $key"
			);
		}
	}//end test_batch_descriptor_flags_parity



	/**
	* TEST_HAS_CHILDREN_OF_TYPE_PARITY
	* The batched has_children_of_type answer must equal the legacy loop
	* answer for real children sets.
	* @return void
	*/
	public function test_has_children_of_type_parity() : void {

		$locators = $this->sample_locators(10);
		if (empty($locators)) {
			$this->markTestSkipped('No thesaurus rows available in this installation');
		}

		$checked = 0;
		foreach ($locators as $locator) {

			// children of this node (legacy computed list)
			$children = component_relation_children::get_children(
				$locator->section_id,
				$locator->section_tipo
			);
			if (empty($children)) {
				continue;
			}

			$ts_object = new ts_object($locator->section_id, $locator->section_tipo);

			foreach (['descriptor', 'nd'] as $type) {

				$batched_result = $ts_object->has_children_of_type($children, $type);

				// legacy expectation computed manually (per-child component loads)
				$descriptor_value = ($type==='descriptor') ? 1 : 2;
				$legacy_result = false;
				foreach ($children as $child) {
					$child_map = section::get_section_map($child->section_tipo);
					$flag_tipo = $child_map->thesaurus->is_descriptor ?? null;
					if (empty($flag_tipo)) {
						continue;
					}
					$component = component_common::get_instance(
						ontology_node::get_model_by_tipo($flag_tipo, true),
						$flag_tipo,
						$child->section_id,
						'list',
						DEDALO_DATA_NOLAN,
						$child->section_tipo
					);
					$data = $component->get_data();
					if (isset($data[0]) && isset($data[0]->section_id) && (int)$data[0]->section_id == $descriptor_value) {
						$legacy_result = true;
						break;
					}
				}

				$this->assertSame(
					$legacy_result,
					$batched_result,
					"has_children_of_type('$type') parity failed for node "
						. $locator->section_tipo . '_' . $locator->section_id
				);
				$checked++;
			}
		}

		if ($checked===0) {
			$this->markTestSkipped('No nodes with children available for parity check');
		}
	}//end test_has_children_of_type_parity



}//end class ts_node_repository_test
