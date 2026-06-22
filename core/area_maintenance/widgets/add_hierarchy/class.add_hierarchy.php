<?php declare(strict_types=1);
/**
* ADD_HIERARCHY
* Area-maintenance widget that supplies the data needed to present and activate
* additional hierarchy packages on a running Dédalo installation.
*
* Responsibilities:
* - Exposes a single read-only probe, get_value(), consumed by the JS widget
*   (add_hierarchy.js / render_add_hierarchy.js) to populate the "Add Hierarchy"
*   panel in the Maintenance area.
* - Aggregates three independent sources into one response object so the client
*   only needs a single round-trip:
*     · available .copy.gz hierarchy archive files on disk
*       (installer::get_available_hierarchy_files)
*     · hierarchies already active in the running installation
*       (hierarchy::get_active_elements)
*     · install-config scalars required by the import UI
*       (installer::get_config → hierarchy_files_dir_path, hierarchy_typologies)
*
* There are no mutating actions; the actual import is handled by the install
* subsystem (installer_hierarchy_manager / backup::import_from_copy_file) and
* invoked through the shared render_hierarchies_import_block UI component
* (js/render_install.js), which fires its own API calls.
*
* No API_ACTIONS constant is declared because this widget exposes no callable
* actions beyond the hard-coded get_widget_value() dispatch path used by
* dd_area_maintenance_api::get_widget_value().  If mutating actions are added
* in the future, an API_ACTIONS allowlist MUST be declared (SEC-044).
*
* @package Dédalo
* @subpackage Core
*/
class add_hierarchy {



	/**
	* GET_VALUE
	* Read-only probe called by dd_area_maintenance_api::get_widget_value() to
	* refresh the widget's data in the browser without a full page reload.
	*
	* Assembles a result object with four keys:
	*
	*   hierarchies              — array of hierarchy descriptor objects returned
	*                              by installer::get_available_hierarchy_files(); each
	*                              entry describes a .copy.gz archive on disk (label,
	*                              type, typology, active_in_thesaurus, etc.).
	*                              The property holds the ->result of the response.
	*
	*   active_hierarchies       — array of normalised element objects (stdClass)
	*                              produced by hierarchy::get_active_elements(); only
	*                              hierarchies whose hierarchy4 radio button is set to
	*                              "Yes" (dd64/1) appear here.  Each element has at
	*                              minimum a 'tld' property, which the JS layer
	*                              lower-cases and uses to highlight already-installed
	*                              entries in the picker list.
	*
	*   hierarchy_files_dir_path — absolute server path to the directory that holds
	*                              the .copy.gz files; surfaced to the UI for display
	*                              purposes only (not used for filesystem ops on the
	*                              client side).
	*
	*   hierarchy_typologies     — array of typology definition objects read from
	*                              hierarchies_typologies.json; each entry carries at
	*                              minimum 'typology' (int) and 'label' (string).
	*
	* This method takes no arguments; it is a pure read probe with no side effects.
	* Results from hierarchy::get_active_elements() are cached inside the hierarchy
	* class for the lifetime of the request (cleared by common::clear() between
	* persistent-worker requests).
	*
	* @return object $response - Standard Dédalo response: {result, msg, errors[]}.
	*                            result is the stdClass described above; errors is
	*                            always an empty array on success (no partial-failure
	*                            path is modelled here).
	*/
	public static function get_value() : object {

		$install_config = installer::get_config();

		$result = (object)[
			'hierarchies'				=> installer::get_available_hierarchy_files()->result,
			'active_hierarchies'		=> hierarchy::get_active_elements(),
			'hierarchy_files_dir_path'	=> $install_config->hierarchy_files_dir_path,
			'hierarchy_typologies'		=> $install_config->hierarchy_typologies
		];

		$response = new stdClass();
			$response->result	= $result;
			$response->msg		= 'OK. Request done successfully';
			$response->errors	= [];


		return $response;
	}//end get_value



}//end add_hierarchy
