<?php
include( dirname(__FILE__) . '/translators/class.babel.php');
/*
* CLASS TOOL LANG
*
*
*/
class tool_lang extends tool_common {



	/**
	* AUTOMATIC_TRANSLATION
	* @return object $response
	*/
	public function automatic_translation($request_options) {

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

		// config json . Must be compatible with tool properties translator_engine data
			$config 				= $this->get_config();
			$ar_translator_configs 	= $config->translator_config->value;
			$translator_name 		= $options->translator->name;
			// search current translator config in tool config (stored in database, section 'dd996' Tools configuration)
			$translator_config = array_find($ar_translator_configs, function($item) use($translator_name) {
				return $item->name===$translator_name;
			});

		// data from options->translator
			$uri = $translator_config->uri;
			$key = $translator_config->key;

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

				switch ($translator_name) {
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
