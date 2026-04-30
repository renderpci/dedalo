<?php declare(strict_types=1);
/**
* CLASS SECTION
* TRAIT SECTION_V7
*
*/
trait section_v7 {



	// @V7 PROPERTIES FROM THE NEW TABLE COLUMNS

	// // object|null data. Section data value from V7 DB column 'data'
	// // Section specific data like label, diffusion info, etc.
	// protected $data;
	// // object|null relation. Section data value from V7 DB column 'relation'.
	// // Stores the list of locators grouped by component tipo as {"dd20":[locators],"dd35":[locators]}
	// protected $relation;
	// // object|null string. Section data value from V7 DB column 'string'
	// // Stores string literals values used from component_input_text, component_text_area and others.
	// protected $string;
	// // object|null date. Section data value from V7 DB column 'date'
	// // Stores date values handled by component_date
	// protected $date;
	// // object|null iri. Section data value from V7 DB column 'iri'
	// // Stores IRI object values handled by component_iri as {"dd85":{"title":"My site URI","uri":"https://mysite.org"}}
	// protected $iri;
	// // object|null geo. Section data value from V7 DB column 'geo'
	// // Stores geo data handled by component_geolocation.
	// protected $geo;
	// // object|null number. Section data value from V7 DB column 'number'
	// // Stores numeric values handled by component_number.
	// protected $number;
	// // object|null media. Section data value from V7 DB column 'media'
	// // Stores media values handled by media components (3d,av,image,pdf,svg)
	// protected $media;
	// // object|null misc. Section data value from V7 DB column 'misc'
	// // Stores other components values like component_security_access, component_json, etc.
	// protected $misc;
	// // object|null relation_search. Section data value from V7 DB column 'relation_search'
	// // Stores relation optional data useful for search across parents like toponymy.
	// protected $relation_search;
	// // object|null counters. Section data value from V7 DB column 'counters'
	// // Stores string components counters used to get unique identifiers for the values as {"id":1,"lang":"lg-nolan","type":"dd750","value":"Hello"}
	// // The format of the counter data is {"dd750":1,"dd201":1,..}
	// protected $counters;

	// @v7 array data_columns. Assoc array with all v7 DB columns


	// section_record_data class instance
	protected object $section_record_data;



    // /**
	// * LOAD_SECTION_DATA @v7
	// * Loads the section DB record once.
	// * The data fill the '$this->data_columns' values
	// * with parsed integer and JSON values.
	// * To force to reload the data form DB, set the property
	// * 'this->is_loaded_data_columns' to false.
	// * @return bool
	// */
	// private function load_section_data() : bool {

	// 	// init section_record_data instance.
	// 	// It's instanced once and handles all the section data database tasks.
	// 	if (!isset($this->section_record_data)) {
	// 		$section_id = $this->section_id ? (int)$this->section_id : null;
	// 		$this->section_record_data = section_record_data::get_instance(
	// 			$this->tipo,
	// 			$section_id
	// 		);
	// 	}

	// 	// If the section_record_data instance has already been loaded,
	// 	// it returns the cached data without reconnecting to the database.
	// 	// All section instances with the same section_tipo and section_id values
	// 	// share the same cached instance of 'section_record_data', independent of the mode.
	// 	$this->section_record_data->read();

	// 	/* TEST
	// 	$data_column_name = 'string';
	// 	$tipo = 'rsc21';
	// 	// $rsc21_data = $this->section_record_data->get_data_columns()['string']->{$tipo} ?? null;
	// 	// $rsc21_data = $this->get_column('string')->{$tipo} ?? null;
	// 	$rsc21_data = $this->data_columns[$data_column_name]->{$tipo} ?? null;
	// 		dump($rsc21_data, ' rsc21_data ++ '.to_string());
	// 		*/

	// 	return true;
	// }//end load_section_data



	/**
	* GET_COLUMN
	* @return
	*/
	public function get_column($data_column_name) {
		return $this->section_record_data->get_data_columns()[$data_column_name];
	}//end get_column



	/**
	* GET_COMPONENT_DATA @v7
	* It gets all the data from the component as the database is stored,
	* with all languages, using the proper data column.
	* @param string $tipo
	* 	Component tipo
	* @param string data_column
	* 	DB data_column where to get the data (relation,string...)
	* @return array|null $component_data
	*/
	public function get_component_data( string $tipo, string $data_column ) : ?array {

		// Load the DB data once
		$this->load_section_data();

		// $component_data = $this->data_columns[$data_column]->{$tipo} ?? null;
		$component_data = $this->section_record_data->get_data_columns()[$data_column]->{$tipo} ?? null;


		return $component_data;
	}//end get_component_data



	// SEC-045: removed `save_partial()` and `delete_partial()` (were defined
	// here). Zero callers in production / CLI / tests (verified by repo-wide
	// grep; only a commented-out reference remains in `class.section.php:671`).
	// Both built JSONB-path SQL by string interpolation of `$tipo` /
	// `$data_column_name`; would have been Class C/D had they been revived.
	// If reintroduction is necessary, use `pg_query_params` and validate the
	// JSONB path against an ontology lookup.



}//end section_v7
