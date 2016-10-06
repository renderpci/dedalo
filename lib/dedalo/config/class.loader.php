<?php
/*
	LOADER DEDALO COMPONENTS
*/
require(DEDALO_LIB_BASE_PATH . '/db/class.DBi.php');
require(DEDALO_LIB_BASE_PATH . '/db/class.RecordObj_matrix.php');
require(DEDALO_LIB_BASE_PATH . '/db/class.JSON_RecordObj_matrix.php');
require(DEDALO_LIB_BASE_PATH . '/db/class.RecordObj_time_machine.php');
require(DEDALO_LIB_BASE_PATH . '/db/class.RecordObj_dd.php');
require(DEDALO_LIB_BASE_PATH . '/db/class.RecordObj_descriptors.php');
require(DEDALO_LIB_BASE_PATH . '/db/class.RecordObj_descriptors_dd.php');
require(DEDALO_LIB_BASE_PATH . '/db/class.json_handler.php');
#require(DEDALO_LIB_BASE_PATH . '/db/class.RecordDataBoundObject.php');
#require(DEDALO_LIB_BASE_PATH . '/db/class.JSON_RecordDataBoundObject.php');
require(DEDALO_LIB_BASE_PATH . '/common/class.common.php');
require(DEDALO_LIB_BASE_PATH . '/common/class.navigator.php');
require(DEDALO_LIB_BASE_PATH . '/common/class.filter.php');
require(DEDALO_LIB_BASE_PATH . '/common/class.counter.php');
require(DEDALO_LIB_BASE_PATH . '/common/class.tools.php');
require(DEDALO_LIB_BASE_PATH . '/common/class.label.php');
require(DEDALO_LIB_BASE_PATH . '/common/class.TR.php');
require(DEDALO_LIB_BASE_PATH . '/common/class.operator.php');
require(DEDALO_LIB_BASE_PATH . '/common/class.locator.php');
require(DEDALO_LIB_BASE_PATH . '/common/class.dd_date.php');
require(DEDALO_LIB_BASE_PATH . '/common/class.relation.php');
require(DEDALO_LIB_BASE_PATH . '/component_common/class.component_common.php');
require(DEDALO_LIB_BASE_PATH . '/component_common/class.component_relation_common.php');


	
class class_loader {
	
	
	public function __construct() {		
		
		# Check if PHP versiion is supported
		#self::test_php_version_supported();
		
		spl_autoload_extensions('.php');
		spl_autoload_register(array($this, 'loader'));
	}
	
		
	private static function loader($className) {

		switch (true) {			
			case (strpos($className, 'tool_')!==false):
				$file_path	= DEDALO_LIB_BASE_PATH . '/tools/' . $className . '/class.' . $className . '.php';
				break;

			case (strpos($className, 'diffusion_')!==false):
				$file_path	= DEDALO_LIB_BASE_PATH . '/diffusion/' . $className . '/class.' . $className . '.php';
				break;			

			case (strpos($className, 'Smalot')!==false):
			case (strpos($className, 'Zend')!==false):
				# Nothint to do
				return;
				break;

			case (strpos($className, 'default')!==false):				
				if(SHOW_DEBUG) {
					$bt = debug_backtrace();
					echo "<pre>";
					print_r($bt);
					echo "</pre>";
					die();
				}
				# Nothint to do
				return;
				break;

			case (strpos($className, 'Error')!==false):
				$file_path	= DEDALO_LIB_BASE_PATH . '/config/class.Error.php';
				break;

			default:
				# Folder base dedalo lib
				$file_path	= DEDALO_LIB_BASE_PATH . '/' . $className . '/class.' . $className . '.php';
				break;
		}		
		
		if ( !include($file_path) ) {
			throw new Exception(__METHOD__ . "<hr> A loader call was made to class <b>$className</b><br> File not exits at: <b>$file_path</b><br>
				Please, remember require this file in main class (like component_common) or create standar dedalo lib path folder 
				like '/component_input_text/class.component_input_text.php' for loader calls. ");
		}
		
	}#end loader
	
	
	
	# Test if PHP versiion is supported
	static private function test_php_version_supported() {		
		
		static $php_version_supported;
		
		if(isset($php_version_supported)) {
			return ($php_version_supported);
		}
		
		$current_php_version		= phpversion();
		$minimun_php_version		= '5.4.3';
		
		
		$ar_current_php_version = explode('.',$current_php_version);
		$ar_minimun_php_version = explode('.',$minimun_php_version);

		if ($ar_current_php_version[1]<4) {
			trigger_error("PHP version $current_php_version is not full compatible with this application. Please update ASAP to PHP 5.4");
		}		
		
		if(	$ar_current_php_version[0] < $ar_minimun_php_version[0] || 
			($ar_current_php_version[0] == $ar_minimun_php_version[0] && $ar_current_php_version[1] < $ar_minimun_php_version[1])
		  )
		  throw new Exception( " This PHP version (".phpversion().") is not supported ! Please update your PHP to $minimun_php_version or higher ASAP ");
		
		$php_version_supported = true;
	}


};


# LOAD . Auto Init class
$autoloader	= new class_loader();


# INIT NAVIGATOR
$navigator	= new navigator();			#var_dump($navigator);

?>