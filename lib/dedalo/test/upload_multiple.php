<?php
require_once( dirname(dirname(__FILE__)) .'/config/config4.php');

#ob_start();

if (isset($_REQUEST)) {
echo"<pre>";

	var_dump($_REQUEST);


echo"</pre>";
}

$upload_dir = ini_get('upload_tmp_dir'); echo "upload_dir: $upload_dir<hr>";
?>
<html>
<form action="" enctype="multipart/form-data" method="post">
<input type="file" id="file_input" name="file_input" webkitdirectory="" directory="" >
<input type="submit" >
</form>




<?php
#echo "<div style=\"margin:30px;\">".phpinfo()."</div>";


echo"<pre>";
echo"</pre>";


#ob_flush(html_page::get_html);
#echo html_page::get_html(ob_flush())
?>

</html>