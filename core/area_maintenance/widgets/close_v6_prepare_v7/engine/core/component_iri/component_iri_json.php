<?php declare(strict_types=1);
/**
* COMPONENT_IRI — JSON CONTROLLER
* Included-file controller that builds the JSON context+data response for a
* component_iri instance. Executed via common::get_json() inside the calling
* object scope ($this = component_iri).
*
* Responsibilities:
* - Guard against direct HTTP access (SEC-026 §9.3).
* - Resolve the ontology structure context unconditionally (component_iri always
*   emits its context so the client can initialise the IRI editor / link widget).
* - Resolve the stored IRI data items for the active mode:
*   - 'search' → empty value (client builds its own search UI);
*   - 'list', 'edit', 'tm' (default) → get_data_lang() for the active language.
* - Resolve the paired label-dataframe subdatum (dd560 / DEDALO_COMPONENT_IRI_LABEL_DATAFRAME)
*   so that the client receives the resolved title records alongside the IRI data
*   in a single response. A provisional locator is synthesised when the component
*   carries no data yet (counter+1), so the client can render the empty-row editor
*   with a valid dataframe context.
* - Attach the row counter and, when with_lang_versions is true, the cross-language
*   transliterate_value so the translation tool (tool_lang) can display the
*   original text next to the target-language field.
* - Return a stdClass {context: array, data: array} via
*   common::build_element_json_output().
*
* Data shape produced (one item pushed to $data — the component_iri data item):
*   {
*     section_id, section_tipo, tipo, mode, lang,
*     from_component_tipo, entries: [{iri, id, title?, lang?}],
*     parent_tipo, parent_section_id,
*     counter: int,                    // row counter; used by editor for new rows
*     transliterate_value?: array      // cross-lang data (with_lang_versions only)
*   }
*
* The $context array also receives the subdatum context objects emitted by
* get_subdatum() (i.e., the dd560 component_dataframe structure).
* The $data array also receives the subdatum data objects (resolved dataframe rows).
*
* @package Dédalo
* @subpackage Core
*/
// SEC-026 (§9.3): server-agnostic deny for direct HTTP access. This file is
// included by common::get_json() inside the calling object scope; reaching
// it through a URL means the web server config did not block the path.
// Fail closed regardless of server (Apache / nginx / Caddy / lighttpd / IIS)
// or display_errors mode. The .htaccess <FilesMatch> rule is layer 1.
if (!isset($this)) { http_response_code(404); exit; }
/** @var component_iri $this */
// JSON data component controller



// component configuration vars
	$permissions	= $this->get_component_permissions();
	$mode			= $this->get_mode();



// context
	$context = [];

	// Component structure context (tipo, relations, properties, etc.)
		$this->context = $this->get_structure_context($permissions, true);
		$context[] = $this->context;


