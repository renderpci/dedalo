<?php
/**
* CLASS TOOL_INDEXATION
*
*
*/
class tool_indexation extends tool_common {



	/**
	* DELETE_TAG
	* Delete all tag relations (indexing_component) and finally removes
	* the tag in all langs of transcription_component
	*
	* @param object $request_options
	* @return object $response
	*/
		// public static function delete_tag( object $request_options ) : object {

		// 	$response = new stdClass();
		// 		$response->result 	= false;
		// 		$response->msg 		= [];

		// 	// options get and set
		// 		$options = new stdClass();
		// 			$options->section_tipo					= null;
		// 			$options->section_id					= null;
		// 			$options->transcription_component_tipo	= null; // component_text_area tipo
		// 			$options->transcription_component_lang	= null; // component_text_area lang
		// 			$options->indexing_component_tipo		= null; // component_relation_xxx used to store indexation locators
		// 			$options->tag_id						= null;
		// 			foreach ($request_options as $key => $value) {
		// 				if (property_exists($options, $key)) {
		// 					$options->$key = $value;
		// 				}
		// 			}

		// 	// short vars
		// 		$section_tipo					= $options->section_tipo;
		// 		$section_id						= $options->section_id;
		// 		$transcription_component_tipo	= $options->transcription_component_tipo;
		// 		$transcription_component_lang	= $options->transcription_component_lang;
		// 		$indexing_component_tipo		= $options->indexing_component_tipo;
		// 		$tag_id							= $options->tag_id;

		// 	// indexing_component. Remove locators with tag_id given
		// 		$model_name			= RecordObj_dd::get_modelo_name_by_tipo($indexing_component_tipo,true);
		// 		$indexing_lang		= common::get_element_lang($indexing_component_tipo, DEDALO_DATA_LANG);
		// 		$indexing_component	= component_common::get_instance(
		// 			$model_name,
		// 			$indexing_component_tipo,
		// 			$section_id,
		// 			'list',
		// 			$indexing_lang,
		// 			$section_tipo
		// 		);
		// 		// stored locator sample
		// 			// {
		// 			// 	"type": "dd96",
		// 			// 	"tag_id": "19",
		// 			// 	"section_id": "2",
		// 			// 	"section_tipo": "dc1",
		// 			// 	"section_top_id": "2",
		// 			// 	"section_top_tipo": "ich100",
		// 			// 	"tag_component_tipo": "rsc36",
		// 			// 	"from_component_tipo": "rsc860"
		// 			// }

		// 		$pseudo_locator = new stdClass();
		// 			$pseudo_locator->tag_id	= $tag_id;
		// 			$pseudo_locator->type	= DEDALO_RELATION_TYPE_INDEX_TIPO; // dd96

		// 		$ar_properties = ['tag_id','type']; // properties to compare

		// 		$removed = $indexing_component->remove_locator_from_dato($pseudo_locator, $ar_properties);
		// 		$response->msg[] = $removed===true
		// 			? 'Removed locators with tag_id '.$tag_id
		// 			: 'No locators are removed with tag_id '.$tag_id;

		// 		if ($removed===true) {
		// 			$indexing_component->Save();
		// 		}

		// 	// component_text_area. Remove tag in all langs
		// 		$model_name				= RecordObj_dd::get_modelo_name_by_tipo($transcription_component_tipo,true);
		// 		$component_text_area	= component_common::get_instance(
		// 			$model_name,
		// 			$transcription_component_tipo,
		// 			$section_id,
		// 			'list',
		// 			$transcription_component_lang,
		// 			$section_tipo
		// 		);

		// 		$ar_tag_deleted = (array)$component_text_area->delete_tag_from_all_langs(
		// 			$tag_id, // string tag_id
		// 			'index' // string tag_type
		// 		); // Note that "tag" is complete in or out tag like [index-n-8]
		// 		$n_deleted			= count($ar_tag_deleted) ?? 0;
		// 		$response->msg[]	= $n_deleted>0
		// 			? 'Deleted tag '.$tag_id.' in '.$n_deleted.' langs: '.to_string($ar_tag_deleted).' ('.$model_name.' - '.$transcription_component_tipo.')'
		// 			: 'No tags are deleted in '.$model_name.' tipo: '.$transcription_component_tipo.' with tag_id '.$tag_id;

		// 		debug_log(__METHOD__." AR_TAG_DELETED: ".to_string($ar_tag_deleted), logger::DEBUG);


		// 	// DES
		// 		// # GET INVERSE RELATIONS TO CURRENT TAG
		// 		// # And remove it
		// 		// 	$locator = new locator();
		// 		// 		$locator->set_type(DEDALO_RELATION_TYPE_INDEX_TIPO);
		// 		// 		$locator->set_section_tipo($section_tipo);
		// 		// 		$locator->set_section_id($section_id);
		// 		// 		$locator->set_component_tipo($component_tipo);
		// 		// 		$locator->set_tag_id($tag_id);


		// 		// 	$ar_locators = search::calculate_inverse_locators( $locator );
		// 		// 		dump($ar_locators, ' ar_locators ++ '.to_string());
		// 		// 		dump($locator, ' locator ++ '.to_string());
		// 		// 		die();

		// 		// 	foreach ($ar_locators as $pseudo_locator) {

		// 		// 		if (empty($pseudo_locator->from_component_tipo)) {
		// 		// 			debug_log(__METHOD__." Error on locate property from_component_tipo in locator ".json_encode($pseudo_locator), logger::ERROR);
		// 		// 			continue;
		// 		// 		}

