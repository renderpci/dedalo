/**
 * Hard-coded model-resolution tables ported verbatim from PHP
 * `ontology_node::get_model()`.
 *
 * The constant tipos are inlined from `config/sample.config.php` and the Time
 * Machine / security config (verified against the running install):
 *   DEDALO_SECURITY_ADMINISTRATOR_TIPO = 'dd244'
 *   DEDALO_USER_PROFILE_TIPO           = 'dd1725'
 *   DEDALO_TIME_MACHINE_COLUMN_ID            = 'dd1573'
 *   DEDALO_TIME_MACHINE_COLUMN_SECTION_ID    = 'dd1212'
 *   DEDALO_TIME_MACHINE_COLUMN_SECTION_TIPO  = 'dd1772'
 *   DEDALO_TIME_MACHINE_COLUMN_TIPO          = 'dd577'
 *   DEDALO_TIME_MACHINE_COLUMN_TIMESTAMP     = 'dd559'
 *   DEDALO_TIME_MACHINE_COLUMN_USER_ID       = 'dd578'
 *   DEDALO_TIME_MACHINE_COLUMN_BULK_PROCESS_ID = 'dd1371'
 *   DEDALO_TIME_MACHINE_COLUMN_DATA          = 'dd1574'
 */

/** The ontology authoring language (PHP `DEDALO_STRUCTURE_LANG`). */
export const DEDALO_STRUCTURE_LANG = 'lg-spa';

/** Universal root node, excluded from ancestor walks (PHP `$parent_zero`). */
export const PARENT_ZERO = 'dd0';

/**
 * Highest-priority model overrides for v6/v7 transitional nodes whose ontology
 * rows are not yet migrated. PHP `get_model()` static `$forced_models`.
 */
export const FORCED_MODELS: Readonly<Record<string, string>> = {
  dd244: 'component_radio_button', // DEDALO_SECURITY_ADMINISTRATOR_TIPO
  dd1725: 'component_select', // DEDALO_USER_PROFILE_TIPO
  dd546: 'component_input_text', // activity where
  dd545: 'component_select', // activity what
  dd544: 'component_input_text', // activity ip
  dd551: 'component_json', // activity 'data'
  hierarchy48: 'component_number', // hierarchy 'order'
  dd1067: 'component_check_box', // tools component_security_tools
  hierarchy45: 'component_portal', // hierarchy main: General term
  hierarchy59: 'component_portal', // hierarchy main: General term model
};

/**
 * Second-priority overrides for Time Machine columns pending ontology update.
 * PHP `get_model()` static `$temporal_models`.
 */
export const TEMPORAL_MODELS: Readonly<Record<string, string>> = {
  dd1573: 'component_number', // TIME_MACHINE_COLUMN_ID
  dd1212: 'component_number', // TIME_MACHINE_COLUMN_SECTION_ID
  dd1772: 'component_input_text', // TIME_MACHINE_COLUMN_SECTION_TIPO
  dd577: 'component_input_text', // TIME_MACHINE_COLUMN_TIPO
  dd559: 'component_date', // TIME_MACHINE_COLUMN_TIMESTAMP
  dd578: 'component_portal', // TIME_MACHINE_COLUMN_USER_ID
  dd1371: 'component_number', // TIME_MACHINE_COLUMN_BULK_PROCESS_ID
  dd1574: 'component_json', // TIME_MACHINE_COLUMN_DATA
};

/** area_maintenance tipo (PHP defines DEDALO_AREA_MAINTENANCE_TIPO = 'dd88'). */
export const AREA_MAINTENANCE_TIPO = 'dd88';

/**
 * Final legacy-name replacement map applied after model resolution. PHP
 * `get_model()` `$model_map` — normalises removed/renamed model classes.
 */
export const MODEL_MAP: Readonly<Record<string, string>> = {
  component_input_text_large: 'component_text_area',
  component_html_text: 'component_text_area',
  component_autocomplete: 'component_portal',
  component_autocomplete_hi: 'component_portal',
  component_state: 'component_info',
  component_calculation: 'component_info',
  section_group_div: 'section_group',
  tab: 'section_tab',
  component_relation_struct: 'box elements',
  component_security_tools: 'component_check_box',
  dataframe: 'box elements',
};
