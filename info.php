<?php
require_once(dirname(__FILE__).'/lib/dedalo/config/config4.php');

# LOGIN VERIFICATION
if(login::is_logged()!==true) die("<span class='error'> Auth error: please login </span>");

/*
function alist ($array) {  //This function prints a text array as an html list.
  $alist = "<ul>";
  for ($i = 0; $i < sizeof($array); $i++) {
    $alist .= "<li>$array[$i]";
  }
  $alist .= "</ul>";
  return $alist;
}
*/
$test_daemons = array(
				'convert',
				'identify',
				'/usr/local/bin/ffmpeg',
				'/usr/local/bin/qt-faststart',
				'/Applications/MAMP/bin/php/php5.5.3/bin/php',
				MYSQL_BIN_PATH.'mysql',
				PHP_BIN_PATH
				);

foreach ($test_daemons as $key => $daemon_test) {
	exec( "$daemon_test ", $out, $rcode); //Try to get ImageMagick "convert" program version number.
	echo "Return code for $daemon_test is $rcode <br>"; //Print the return code: 0 if OK, nonzero if error.
}

#echo alist($out); //Print the output of "convert -version"

#var_dump($out);
#echo "</pre>";


?>
<?php  
echo phpinfo();
?>