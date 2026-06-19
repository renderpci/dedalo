<?php declare(strict_types=1);
/**
* AREA_ONTOLOGY
* Area controller for the Dédalo ontology hierarchy.
*
* `area_ontology` is a thin specialisation of `area_thesaurus` that redirects the
* two hierarchy-lookup hooks to the ontology storage layer instead of the generic
* thesaurus layer:
*
* - `get_hierarchy_section_tipo()` returns `DEDALO_ONTOLOGY_SECTION_TIPO`
*   ('ontology35') instead of `DEDALO_HIERARCHY_SECTION_TIPO` ('hierarchy1').
*   This means all parent-class methods that call `$this->get_hierarchy_section_tipo()`
*   (e.g. `get_typology_data`, `get_hierarchy_name`) will query the ontology section
*   rather than a thesaurus section.
*
* - `get_main_table()` returns `ontology::$main_table` ('matrix_ontology_main')
*   instead of `hierarchy::$main_table`, directing row-level CRUD to the correct
*   PostgreSQL table.
*
* All other behaviour — `get_hierarchy_sections`, `search_thesaurus`,
* `get_hierarchy_terms_sqo`, typology resolution, hierarchy-name caching, etc. — is
* inherited verbatim from `area_thesaurus` (which in turn extends `area_common`).
*
* The JSON controller (`area_ontology_json.php`) delegates to `area_thesaurus_json.php`
* via a simple `include` redirect, so the API surface is identical to the thesaurus area.
*
* Relationship chain:
*   area_ontology → area_thesaurus → area_common → common
*
* Data layer managed:
*   Section 'ontology35' (DEDALO_ONTOLOGY_SECTION_TIPO) in table 'matrix_ontology_main'.
*   Node records live in per-TLD matrix tables (e.g. 'matrix_dd0') and the flat
*   'dd_ontology' lookup table — see class.ontology.php for the full storage architecture.
*
* @package Dédalo
* @subpackage Core
*/
class area_ontology extends area_thesaurus {



	/**
	* CLASS VARS
	* No additional properties are declared here; all state is inherited from
	* area_thesaurus (typology/hierarchy name caches, thesaurus_mode, model_view)
	* and from area_common / common (tipo, mode, lang, etc.).
	* @var
	*/



	/**
	* GET_HIERARCHY_SECTION_TIPO
	* Returns the section tipo that identifies the ontology registry section.
	*
	* Overrides `area_thesaurus::get_hierarchy_section_tipo()` to return the
	* ontology-specific constant ('ontology35') instead of the generic hierarchy
	* constant ('hierarchy1').  Every parent-class method that needs to load
	* metadata for the current hierarchy section calls this hook, so this single
	* override is sufficient to steer the whole area toward the ontology data.
	*
	* @return string - Always DEDALO_ONTOLOGY_SECTION_TIPO ('ontology35')
	*/
	public function get_hierarchy_section_tipo() : string {

		$hierarchy_section_tipo = DEDALO_ONTOLOGY_SECTION_TIPO; // 'ontology35';

		return $hierarchy_section_tipo;
	}//end get_hierarchy_section_tipo



	/**
	* GET_MAIN_TABLE
	* Returns the name of the PostgreSQL table that holds ontology main-section rows.
	*
	* Overrides `area_thesaurus::get_main_table()` to return `ontology::$main_table`
	* ('matrix_ontology_main') instead of `hierarchy::$main_table`
	* ('matrix_hierarchy_main').  The main table stores one row per registered
	* top-level domain (TLD) of the ontology (e.g. 'dd', 'es') together with the
	* TLD's metadata (name, active flag, typology, target_section_tipo, order).
	*
	* @return string - Table name, always 'matrix_ontology_main'
	*/
	public function get_main_table() : string {

		return ontology::$main_table; // 'matrix_ontology_main'
	}//end get_main_table



}//end area_ontology
