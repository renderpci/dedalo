<?php
declare(strict_types=1);
use PHPUnit\Framework\TestCase;
use PHPUnit\Framework\Attributes\TestDox;

// require_once dirname(dirname(__FILE__)). '/lib/vendor/autoload.php';
	require_once dirname(dirname(dirname(__FILE__))) . '/config/config.php';
	require_once dirname(dirname(__FILE__)) . '/login/login_Test.php';

// check is development server. if not, throw to prevent malicious access
	if (!defined('DEVELOPMENT_SERVER') || DEVELOPMENT_SERVER!==true) {
		throw new Exception("Error. Only development servers can use this method", 1);
	}


final class component_common_test extends TestCase {



	/**
	* GET_ELEMENTS
	* @return array $elements
	*/
	public function get_elements() : array {

		// components general values
			$section_tipo	= 'test3';
			$section_id		= 1;
			$mode			= 'edit';
			$lang			= 'lg-eng';
			// $permissions	= 2;

		$elements = [
			(object)[
				'model'			=> 'component_3d',
				'tipo'			=> 'test26',
				'section_tipo'	=> $section_tipo,
				'section_id'	=> $section_id,
				'mode'			=> $mode,
				'lang'			=> $lang
			],
			(object)[
				'model'			=> 'component_av',
				'tipo'			=> 'test94',
				'section_tipo'	=> $section_tipo,
				'section_id'	=> $section_id,
				'mode'			=> $mode,
				'lang'			=> $lang
			],
			(object)[
				'model'			=> 'component_check_box',
				'tipo'			=> 'test88',
				'section_tipo'	=> $section_tipo,
				'section_id'	=> $section_id,
				'mode'			=> $mode,
				'lang'			=> $lang
			],
			(object)[
				'model'			=> 'component_date',
				'tipo'			=> 'test145',
				'section_tipo'	=> $section_tipo,
				'section_id'	=> $section_id,
				'mode'			=> $mode,
				'lang'			=> $lang
			],
			(object)[
				'model'			=> 'component_email',
				'tipo'			=> 'test208',
				'section_tipo'	=> $section_tipo,
				'section_id'	=> $section_id,
				'mode'			=> $mode,
				'lang'			=> $lang
			],
			(object)[
				'model'			=> 'component_filter_master',
				'tipo'			=> 'test70',
				'section_tipo'	=> $section_tipo,
				'section_id'	=> $section_id,
				'mode'			=> $mode,
				'lang'			=> $lang
			],
			(object)[
				'model'			=> 'component_filter_records',
				'tipo'			=> 'test69',
				'section_tipo'	=> $section_tipo,
				'section_id'	=> $section_id,
				'mode'			=> $mode,
				'lang'			=> $lang
			],
			(object)[
				'model'			=> 'component_filter',
				'tipo'			=> 'test101',
				'section_tipo'	=> $section_tipo,
				'section_id'	=> $section_id,
				'mode'			=> $mode,
				'lang'			=> $lang
			],
			(object)[
				'model'			=> 'component_geolocation',
				'tipo'			=> 'test100',
				'section_tipo'	=> $section_tipo,
				'section_id'	=> $section_id,
				'mode'			=> $mode,
				'lang'			=> $lang
			],
			(object)[
				'model'			=> 'component_image',
				'tipo'			=> 'test99',
				'section_tipo'	=> $section_tipo,
				'section_id'	=> $section_id,
				'mode'			=> $mode,
				'lang'			=> $lang
			],
			(object)[
				'model'			=> 'component_input_text',
				'tipo'			=> 'test52',
				'section_tipo'	=> $section_tipo,
				'section_id'	=> $section_id,
				'mode'			=> $mode,
				'lang'			=> $lang
			],
			(object)[
				'model'			=> 'component_inverse',
				'tipo'			=> 'test68',
				'section_tipo'	=> $section_tipo,
				'section_id'	=> $section_id,
				'mode'			=> $mode,
				'lang'			=> $lang
			],
			(object)[
				'model'			=> 'component_iri',
				'tipo'			=> 'test140',
				'section_tipo'	=> $section_tipo,
				'section_id'	=> $section_id,
				'mode'			=> $mode,
				'lang'			=> $lang
			],
			(object)[
				'model'			=> 'component_json',
				'tipo'			=> 'test18',
				'section_tipo'	=> $section_tipo,
				'section_id'	=> $section_id,
				'mode'			=> $mode,
				'lang'			=> $lang
			],
			(object)[
				'model'			=> 'component_number',
				'tipo'			=> 'test211',
				'section_tipo'	=> $section_tipo,
				'section_id'	=> $section_id,
				'mode'			=> $mode,
				'lang'			=> $lang
			],
			(object)[
				'model'			=> 'component_password',
				'tipo'			=> 'test152',
				'section_tipo'	=> $section_tipo,
				'section_id'	=> $section_id,
				'mode'			=> $mode,
				'lang'			=> $lang
			],
			(object)[
				'model'			=> 'component_pdf',
				'tipo'			=> 'test85',
				'section_tipo'	=> $section_tipo,
				'section_id'	=> $section_id,
				'mode'			=> $mode,
				'lang'			=> $lang
			],
			(object)[
				'model'			=> 'component_portal',
				'tipo'			=> 'test80',
				'section_tipo'	=> $section_tipo,
				'section_id'	=> $section_id,
				'mode'			=> $mode,
				'lang'			=> $lang
			],
			(object)[
				'model'			=> 'component_publication',
				'tipo'			=> 'test92',
				'section_tipo'	=> $section_tipo,
				'section_id'	=> $section_id,
				'mode'			=> $mode,
				'lang'			=> $lang
			],
			(object)[
				'model'			=> 'component_radio_button',
				'tipo'			=> 'test87',
				'section_tipo'	=> $section_tipo,
				'section_id'	=> $section_id,
				'mode'			=> $mode,
				'lang'			=> $lang
			],
			(object)[
				'model'			=> 'component_relation_children',
				'tipo'			=> 'test201',
				'section_tipo'	=> $section_tipo,
				'section_id'	=> $section_id,
				'mode'			=> $mode,
				'lang'			=> $lang
			],
			(object)[
				'model'			=> 'component_relation_index',
				'tipo'			=> 'test25',
				'section_tipo'	=> $section_tipo,
				'section_id'	=> $section_id,
				'mode'			=> $mode,
				'lang'			=> $lang
			],
			(object)[
				'model'			=> 'component_relation_model',
				'tipo'			=> 'test169',
				'section_tipo'	=> $section_tipo,
				'section_id'	=> $section_id,
				'mode'			=> $mode,
				'lang'			=> $lang
			],
			(object)[
				'model'			=> 'component_relation_parent',
				'tipo'			=> 'test71',
				'section_tipo'	=> $section_tipo,
				'section_id'	=> $section_id,
				'mode'			=> $mode,
				'lang'			=> $lang
			],
			(object)[
				'model'			=> 'component_relation_related',
				'tipo'			=> 'test54',
				'section_tipo'	=> $section_tipo,
				'section_id'	=> $section_id,
				'mode'			=> $mode,
				'lang'			=> $lang
			],
			(object)[
				'model'			=> 'component_section_id',
				'tipo'			=> 'test102',
				'section_tipo'	=> $section_tipo,
				'section_id'	=> $section_id,
				'mode'			=> $mode,
				'lang'			=> $lang
			],
			(object)[
				'model'			=> 'component_security_access',
				'tipo'			=> 'test157',
				'section_tipo'	=> $section_tipo,
				'section_id'	=> $section_id,
				'mode'			=> $mode,
				'lang'			=> $lang
			],
			(object)[
				'model'			=> 'component_select',
				'tipo'			=> 'test91',
				'section_tipo'	=> $section_tipo,
				'section_id'	=> $section_id,
				'mode'			=> $mode,
				'lang'			=> $lang
			],
			(object)[
				'model'			=> 'component_select_lang',
				'tipo'			=> 'test89',
				'section_tipo'	=> $section_tipo,
				'section_id'	=> $section_id,
				'mode'			=> $mode,
				'lang'			=> $lang
			],
			(object)[
				'model'			=> 'component_svg',
				'tipo'			=> 'test177',
				'section_tipo'	=> $section_tipo,
				'section_id'	=> $section_id,
				'mode'			=> $mode,
				'lang'			=> $lang
			],
			(object)[
				'model'			=> 'component_text_area',
				'tipo'			=> 'test17',
				'section_tipo'	=> $section_tipo,
				'section_id'	=> $section_id,
				'mode'			=> $mode,
				'lang'			=> $lang
			]
		];

		return $elements;
	}//end get_elements



