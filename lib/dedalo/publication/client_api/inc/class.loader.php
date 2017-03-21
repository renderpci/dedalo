<?php
/**
*
* LOADER
* API DEDALO WEB LOADER
* Loads necessary classes
*/	
class class_loader {
	
	
	public function __construct() {		
		
		# Check if PHP versiion is supported
		#self::test_php_version_supported();
		
		spl_autoload_extensions('.php');
		spl_autoload_register(array($this, 'loader'));
	}
	
		
	private static function loader($className) {

		switch (true) {	

			case (strpos($className, 'Error')!==false):
				$file_path	= __WEB_ROOT__ . '/config_api/class.Error.php';
				break;

			default:
				# Folder base inc lib
				$file_path	= __WEB_ROOT__ . '/inc' . '/class.' . $className . '.php';
				break;
		}		
		
		if ( !include($file_path) ) {
			throw new Exception(__METHOD__ . "<hr> A loader call was made to class <b>$className</b><br> File not exits at: <b>$file_path</b><br>
				Please, remember include in inc path folder");
		}
		
	}#end loader

};



# LOAD . Auto Init class
$autoloader	= new class_loader();
?>