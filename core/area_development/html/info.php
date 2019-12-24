<?php
require_once( DEDALO_CONFIG_PATH .'/config.php');

# LOGIN VERIFICATION
if(login::is_logged()!==true) die("<span class='error'> Auth error: please login </span>");

phpinfo();
