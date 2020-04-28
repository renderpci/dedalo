<?php
include( dirname(__FILE__) . '/translators/class.babel.php');
/*
* CLASS TOOL_indexation
*
*
*/
class tool_indexation { // extends tool_common


	public $source_component;
	public $target_component;
	public $ar_source_langs;
	public $ar_source_components;
	public $target_langs;	# From filter 'Projects'
	public $last_target_lang;
	public $section_tipo;



	/**
	* __CONSTRUCT
	*/
	public function __construct($component_obj, $modo='button') {

		# Fix modo
		$this->modo = $modo;

		# Para unificar el acceso, se copia el componente a $this->component_obj
		$this->component_obj 	= $component_obj;

		# Fix component
		$this->source_component = $component_obj;
		$this->source_component->set_modo('tool_indexation');
		#$this->source_component->set_variant( tool_indexation::$source_variant );
			#dump($component_obj,'component_obj');

		$this->section_tipo = $component_obj->get_section_tipo();
	}//end __construct



	/**
	* AUTOMATIC_TRANSLATION
	* @return object $response
	*/
	public static function automatic_translation($request_options) {

		$response = new stdClass();
			$response->result 	= false;
			$response->msg 		= 'Error. Request failed ['.__FUNCTION__.']';

		$options = new stdClass();
			$options->source_lang 		= null;
			$options->target_lang 		= null;
			$options->component_tipo	= null;
			$options->section_id 		= null;
			$options->section_tipo 		= null;
			$options->translator 		= null;
			foreach ($request_options as $key => $value) {if (property_exists($options, $key)) $options->$key = $value;}

		// config json file . Must be compatible with tool properties translator_engine data
			// $config = json_decode(file_get_contents(dirname(__FILE__) . '/translators/config.json'));
			// if ($config===null) {
			// 	$response->msg 	= "Sorry. 'translators/config.json' file is not valid!"; // error msg
			// 	return $response;
			// }
			// // match config engine name with options translator name
			// $engine = array_reduce($config->translator_engine, function($carry, $item) use($options){
			// 	return ($item->name===$options->translator->name) ? $item : $carry;
			// });
			// $uri = $engine->uri;
			// $key = $engine->key;

		// data from options->translator
			$uri = $options->translator->uri;
			$key = $options->translator->key;

		// Source text . Get source text from component
			$model 		= RecordObj_dd::get_modelo_name_by_tipo($options->component_tipo,true);
			$component	= component_common::get_instance($model,
														 $options->component_tipo,
														 $options->section_id,
														 'list',
														 $options->source_lang,
														 $options->section_tipo);
			$dato = (array)$component->get_dato();

		// iterate component array data
			$translated_data = [];
			foreach ($dato as $key => $value) {

				switch ($options->translator->name) {
					case 'google_translation':
						// Not implemented yet
						$response->msg = "Sorry. '{$options->translator->label}' is not implemented yet"; // error msg
						return $response;
						break;
					case 'babel':
					default:
						$translate = babel::translate([
							'uri' 			=> $uri,
							'key' 			=> $key,
							'source_lang' 	=> $options->source_lang,
							'target_lang' 	=> $options->target_lang,
							'text' 			=> $value,
						]);
						$result	= $translate->result;
						if ($result===false) {
							$msg = strlen($translate->msg)>512 ? substr($translate->msg, 0, 512).'..' : $translate->msg;
							$response->msg = $msg; // error msg
							return $response;
						}
						break;
				}

				$translated_data[] = $result ?? null;
			}//end foreach ($dato as $key => $value)


		// Save result on target component
			$component	= component_common::get_instance($model,
														 $options->component_tipo,
														 $options->section_id,
														 'list',
														 $options->target_lang,
														 $options->section_tipo);
			$component->set_dato($translated_data);
			$component->Save(false); // (!) Important: send arg 'false' to save for avoid alter other langs tags (propagate)


		$response->result 	= true;
		$response->msg 		= 'Ok. Request done ['.__FUNCTION__.']';


		return (object)$response;
	}//end automatic_translation



}//end class
