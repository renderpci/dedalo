<?php
# CONFIG
	include(dirname(dirname(dirname(__FILE__))) . '/config/config.php');

$page_globals = array(
		"JSON_TRIGGER_URL" 		=> JSON_TRIGGER_URL,
		"SHOW_DEBUG" 			=> SHOW_DEBUG,
		"__WEB_BASE_URL__" 		=> __WEB_BASE_URL__,
		"WEB_CURRENT_LANG_CODE" => WEB_CURRENT_LANG_CODE
	);

# Page globals
header('Content-type: application/javascript');
?>
var page_globals=<?php echo json_encode($page_globals, JSON_PRETTY_PRINT) ?>;
SHOW_DEBUG=page_globals.SHOW_DEBUG
<?php include dirname(__FILE__) . "/page.js" ?>