	/**
	* TEST_GET_INSTANCE
	* @return void
	*/
	public function test_get_instance() : void {

		// elements
			$elements = $this->get_elements();

		foreach ($elements as $element) {

			// component instance
				$component = component_common::get_instance(
					$element->model, // string model
					$element->tipo, // string tipo
					$element->section_id, // string section_id
					$element->mode, // string mode
					$element->lang, // string lang
					$element->section_tipo, // string section_tipo
					true // bool cache
				);
				$uid = $component->uid;

			// from cache check
				$component2 = component_common::get_instance(
					$element->model, // string model
					$element->tipo, // string tipo
					$element->section_id, // string section_id
					$element->mode, // string mode
					$element->lang, // string lang
					$element->section_tipo, // string section_tipo
					true // bool cache
				);
				$uid2 = $component2->uid;

			// same instance from cache. Expected true
				$this->assertTrue( $uid===$uid2 );


			// from cache check
				$component3 = component_common::get_instance(
					$element->model, // string model
					$element->tipo, // string tipo
					$element->section_id, // string section_id
					$element->mode, // string mode
					$element->lang, // string lang
					$element->section_tipo, // string section_tipo
					false // bool cache
				);
				$uid3 = $component3->uid;

			// same instance from cache. Expected false
				$this->assertFalse( $uid===$uid3 );

			// check lang. Verify if assigned lang is as expected for non translatable components
				$component3 = component_common::get_instance(
					$element->model, // string model
					$element->tipo, // string tipo
					$element->section_id, // string section_id
					$element->mode, // string mode
					$element->lang, // string lang
					$element->section_tipo, // string section_tipo
					false // bool cache
				);
				$expected_component_lang = (RecordObj_dd::get_translatable($element->tipo)===true)
					? DEDALO_DATA_LANG
					: DEDALO_DATA_NOLAN;
				$component_lang = $component3->get_lang();
				if ($expected_component_lang!==$component_lang) {
					error_log($element->model.' - expected_component_lang:'.$expected_component_lang . ' => component_lang:' . $component_lang);
				}
				$this->assertTrue( $expected_component_lang===$component_lang );

			// check main vars
				$this->assertTrue( $component3->get_tipo()===$element->tipo );
				$this->assertTrue( $component3->get_section_id()===$element->section_id );
				$this->assertTrue( $component3->get_mode()===$element->mode );
				$this->assertTrue( $component3->get_section_tipo()===$element->section_tipo );
				$this->assertTrue( $component3->pagination->offset===0 );
				$this->assertTrue( $component3->pagination->limit===null );

		}//end foreach
	}//end test_get_instance



