<?php declare(strict_types=1);
/**
* CLASS COMPONENT_FILTER_RECORDS
* Row-level access-control component that restricts which specific section records
* a user may see, independently of project-based filtering.
*
* This component lives exclusively inside the User section (dd128, tipo dd478) and
* holds a list of allowed record IDs grouped by section_tipo.  Unlike
* component_filter, which grants access by project membership (a set of locators),
* component_filter_records names individual section record IDs the user may see.
*
* Responsibilities:
* - Persisting the user's per-section record allow-list in the 'misc' column of the
*   matrix table (see section_record_data::$column_map).
* - Exposing get_user_filter_records() so that the search WHERE builder
*   (trait.where → build_filter_by_user_records) can inject an IN clause that
*   limits query results to the allowed record IDs.
* - Generating the edit-mode datalist of sections the current user may choose from,
*   derived from their ontology-level area permissions.
*
* Data shape (stored in 'misc', keyed by section_tipo):
*   [
*     { "id": 1, "tipo": "mdcat3112", "value": [1, 8, 9] },
*     { "id": 2, "tipo": "rsc202",    "value": [8, 150, 201] },
*     ...
*   ]
* Each entry maps a section_tipo to the section_ids the user is allowed to access.
* The search WHERE builder reads this as `[ section_tipo => [int, ...] ]`.
*
* Feature gate: the entire mechanism is disabled unless the constant
* DEDALO_FILTER_USER_RECORDS_BY_ID is defined and set to true in config
* (defaults to false in stub.php and sample.config.php).
*
* Extends component_common for standard component lifecycle (get_data, save, etc.).
*
* @package Dédalo
* @subpackage Core
*/
class component_filter_records extends component_common {



	/**
	* @var array $filter_user_records_by_id_cache
	* Class-level static cache intended to hold per-user filter results within a
	* single PHP request so that repeated calls to get_user_filter_records() avoid
	* redundant database reads.
	*
	* (!) NOTE: this property is declared but never read or written inside this class.
	* The active per-request cache is maintained by trait.where → $filter_user_records_cache
	* (in search), which performs the same optimisation there.  This property is a
	* leftover stub; it is public so external callers could potentially populate it,
	* but no current code does so.  Candidate for removal in a future cleanup pass.
	*/
	public static array $filter_user_records_by_id_cache = [];



	/**
	* GET_USER_FILTER_RECORDS
	* Returns the row-level access allow-list for the given user, used to restrict
	* search results to explicitly permitted section records.
	*
	* The method is the sole authoritative data source for the search WHERE builder
	* (trait.where::build_filter_by_user_records).  It instantiates the user's own
	* component_filter_records component (tipo dd478) from the User section (dd128)
	* and calls get_data() on it, returning whatever allow-list was saved there.
	*
	* When the feature gate is off (DEDALO_FILTER_USER_RECORDS_BY_ID !== true) the
	* method short-circuits immediately and returns an empty array, so callers are
	* safe to call it unconditionally.
	*
	* Expected return shape (when populated):
	*   [
	*     'mdcat3112' => [1, 8, 9],
	*     'rsc202'    => [8, 150, 201],
	*     ...
	*   ]
	* Each key is a section_tipo string and its value is the list of allowed
	* section_ids (integers) for that section.
	*
	* @param int $user_id - The numeric user ID whose record filters should be loaded.
	*                       Typically the currently logged-in user's ID.
	* @return array        - Keyed allow-list (section_tipo → int[]) or empty array
	*                        when the feature is disabled or the user has no restrictions.
	*/
	public static function get_user_filter_records(int $user_id) : array {

		$filter_user_records_by_id = [];

		if (defined('DEDALO_FILTER_USER_RECORDS_BY_ID') && DEDALO_FILTER_USER_RECORDS_BY_ID===true) {

			$model_name	= 'component_filter_records';
			$tipo		= DEDALO_USER_COMPONENT_FILTER_RECORDS_TIPO;
			$component	= component_common::get_instance(
				$model_name,
				$tipo,
				$user_id,
				'list',
				DEDALO_DATA_NOLAN,
				DEDALO_SECTION_USERS_TIPO
			);
			$filter_user_records_by_id = $component->get_data() ?? [];

		}

		return $filter_user_records_by_id;
	}//end get_filter_user_records_by_id



	/**
	* GET_DATALIST
	* Builds the list of sections available for selection in edit mode, filtered to
	* only those sections the current user has sufficient permission to access.
	*
	* The list is built in three steps:
	*   1. Retrieve all ontology-level area permissions for the logged-in user via
	*      security::get_ar_authorized_areas_for_user().  Each item carries a 'tipo'
	*      (ontology node ID) and a numeric 'value' (permission level).
	*   2. Filter out entries whose permission value is below 2 (read-write threshold),
	*      and discard any node that does not resolve to the 'section' ontology model.
	*      This excludes pure area/grouper nodes that are not proper data sections.
	*   3. For every qualifying node, resolve its human-readable label from the
	*      ontology in DEDALO_DATA_LANG, then wrap tipo, permissions, and label into a
	*      stdClass object.
	*
	* The resulting array is sorted alphabetically (case-sensitive, spaceship operator)
	* by label, and array_values() is called to reset keys to a contiguous 0-based
	* index before returning.
	*
	* Datalist item shape:
	*   {
	*     "tipo":        string,  // ontology node ID of the section (e.g. "mdcat3112")
	*     "permissions": int,     // numeric permission level (>= 2)
	*     "label":       string   // ontology display name in DEDALO_DATA_LANG
	*   }
	*
	* @return array - Sorted array of stdClass datalist items; empty if the user has
	*                 no qualifying area permissions.
	*/
	public function get_datalist() : array {

		// user areas
		$areas_for_user = security::get_ar_authorized_areas_for_user();

		// Filter and validate sections
		$sections = [];
		foreach ($areas_for_user as $area_item) {

			// area_item format:
				// {
				// 	"tipo": "sicfnumisdata0",
				// 	"value": 2
				// }

			// ignore non authorized for user
				if ( (int)$area_item->value < 2 ) {
					continue;
				}

			// resolve model
				$model = ontology_node::get_model_by_tipo($area_item->tipo, true);

			// ignore non sections (areas)
			// Area/grouper nodes in the ontology share the same permission table but
			// are not sections users can filter records for; skip them.
				if ( $model !== 'section' ) {
					continue;
				}

			// resolve label
			// Use DEDALO_DATA_LANG so the label matches the interface language.
				$label = ontology_node::get_term_by_tipo($area_item->tipo, DEDALO_DATA_LANG, true, true);

			// add object item with label
				$datalist_item = new stdclass();
					$datalist_item->tipo = $area_item->tipo;
					$datalist_item->permissions = $area_item->value;
					$datalist_item->label = $label;

				$sections[] = $datalist_item;
		}

		// sort by label
		// uasort preserves key association during the sort; array_values below
		// resets keys to 0-based integers before the array is serialised to JSON.
		uasort($sections, function($a, $b) {
			return $a->label <=> $b->label;
		});

		// regenerate array keys
		$sections = array_values($sections);


		return $sections;
	}//end get_datalist



}//end class component_filter_records
