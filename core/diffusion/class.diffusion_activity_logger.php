<?php declare(strict_types=1);

require_once(DEDALO_CORE_PATH . '/db/class.matrix_activity_diffusion_db_manager.php');

/**
 * CLASS DIFFUSION_ACTIVITY_LOGGER
 * Handles the logic for logging a processed section in the Diffusion API.
 * Ensures unique logging per request/process cycle.
 */
class diffusion_activity_logger {

	// Cache to ensure unique logging per processed section in the current request
	// Key format: "{section_tipo}_{section_id}"
	private static array $logged_sections = [];

	/**
	 * LOG
	 * Logs the activity of a processed section.
	 * 
	 * @param string $section_tipo
	 * @param int $section_id
	 * @return bool True if logged, false if already logged or error
	 */
	public static function log(string $section_tipo, int $section_id, ?string $diffusion_element_tipo=null): bool {

		// 1. Debounce check
		$cache_key = "{$section_tipo}_{$section_id}";
		if (isset(self::$logged_sections[$cache_key])) {
			return false; // Already logged
		}

		// 2. Prepare data for matrix_activity_diffusion
		$data = new stdClass();
			$data->relation	= new stdClass();
			$data->date		= new stdClass();
			$data->misc		= new stdClass();



		// USER (dd1762 - Who)
		// We use the current logged user or system user
		$user_id = function_exists('logged_user_id') ? logged_user_id() : ( isset($_SESSION['dedalo']['auth']['user_id']) ? $_SESSION['dedalo']['auth']['user_id'] : 0 );
		if ($user_id) {
			$component_tipo = 'dd1762';
			$model			= ontology_node::get_model_by_tipo($component_tipo);
			$column_name	= section_record_data::get_column_name($model);

			if ($column_name) {
				if (!isset($data->$column_name)) {
					$data->$column_name = new stdClass();
				}
				$locator = new locator();
					$locator->set_section_id($user_id);
					$locator->set_section_tipo(DEDALO_SECTION_USERS_TIPO);
					$locator->set_type(DEDALO_RELATION_TYPE_LINK);
					$locator->set_from_component_tipo($component_tipo);
				
				$data->$column_name->$component_tipo = [$locator];
			}
		}

		// WHEN (dd1761 - Temporal Frame)
		$component_tipo = 'dd1761';
		$model			= ontology_node::get_model_by_tipo($component_tipo);
		$column_name	= section_record_data::get_column_name($model);
		
		if ($column_name) {
			if (!isset($data->$column_name)) {
				$data->$column_name = new stdClass();
			}
			$time_value = new stdClass();
			$time_value->start = component_date::get_date_now();
			
			$data->$column_name->$component_tipo = [$time_value];
		}


		// PROCESSED SECTION

			// locator for the processed section
			$component_tipo = 'dd1763';
			$model = ontology_node::get_model_by_tipo($component_tipo);
			$column_name = section_record_data::get_column_name($model);

			if ($column_name) {
				if (!isset($data->$column_name)) {
					$data->$column_name = new stdClass();
				}
				$locator = new locator();
					$locator->set_section_id($section_id);
					$locator->set_section_tipo($section_tipo);
					$locator->set_type(DEDALO_RELATION_TYPE_LINK);
					$locator->set_from_component_tipo($component_tipo);
				
				$data->$column_name->$component_tipo = [$locator];
			}

			// Secction_id (dd1764)
			$component_tipo = 'dd1764';
			$model			= ontology_node::get_model_by_tipo($component_tipo);
			$column_name	= section_record_data::get_column_name($model);

			if ($column_name) {
				if (!isset($data->$column_name)) {
					$data->$column_name = new stdClass();
				}
				$val_obj = new stdClass();
				$val_obj->value = $section_id;
				$data->$column_name->$component_tipo = [$val_obj];
			}

			// Section_tipo (dd1765)
			$component_tipo = 'dd1765';
			$model			= ontology_node::get_model_by_tipo($component_tipo);
			$column_name	= section_record_data::get_column_name($model);

			if ($column_name) {
				if (!isset($data->$column_name)) {
					$data->$column_name = new stdClass();
				}
				$val_obj = new stdClass();
					$val_obj->lang = 'lg-nolan';
					$val_obj->value = $section_tipo;
				$data->$column_name->$component_tipo = [$val_obj];
			}

		// Diffusion element (dd1766)
		if ($diffusion_element_tipo) {
			$component_tipo = 'dd1766';
			$model			= ontology_node::get_model_by_tipo($component_tipo);
			$column_name	= section_record_data::get_column_name($model);

			if ($column_name) {
				if (!isset($data->$column_name)) {
					$data->$column_name = new stdClass();
				}
				
				// Calculate locator from diffusion_element_tipo (e.g. oh63 -> diffusion_element_id:63)
				// Logic: extract chars for prefix, numbers for id. locator tipo = prefix.'0'
				$diff_prefix = get_tld_from_tipo($diffusion_element_tipo);
				$diff_id     = get_section_id_from_tipo($diffusion_element_tipo);
				
				if ($diff_prefix && $diff_id) {
					$diff_section_tipo = $diff_prefix . '0';
					$diff_section_id   = (int)$diff_id;
					
					$locator = new locator();
						$locator->set_section_id($diff_section_id);
						$locator->set_section_tipo($diff_section_tipo);
						$locator->set_type(DEDALO_RELATION_TYPE_LINK);
						$locator->set_from_component_tipo($component_tipo);
					
					$data->$column_name->$component_tipo = [$locator];
				}
			}
		}

		// 3. Save
		matrix_activity_diffusion_db_manager::create(
			'matrix_activity_diffusion',
			'dd1758', // diffusion_log section tipo
			$data
		);
		
		// 4. Update cache
		self::$logged_sections[$cache_key] = true;

		return true;
	}

	/**
	 * RESET_CACHE
	 * Clears the logged sections cache.
	 */
	public static function reset_cache(): void {
		self::$logged_sections = [];
	}

}
