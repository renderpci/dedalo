<?php

/************************************************************************
	
    Dédalo : Cultural Heritage & Oral History Management Platform
	
	Copyright (C) 1998 - 2015  Authors: Juan Francisco Onielfa, Alejandro Peña

    This program is free software: you can redistribute it and/or modify
    it under the terms of the GNU Affero General Public License as
    published by the Free Software Foundation, either version 3 of the
    License, or (at your option) any later version.

    This program is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public License
    along with this program.  If not, see <http://www.gnu.org/licenses/>.
	
	http://www.fmomo.org
	dedalo@fmomo.org
	
************************************************************************/

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
