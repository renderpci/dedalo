<?php declare(strict_types=1);
require_once dirname(dirname(__FILE__)) . '/bootstrap.php';

/**
* WIRE_CONTRACT_TEST (PHP side)
* Pins the frozen JSON contract between dd_diffusion_api and the Bun
* diffusion engine.
*
* The golden fixture (diffusion/api/v1/test/fixtures/contract/
* php_response.golden.json) is ALSO asserted by the Bun suite
* (test/contract.test.ts): the Bun processor must transform it into the
* golden processed output. This test asserts that the PHP containers
* (diffusion_datum + diffusion_data_object), assembled exactly as
* dd_diffusion_api::process_datum assembles them, serialize to exactly
* the golden datum_group JSON.
*
* If either test breaks after a change, the wire contract moved: update
* BOTH sides and both golden files deliberately, never silently.
*/
final class wire_contract_Test extends BaseTestCase {

	public static $model = 'diffusion_datum';

	/**
	* GOLDEN_FIXTURE_PATH
	*/
	private function golden_fixture_path() : string {

		return DEDALO_DIFFUSION_PATH . '/api/v1/test/fixtures/contract/php_response.golden.json';
	}//end golden_fixture_path



	/**
	* BUILD_ENTRY
	* Mirrors the entry building of dd_diffusion_api::process_datum:
	* value first, then every extra property beyond the grouping keys
	* (which includes diffusion_data_object's declared public $errors).
	*/
	private function build_entry( diffusion_data_object $item ) : object {

		$entry = (object)['value' => $item->value ?? null];
		$skip_keys = ['tipo','lang','id','value','section_id','section_tipo'];
		foreach (get_object_vars($item) as $k => $v) {
			if (!in_array($k, $skip_keys)) {
				$entry->{$k} = $v;
			}
		}

		return $entry;
	}//end build_entry



	/**
	* BUILD_FIELD_GROUP
	* Mirrors the field_group building of dd_diffusion_api::process_datum.
	*/
	private function build_field_group( diffusion_data_object $item, array $entries ) : object {

		$field_group = (object)[
			'tipo'		=> $item->tipo ?? null,
			'lang'		=> $item->lang ?? null,
			'entries'	=> $entries,
			'id'		=> $item->id ?? null
		];

		return $field_group;
	}//end build_field_group



	/**
	* TEST_DATUM_GROUP_SERIALIZATION
	* Builds the canonical datum_group with the production containers and
	* asserts it serializes byte-identical to the golden fixture datum.
	*/
	public function test_datum_group_serialization() : void {

		$fixture_path = $this->golden_fixture_path();
		$this->assertFileExists($fixture_path, 'Golden contract fixture is missing');

		$golden = json_decode(file_get_contents($fixture_path));
		$this->assertIsObject($golden);

		// 1. Inner value items (as components / diffusion_fn produce them)
			$code_item = new diffusion_data_object((object)[
				'tipo'	=> 'test60',
				'lang'	=> null,
				'value'	=> 'CODE-001',
				'id'	=> null
			]);

			$title_eng_item = new diffusion_data_object((object)[
				'tipo'	=> 'test61',
				'lang'	=> 'lg-eng',
				'value'	=> 'English title',
				'id'	=> 'a'
			]);

			$title_spa_item = new diffusion_data_object((object)[
				'tipo'	=> 'test61',
				'lang'	=> 'lg-spa',
				'value'	=> 'Título español',
				'id'	=> 'a'
			]);
			// dynamic extra property (e.g. set by component_relation_common add_parents)
			$title_spa_item->meta = (object)['note' => 'extra prop passthrough'];

		// 2. Field groups + record fields (as process_datum groups them)
			$fields = new stdClass();
			$fields->test10 = [
				$this->build_field_group($code_item, [$this->build_entry($code_item)])
			];
			$fields->test11 = [
				$this->build_field_group($title_eng_item, [$this->build_entry($title_eng_item)]),
				$this->build_field_group($title_spa_item, [$this->build_entry($title_spa_item)])
			];

		// 3. Records: one normal, one unpublishable (fields = 'delete')
			$record_1 = (object)[
				'section_id'	=> 1,
				'fields'		=> $fields
			];
			$record_2 = (object)[
				'section_id'	=> 2,
				'fields'		=> 'delete'
			];

		// 4. Context (as build_datum_context emits it: columns always present)
			$context = [
				(object)[
					'term'		=> 'code',
					'tipo'		=> 'test10',
					'model'		=> 'field_text',
					'parent'	=> 'test5',
					'parser'	=> new stdClass(),
					'columns'	=> []
				],
				(object)[
					'term'		=> 'title',
					'tipo'		=> 'test11',
					'model'		=> 'field_text',
					'parent'	=> 'test5',
					'parser'	=> new stdClass(),
					'columns'	=> []
				]
			];

		// 5. The datum group (canonical container, canonical setter order)
			$datum_object = new diffusion_datum();
				$datum_object->set_diffusion_tipo('test5');
				$datum_object->set_section_tipo('test3');
				$datum_object->set_term('interview');
				$datum_object->set_model('table');
				$datum_object->set_parent('test1');
				$datum_object->set_context($context);
				$datum_object->set_data([$record_1, $record_2]);

		// 6. Byte-identical serialization against the golden datum
			$flags = JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES;
			$built_json		= json_encode($datum_object, $flags);
			$golden_json	= json_encode($golden->datum[0], $flags);

			$this->assertSame(
				$golden_json,
				$built_json,
				'PHP containers no longer serialize to the golden wire contract. '
				. 'If this change is intentional, update BOTH golden fixtures and the Bun contract test.'
			);
	}//end test_datum_group_serialization



	/**
	* TEST_DATUM_KEY_ORDER
	* The declared property order of diffusion_datum IS the wire key order.
	*/
	public function test_datum_key_order() : void {

		$datum_object = new diffusion_datum();
			$datum_object->set_diffusion_tipo('a');
			$datum_object->set_section_tipo('b');
			$datum_object->set_term('c');
			$datum_object->set_model('d');
			$datum_object->set_parent('e');
			$datum_object->set_context([]);
			$datum_object->set_data([]);

		$keys = array_keys((array)json_decode(json_encode($datum_object)));

		$this->assertSame(
			['diffusion_tipo','section_tipo','term','model','parent','context','data'],
			$keys,
			'diffusion_datum property declaration order changed: this is the wire key order'
		);
	}//end test_datum_key_order



	/**
	* TEST_ENTRY_ERRORS_KEY_IS_LOAD_BEARING
	* diffusion_data_object->errors serializes into every wire entry.
	*/
	public function test_entry_errors_key_is_load_bearing() : void {

		$item = new diffusion_data_object((object)[
			'tipo'	=> 'test60',
			'lang'	=> null,
			'value'	=> 'x',
			'id'	=> null
		]);

		$entry = $this->build_entry($item);

		$this->assertObjectHasProperty('errors', $entry);
		$this->assertSame([], $entry->errors);
	}//end test_entry_errors_key_is_load_bearing



}//end class wire_contract_Test