// data
	$data = [];

	if($options->get_data===true && $permissions>0) {

		$start_time=start_time();

		// value
		// Resolve the stored IRI data items for the current mode.
		// 'search' produces an empty array because the search UI is driven entirely
		// by the client's SQO and does not need pre-loaded data.
		// All other modes (list, edit, tm) return the language-filtered item array.
			switch ($mode) {
				case 'search':
					$value = [];
					break;
				case 'list':
				case 'edit':
				case 'tm':
				default:
					$value = $this->get_data_lang();
					break;
			}

		// get the counter
		// The counter is the highest `id` ever assigned to an IRI item in this
		// component; it is monotonically incremented on each new item save.
			$counter = $this->get_counter();

		// dataframe. If it exists, calculate the subdatum
		// component_iri always pairs with a label dataframe (dd560) that holds
		// the human-readable title for each IRI item. The pairing key is the
		// item's numeric `id` field. We skip subdatum resolution in 'search'
		// mode because the search UI does not render individual IRI values.
			if ($mode!=='search') {

				// locators (using value key as section_id)
				// Build one locator per stored IRI item. Each locator points to
				// the dd1706 section whose section_id equals the item's `id` field,
				// so get_subdatum() can fetch the matching dataframe row.
					$ar_locator	= [];
					$safe_value	= !empty($value) ? $value : [];
					foreach ($safe_value as $current_value) {

						// Check safe component IRI value. Expected format {"iri":"https://dedalo.es","title":"Dedalo","id":1}
						if (!isset($current_value->id)) {
							// skip old value to prevent to crash the application.
							debug_log(__METHOD__
								. " Ignored non valid value. Expected property 'id' but is not defined" . PHP_EOL
								. ' tipo: ' . $this->tipo . PHP_EOL
								. ' section_tipo: ' . $this->section_tipo . PHP_EOL
								. ' section_id: ' . $this->section_id . PHP_EOL
								. ' current_value: ' . to_string($current_value)
								, logger::ERROR
							);
							continue;
						}

						$locator = new locator();
							$locator->set_section_tipo($this->section_tipo);
							$locator->set_section_id($current_value->id);
						$ar_locator[] = $locator;
					}

				// Empty data
				// If the component has not data, create the locator to get the context of dataframe
				// with the counter, it will be used to show the fields to be filled by default.
				// if the dataframe has not its own context, is not possible to create the instance in client.
				// (!) counter+1 is intentional: the dataframe context for a not-yet-saved row
				// uses the next provisional id so the editor renders an empty slot correctly.
					if( empty($ar_locator) ){
						$locator = new locator();
							$locator->set_section_tipo($this->section_tipo);
							$locator->set_section_id($counter+1);
						$ar_locator[] = $locator;
					}

				// subdatum
				// get_subdatum() resolves the dd560 dataframe rows that pair with
				// the item locators built above. It returns an object with 'context'
				// (dataframe component structure objects) and 'data' (resolved rows).
				// Both are merged into the controller arrays so the client receives
				// a single, self-contained JSON payload.
					$subdatum = $this->get_subdatum($this->tipo, $ar_locator);

					$ar_subcontext = $subdatum->context;
					foreach ($ar_subcontext as $current_context) {
						$context[] = $current_context;
					}

					$ar_subdata = $subdatum->data;
					foreach ($ar_subdata as $sub_value) {
						$data[] = $sub_value;
					}
			}

		// data item
		// Build the standard data envelope. parent_tipo and parent_section_id allow
		// the client to derive the parent component locator (e.g., for inline-relation
		// or nested dataframe requests).
			$item = $this->get_data_item($value);
				$item->parent_tipo			= $this->get_tipo();
				$item->parent_section_id	= $this->get_section_id();

		// counter
		// Attach the current counter so the client editor can assign the next numeric
		// id without a round-trip (counter+1 = id for the next new item).
			$item->counter = $counter;

		// Transliterate components
		// the main lang is set to nolan, the component has translatable property set to false.
		// if the component has with_lang_versions = true in properties
		// it could be transliterate to other languages (translatable with the tool_lang)
		// transliterate_value is used to inform the users than this data has a translation
		// or inside the tool_lang, inform what is the original data in nolan.
		// When original_lang is DEDALO_DATA_NOLAN we fetch the translation in the UI lang;
		// when it is already a UI lang (tool_lang context) we fetch the nolan original.
			$with_lang_versions	= $this->with_lang_versions;
			if($with_lang_versions===true) {

				$original_lang = $this->lang;

				// if the original_lang is nolan change to get the transliterable data in current data lang.
				// if the original_lang is any lang set to nolan (is use into translate component inside tool_lang)
				$tranliterable_lang = ($original_lang === DEDALO_DATA_NOLAN)
					? DEDALO_DATA_LANG
					: DEDALO_DATA_NOLAN;

				$this->set_lang($tranliterable_lang);
				$item->transliterate_value = $this->get_data_lang( $tranliterable_lang );
			}

		// debug
			if(SHOW_DEBUG===true) {
				metrics::add_metric('data_total_time', $start_time);
				metrics::add_metric('data_total_calls');
			}

		$data[] = $item;
	}//end if($options->get_data===true && $permissions>0)



// JSON string
	return common::build_element_json_output($context, $data);
