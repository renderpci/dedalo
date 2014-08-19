<?php
require_once( dirname(dirname(dirname(__FILE__))) .'/config/config4.php');
require_once(DEDALO_LIB_BASE_PATH .'/component_tools/class.component_tools.php');


class tool_container {


	protected $component_obj;

	protected $id;
	protected $tipo;
	protected $parent;	# matrix parent
	protected $lang;
	protected $traducible;

	# STRUCTURE DATA
	protected $RecordObj_ts ;
	protected $modelo;
	protected $norden;
	protected $label;

	

}
?>
