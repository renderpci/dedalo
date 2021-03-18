<?php


/**
* WIDGET
*/
class widget {

	/**
	 * @var widget The reference to *widget* instance of this class
	 */
	private static $instance;

	// set from properties on configure
	public $widget_name;
	public $widget_info;
	public $widget_path;
	public $data_source;

	public $dato;


	/**
	 * Returns the *widget* instance of this class.
	 *
	 * @return widget The *widget* instance.
	 */
	public static function getInstance() {

		if (null === static::$instance) {
			static::$instance = new static();
		}
		
		return static::$instance;
	}



	/**
	 * Protected constructor to prevent creating a new instance of the
	 * *widget* via the `new` operator from outside of this class.
	 */
	protected function __construct() {
	}



	/**
	 * Private clone method to prevent cloning of the instance of the
	 * *widget* instance.
	 *
	 * @return void
	 */
	private function __clone() {
	}



	/**
	 * Private unserialize method to prevent unserializing of the *widget*
	 * instance.
	 *
	 * @return void
	 */
	public function __wakeup() {
	}



	/**
	* GET_HTML
	* @return string $html
	*/
	public function get_html($lang=DEDALO_DATA_LANG, $widget_mode=null) {

		ob_start();
		$widget_file = DEDALO_EXTRAS_PATH .''. $this->widget_path . '/' . $this->widget_name. '/' . $this->widget_name . '.php';
		include( $widget_file );
		$html = ob_get_clean();

		return $html;
	}//end get_html



	/**
	* CONFIGURE  
	*/
	public function configure( $widget_obj ) {
		foreach($widget_obj as $key => $value) {
			$this->$key = $value;
		}
	}//end configure



	/**
	* GET_BASE_URL
	* Note: Widgets are placed in extras folder
	* @return string $widget_base_url
	*/
	public function get_widget_base_url() {

		$DEDALO_EXTRAS_BASE_URL = DEDALO_ROOT_WEB . '/'. basename(dirname(DEDALO_LIB_BASE_PATH)) .'/'. basename(DEDALO_LIB_BASE_PATH) .'/'. basename(DEDALO_EXTRAS_PATH);
		$widget_base_url 		= $DEDALO_EXTRAS_BASE_URL . $this->widget_path . '/' . $this->widget_name;

	   return $widget_base_url;
	}//end get_base_url



	/**
	* GET_WIDGET_STR_OBJECT
	* @return object | false
	*/
	public static function get_widget_str_object( $component_tipo, $name ) {
		
		$RecordObj_dd = new RecordObj_dd($component_tipo);
		$propiedades  = json_decode($RecordObj_dd->get_propiedades());
		foreach ((array)$propiedades->widgets as $value_obj) {
			if ($value_obj->widget_name===$name) {
				return $value_obj;
			}
		}

		return false;
	}//end get_widget_str_object



	/**
	* SET_DATO
	* @return 
	*/
	public function set_dato($dato) {
		
		$this->dato = $dato;
	}//end set_dato



}