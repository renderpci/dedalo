<?php
include( dirname(__FILE__) . '/translators/class.babel.php');
/*
* CLASS TOOL_LANG
*
*
*/
class tool_lang extends tool_common {



	/**
	* AUTOMATIC_TRANSLATION
	* Exec a translation request against the translator service given (babel, google, etc.)
	* and save the result to the target component in the target lang.
	* Note that translator config is stored in the tool section data (tools_register)
	* @param object $request_options
	* @return object $response
	*/
	public static function automatic_translation(object $request_options) : object {

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed ['.__FUNCTION__.']';

		// options
			$options = new stdClass();
				$options->source_lang		= null;
				$options->target_lang		= null;
				$options->component_tipo	= null;
				$options->section_id		= null;
				$options->section_tipo		= null;
				$options->translator		= null;
				$options->config			= null;
				foreach ($request_options as $key => $value) {if (property_exists($options, $key)) $options->$key = $value;}

		// config
			// get all tools config sections
				$ar_config = tools_register::get_all_config_tool();
			// select current from all tool config matching tool name
				$tool_name	= get_called_class(); // tool_lang
				$config		= array_find($ar_config, function($el) use($tool_name) {
					return $el->name===$tool_name;
				});

		// config JSON . Must be compatible with tool properties translator_engine data
			$ar_translator_configs	= $config->config->translator_config->value;
			$translator_name		= $options->translator;
			// search current translator config in tool config (stored in database, section 'dd996' Tools configuration)
			$translator_config = array_find($ar_translator_configs, function($item) use($translator_name) {
				return $item->name===$translator_name;
			});

		// data from options->translator
			$uri	= $translator_config->uri;
			$key	= $translator_config->key;

		// Source text . Get source text from component (source_lang)
			$model		= RecordObj_dd::get_modelo_name_by_tipo($options->component_tipo,true);
			$component	= component_common::get_instance(
				$model,
				$options->component_tipo,
				$options->section_id,
				'list',
				$options->source_lang,
				$options->section_tipo
			);
			$dato = (array)$component->get_dato();

		// iterate component array data
			$translated_data = [];
			foreach ($dato as $key => $value) {

				switch ($translator_name) {
					case 'google_translation':
						// Not implemented yet
						$response->msg = "Sorry. '{$translator_name}' is not implemented yet"; // error msg
						return $response;
						break;
					case 'babel':
					default:
						$translate = babel::translate((object)[
							'uri'			=> $uri,
							'key'			=> $key,
							'source_lang'	=> $options->source_lang,
							'target_lang'	=> $options->target_lang,
							'text'			=> $value
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


		// Save result on target component (target_lang)
			if (empty($translated_data)) {
				// skip save empty values
				debug_log(__METHOD__." Skipt empty received value ".to_string(), logger::ERROR);
				$response->msg		= 'Ignored empty result. Nothing is saved!';
			}else{
				$component = component_common::get_instance($model,
					$options->component_tipo,
					$options->section_id,
					'list',
					$options->target_lang,
					$options->section_tipo
				);
				$component->set_dato($translated_data);
				$component->Save(false); // (!) Important: send argument 'false' to save to prevent alter other langs tags (propagate)

				// response OK
					$response->result	= true;
					$response->msg		= 'OK. Request done ['.__FUNCTION__.']';
			}

		//  debug
			if(SHOW_DEBUG===true) {
				$response->debug = new stdClass();
				$response->debug->translated_data	= $translated_data;
				$response->debug->raw_result		= $translate->raw_result;
			}


		return (object)$response;
	}//end automatic_translation



}//end class tool_lang
