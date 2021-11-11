<?php
// set default tipo
	$TOP_TIPO = 'dd242';

// config
require_once( dirname(dirname(__FILE__)) . '/config/config4.php' );
require_once( DEDALO_LIB_BASE_PATH . '/install/class.install.php' );

// set menu off
	$_REQUEST['menu'] = 0;

// content
	ob_start();
	include dirname(__FILE__) . '/install.php';
	$content = ob_get_clean();


$html = html_page::get_html($content, true, [
	// 'top_tipo' => 'oh1'
]);
echo $html;