<?php
$url =  "../../../inc/btn.php";
#header("Location: $url");
require $url; exit();

ob_start();
include ( $url );
$html = ob_get_clean();
print $html;
?>