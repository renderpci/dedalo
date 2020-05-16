<?php


/**
* WIDGET
*/
class widget_common {

	public $section_tipo;
	public $section_id;
	public $lang;
	public $ipo;


	/**
	* Returns the *widget* instance of this class.
	*
	* @return widget The *widget* instance.
	* $options = {
	*		widget_name 	: string, with the class name
	*		path			: string, with the path to the class of the widget,
	*		ipo				: Input-Process-Output; array with objects with the config defined in the ontology
	*		section_tipo 	: string, $tipo
	*		section_id 		: int in string format || null (for list mode)
	* 		lang			: string
	* }
	*/
	public static function get_instance($options) {

		$widget_name = $options->widget_name;
		$path = $options->path;

		include_once( DEDALO_WIDGETS_PATH . $path .'/class.'. $widget_name.'.php');

		$instance = new $widget_name($options);

		return $instance;
	}



	/**
	 * Protected constructor to prevent creating a new instance of the
	 * *widget* via the `new` operator from outside of this class.
	 */
	protected function __construct($options) {

		$this->section_tipo		= $options->section_tipo;
		$this->section_id 		= $options->section_id;
		$this->lang 			= $options->lang;
		$this->ipo 				= $options->ipo;

	}


}
