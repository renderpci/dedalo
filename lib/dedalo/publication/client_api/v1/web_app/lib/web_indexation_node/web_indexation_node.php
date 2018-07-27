<?php
/*
	CONTROLLER : INDEX_NODE	
*/
#require_once(dirname(dirname(__FILE__)) .'/config/config.php');
#require_once(dirname(dirname(__FILE__)) .'/ts_term/class.ts_term.php');


# set request vars (id,lang,etc..) if need
#$vars = [];
#foreach($vars as $name) $$name = Tools::setVar($name); 

$mode = $this->mode;


switch ($mode) {

	case 'icon':

		$node_id 	= $this->node_id;
		$term_id 	= $this->term_id;
		$term 		= $this->term;	
		$image_url 	= $this->image_url;
		
		
		#
		# GROUP_LOCATORS . Important !		
		if (isset($this->group_locators)) {
			# All locators of current interview
			$interview_locators = $this->group_locators;			
		}else{
			# Only one (own) locator as array
			$interview_locators = array($this->locator);		
		}
		$locator_json = json_encode( $interview_locators );
		#echo "node_id:$this->node_id ($locator_json) <br>"; #return;	
		break;
	
	default:
		return '';
		break;
}

$cwd = basename(__DIR__);
include ( dirname(__FILE__) .'/html/' . $cwd . '_'.$mode.'.phtml');