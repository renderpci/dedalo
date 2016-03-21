<?php





class widget {

    /**
     * @var widget The reference to *widget* instance of this class
     */
    private static $instance;
    
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
    private function __wakeup() {
    }


    /**
    * GET_HTML
    * @return 
    */
    public function get_html() {
    	ob_start();	
        include( dirname(__FILE__) . '/' . $this->widget_name .'/'. $this->widget_name . '.php' );
		$html = ob_get_clean();
		return $html;
    }#end get_html


    /**
    * CONFIGURE  
    */
    public function configure( $widget_obj ) {
    	foreach($widget_obj as $key => $value) {
    		$this->$key = $value;
    	}
    }#end configure



}
?>