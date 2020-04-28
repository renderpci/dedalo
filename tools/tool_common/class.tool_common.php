<?php
/*
* CLASS TOOL_UPLOAD
*
*
*/
class tool_common{

    public $config;
    public $tool_name;

	/**
	* __CONSTRUCT
	*/
	public function __construct() {
        $this->tool_name = get_called_class();
	}//end __construct


    /**
    * get_config
    * @return
    */
    public function get_config() {

        $tool_name = $this->tool_name;

        // get all tools config sections
			$ar_config = tools_register::get_all_config_tool();

        // append config
        $ar_tool_config = array_filter($ar_config, function($item) use($tool_name){
            if($item->name === $tool_name) {
                return $item;
            }
        });
        $config = !empty($ar_tool_config[0])
            ? $ar_tool_config[0]->config
            : null;

        $this->config = $config;

        return $config;
    }//end get_config


}
