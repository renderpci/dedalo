<?php declare(strict_types=1);
/**
 * CLASS WIDGET_COMMON
 *
 * Base class for all Dédalo widgets. Provides the common properties,
 * factory method, and data contract that every widget must implement.
 *
 * Key features:
 * - Defines the core property set: section_tipo, section_id, mode, lang, ipo
 * - Acts as a factory via get_instance() to load and instantiate widget subclasses
 * - Declares the get_data() contract that subclasses must override
 * - Provides get_data_parsed() as a pass-through hook for post-processing
 * - IPO (Input-Process-Output) drives all widget data resolution from ontology definitions
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
	* Protected constructor to prevent creating a new instance of the
	* *widget* via the `new` operator from outside of this class.
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
	* Returns the *widget* instance of this class.
	* @param object $options
	* {
	*	widget_name 	: string, with the class name
	*	path			: string, with the path to the class of the widget,
	*	ipo				: Input-Process-Output; array with objects with the config defined in the ontology
	*	section_tipo 	: string, $tipo
	*	section_id 		: int in string format || null (for list mode)
	* 	lang			: string
	* }
	* @return object $instance
	* 	The "widget" instance
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
	* @return array|null $data_parsed Array of processed data items, or null
	*/
	public function get_data_parsed() : ?array {

		return $this->get_data();
	}//get_data_parsed



}//end class widget_common