	/**
	* TEST_COMPONENT_DATO
	* @return void
	*/
	public function test_component_dato(): void {

		// elements
			$elements = $this->get_elements();

		foreach ($elements as $element) {

			$component = component_common::get_instance(
				$element->model, // string model
				$element->tipo, // string tipo
				$element->section_id, // string section_id
				$element->mode, // string mode
				$element->lang, // string lang
				$element->section_tipo // string section_tipo
			);

			// dato type
				$dato = $component->get_dato();
				$element->dato_type = gettype($dato);


			switch ($element->model) {
				case 'component_section_id':
					$this->assertTrue( gettype($dato)==='integer' );

					// $component->set_dato('string');
					// $dato = $component->get_dato();
					// $this->assertTrue( gettype($dato)==='integer' );
					break;
				default:
					$this->assertTrue( gettype($dato)==='array' || is_null($dato) );
					break;
			}
		}
	}//end test_component_dato



	/**
	* TEST_COMPONENT_json
	* @return void
	*/
	public function test_component_json(): void {

		// force status as logged to allow test
			login_test::force_login(DEDALO_SUPERUSER);

		// elements
			$elements = $this->get_elements();

		foreach ($elements as $element) {

			$component = component_common::get_instance(
				$element->model, // string model
				$element->tipo, // string tipo
				$element->section_id, // string section_id
				$element->mode, // string mode
				$element->lang, // string lang
				$element->section_tipo // string section_tipo
			);

			$json_data = $component->get_json((object)[
				'get_context'	=> true,
				'get_data'		=> true
			]);

			$this->assertTrue( gettype($json_data->context)==='array' );
			$this->assertTrue( gettype($json_data->data)==='array' );
				// dump($json_data->data, ' json_data->data ++ '.to_string($element->model));

			if (!empty($json_data->data[0])) {

				$this->assertTrue( $json_data->data[0]->section_id===$component->get_section_id() );
				$this->assertTrue( $json_data->data[0]->section_tipo===$component->get_section_tipo() );
				$this->assertTrue( $json_data->data[0]->lang===$component->get_lang() );
				$this->assertTrue( $json_data->data[0]->from_component_tipo===$component->get_tipo() );

				// if (gettype($json_data->data[0]->value)!=='array' && !is_null($json_data->data[0]->value)) {
				// 	dump($json_data->data[0], ' var ++ ))))))))))))))))) '.to_string($element->model));
				// 	dump(gettype($json_data->data[0]->value), ' gettype ((((((((((((((((((( ))))))))))))))))))) ++ '.to_string($element->model));
				// }
				if ($element->model==='component_section_id') {
					$this->assertTrue( gettype($json_data->data[0]->value)==='integer' && $json_data->data[0]->value==$component->get_section_id() );
				}else{
					$this->assertTrue( gettype($json_data->data[0]->value)==='array' || is_null($json_data->data[0]->value) );
				}
			}
		}
	}//end test_component_json