		// 		// 		$current_component_tipo  = $pseudo_locator->from_component_tipo;
		// 		// 		$current_section_tipo 	 = $pseudo_locator->from_section_tipo;
		// 		// 		$current_section_id   	 = $pseudo_locator->from_section_id;

		// 		// 		$model_name 	= RecordObj_dd::get_modelo_name_by_tipo($current_component_tipo,true);
		// 		// 		$component 		= component_common::get_instance($model_name,
		// 		// 														 $current_component_tipo,
		// 		// 														 $current_section_id,
		// 		// 														 'edit',
		// 		// 														 DEDALO_DATA_NOLAN,
		// 		// 														 $current_section_tipo);
		// 		// 		$current_locator = clone($locator);
		// 		// 		$component->remove_locator( $current_locator );
		// 		// 		$component->Save();

		// 		// 		debug_log(__METHOD__." Deleted inverse relation in $model_name - $current_section_tipo - $current_component_tipo - $current_section_id - ".json_encode($pseudo_locator), logger::DEBUG);

		// 		// 		$response->msg[] = "Deleted locator: ".json_encode($pseudo_locator);
		// 		// 	}//end oreach ($ar_locators as $current_locator)


		// 		// #
		// 		// # TEXT AREA
		// 		// # Remove tag from text
		// 		// $component_text_area = component_common::get_instance('component_text_area',
		// 		// 													  $component_tipo,
		// 		// 													  $section_id,
		// 		// 													  'edit',
		// 		// 													  $lang,
		// 		// 													  $section_tipo);
		// 		// $ar_tag_deleted = (array)$component_text_area->delete_tag_from_all_langs($tag_id, $tag_type='index'); // note that "tag" is complete in or out tag like [index-n-8]
		// 		// 	$response->msg[] = "Deleted in langs ".count($ar_tag_deleted)." the tag \"$tag_id\" from component_text_area $component_tipo [$section_tipo - $section_id]";
		// 		// 	$response->debug['ar_tag_deleted'] = $ar_tag_deleted;


		// 	$response->result = true;

		// 	return $response;
		// }//end delete_tag



	/**
	* CHANGE_TAG_STATE
	* @return object $response
	*/
		// public static function change_tag_state(object $request_options) : object {

		// 	$response = new stdClass();
		// 		$response->result 	= false;
		// 		$response->msg 		= [];


		// 	// options get and set
		// 		$options = new stdClass();
		// 			$options->section_tipo			= null;
		// 			$options->section_id			= null;
		// 			$options->transcription_component_tipo	= null; // component_text_area tipo
		// 			$options->transcription_component_lang	= null; // component_text_area lang
		// 			$options->tag_id				= null;
		// 			$options->state					= null;
		// 			foreach ($request_options as $key => $value) {
		// 				if (property_exists($options, $key)) {
		// 					$options->$key = $value;
		// 				}
		// 			}

		// 	// component_text_area
		// 		$model_name				= RecordObj_dd::get_modelo_name_by_tipo($options->transcription_component_tipo,true);
		// 		$component_text_area	= component_common::get_instance( $model_name,
		// 																  $options->transcription_component_tipo,
		// 																  $options->section_id,
		// 																  'edit',
		// 																  $options->transcription_component_lang,
		// 																  $options->section_tipo);
		// 		$tag_id		= $options->tag_id;
		// 		$state		= $options->state;
		// 		$dato		= $component_text_area->get_dato();
		// 		$text_raw	= $dato[0];
		// 			// dump($text_raw, ' text_raw ++ '.to_string());

		// 		if (!empty($text_raw)) {
		// 			$result_text = component_text_area::change_tag_state($tag_id, $state, $text_raw);
		// 				// dump($result_text, ' result_text ++ '.to_string());

		// 			$component_text_area->set_dato([$result_text]);
		// 			$component_text_area->Save();

		// 			$response->result 	= true;
		// 			$response->msg 		= 'OK. Tag: '.$options->tag_id.' successful updated to state: '.$state;
		// 		}


		// 	return $response;
		// }//end change_tag_state



	/**
	* GET_INDEXATION_NOTE
	* Get existing note data or create a new one
	*
	* @param object $options
	* @return object $response
	*/
		// public function get_indexation_note(object $options) : object {

		// 	$response = new stdClass();
		// 		$response->result	= false;
		// 		$response->msg		= 'Error. Request failed';

		// 	// options
		// 		$tag_id			= $options->tag_id;
		// 		$section_id		= $options->section_id;

		// 	// short vars
		// 		$section_tipo	= DEDALO_INDEXATION_SECTION_TIPO;

		// 	// new note case
		// 		if (empty($section_id)) {

		// 			$new_section	= section::get_instance(null, $section_tipo);
		// 			$new_section_id	= $new_section->Save();
		// 			if (empty($new_section_id)) {
		// 				#debug_log(__METHOD__." Error on create new section from parent. Stoped add_child process !".to_string(), logger::ERROR);
		// 				$response->msg = 'Error on create new section from parent. Stop here !';
		// 				debug_log(__METHOD__." $response->msg ", logger::ERROR);
		// 				return $response;
		// 			}
		// 		}

		// 	$json_data


		// 		# Indexation notes
		// 		// define('DEDALO_INDEXATION_SECTION_TIPO'					, 'rsc377');
		// 		// define('DEDALO_INDEXATION_TITLE_TIPO'					, 'rsc379');
		// 		// define('DEDALO_INDEXATION_DESCRIPTION_TIPO'				, 'rsc380');


		// 	return $response;
		// }//end get_indexation_note



}//end class tool_indexation
