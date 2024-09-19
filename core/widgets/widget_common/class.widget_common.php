<?php
/**
* WIDGET_COMMON
*
*/
class widget_common {



	/**
	* CLASS VARS
	*/
		public $section_tipo;
		public $section_id;
		public $mode;
		public $lang;
		public $ipo;



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
	* GET_DATO
	* @return
	*/
	public function get_dato() {

		debug_log(__METHOD__
			." Do not use this method, overwrite it in every widget ".get_called_class()." : ". PHP_EOL
			, logger::WARNING
		);
		return null;
	}//end get_dato



	/**
	* GET_DATO_PARSED
	* @return array|null $dato_parsed
	*/
	public function get_dato_parsed() : ?array {

		return $this->get_dato();
	}



}//end class widget_common
