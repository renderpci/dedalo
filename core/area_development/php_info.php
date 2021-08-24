<?php
// config dedalo
require dirname(dirname(dirname(__FILE__))) .'/config/config.php';


if(login::is_logged()!==true) die("<span class='error'> Auth error: please login </span>");


phpinfo();