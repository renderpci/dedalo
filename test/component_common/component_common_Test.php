<?php
declare(strict_types=1);
use PHPUnit\Framework\TestCase;
use PHPUnit\Framework\Attributes\TestDox;

// require_once dirname(dirname(__FILE__)). '/lib/vendor/autoload.php';
require_once dirname(dirname(dirname(__FILE__))) . '/config/config.php';



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
	* TEST_COMPONENT_DATO_IS_ARRAY_OR_NULL
	* @return void
	*/
	public function test_component_dato_is_array_or_null(): void {

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
	}//end test_component_dato_is_array_or_null



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
				dump($component_dato, '$component->get_dato() 1 ++ '.to_string($component->uid));

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
			dump($dato_from_section, ' dato_from_section ++ '.to_string());

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
			dump($component2->get_dato(), '$component2->get_dato() 2 ++ '.to_string($component2->uid));

		$this->assertSame($component->uid, $component2->uid);
	}//end test_save_component_dato



}//end class
