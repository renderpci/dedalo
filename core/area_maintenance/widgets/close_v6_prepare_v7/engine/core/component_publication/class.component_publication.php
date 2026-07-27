<?php declare(strict_types=1);
/**
* CLASS COMPONENT_PUBLICATION
* Controls whether a record is marked for publication to external diffusion targets.
*
* Each record in a section that participates in diffusion carries exactly one
* component_publication instance. Its dato holds zero or one locator pointing to
* the shared yes/no section (DEDALO_SECTION_SI_NO_TIPO = 'dd64'):
*
*   - Empty / null dato : not yet decided — default for newly created records.
*   - Locator whose section_id equals NUMERICAL_MATRIX_VALUE_YES (1) : the record
*     is approved for publication. diffusion_utils::is_publishable() returns true.
*   - Locator whose section_id equals any other value (the "no" record) : explicitly
*     excluded. diffusion_utils::is_publishable() returns false.
*
* Responsibilities:
* - Stores the publication flag as a relation locator in the 'relation' column of
*   the matrix table, keeping the schema consistent with all other relation components.
* - Forces language to DEDALO_DATA_NOLAN ('lg-nolan') unconditionally; publication
*   state is language-neutral by design.
* - Overrides get_sortable() to return true so list views can order records by their
*   publication status (unlike most relation components, which return false).
* - Inherits duplicate-detection from component_relation_common; $test_equal_properties
*   prevents the same yes/no record from being linked twice.
*
* Data shape (single locator in the dato array):
*   {
*     "section_tipo"         : "dd64",          // DEDALO_SECTION_SI_NO_TIPO
*     "section_id"           : 1,               // NUMERICAL_MATRIX_VALUE_YES = 1
*     "type"                 : "dd151",          // DEDALO_RELATION_TYPE_LINK
*     "from_component_tipo"  : "<this tipo>"
*   }
*
* Integration points:
* - diffusion_utils::is_publishable(locator) calls get_ar_children_tipo_by_model_name
*   to locate this component in the target section, then calls
*   diffusion_utils::get_component_publication_bool_value() which instantiates
*   component_publication in 'list' mode and reads get_data().
* - The JSON controller (component_publication_json.php) resolves context + data using
*   the standard component pipeline (get_structure_context / get_list_value / get_data_lang).
* - section_record_data maps model 'component_publication' to the 'relation' DB column.
*
* Extends component_relation_common for locator storage, relation-table persistence,
* and duplicate detection.
*
* @package Dédalo
* @subpackage Core
*/
class component_publication extends component_relation_common {



	/**
	* CLASS VARS
	*/
		/**
		 * Relation type used when creating the yes/no locator.
		 * Overrides the parent $default_relation_type (which defaults to null) to
		 * use DEDALO_RELATION_TYPE_LINK ('dd151') — the generic link relation type.
		 * This value is read by component_relation_common::__construct() to initialise
		 * $relation_type when the ontology properties do not provide an explicit type.
		 * @var ?string $default_relation_type
		 */
		protected ?string $default_relation_type = DEDALO_RELATION_TYPE_LINK;

		/**
		 * Locator properties that must all match for two locators to be considered
		 * duplicates. Used by component_relation_common duplicate-detection logic before
		 * adding a new locator to prevent a record from being linked to the same
		 * yes/no target more than once.
		 *
		 * Fields:
		 * - section_tipo         : Publication status section type (dd64).
		 * - section_id           : The specific yes or no record in dd64.
		 * - type                 : Relation type (dd151 / DEDALO_RELATION_TYPE_LINK).
		 * - from_component_tipo  : The component tipo that owns this relation,
		 *                          disambiguates cases where the same target section_id
		 *                          could be referenced from multiple components.
		 * @var array $test_equal_properties
		 */
		public array $test_equal_properties = ['section_tipo','section_id','type','from_component_tipo'];



	/**
	* __CONSTRUCT
	* Initialises a component_publication instance.
	*
	* Forces $lang to DEDALO_DATA_NOLAN ('lg-nolan') before delegating to the parent
	* constructor. Publication state is language-neutral; storing it under a specific
	* language key would cause the record to appear published in one locale but not
	* another, which is never the intended behaviour.
	*
	* The constructor is protected — callers must use component_common::get_instance()
	* (the standard factory) rather than direct instantiation.
	*
	* @param string       $tipo         - Ontology tipo of this component (e.g. 'rsc20').
	* @param mixed        $section_id   [= null] - ID of the parent section record.
	* @param string       $mode         [= 'list'] - Rendering mode: 'list', 'edit', 'tm', etc.
	* @param string       $lang         [= DEDALO_DATA_NOLAN] - Ignored; always overridden
	*                                     to DEDALO_DATA_NOLAN before super-constructor call.
	* @param string|null  $section_tipo [= null] - Section tipo that owns this component.
	* @param bool         $cache        [= true] - Whether to use the instance cache.
	* @return void
	*/
	protected function __construct( string $tipo, mixed $section_id=null, string $mode='list', string $lang=DEDALO_DATA_NOLAN, ?string $section_tipo=null, bool $cache=true ) {

		// Force always DEDALO_DATA_NOLAN
		// Publication state is language-neutral; lock $lang before the parent reads it.
		$this->lang = DEDALO_DATA_NOLAN;

		// construct the component normally
		parent::__construct($tipo, $section_id, $mode, $this->lang, $section_tipo, $cache);
	}//end __construct



	/**
	* GET_SORTABLE
	* Reports whether this component supports column-based sorting in list views.
	*
	* component_relation_common::get_sortable() returns false for all relation
	* components because sorting over arbitrary relation targets is generally not
	* meaningful. component_publication overrides this to true because its target
	* section (dd64 / yes–no) has a fixed, known cardinality; the diffusion list view
	* can therefore offer a "sort by publication status" column header.
	*
	* @return bool - Always true; this component is sortable.
	*/
	public function get_sortable() : bool {

		return true;
	}//end get_sortable



}//end class component_publication
