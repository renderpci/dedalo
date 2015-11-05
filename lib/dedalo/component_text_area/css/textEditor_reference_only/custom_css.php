<?php 
header('Content-type: text/css');
echo '@charset "UTF-8";';
echo '/* CSS Document */';

if(isset($_REQUEST['showAll'])) echo "@import url('showAll.css');";



if(isset($_REQUEST['indexID']) && $_REQUEST['indexID']>0) {
	
	$value = sprintf("%03s", $_REQUEST['indexID']);	# format like '002'
	#echo "img { display:none !important }";
	echo ".mceNonEditable { display:none !important }";
	echo "#\[index_{$value}_in\]	{ display: inline !important; }";
	echo "#\[out_index_{$value}\]	{ display: inline !important; }";
}
?>