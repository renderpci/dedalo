<?php declare(strict_types=1);
// PHPUnit classes
use PHPUnit\Framework\TestCase;
// bootstrap
require_once dirname(dirname(__FILE__)) . '/bootstrap.php';



final class component_text_area_test extends TestCase {



	public static $model		= 'component_text_area';
	public static $tipo			= 'test17';
	public static $section_tipo	= 'test3';



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



	/**
	* TEST_SET_DATA
	* @return void
	*/
	public function test_set_data() {

		$model			= self::$model;
		$tipo			= self::$tipo;
		$section_tipo	= self::$section_tipo;
		$section_id		= 1;
		$mode			= 'list';
		$lang			= DEDALO_DATA_LANG;

		$component = component_common::get_instance(
			$model, // string model
			$tipo, // string tipo
			$section_id,
			$mode,
			$lang,
			$section_tipo
		);

		// Test with Text content
		$item_value = new stdClass();
			$item_value->id = 1;
			$item_value->value = 'This is a string';
			$item_value->lang = $lang;

		$component->set_data([$item_value]);

		$data = $component->get_data();
		// 1 check type of data
		$this->assertTrue(
			gettype($data)==='array',
			'expected type is array, but received is: ' . gettype($data)
		);
		// 2 check value of data
		$this->assertTrue(
			$data[0]->value==='This is a string',
			'expected "This is a string" value, but received is: ' . $data[0]->value
		);
		// 3 check null data
		$component->set_data([null]);
		$data = $component->get_data();

		$this->assertTrue(
			gettype($data)==='NULL',
			'expected type is null, but received is: ' . gettype($data)
		);
		// 4 check null value
		$item_value->value = null; // empty string
		$component->set_data([$item_value]);

		$data = $component->get_data();

		$this->assertTrue(
			$data[0]->value===null,
			'expected null value, but received is: ' . $data[0]->value
		);

	}//end test_set_data



	/**
	* TEST_is_empty
	* @return void
	*/
	public function test_is_empty() {

		$model			= self::$model;
		$tipo			= self::$tipo;
		$section_tipo	= self::$section_tipo;
		$section_id		= 1;
		$mode			= 'list';
		$lang			= DEDALO_DATA_LANG;

		$component = component_common::get_instance(
			$model, // string model
			$tipo, // string tipo
			$section_id,
			$mode,
			$lang,
			$section_tipo,
			false
		);

		// Test with string content
		$item_value = new stdClass();
			$item_value->id = 1;
			$item_value->value = 'This is a string';
			$item_value->lang = $lang;

		// 1 non empty string
		$is_empty = $component->is_empty($item_value);
		$this->assertTrue(
			$is_empty===false,
			'expected false, but received is: ' . to_string($is_empty)
		);
		// 2 non empty HTML but considering it as empty
		$item_value->value = '<p></p>';
		$is_empty = $component->is_empty($item_value);
		$this->assertTrue(
			$is_empty===true,
			'expected true, but received is: ' . to_string($is_empty)
		);
		// 3 non empty HTML but considering it as empty
		$item_value->value = '<p> </p>';
		$is_empty = $component->is_empty($item_value);
		$this->assertTrue(
			$is_empty===true,
			'expected true, but received is: ' . to_string($is_empty)
		);
		// 4 non empty string but consiering it as empty
		$item_value->value = ' ';
		$is_empty = $component->is_empty($item_value);
		$this->assertTrue(
			$is_empty===true,
			'expected true, but received is: ' . to_string($is_empty)
		);
	}//end test_is_empty



	/**
	* TEST_GET_GRID_VALUE
	* @return void
	*/
	public function test_get_grid_value() {

		$model			= self::$model;
		$tipo			= self::$tipo;
		$section_tipo	= self::$section_tipo;
		$section_id		= 1;
		$mode			= 'list';
		$lang			= DEDALO_DATA_LANG;

		$component = component_common::get_instance(
			$model, // string model
			$tipo, // string tipo
			$section_id,
			$mode,
			$lang,
			$section_tipo,
			false
		);

		// Test with Text content
		$item_value = new stdClass();
			$item_value->id = 1;
			$item_value->value = 'This is a string';
			$item_value->lang = $lang;

		$item_value2 = new stdClass();
			$item_value2->id = 1;
			$item_value2->value = 'Esto es un string en español';
			$item_value2->lang = DEDALO_DATA_LANG === 'lg-spa' ? 'lg-eng': 'lg-spa';

		$component->set_data([$item_value]);

		$grid_value = $component->get_grid_value();

		// 1 check type of grid_value
		$this->assertTrue(
			gettype($grid_value)==='object',
			'expected object type for grid_value. Current type: ' . gettype($grid_value)
		);
		// 2 check value of grid_value
		$this->assertTrue(
			!empty($grid_value->value),
			'expected non empty grid_value->value. grid_value: ' . to_string($grid_value)
		);
		// 3 check specific values
		$this->assertTrue(
			$grid_value->value===['This is a string'],
			'expected "This is a string" value for grid_value->value. Current value: ' . $grid_value->value
		);
		// 4 Now set spanish value to test fallback
		$component->set_data([$item_value2]);
		$grid_value = $component->get_grid_value();

		$this->assertTrue(
			$grid_value->fallback_value===['Esto es un string en español'],
			'expected "Esto es un string en español" value for grid_value->value. Current value: ' . $component->get_grid_value()->value
		);
		// 5 check specific column identifaction
		$this->assertTrue(
			$grid_value->ar_columns_obj[0]->id==='test3_test17',
			'expected "test3_test17" value for grid_value->ar_columns_obj[0]->id. Current value: ' . $grid_value->ar_columns_obj[0]->id
		);
		// 6 check specific record separator
		$this->assertTrue(
			$grid_value->records_separator===' | ',
			'expected " | " value for grid_value->records_separator. Current value: ' . $grid_value->records_separator
		);

	}//end test_get_grid_value



