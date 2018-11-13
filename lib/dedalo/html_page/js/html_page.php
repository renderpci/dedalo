<?php
/* 

	En preparación 15-2-2018 

*/
die("Stop here!");






















# CONFIG
include(dirname(dirname(dirname(__FILE__))) . '/config/config4.php');



# Page globals
header('Content-type: application/javascript');
?>
var DEDALO_LIB_BASE_URL='<?php echo DEDALO_LIB_BASE_URL ?>',DEDALO_ROOT_WEB='<?php echo DEDALO_ROOT_WEB ?>',DEBUG=SHOW_DEBUG=<?php var_export(SHOW_DEBUG); ?>,SHOW_DEVELOPER=<?php var_export(SHOW_DEVELOPER); ?>,DEDALO_SECTION_ID_TEMP='<?php echo DEDALO_SECTION_ID_TEMP ?>',USE_CDN='<?php echo USE_CDN ?>';
<?php echo js::get_json_elements_data(); ?>
<?php include dirname(__FILE__) . "/html_page.js" ?>