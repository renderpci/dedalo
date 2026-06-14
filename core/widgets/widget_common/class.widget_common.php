<?php declare(strict_types=1);
/**
* CLASS WIDGET_COMMON
* Abstract base class for all Dédalo widget subclasses.
*
* Provides the canonical property set, the factory method, and the get_data()
* contract that every widget must honour. Widgets are lightweight, read-only
* data-resolution units attached to component_info ontology nodes; they do not
* persist data themselves — they aggregate, transform, and deliver it to the
* client renderer.
*
* Responsibilities:
* - Holds the five core properties (section_tipo, section_id, mode, lang, ipo)
*   that describe the record context and resolution configuration for any widget.
* - Acts as a static factory via get_instance(): loads the concrete subclass PHP
*   file from DEDALO_WIDGETS_PATH/$path and returns a fully constructed instance.
* - Declares the get_data() abstract contract: the base implementation logs a
*   warning and returns null, forcing subclasses to override it.
* - Provides get_data_parsed() as a post-processing hook; the default pass-through
*   calls get_data() directly, but subclasses may override to add formatting,
*   filtering, or localisation steps before the data is sent to the client.
*
* IPO (Input-Process-Output):
*   The $ipo property carries the widget's data-resolution configuration as decoded
*   from the ontology node's 'widgets' properties array. Each element describes one
*   resolution cycle: input (where and how to fetch data), process (optional
*   transformation logic), and output (how to shape the result for the renderer).
*
* Known subclasses (extend widget_common):
*   - calculation          (core/widgets/calculation)
*   - state                (core/widgets/state)
*   - get_archive_states   (core/widgets/dmm/get_archive_states)
*   - media_icons          (core/widgets/oh/media_icons)
*   - tags                 (core/widgets/oh/tags)
*   - descriptors          (core/widgets/oh/descriptors)
*   - user_activity        (core/widgets/dd/user_activity)
*   - test_info            (core/widgets/test/test_info)
*   - sum_dates            (core/widgets/mdcat/sum_dates)
*   - get_archive_weights  (core/widgets/numisdata/get_archive_weights)
*   - get_coins_by_period  (core/widgets/numisdata/get_coins_by_period)
*
* Primary caller:
*   component_info::get_data() and dd_component_info::get_widget_data() both
*   reach widgets through widget_common::get_instance().
*
* @package Dédalo
* @subpackage Widgets
*/
class widget_common {



	/**
	* CLASS VARS
	*/
		/**
		 * Section tipo (ontology identifier) of the record being displayed by this widget.
		 * Defines which section/hierarchy the widget data belongs to.
		 * @var ?string $section_tipo
		 */
		public ?string $section_tipo = null;

		/**
		 * Section ID of the record being displayed. Null for list mode widgets.
		 * Identifies the specific record within the section for detail/edit views.
		 * @var string|int|null $section_id
		 */
		public string|int|null $section_id = null;

		/**
		 * Display mode for this widget instance. Default 'edit'.
		 * Controls rendering context: 'edit', 'list', 'search', etc.
		 * @var ?string $mode
		 */
		public ?string $mode = null;

		/**
		 * Language code for multilingual widget content. Default DEDALO_DATA_LANG.
		 * Determines which language version of labels/data to display.
		 * @var ?string $lang
		 */
		public ?string $lang = null;

		/**
		 * Input-Process-Output configuration array from ontology.
		 * Array of objects defining the widget's data sources, processing, and output format.
		 * @var ?array $ipo
		 */
		public ?array $ipo = null;



	/**
	* __CONSTRUCT
	* Initialises the five core context properties from $options.
	*
	* The constructor is protected so that widget instances can only be created
	* through widget_common::get_instance() (factory pattern). Subclasses that
	* need additional initialisation should call parent::__construct($options)
	* and then set their own extra properties.
	*
	* All five fields must be present in $options; mode may be absent (falls
	* back to null, meaning the caller did not specify a render context).
	*
	* @param object $options Object with properties:
	*   - section_tipo : string  Ontology tipo of the host section (e.g. 'oh1').
	*   - section_id   : string|int|null  Record identifier; null for list-mode widgets.
	*   - mode         : ?string  Render context ('edit', 'list', 'search', …).
	*   - lang         : ?string  Active language code (typically DEDALO_DATA_LANG).
	*   - ipo          : ?array   Decoded IPO configuration from the ontology node.
	*/
	protected function __construct(object $options) {

		$this->section_tipo	= $options->section_tipo;
		$this->section_id	= $options->section_id;
		$this->mode			= $options->mode ?? null;
		$this->lang			= $options->lang;
		$this->ipo			= $options->ipo;
	}//end __construct



