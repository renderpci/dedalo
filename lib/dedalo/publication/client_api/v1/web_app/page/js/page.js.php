<?php
# CONFIG
include(dirname(dirname(dirname(__FILE__))) . '/config/config.php');
# API PAGE GLOBALS
$page_globals = array(
		"JSON_TRIGGER_URL" 		=> JSON_TRIGGER_URL,
		"SHOW_DEBUG" 			=> SHOW_DEBUG,
		"__WEB_BASE_URL__" 		=> __WEB_BASE_URL__,
		"WEB_CURRENT_LANG_CODE" => WEB_CURRENT_LANG_CODE,
		"__WEB_ROOT_WEB__" 		=> __WEB_ROOT_WEB__,
		"__WEB_TEMPLATE_WEB__" 	=> __WEB_TEMPLATE_WEB__
	);
	
$titles = json_encode(lang::get_lang_obj(WEB_CURRENT_LANG_CODE));

# Page globals
header('Content-type: application/javascript');
?>
var page_globals=<?php echo json_encode($page_globals, JSON_PRETTY_PRINT) ?>;
SHOW_DEBUG=page_globals.SHOW_DEBUG;
var tstring=<?php echo $titles;?>;
<?php include dirname(__FILE__) . "/page.js" ?>