	/**
	* TEST_SAVE_COMPONENT_DATO
	* @return void
	*/
	public function test_save_component_dato() : void {

		// Working here !!!

		// section
			$section_id		= 1;
			$section_tipo	= 'test3';
			$section = section::get_instance(
				$section_id, // string|null section_id
				$section_tipo, // string section_tipo
				'list',
				// false
			);
			$section_dato = $section->get_dato();
				// dump($section_dato, ' section_dato ++ '.to_string());
				// dump($section->uid, ' section->uid 1 ++ '.to_string());

		// component
			$model	= 'component_input_text';
			$tipo	= 'test52';
			$mode	= 'list';
			$lang	= 'lg-eng';
			$component = component_common::get_instance(
				$model, // string model
				$tipo, // string tipo
				$section_id, // string section_id
				$mode, // string mode
				$lang, // string lang
				$section_tipo, // string section_tipo
				// false
			);
			$component_dato = $component->get_dato();
				// dump($component_dato, '$component->get_dato() 1 ++ '.to_string($component->uid));

			$new_dato = [
				'New dato key 0 C'
			];
			$component->set_dato($new_dato);
				// dump($component->get_dato(), '$component_dato 2 ++ '.to_string());

			$section->save_component_dato(
				$component,
				'direct',
				false // bool $save_to_database
			);
			$dato_from_section = $section_dato->components->{$tipo}->dato->{$lang};
				// dump($dato_from_section, ' dato_from_section ++ '.to_string());

			// unset($section);
			// unset($component);

		// section 2
			$section2 = section::get_instance(
				$section_id, // string|null section_id
				$section_tipo, // string section_tipo
				'list',
				// false
			);
		// component 2
			$component2 = component_common::get_instance(
				$model, // string model
				$tipo, // string tipo
				$section_id, // string section_id
				$mode, // string mode
				$lang, // string lang
				$section_tipo, // string section_tipo
				// false
			);
				// dump($component2->get_dato(), '$component2->get_dato() 2 ++ '.to_string($component2->uid));

		$this->assertSame($component->uid, $component2->uid);
	}//end test_save_component_dato



}//end class component_common_test