	/**
	* GET_INSTANCE
	* Factory: load the concrete widget subclass file and return a new instance.
	*
	* The method constructs the include path as:
	*   DEDALO_WIDGETS_PATH . $options->path . '/class.' . $options->widget_name . '.php'
	* and then instantiates $options->widget_name, passing $options to the protected
	* constructor inherited from widget_common.
	*
	* The caller (component_info / dd_component_info) builds $options by merging the
	* record coordinates (section_tipo, section_id, mode, lang) with the per-widget
	* ontology keys (widget_name, path, ipo) found inside the component's 'widgets'
	* properties array. The 'path' value is the sub-directory under DEDALO_WIDGETS_PATH
	* that contains the class file (e.g. 'oh/descriptors' for class.descriptors.php).
	*
	* (!) No path-confinement check is performed here. If path-safety is required for
	* dynamically sourced widget names, the caller must validate before invoking this
	* method. Widgets sourced from the ontology (admin-authored) are considered trusted;
	* see class.calculation.php's resolve_logic() for the SEC-052 confinement pattern
	* used when loading external processing functions at widget runtime.
	*
	* @param object $options  Combined widget-configuration and record-context object:
	*   - widget_name : string  PHP class name to instantiate (e.g. 'state').
	*   - path        : string  Sub-path under DEDALO_WIDGETS_PATH to the class file
	*                           (e.g. 'state', 'oh/tags').
	*   - section_tipo: string  Ontology tipo of the host section.
	*   - section_id  : string|int|null  Record identifier; null for list mode.
	*   - mode        : ?string  Render context ('edit', 'list', etc.).
	*   - lang        : ?string  Active language code.
	*   - ipo         : ?array   IPO configuration array decoded from ontology.
	* @return object $instance  The instantiated widget subclass.
	*/
	public static function get_instance(object $options) : object {

		$widget_name	= $options->widget_name;
		$path			= $options->path;

		include_once DEDALO_WIDGETS_PATH . $path .'/class.'. $widget_name.'.php';

		$instance = new $widget_name($options);

		return $instance;
	}//end get_instance



	/**
	* GET_DATA
	* Return the widget's resolved data. Must be overridden by every widget subclass.
	*
	* The base implementation emits a WARNING-level log entry and returns null so
	* that a missing override is detectable during development without throwing a
	* fatal error. The log message includes the actual called class name to make
	* identification straightforward when multiple widget types are active.
	*
	* Subclasses must override this method to iterate $this->ipo, resolve component
	* or search data, and return a flat array of stdClass items ready for the client
	* renderer. The shape of those items is widget-specific; see each subclass for
	* the documented output format.
	*
	* @return array|null $data Array of structured data items, or null if no data
	*/
	public function get_data() : ?array {

		debug_log(__METHOD__
			." Do not use this method, overwrite it in every widget ".get_called_class()." : ". PHP_EOL
			, logger::WARNING
		);
		return null;
	}//end get_data



	/**
	* GET_DATA_PARSED
	* Pass-through wrapper for get_data(). Subclasses may override to apply
	* additional post-processing (formatting, filtering, localization) before
	* the data is sent to the client renderer.
	*
	* The default implementation is a direct delegate to get_data() with no
	* transformation. A subclass that needs to reshape output (e.g. flatten
	* nested structures, apply number formatting, translate labels) should
	* override only this method and call parent::get_data_parsed() or
	* $this->get_data() as the raw data source.
	*
	* @return array|null $data_parsed Array of processed data items, or null
	*/
	public function get_data_parsed() : ?array {

		return $this->get_data();
	}//end get_data_parsed



}//end class widget_common
