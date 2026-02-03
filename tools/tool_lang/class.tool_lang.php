<?php declare(strict_types=1);
/**
* CLASS TOOL_LANG
* Tool for managing multilingual content and automatic translations
*
* Provides automation for translating component data across multiple languages
* using external translation services (Babel, Google Translate, etc.).
*
* Key features:
* - Automatic translation of component data using external translator services
* - Support for multiple translation engines (Babel, Google Translate)
* - Translation-specific configuration stored in tool settings (Tools configuration section)
* - Source and target language flexibility for each translation request
* - Error handling and quota monitoring for translation services
* - Batch translation of component array data
*
* Translation workflow:
* 1. Retrieves source text from component in source language
* 2. Calls external translator service with configured credentials
* 3. Saves translated result to target component in target language
* 4. Handles translation engine-specific implementations and error states
*
* @package Dedalo
* @subpackage Tools
*/
class tool_lang extends tool_common {



	/**
	* AUTOMATIC_TRANSLATION
	* Execute automatic translation of component data using configured translator service
	*
	* Retrieves source text from a component in the source language, sends it to an
	* external translation service (Babel, Google Translate, etc.), and saves the 
	* translated result to the target component in the target language.
	*
	* Translator configurations (URI, authentication keys) are stored in the tool's
	* configuration section (Tools configuration - dd996) and retrieved at runtime.
	*
	* @param object $options Configuration object for translation request
	* {
	* 	@type string source_lang Source language code (default: DEDALO_DATA_LANG)
	* 	@type string target_lang Target language code for translation result
	* 	@type string component_tipo The component type to translate
	* 	@type int section_id The section ID containing the component
	* 	@type string section_tipo The section type of the component
	* 	@type string translator Name of translator service ('babel', 'google_translation', etc.)
	* 	@type object config Optional translator configuration object
	* }
	*
	* @return object Response object
	* {
	* 	@type bool result True if translation succeeded
	* 	@type string msg Status message or error description
	* 	@type array errors Array of error message strings
	* 	@type object debug Debug information when SHOW_DEBUG=true
	* 	@type array debug->translated_data Array of translated values
	* 	@type string debug->raw_result Raw response from translator service
	* }
	*
	* @throws Exception When translator config is invalid or required parameters missing
	*/
	public static function automatic_translation(object $options) : object {

		// response
			$response = new stdClass();
				$response->result	= false;
				$response->msg		= 'Error. Request failed ['.__FUNCTION__.']';
				$response->errors	= [];

		// options
			$source_lang	= $options->source_lang		?? DEDALO_DATA_LANG;
			$target_lang	= $options->target_lang		?? null;
			$component_tipo	= $options->component_tipo	?? null;
			$section_id		= $options->section_id		?? null;
			$section_tipo	= $options->section_tipo	?? null;
			$translator		= $options->translator		?? null;

		// config
			// get all tools config sections
			$tool_name	= get_called_class();
			$config = tool_common::get_config($tool_name) ?? new stdClass();

		// config JSON . Must be compatible with tool properties translator_engine data
			$ar_translator_configs	= $config->config->translator_config->value ?? [];
			$translator_name		= $translator;
			// search current translator config in tool config (stored in database, section 'dd996' Tools configuration)
			$translator_config = array_find($ar_translator_configs, function($item) use($translator_name) {
				return $item->name===$translator_name;
			}) ?? new stdClass();

			// check config
				if (empty($translator_config->uri)) {
					$msg = 'Translator config URI is not defined';
					$response->msg .= ' ' . $msg;
					$response->errors[] = $msg;
					return $response;
				}
				if (empty($translator_config->key)) {
					$msg = 'Translator config key is not defined';
					$response->msg .= ' ' . $msg;
					$response->errors[] = $msg;
					return $response;
				}

		// data from options translator
			$uri = $translator_config->uri;
			$key = $translator_config->key;

		// Source text . Get source text from component (source_lang)
			$model		= ontology_node::get_model_by_tipo($component_tipo,true);
			$component	= component_common::get_instance(
				$model,
				$component_tipo,
				$section_id,
				'list',
				$source_lang,
				$section_tipo
			);
			$data_lang = $component->get_data_lang($source_lang);

		// iterate component array data
			$translated_data = [];
			$translate = null; // Initialize to prevent undefined variable in debug section
			foreach ($data_lang as $data_element) {

				switch ($translator_name) {

					case 'google_translation':
						// Not implemented yet
						$response->msg = "Sorry. '{$translator_name}' is not implemented yet"; // error msg
						$response->errors[] = 'Tool not implemented';
						return $response;

					case 'babel':
					default:
						include_once( dirname(__FILE__) . '/translators/class.babel.php');
						$translate = babel::translate((object)[
							'uri'			=> $uri,
							'key'			=> $key,
							'source_lang'	=> $source_lang,
							'target_lang'	=> $target_lang,
							'text'			=> $data_element->value ?? '',
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
			}//end foreach ($data_lang as $data_element)


		// Save result on target component (target_lang)
			if (empty($translated_data)) {

				// skip save empty values
				debug_log(__METHOD__." Skip empty received translation value ", logger::ERROR);
				$response->msg = 'Ignored empty result. Nothing is saved!';

			}else{

				$first_translated_data = $translated_data[0] ?? '';
				if ( str_starts_with($first_translated_data, 'Sorry. Quota exceeded') ) {
					debug_log(__METHOD__." ERROR: $first_translated_data ", logger::ERROR);
					$response->msg = 'Sorry. Quota exceeded';
					return $response;
				}

				$component = component_common::get_instance(
					$model,
					$component_tipo,
					$section_id,
					'list',
					$target_lang,
					$section_tipo
				);

				$component_data = array_map(function($item) use($target_lang) {
					return (object)[
						'value' => $item,
						'lang' => $target_lang
					];
				}, $translated_data);
				$component->set_data_lang($component_data, $target_lang);
				$component->save();

				// response OK
					$response->result	= true;
					$response->msg		= 'OK. Request done ['.__FUNCTION__.']';
			}

		//  debug
			if(SHOW_DEBUG===true) {
				$response->debug = new stdClass();
				$response->debug->translated_data	= $translated_data;
				$response->debug->raw_result		= $translate->raw_result ?? null;
			}


		return $response;
	}//end automatic_translation



}//end class tool_lang