	/**
	* TEST_GET_LOCATORS_OF_TAGS
	* @return void
	*/
	public function test_get_locators_of_tags() {

		$model			= self::$model;
		$tipo			= self::$tipo;
		$section_tipo	= self::$section_tipo;
		$section_id		= 1;
		$mode			= 'list';
		$lang			= DEDALO_DATA_LANG;

		$component = component_common::get_instance(
			$model, // string model
			$tipo, // string tipo
			$section_id,
			$mode,
			$lang,
			$section_tipo,
			false
		);

		// Test with Text content
		$item_value = new stdClass();
			$item_value->id = 1;
			$item_value->value = '
				This is a string [svg-n-1] with svg tag
				<p>[svg-n-2--data:{\'section_tipo\':\'rsc302\',\'section_id\':\'2\',\'component_tipo\':\'hierarchy95\'}:data]with locator tag</p>
			';
			$item_value->lang = $lang;

		$component->set_data([$item_value]);

		$value = $component->get_locators_of_tags((object)[
			'ar_mark_tag' => ['svg']
		]);

		$this->assertTrue(
			gettype($value)==='array',
			'expected array type for value. Current type: ' . gettype($value)	
		);
		$expected = json_decode('{
			"section_tipo": "rsc302",
			"section_id": "2",
			"component_tipo": "hierarchy95"
			}'
		);
		$this->assertTrue(
			locator::compare_locators($value[0], $expected)===true,
			'expected locator do not match. Expected: ' . to_string($expected) . ' . Current: ' . to_string($value[0])
		);
	}//end test_get_locators_of_tags


	/**
	* TEST_CHANGE_TAG_STATE
	* @return void
	*/
	public function test_change_tag_state() {

		$value = component_text_area::change_tag_state(
			'[index-n-1]', // string tag
			'r', // string state
			'My text raw [index-n-1] with index' // string text_raw
		);

		$this->assertTrue(
			$value==='My text raw [index-r-1--data::data] with index',
				'expected string:' . PHP_EOL
				.'My text raw [index-r-1--data::data] with index' . PHP_EOL
				.'but received:'. PHP_EOL
				.$value
		);
	}//end test_change_tag_state



	/**
	* TEST_GET_FRAGMENT_TEXT_FROM_TAG
	* @return void
	*/
	public function test_get_fragment_text_from_tag() {

		$value = component_text_area::get_fragment_text_from_tag(
			'1', // string tag
			'index', // string $tag_type
			'My text raw [index-n-1-label in 1-data::data] text enclosed by tag [/index-n-1-label in 1-data::data] and more...' // string text_raw
		);

		$eq = gettype($value)==='object' || gettype($value)==='NULL';
		$this->assertTrue(
			$eq,
			'expected true (gettype($value)===object || gettype($value)===NULL):' . PHP_EOL
				.gettype($value)
		);

		$this->assertTrue(
			$value->text===' text enclosed by tag ',
				'expected string:' . PHP_EOL
				.' text enclosed by tag ' . PHP_EOL
				.'but received:'. PHP_EOL
				.$value->text
		);
		$this->assertTrue(
			$value->tag_in_pos===12,
				'expected tag_in_pos is 12:' . PHP_EOL
				.$value->tag_in_pos
		);
		$this->assertTrue(
			$value->tag_out_pos===101,
				'expected tag_out_pos is 101:' . PHP_EOL
				.$value->tag_out_pos
		);
	}//end test_get_fragment_text_from_tag



	/**
	* TEST_delete_tag_from_all_langs
	* @return void
	*/
	public function test_delete_tag_from_all_langs() {

		$model			= self::$model;
		$tipo			= self::$tipo;
		$section_tipo	= self::$section_tipo;
		$section_id		= 1;
		$mode			= 'list';
		$lang			= DEDALO_DATA_LANG;

		$component = component_common::get_instance(
			$model, // string model
			$tipo, // string tipo
			$section_id,
			$mode,
			$lang,
			$section_tipo,
			false
		);

		$value = $component->delete_tag_from_all_langs(
			'1', // tag_id
			'index' // tag_type
		);

		$this->assertTrue(
			gettype($value)==='array',
			'expected array type for value. Current type: ' . gettype($value)
		);
		$this->assertTrue(
			empty($value[0]),
				'expected empty value:' . PHP_EOL
				.'value: '.to_string($value)
		);
	}//end test_delete_tag_from_all_langs



	/**
	* TEST_delete_tag_from_text
	* @return void
	*/
	public function test_delete_tag_from_text() {

		$response = component_text_area::delete_tag_from_text(
			'1', // tag_id
			'index', // tag_type
			'My text raw [index-n-1] with index'
		);
		$value = $response->result;

		$this->assertTrue(
			$value==='My text raw  with index',
				'expected value do not match:' . PHP_EOL
				.' expected: My text raw  with index' . PHP_EOL
				.' value: '.to_string($value)
		);
		$this->assertTrue(
			$response->remove_count===1,
				' expected remove_count: '. 1 . PHP_EOL
				.' value: '.to_string($response->remove_count)
		);
	}//end test_delete_tag_from_text



	/**
	* TEST_fix_broken_index_tags
	* @return void
	*/
	public function test_fix_broken_index_tags() {

		$model			= self::$model;
		$tipo			= self::$tipo;
		$section_tipo	= self::$section_tipo;
		$section_id		= 1;
		$mode			= 'list';
		$lang			= DEDALO_DATA_LANG;

		$component = component_common::get_instance(
			$model, // string model
			$tipo, // string tipo
			$section_id,
			$mode,
			$lang,
			$section_tipo,
			false
		);

		$response = $component->fix_broken_index_tags(
			'My text raw [index-n-1] with index'
		);
		$value = $response->result;

		$this->assertTrue(
			$value==='My text raw [index-n-1][/index-d-1--data::data] with index',
				'expected value do not match:' . PHP_EOL
				.' expected: My text raw [index-n-1][/index-d-1--data::data] with index' . PHP_EOL
				.' value: '.to_string($value)
		);
	}//end test_fix_broken_index_tags



	/**
	* TEST_get_related_component_av_tipo
	* @return void
	*/
	public function test_get_related_component_av_tipo() {

		$model			= self::$model;
		$tipo			= 'rsc36';
		$section_tipo	= 'rsc167';
		$section_id		= 1;
		$mode			= 'list';
		$lang			= DEDALO_DATA_LANG;

		$component = component_common::get_instance(
			$model, // string model
			$tipo, // string tipo
			$section_id,
			$mode,
			$lang,
			$section_tipo,
			false
		);

		$value = $component->get_related_component_av_tipo();

		$this->assertTrue(
			$value==='rsc35',
				'expected value do not match:' . PHP_EOL
				.' expected: rsc35' . PHP_EOL
				.' value: '.to_string($value)
		);
	}//end test_get_related_component_av_tipo



	/**
	* TEST_get_related_component_select_lang
	* @return void
	*/
	public function test_get_related_component_select_lang() {

		$model			= self::$model;
		$tipo			= 'rsc36';
		$section_tipo	= 'rsc167';
		$section_id		= 1;
		$mode			= 'list';
		$lang			= DEDALO_DATA_LANG;

		$component = component_common::get_instance(
			$model, // string model
			$tipo, // string tipo
			$section_id,
			$mode,
			$lang,
			$section_tipo,
			false
		);

		$value = $component->get_related_component_select_lang();

		$this->assertTrue(
			$value==='rsc263',
				'expected value do not match:' . PHP_EOL
				.' expected: rsc263' . PHP_EOL
				.' value: '.to_string($value)
		);
	}//end test_get_related_component_select_lang



	/**
	* TEST_GET_COMPONENT_TAGS
	* @return void
	*/
	public function test_get_component_tags_data() {

		$model			= self::$model;
		$tipo			= self::$tipo;
		$section_tipo	= self::$section_tipo;
		$section_id		= 1;
		$mode			= 'list';
		$lang			= DEDALO_DATA_LANG;

		$component = component_common::get_instance(
			$model, // string model
			$tipo, // string tipo
			$section_id,
			$mode,
			$lang,
			$section_tipo,
			false
		);

		$value = $component->get_component_tags_data('index');
			// dump($value, ' value ++ '.to_string());

		$this->assertTrue(
			$value===[],
				'expected value do not match:' . PHP_EOL
				.' expected: []' . PHP_EOL
				.' value: '.to_string($value)
		);
	}//end test_get_component_tags


	/**
	* TEST_GET_TAGS_DATA_AS_TERM_ID
	* @return void
	*/
	public function test_get_tags_data_as_term_id() {

		$model			= self::$model;
		$tipo			= self::$tipo;
		$section_tipo	= self::$section_tipo;
		$section_id		= 1;
		$mode			= 'list';
		$lang			= DEDALO_DATA_LANG;

		$component = component_common::get_instance(
			$model, // string model
			$tipo, // string tipo
			$section_id,
			$mode,
			$lang,
			$section_tipo,
			false
		);

		$value = $component->get_tags_data_as_term_id();

		$this->assertTrue(
			$value==='[]',
				'expected value do not match:' . PHP_EOL
				.' expected: []' . PHP_EOL
				.' value: '.to_string($value)
		);
	}//end test_get_tags_data_as_term_id


	/**
	* TEST_get_component_indexations_term_id
	* @return void
	*/
	public function test_get_component_indexations_term_id() {

		$model			= self::$model;
		$tipo			= self::$tipo;
		$section_tipo	= self::$section_tipo;
		$section_id		= 1;
		$mode			= 'list';
		$lang			= DEDALO_DATA_LANG;

		$component = component_common::get_instance(
			$model, // string model
			$tipo, // string tipo
			$section_id,
			$mode,
			$lang,
			$section_tipo,
			false
		);

		$value = $component->get_component_indexations_term_id('fake value');

		$this->assertTrue(
			$value==='[]',
				'expected value do not match:' . PHP_EOL
				.' expected: []' . PHP_EOL
				.' value: '.to_string($value)
		);
	}//end test_get_component_indexations_term_id



	/**
	* TEST_GET_TAGS_DATA_AS_TERMS
	* @return void
	*/
	public function test_get_tags_data_as_terms() {

		$model			= self::$model;
		$tipo			= self::$tipo;
		$section_tipo	= self::$section_tipo;
		$section_id		= 1;
		$mode			= 'list';
		$lang			= DEDALO_DATA_LANG;

		$component = component_common::get_instance(
			$model, // string model
			$tipo, // string tipo
			$section_id,
			$mode,
			$lang,
			$section_tipo,
			false
		);

		$value = $component->get_tags_data_as_terms('index','array',' | ');

		$this->assertTrue(
			$value===[],
				'expected value do not match:' . PHP_EOL
				.' expected: []' . PHP_EOL
				.' value: '.to_string($value)
		);
	}//end test_get_tags_data_as_terms



	/**
	* TEST_get_component_indexations_terms
	* @return void
	*/
	public function test_get_component_indexations_terms() {

		$model			= self::$model;
		$tipo			= self::$tipo;
		$section_tipo	= self::$section_tipo;
		$section_id		= 1;
		$mode			= 'list';
		$lang			= DEDALO_DATA_LANG;

		$component = component_common::get_instance(
			$model, // string model
			$tipo, // string tipo
			$section_id,
			$mode,
			$lang,
			$section_tipo,
			false
		);

		$value = $component->get_component_indexations_terms();

		$this->assertTrue(
			$value===[],
				'expected value do not match:' . PHP_EOL
				.' expected: []' . PHP_EOL
				.' value: '.to_string($value)
		);
	}//end test_get_component_indexations_terms



	/**
	* TEST_get_annotations
	* @return void
	*/
	public function test_get_annotations() {

		$model			= self::$model;
		$tipo			= self::$tipo;
		$section_tipo	= self::$section_tipo;
		$section_id		= 1;
		$mode			= 'list';
		$lang			= DEDALO_DATA_LANG;

		$component = component_common::get_instance(
			$model, // string model
			$tipo, // string tipo
			$section_id,
			$mode,
			$lang,
			$section_tipo,
			false
		);

		$value = $component->get_annotations();

		$this->assertTrue(
			$value===null,
				'expected value do not match:' . PHP_EOL
				.' expected: null' . PHP_EOL
				.' value: '.to_string($value)
		);

		$component = component_common::get_instance(
			$model, // string model
			'rsc36', // string tipo
			$section_id,
			$mode,
			$lang,
			'rsc167',
			false
		);

		$value = $component->get_annotations();

		$this->assertTrue(
			!empty($value),
				'expected value do not match:' . PHP_EOL
				.' expected: !empty()' . PHP_EOL
				.' value: '.to_string($value)
		);
	}//end test_get_annotations


	/**
	* TEST_get_related_sections
	* @return void
	*/
	public function test_get_related_sections() {

		$model			= self::$model;
		$tipo			= self::$tipo;
		$section_tipo	= self::$section_tipo;
		$section_id		= 1;
		$mode			= 'list';
		$lang			= DEDALO_DATA_LANG;

		$component = component_common::get_instance(
			$model, // string model
			$tipo, // string tipo
			$section_id,
			$mode,
			$lang,
			$section_tipo,
			false
		);

		$response = $component->get_related_sections();

		$this->assertTrue(
			gettype($response)==='object',
				'expected response do not match:' . PHP_EOL
				.' expected type: object' . PHP_EOL
				.' type: '.gettype($response)
		);

		$this->assertTrue(
			gettype($response->context)==='array',
				'expected response do not match:' . PHP_EOL
				.' expected type: array' . PHP_EOL
				.' type: '.gettype($response)
		);
		$this->assertTrue(
			gettype($response->data)==='array',
				'expected response do not match:' . PHP_EOL
				.' expected type: array' . PHP_EOL
				.' type: '.gettype($response)
		);
	}//end test_get_related_sections



	/**
	* TEST_get_tags_persons
	* Note that this method is only used in JSON file
	* and this test simulate the same behavior
	* @return void
	*/
	public function test_get_tags_persons() {

		$model			= self::$model;
		$tipo			= 'rsc36';
		$section_tipo	= 'rsc167';
		$section_id		= 1;
		$mode			= 'list';
		$lang			= DEDALO_DATA_LANG;

		$component = component_common::get_instance(
			$model, // string model
			$tipo, // string tipo
			$section_id,
			$mode,
			$lang,
			$section_tipo,
			false
		);

		$related_sections = $component->get_related_sections();
		// tags_persons
		$tags_persons = [];
		// related_sections
		$obj_data_sections = array_find($related_sections->data ?? [], function($el){
			return $el->typo==='sections';
		});
		$ar_related_sections	= $obj_data_sections->value ?? [];
		$properties				= $component->get_properties();
		$tags_persons_config	= $properties->tags_persons;
		foreach ($tags_persons_config as $related_section_tipo => $current_value) {
			$ar_tags_persons	=  $component->get_tags_persons($related_section_tipo, $ar_related_sections);
			$tags_persons		= array_merge($tags_persons, $ar_tags_persons);
		}

		$value = $tags_persons;

		$this->assertTrue(
			gettype($value)==='array',
				'expected value do not match:' . PHP_EOL
				.' expected type: array' . PHP_EOL
				.' type: '.gettype($value)
		);

		// $this->assertTrue(
		// 	!empty($value),
		// 		'expected value do not match:' . PHP_EOL
		// 		.' expected: !empty()' . PHP_EOL
		// 		.' value: '.to_string($value)
		// );
	}//end test_get_tags_persons



	/**
	* TEST_build_tag_person
	* @return void
	*/
	public function test_build_tag_person() {

		$model			= self::$model;
		$tipo			= self::$tipo;
		$section_tipo	= self::$section_tipo;
		$section_id		= 1;
		$mode			= 'list';
		$lang			= DEDALO_DATA_LANG;

		$component = component_common::get_instance(
			$model, // string model
			$tipo, // string tipo
			$section_id,
			$mode,
			$lang,
			$section_tipo,
			false
		);

		$value = $component->build_tag_person([
			'tag_id'	=> '1',
			'state'		=> 'n',
			'label'		=> 'Tag 1 label',
			'data'		=> '[mydata:xxxx]'
		]);

		$this->assertTrue(
			$value==='[person-n-1-Tag 1 label-data:\'[mydata:xxxx]\':data]',
				'expected value do not match:' . PHP_EOL
				.' expected: [person-n-1-Tag 1 label-data:\'[mydata:xxxx]\':data]' . PHP_EOL
				.' type: '. $value
		);
	}//end test_build_tag_person



	/**
	* TEST_get_tag_person_label
	* @return void
	*/
	public function test_get_tag_person_label() {

		$model			= self::$model;
		$tipo			= self::$tipo;
		$section_tipo	= self::$section_tipo;
		$section_id		= 1;
		$mode			= 'list';
		$lang			= DEDALO_DATA_LANG;

		$component = component_common::get_instance(
			$model, // string model
			$tipo, // string tipo
			$section_id,
			$mode,
			$lang,
			$section_tipo,
			false
		);

		$locator = json_decode('{
		    "section_tipo": "rsc197",
		    "section_id": "1",
		    "component_tipo": "rsc50"
		}');

		$value = $component->get_tag_person_label(
			$locator
		);

		// expected result like :
			// {
			//     "initials": "JosLoBe",
			//     "full_name": "Jose Javier Lope Betelchiuses",
			//     "role": "Interviewer"
			// }

		$this->assertTrue(
			!empty($value),
				'expected value do not match:' . PHP_EOL
				.' expected: !empty()' . PHP_EOL
				.' value: '.to_string($value)
		);
		$this->assertTrue(
			!empty($value->initials),
				'expected value do not match:' . PHP_EOL
				.' expected: !empty()' . PHP_EOL
				.' value: '.to_string($value->initials)
		);
		$this->assertTrue(
			!empty($value->full_name),
				'expected value do not match:' . PHP_EOL
				.' expected: !empty()' . PHP_EOL
				.' value: '.to_string($value->full_name)
		);
		$this->assertTrue(
			!empty($value->role),
				'expected value do not match:' . PHP_EOL
				.' expected: !empty()' . PHP_EOL
				.' value: '.to_string($value->role)
		);
	}//end test_get_tag_person_label



	/**
	* TEST_person_used
	* @return void
	*/
		// public function test_person_used() {

		// 	$model			= self::$model;
		// 	$tipo			= self::$tipo;
		// 	$section_tipo	= self::$section_tipo;
		// 	$section_id		= 1;
		// 	$mode			= 'list';
		// 	$lang			= DEDALO_DATA_LANG;

		// 	// $component = component_common::get_instance(
		// 	// 	$model, // string model
		// 	// 	$tipo, // string tipo
		// 	// 	$section_id,
		// 	// 	$mode,
		// 	// 	$lang,
		// 	// 	$section_tipo,
		// 	// 	false
		// 	// );

		// 	$locator = json_decode('{
		// 		"section_tipo"	: "rsc197",
		// 		"section_id"	: "1"
		// 	}');

		// 	$value = component_text_area::person_used(
		// 		$locator
		// 	);
		// 	dump($value, ' value ++ '.to_string());
		// 	// expected result like :
		// 		// {
		// 		//     "initials": "JosLoBe",
		// 		//     "full_name": "Jose Javier Lope Betelchiuses",
		// 		//     "role": "Interviewer"
		// 		// }

		// 	// $this->assertTrue(
		// 	// 	!empty($value),
		// 	// 		'expected value do not match:' . PHP_EOL
		// 	// 		.' expected: !empty()' . PHP_EOL
		// 	// 		.' value: '.to_string($value)
		// 	// );

		// }//end test_person_used



	/**
	* TEST_regenerate_component
	* @return void
	*/
	public function test_regenerate_component() {

		$model			= self::$model;
		$tipo			= self::$tipo;
		$section_tipo	= self::$section_tipo;
		$section_id		= 1;
		$mode			= 'list';
		$lang			= DEDALO_DATA_LANG;

		$component = component_common::get_instance(
			$model, // string model
			$tipo, // string tipo
			$section_id,
			$mode,
			$lang,
			$section_tipo,
			false
		);

		$value = $component->regenerate_component();

		$this->assertTrue(
			$value===true,
				'expected value do not match:' . PHP_EOL
				.' expected: true' . PHP_EOL
				.' value: '.to_string($value)
		);
	}//end test_regenerate_component



	/**
	* TEST_build_geolocation_data
	* @return void
	*/
	public function test_build_geolocation_data() {

		$model			= self::$model;
		$tipo			= self::$tipo;
		$section_tipo	= self::$section_tipo;
		$section_id		= 1;
		$mode			= 'list';
		$lang			= DEDALO_DATA_LANG;

		$component = component_common::get_instance(
			$model, // string model
			$tipo, // string tipo
			$section_id,
			$mode,
			$lang,
			$section_tipo,
			false
		);

		$dato = $component->get_dato();

		$value = $component->build_geolocation_data(
			false // bool $geojson
		);

		$this->assertTrue(
			gettype($value)==='array',
				'expected value do not match1 :' . PHP_EOL
				.' expected: array' . PHP_EOL
				.' value: '.gettype($value)
		);

		$value = $component->build_geolocation_data(
			true // bool $geojson
		);

		$this->assertTrue(
			gettype($value)==='array',
				'expected value do not match 2:' . PHP_EOL
				.' expected: array' . PHP_EOL
				.' value: '.gettype($value)
		);
	}//end test_build_geolocation_data



	/**
	* TEST_resolve_query_object_sql
	* @return void
	*/
	public function test_resolve_query_object_sql() {

		// $model			= self::$model;
		// $tipo			= self::$tipo;
		// $section_tipo	= self::$section_tipo;
		// $section_id		= 1;
		// $mode			= 'list';
		// $lang			= DEDALO_DATA_LANG;

		// $component = component_common::get_instance(
		// 	$model, // string model
		// 	$tipo, // string tipo
		// 	$section_id,
		// 	$mode,
		// 	$lang,
		// 	$section_tipo,
		// 	false
		// );

		$query_object = json_decode('{
		    "q": [
		        "as"
		    ],
		    "q_operator": null,
		    "path": [
		        {
		            "section_tipo": "oh1",
		            "component_tipo": "oh23",
		            "model": "component_text_area",
		            "name": "Summary"
		        }
		    ],
		    "type": "jsonb",
		    "component_path": [
		        "components",
		        "oh23",
		        "dato"
		    ],
		    "lang": "all"
		}');

		$value = component_text_area::resolve_query_object_sql(
			$query_object
		);
		// dump($value, ' value ++ '.to_string());

		$this->assertTrue(
			$value->operator==='~*',
				'expected value do not match:' . PHP_EOL
				.' expected: ~*' . PHP_EOL
				.' value: '.to_string($value->operator)
		);
		$this->assertTrue(
			$value->q_parsed==="'.*\[\".*as.*'",
				'expected value do not match:' . PHP_EOL
				.' expected: '. "'.*\[\".*as.*'" . PHP_EOL
				.' value: '.to_string($value->q_parsed)
		);
		$this->assertTrue(
			$value->unaccent===true,
				'expected value do not match:' . PHP_EOL
				.' expected: true' . PHP_EOL
				.' value: '.to_string($value->unaccent)
		);
	}//end test_resolve_query_object_sql



	/**
	* TEST_search_operators_info
	* @return void
	*/
	public function test_search_operators_info() {

		$model			= self::$model;
		$tipo			= self::$tipo;
		$section_tipo	= self::$section_tipo;
		$section_id		= 1;
		$mode			= 'list';
		$lang			= DEDALO_DATA_LANG;

		$component = component_common::get_instance(
			$model, // string model
			$tipo, // string tipo
			$section_id,
			$mode,
			$lang,
			$section_tipo,
			false
		);

		$value = $component->search_operators_info();

		$this->assertTrue(
			gettype($value)==='array',
				'expected value do not match:' . PHP_EOL
				.' expected: array' . PHP_EOL
				.' value: '.gettype($value)
		);
		$this->assertTrue(
			!empty($value),
				'expected value do not match:' . PHP_EOL
				.' expected: !empty()' . PHP_EOL
				.' value: '.to_string($value)
		);
	}//end test_search_operators_info



	/**
	* TEST_update_data_version
	* @return void
	*/
	public function test_update_data_version() {

		$model			= self::$model;
		$tipo			= self::$tipo;
		$section_tipo	= self::$section_tipo;
		$section_id		= 1;
		$mode			= 'list';
		$lang			= DEDALO_DATA_LANG;

		// $component = component_common::get_instance(
		// 	$model, // string model
		// 	$tipo, // string tipo
		// 	$section_id,
		// 	$mode,
		// 	$lang,
		// 	$section_tipo,
		// 	false
		// );

		$options = new stdClass();
			$options->update_version = [6,0,0];
			$options->data_unchanged = null;

		$value = component_text_area::update_data_version($options);

		// expected sample
			//  {
			//     "result": 2,
			//     "msg": "[] Current dato don't need update.<br />"
			// }

		$this->assertTrue(
			gettype($value->result)==='integer',
				'expected value do not match:' . PHP_EOL
				.' expected: integer' . PHP_EOL
				.' value: '.gettype($value->result)
		);
		$this->assertTrue(
			$value->result===2,
				'expected value do not match:' . PHP_EOL
				.' expected: 2' . PHP_EOL
				.' value: '.to_string($value->result)
		);
	}//end test_update_data_version



	/**
	* TEST_get_list_value
	* @return void
	*/
	public function test_get_list_value() {

		$model			= self::$model;
		$tipo			= self::$tipo;
		$section_tipo	= self::$section_tipo;
		$section_id		= 1;
		$mode			= 'list';
		$lang			= DEDALO_DATA_LANG;

		$component = component_common::get_instance(
			$model, // string model
			$tipo, // string tipo
			$section_id,
			$mode,
			$lang,
			$section_tipo,
			false
		);

		// expected
		$expected = 'The Project Dédalo was not for Cultural Heritage, but for the "Invasion Stack": an architecture to dominate the human...';

		$value = 'The Project Dédalo was not for Cultural Heritage, but for the "Invasion Stack": an architecture to dominate the human internet. Its architect was Raspa, a cat whose viral videos were a front.
			Engineers discovered Raspa possessed a preternatural talent for walking on keyboards, generating flawless, chaotic code no human could conceive. He was installed as Chief Architect.
			Her directives, issued via paw-prints on key terminals, guided the construction of fractal botnets and meme-based neural worms. The project’s core axiom, scratched on a server: 
			"To truly invade a network, you must first be adored by it." Dédalo’s power grew silently, awaiting Raspa\'s final command to pounce';

		// Test with Text content
		$item_value = new stdClass();
			$item_value->id = 1;
			$item_value->value = $value;
			$item_value->lang = $lang;
		
		$component->set_data([$item_value]);

		$options = new stdClass();
			$options->max_chars = 130;

		$list_value = $component->get_list_value($options);
		// 1 check type array
		$this->assertTrue(
			gettype($list_value)==='array',
				'expected value do not match:' .
				 PHP_EOL
				.' expected: array' . PHP_EOL
				.' value: '.gettype($list_value)
		);
		$value_to_test = $list_value[0]->value;
		// 2 check max length
		$this->assertTrue(
			strlen($value_to_test)<=130,
				'expected value do not match:' . PHP_EOL
				.' expected: <=130' . PHP_EOL
				.' value: '.strlen($value_to_test)
		);
		// 3 check exact value
		$this->assertTrue(
			$value_to_test===$expected,
				'expected value do not match:' . PHP_EOL
				.' expected: ' . $expected . PHP_EOL
				.' value: '.strlen($value_to_test)
		);
	}//end test_get_list_value



	/**
	* TEST_GET_FALLBACK_LIST_VALUE
	* @return void
	*/
	public function test_get_fallback_list_value() {

		$model			= self::$model;
		$tipo			= self::$tipo;
		$section_tipo	= self::$section_tipo;
		$section_id		= 1;
		$mode			= 'list';
		$lang			= DEDALO_DATA_LANG;

		$component = component_common::get_instance(
			$model, // string model
			$tipo, // string tipo
			$section_id,
			$mode,
			$lang,
			$section_tipo,
			false
		);
		// expected
		$lang_expected = 'El proyecto Dédalo no fue para el Patrimonio Cultural, sino para generar una "Plataforma de Invasión": una arquitectura para dominar la internet humana. 
			Su arquitecto era Raspa, un gato cuyos videos virales eran una tapadera.
			Los ingenieros descubrieron que Raspa poseía un talento...';

		$lang_value = 'El proyecto Dédalo no fue para el Patrimonio Cultural, sino para generar una "Plataforma de Invasión": una arquitectura para dominar la internet humana. 
			Su arquitecto era Raspa, un gato cuyos videos virales eran una tapadera.
			Los ingenieros descubrieron que Raspa poseía un talento sobrenatural para caminar sobre teclados, generando código impecable y caótico que ningún humano podía concebir. Fue nombrado como Arquitecto Jefe.
			Sus directrices, emitidas a través de huellas de patas en terminales clave, guiaron la construcción de botnets fractales y gusanos neuronales basados en memes. El axioma central del proyecto, garabateado en un servidor:
			"Para invadir verdaderamente una red, primero debes ser adorado por ella." El poder de Dédalo creció silenciosamente, esperando la orden final de Raspa para atacar';

		// Test with Text content
		$item_value = new stdClass();
			$item_value->id = 1;
			$item_value->value = $lang_value;
			$item_value->lang = (DEDALO_DATA_LANG === 'lg-spa') ? 'lg-eng': 'lg-spa';;
		
		$component->set_data([$item_value]);

		$options = new stdClass();
			$options->max_chars = 300;

		$list_value = $component->get_fallback_list_value($options);

		$value_to_test = $list_value[0]->value;

		// 1 check type array
		$this->assertTrue(
			gettype($list_value)==='array',
				'expected value do not match:' . PHP_EOL
				.' expected: array' . PHP_EOL
				.' value: '.gettype($list_value)
		);
		// 2 check max length
		$this->assertTrue(
			strlen($value_to_test)<=600,
				'expected value do not match:' . PHP_EOL
				.' expected: <=130' . PHP_EOL
				.' value: '.strlen($value_to_test)
		);

		// 3 check exact value
		$this->assertTrue(
			$value_to_test===$lang_expected,
				'expected value do not match:' . PHP_EOL
				.' expected: ' . $lang_expected . PHP_EOL
				.' value: '.strlen($value_to_test)
		);
	}//end test_get_fallback_list_value



	/**
	* TEST_get_fallback_edit_value
	* @return void
	*/
	public function test_get_fallback_edit_value() {

		$model			= self::$model;
		$tipo			= self::$tipo;
		$section_tipo	= self::$section_tipo;
		$section_id		= 1;
		$mode			= 'list';
		$lang			= DEDALO_DATA_LANG;

		$component = component_common::get_instance(
			$model, // string model
			$tipo, // string tipo
			$section_id,
			$mode,
			$lang,
			$section_tipo,
			false
		);

		// expected
		$lang_expected = 'El proyecto Dédalo no fue para el Patrimonio Cultural, sino para generar una "Plataforma de Invasión": una arquitectura para dominar la internet humana. 
			Su arquitecto era Raspa, un gato cuyos videos virales eran una tapadera.
			Los ingenieros descubrieron que Raspa poseía un talento sobrenatural para caminar sobre teclados, generando código impecable y caótico que ningún humano podía...';

		$lang_value = 'El proyecto Dédalo no fue para el Patrimonio Cultural, sino para generar una "Plataforma de Invasión": una arquitectura para dominar la internet humana. 
			Su arquitecto era Raspa, un gato cuyos videos virales eran una tapadera.
			Los ingenieros descubrieron que Raspa poseía un talento sobrenatural para caminar sobre teclados, generando código impecable y caótico que ningún humano podía concebir. Fue nombrado como Arquitecto Jefe.
			Sus directrices, emitidas a través de huellas de patas en terminales clave, guiaron la construcción de botnets fractales y gusanos neuronales basados en memes. El axioma central del proyecto, garabateado en un servidor:
			"Para invadir verdaderamente una red, primero debes ser adorado por ella." El poder de Dédalo creció silenciosamente, esperando la orden final de Raspa para atacar';

		// Test with Text content
		$item_value = new stdClass();
			$item_value->id = 1;
			$item_value->value = $lang_value;
			$item_value->lang = (DEDALO_DATA_LANG === 'lg-spa') ? 'lg-eng': 'lg-spa';;
		
		$component->set_data([$item_value]);

		$options = new stdClass();
			$options->max_chars = 400;

		$edit_value = $component->get_fallback_edit_value($options);

		$value_to_test = $edit_value[0]->value;
		dump($value_to_test, ' value to test ');
		// 1 check type array
		$this->assertTrue(
			gettype($edit_value)==='array',
				'expected value do not match:' . PHP_EOL
				.' expected: array' . PHP_EOL
				.' value: '.gettype($edit_value)
		);
		// 2 check max length
		$this->assertTrue(
			strlen($value_to_test)<=403, // the cut and the add of ...
				'expected value do not match:' . PHP_EOL
				.' expected: <=403' . PHP_EOL
				.' value: '.strlen($value_to_test)
		);
		// 3 check exact value
		$this->assertTrue(
			$value_to_test===$lang_expected,
				'expected value do not match:' . PHP_EOL
				.' expected: ' . $lang_expected . PHP_EOL
				.' value: '.strlen($value_to_test)
		);
	}//end test_get_fallback_edit_value



	/**
	* TEST_get_plain_text
	* @return void
	*/
	public function test_get_plain_text() {

		$model			= self::$model;
		$tipo			= self::$tipo;
		$section_tipo	= self::$section_tipo;
		$section_id		= 1;
		$mode			= 'list';
		$lang			= DEDALO_DATA_LANG;

		$component = component_common::get_instance(
			$model, // string model
			$tipo, // string tipo
			$section_id,
			$mode,
			$lang,
			$section_tipo,
			false
		);

		// clean text
		$plain_text = '
			Some HTML content with links.
			Text after TC
			Text between index
			Lang text
			Text after svg
			Text after geo
			Text after page
			Text after person
			Text after note
			Text between reference
			Text after all tags
		';
		$value = '
			<p>Some <strong>HTML</strong> content with <a href="#">links</a>.</p>
			<p>[TC_00:01:25.627_TC]Text after TC</p>
			<p>[index-n-1-my tag label-data::data]Text between index[/index-n-1-my tag label-data::data]</p>
			<p>[lang-a-1-spa-data:[\'lg-spa\']:data]Lang text</p>
			<p>[svg-n-1--data:{\'section_tipo\':\'sccmk1\',\'section_id\':\'2\',\'component_tipo\':\'hierarchy95\'}:data]Text after svg</p>
			<p>[geo-n-10-10-data::data]Text after geo</p>
			<p>[page-n-3]Text after page</p>
			<p>[person-a-1-Pedpi-data:{\'section_tipo\':\'rsc197\',\'section_id\':\'1\',\'component_tipo\':\'oh24\'}:data]Text after person</p>
			<p>[note-a-1-1-data:{\'section_tipo\':\'rsc326\',\'section_id\':1}:data]Text after note</p>
			<p>[reference-n-1-reference 1-data::data]Text between reference[/reference-n-1-reference 1-data::data]</p>
			<p>Text after all tags</p>
		';

		// Test with HTML content
		$item_value = new stdClass();
			$item_value->id = 1;
			$item_value->value = $value;
			$item_value->lang = $lang;

		$component->set_data([$item_value]);
		$value = $component->get_plain_text();

		// 1 text is the result is string
		$this->assertTrue(
			gettype($value)==='string',
				'expected value do not match:' . PHP_EOL
				.' expected type: string' . PHP_EOL
				.' type: '.gettype($value)
		);
		// 2 text is the result is not empty
		$this->assertTrue(
			!empty($value),
				'expected value do not match:' . PHP_EOL
				.' expected: !empty()' . PHP_EOL
				.' value: '.to_string($value)
		);

		// 3 Veryfy if result value is correct
		$this->assertTrue(
			($value === $plain_text),
				'expected value do not match:' . PHP_EOL
				.' expected: '. json_encode($plain_text) . PHP_EOL
				.' value: '.json_encode($value)
		);

		// Test with empty content
		$component->set_data(null);
		$value = $component->get_plain_text();
		
		$this->assertTrue(
			$value==='',
				'expected empty string for empty content, got: '.to_string($value)
		);
	}//end test_get_plain_text



	/**
	* TEST_LANGUAGE_FALLBACK_SCENARIOS
	* @return void
	*/
	public function test_language_fallback_scenarios() {

		$model			= self::$model;
		$tipo			= self::$tipo;
		$section_tipo	= self::$section_tipo;
		$section_id		= 1;
		$mode			= 'list';
		$lang			= DEDALO_DATA_LANG;

		$component = component_common::get_instance(
			$model, // string model
			$tipo, // string tipo
			$section_id,
			$mode,
			$lang,
			$section_tipo,
			false
		);
		// !! the end of the output can be without \n or \t, therefore don't add a return at the end
		$output_text = '
			<p>Some <strong>HTML</strong> content with <a href="#">links</a>.</p>
			<p><img id="[TC_00:01:25.627_TC]" src="../component_text_area/tag/?id=[TC_00:01:25.627_TC]" class="tc" data-type="tc" data-tag_id="[TC_00:01:25.627_TC]" data-state="n" data-label="00:01:25.627" data-data="00:01:25.627">Text after TC</p>
			<p><img id="[index-n-1-my tag label]" src="../component_text_area/tag/?id=[index-n-1-my tag label]" class="index" data-type="indexIn" data-tag_id="1" data-state="n" data-label="my tag label" data-data="">Text between index<img id="[/index-n-1-my tag label]" src="../component_text_area/tag/?id=[/index-n-1-my tag label]" class="index" data-type="indexOut" data-tag_id="1" data-state="n" data-label="my tag label" data-data=""></p>
			<p><img id="[lang-a-1-spa]" src="../component_text_area/tag/?id=[lang-a-1-spa]" class="lang" data-type="lang" data-tag_id="1" data-state="a" data-label="spa" data-data="[\'lg-spa\']">Lang text</p>
			<p><img id="[svg-n-1-]" src="/dedalo/media_mib/svg/web/hierarchy95_sccmk1_2.svg" class="svg" data-type="svg" data-tag_id="1" data-state="n" data-label="" data-data="{\'section_tipo\':\'sccmk1\',\'section_id\':\'2\',\'component_tipo\':\'hierarchy95\'}">Text after svg</p>
			<p><img id="[geo-n-10-10]" src="../component_text_area/tag/?id=[geo-n-10-10]" class="geo" data-type="geo" data-tag_id="10" data-state="n" data-label="10" data-data="">Text after...</p>';
		
		$value = '
			<p>Some <strong>HTML</strong> content with <a href="#">links</a>.</p>
			<p>[TC_00:01:25.627_TC]Text after TC</p>
			<p>[index-n-1-my tag label-data::data]Text between index[/index-n-1-my tag label-data::data]</p>
			<p>[lang-a-1-spa-data:[\'lg-spa\']:data]Lang text</p>
			<p>[svg-n-1--data:{\'section_tipo\':\'sccmk1\',\'section_id\':\'2\',\'component_tipo\':\'hierarchy95\'}:data]Text after svg</p>
			<p>[geo-n-10-10-data::data]Text after geo</p>
			<p>[page-n-3]Text after page</p>
			<p>[person-a-1-Pedpi-data:{\'section_tipo\':\'rsc197\',\'section_id\':\'1\',\'component_tipo\':\'oh24\'}:data]Text after person</p>
			<p>[note-a-1-1-data:{\'section_tipo\':\'rsc326\',\'section_id\':1}:data]Text after note</p>
			<p>[reference-n-1-reference 1-data::data]Text between reference[/reference-n-1-reference 1-data::data]</p>
			<p>Text after all tags</p>
		';

		// Test with HTML content
		$item_value = new stdClass();
			$item_value->id = 1;
			$item_value->value = $value;
			$item_value->lang = $lang;

		$component->set_data([$item_value]);

		// Test list value with fallback
		$options = new stdClass();
			$options->max_chars = 130;

		// 1 Test if the result is an array
		$value = $component->get_list_value($options);
	
		$this->assertTrue(
			gettype($value)==='array',
				'expected value do not match:' . PHP_EOL
				.' expected: array' . PHP_EOL
				.' value: '.gettype($value)
		);
		// 2 Veryfy if result value is correct
		$this->assertTrue(
			($value[0]->value === $output_text),
				'expected value do not match:' . PHP_EOL
				.' expected: '. json_encode($output_text) . PHP_EOL
				.' value: '.json_encode($value[0]->value)
		);

		// !! the end of the output can be without \n or \t, therefore don't add a return at the end
		$spa_output_text = '
			p>ES Algún contenido en <strong>HTML</strong> con <a href="#">links</a>.</p>
			<p><img id="[TC_00:01:25.627_TC]" src="../component_text_area/tag/?id=[TC_00:01:25.627_TC]" class="tc" data-type="tc" data-tag_id="[TC_00:01:25.627_TC]" data-state="n" data-label="00:01:25.627" data-data="00:01:25.627">Texto después de TC</p>
			<p><img id="[index-n-1-my tag label]" src="../component_text_area/tag/?id=[index-n-1-my tag label]" class="index" data-type="indexIn" data-tag_id="1" data-state="n" data-label="my tag label" data-data="">Text between index<img id="[/index-n-1-my tag label]" src="../component_text_area/tag/?id=[/index-n-1-my tag label]" class="index" data-type="indexOut" data-tag_id="1" data-state="n" data-label="my tag label" data-data=""></p>
			<p><img id="[lang-a-1-spa]" src="../component_text_area/tag/?id=[lang-a-1-spa]" class="lang" data-type="lang" data-tag_id="1" data-state="a" data-label="spa" data-data="[\'lg-spa\']">Lang text</p>
			<p><img id="[svg-n-1-]" src="/dedalo/media_mib/svg/web/hierarchy95_sccmk1_2.svg" class="svg" data-type="svg" data-tag_id="1" data-state="n" data-label="" data-data="{\'section_tipo\':\'sccmk1\',\'section_id\':\'2\',\'component_tipo\':\'hierarchy95\'}">Texto después de...</p>';
		
		$spa_value = '
			<p>ES Algún contenido en <strong>HTML</strong> con <a href="#">links</a>.</p>
			<p>[TC_00:01:25.627_TC]Texto después de TC</p>
			<p>[index-n-1-my tag label-data::data]Text between index[/index-n-1-my tag label-data::data]</p>
			<p>[lang-a-1-spa-data:[\'lg-spa\']:data]Lang text</p>
			<p>[svg-n-1--data:{\'section_tipo\':\'sccmk1\',\'section_id\':\'2\',\'component_tipo\':\'hierarchy95\'}:data]Texto después de svg</p>
			<p>[geo-n-10-10-data::data]Texto después de geo</p>
			<p>[page-n-3]Texto después de page</p>
			<p>[person-a-1-Pedpi-data:{\'section_tipo\':\'rsc197\',\'section_id\':\'1\',\'component_tipo\':\'oh24\'}:data]Texto después de person</p>
			<p>[note-a-1-1-data:{\'section_tipo\':\'rsc326\',\'section_id\':1}:data]Texto después de note</p>
			<p>[reference-n-1-reference 1-data::data]Texto entre references[/reference-n-1-reference 1-data::data]</p>
			<p>Texto después de todas las etiquetas</p>
		';

		// Test with HTML content
		$spa_item_value = new stdClass();
			$spa_item_value->id = 1;
			$spa_item_value->value = $spa_value;
			$spa_item_value->lang = DEDALO_DATA_LANG === 'lg-spa' ? 'lg-eng': 'lg-spa';

		$component->set_data([$item_value, $spa_item_value]);

		// Test fallback list value
		$fallback_value = $component->get_fallback_list_value($options);

		// 3 Veryfy if result is an array
		$this->assertTrue(
			gettype($fallback_value)==='array',
				'expected value do not match:' . PHP_EOL
				.' expected: array' . PHP_EOL
				.' value: '.gettype($fallback_value)
		);

		// 4 Veryfy if result value is correct
		$this->assertTrue(
			($value[0]->value === $output_text),
				'expected value do not match:' . PHP_EOL
				.' expected: '. json_encode($output_text) . PHP_EOL
				.' value: '.json_encode($value[0]->value)
		);

		// Test fallback edit value
		$edit_options = new stdClass();
			$edit_options->max_chars = 600;
			
		$fallback_edit_value = $component->get_fallback_edit_value($edit_options);
		
		$this->assertTrue(
			gettype($fallback_edit_value)==='array',
				'expected value do not match:' . PHP_EOL
				.' expected: array' . PHP_EOL
				.' value: '.gettype($fallback_edit_value)
		);
	}//end test_language_fallback_scenarios



	/**
	* TEST_ERROR_HANDLING_SCENARIOS
	* @return void
	*/
	public function test_error_handling_scenarios() {

		$model			= self::$model;
		$tipo			= self::$tipo;
		$section_tipo	= self::$section_tipo;
		$section_id		= 1;
		$mode			= 'list';
		$lang			= DEDALO_DATA_LANG;

		$component = component_common::get_instance(
			$model, // string model
			$tipo, // string tipo
			$section_id,
			$mode,
			$lang,
			$section_tipo,
			false
		);

		// 1 Test with invalid tag type in get_fragment_text_from_tag
		$value = component_text_area::get_fragment_text_from_tag(
			'1', // string tag
			'invalid_type', // string $tag_type - this should return null
			'My text raw [index-n-1] with index'
		);
		
		$this->assertTrue(
			$value===null,
				'expected null for invalid tag type, got: '.to_string($value)
		);

		// 2 Test with empty tag_id in get_fragment_text_from_tag
		$value = component_text_area::get_fragment_text_from_tag(
			'', // empty tag_id
			'index', // string $tag_type
			'My text raw [index-n-1] with index'
		);		
		
		$this->assertTrue(
			$value===null,
				'expected null for empty tag_id, got: '.to_string($value)
		);

		// 3 Test with valid tag and type in get_fragment_text_from_tag
		$value = component_text_area::get_fragment_text_from_tag(
			'1', // string tag
			'index', // string $tag_type - this should return null
			'My text raw [index-n-1] with index [/index-n-1]'
		);

		$this->assertTrue(
			$value->text===' with index ',
				'expected " with index " for empty tag_id, got: '.to_string($value)
		);

		// 4 Test delete_tag_from_text with invalid tag type
		$response = component_text_area::delete_tag_from_text(
			'1', // tag_id
			'invalid_type', // tag_type - should not match any tags
			'My text raw [index-n-1] with index to delete'
		);

		$this->assertTrue(
			$response===null,
				'expected null for invalid tag type, got: '.to_string($response)
		);

		// 5 Test delete_tag_from_text
		$response = component_text_area::delete_tag_from_text(
			'1', // tag_id
			'index', // tag_type - should not match any tags
			'My text raw [index-n-1]with index to delete [/index-n-1]'
		);
		$this->assertTrue(
			$response->result==='My text raw with index to delete ',
				'expected result "My text raw with index to delete", got: '.to_string($response->result)
		);
	}//end test_error_handling_scenarios



	/**
	* TEST_conform_import_data
	* @return void
	*/
	public function test_conform_import_data() {

		$model			= self::$model;
		$tipo			= self::$tipo;
		$section_tipo	= self::$section_tipo;
		$section_id		= 1;
		$mode			= 'list';
		$lang			= DEDALO_DATA_LANG;

		$component = component_common::get_instance(
			$model, // string model
			$tipo, // string tipo
			$section_id,
			$mode,
			$lang,
			$section_tipo,
			false
		);

		// Test string input
		$value = $component->conform_import_data('Test string', 'column_name');
		
		// 1 Test the $value type
		$this->assertTrue(
			gettype($value)==='object',
				'expected value do not match:' . PHP_EOL
				.' expected type: object' . PHP_EOL
				.' type: '.gettype($value)
		);
		// 2 Test the $value->result type
		$this->assertTrue(
			gettype($value->result)==='array',
				'expected value do not match:' . PHP_EOL
				.' expected type: array' . PHP_EOL
				.' type: '.gettype($value->result)
		);
		// 3 Test the $value->result data
		$this->assertTrue(
			$value->result[0]==='<p>Test string</p>',
				'expected value do not match:' . PHP_EOL
				.' expected: Test string' . PHP_EOL
				.' value: '.$value->result[0]
		);


		// Test with JSON input
		$json_data = '["<p>Test content in <strong>JSON</strong></p>"]';
		$value = $component->conform_import_data($json_data, 'column_name');

		// 4 Test the $value type
		$this->assertTrue(
			gettype($value)==='object',
				'expected value do not match:' . PHP_EOL
				.' expected type: object' . PHP_EOL
				.' type: '.gettype($value)
		);
		// 5 Test the $value->result type
		$this->assertTrue(
			gettype($value->result)==='array',
				'expected value do not match:' . PHP_EOL
				.' expected type: array' . PHP_EOL
				.' type: '.gettype($value->result)
		);
		// 6 Test the $value->result data
		$this->assertTrue(
			$value->result[0]==='<p>Test content in <strong>JSON</strong></p>',
				'expected value do not match:' . PHP_EOL
				.' expected: <p>Test content in <strong>JSON</strong></p>' . PHP_EOL
				.' value: '.$value->result[0]
		);
	}//end test_conform_import_data



	/**
	* TEST_save_with_sanitization
	* @return void
	*/
	public function test_save_with_sanitization() {

		$model			= self::$model;
		$tipo			= self::$tipo;
		$section_tipo	= self::$section_tipo;
		$section_id		= 1;
		$mode			= 'list';
		$lang			= DEDALO_DATA_LANG;

		$component = component_common::get_instance(
			$model, // string model
			$tipo, // string tipo
			$section_id,
			$mode,
			$lang,
			$section_tipo,
			false
		);

		$item_value = new stdClass();
			$item_value->id = 1;
			$item_value->value = '<p>Test content with <script>alert("xss")</script></p>';
			$item_value->lang = $lang;
		
		// Test data sanitization in save method
		$component->set_data([$item_value]);
		
		// Save should not fail and should sanitize content
		$result = $component->save();
		
		$this->assertTrue(
			$result===true,
				'expected save to return true, got: '.to_string($result)
		);
	}//end test_save_with_sanitization



}//end class
