<?php
/*

 DEDALO 4 INSTALL

*/
set_time_limit(300);
if (!file_exists(dirname(dirname(__FILE__)).'/config/config4_db.php')) {
	exit("Please create a db config file. You can create one from sample file included");
}
if (!file_exists(dirname(dirname(__FILE__)).'/config/config4.php')) {
	exit("Please create a config file. You can create one from sample file included");
}


require_once(dirname(dirname(__FILE__)).'/config/config4.php');

# include css for page
css::$ar_url[] = DEDALO_LIB_BASE_URL.'/install/css/install.css';


# LOGIN VERIFICATION
#if(login::is_logged()!==true) die("<span class='error'> Auth error: please login </span>");

# Set vars
	$vars = array('mode','process');
	foreach($vars as $name)	$$name = common::setVar($name);
	
		



# IMPORT DB 
function import_install_db() {

	$html='';

	# DB CONFIG DATA
	$mysqlDatabaseName 		= DEDALO_DATABASE_CONN;
	$mysqlUserName			= DEDALO_USERNAME_CONN;
	$mysqlPassword 			= DEDALO_PASSWORD_CONN;
	$mysqlHostName 			= DEDALO_HOSTNAME_CONN;

	$file_path				= DEDALO_LIB_BASE_PATH .'/backup/install/';
	$mysql_bin_path 		= MYSQL_BIN_PATH;

	$db_source_name 		= 'dedalo4_install.sql';
	# GZIP SETTING
	if(DEDALO_DB_USE_GZIP) 
		$db_source_name 	.= ".gzip";
	
	$mysqlImportFilename	= $file_path . $db_source_name;	#dump($mysqlImportFilename,'mysqlImportFilename');	

	if (!file_exists($mysqlImportFilename)) {
		return "<div class=\"error\">Error: source file not found : $mysqlImportFilename</div>";
	}
	
	// Import the database and output the status to the page
	$command='';
	if(DEDALO_DB_USE_GZIP) {
		$command .= 'gunzip < '.$mysqlImportFilename.' | ';
		$command .= $mysql_bin_path.'mysql -h'.$mysqlHostName.' -u'.$mysqlUserName.' -p'.$mysqlPassword.' '.$mysqlDatabaseName ;
	}else{
		$command .= $mysql_bin_path.'mysql -h'.$mysqlHostName.' -u'.$mysqlUserName.' -p'.$mysqlPassword.' '.$mysqlDatabaseName.' < '.$mysqlImportFilename ;
	}
	
	exec($command,$output,$worked);
	switch($worked){
		# OK (0)
		case 0:
			$html .= "<div class=\"ok\">";
			$html .= "Instalación completada correctamente";
			$html .= '</div>';
			$html .= '<br>';
			$html .= " <div class=\"\"><a href=\"".DEDALO_ROOT_WEB."?t=dd153\">Iniciar sesión</a></div> ";
			break;
		# ERROR (1)
		case 1:
			$html .= "<div class=\"error\" >";
			$html .= 'There was an error during import <br>[ error number: '.$worked.' ] <br/><br/><table><tr><td>MySQL Database Name:</td><td><b>' .$mysqlDatabaseName .'</b></td></tr><tr><td>MySQL User Name:</td><td><b>' .$mysqlUserName .'</b></td></tr><tr><td>MySQL Password:</td><td><b>NOTSHOWN</b></td></tr><tr><td>MySQL Host Name:</td><td><b>' .$mysqlHostName .'</b></td></tr><tr><td>MySQL Import Filename:</td><td><b>' .$mysqlImportFilename .'</b></td></tr></table>';
			$html .= '</div>';
			break;
		default:			
			$html .= "Command response: ".$worked ."<br> for command: $command";
			if ($worked==127) {
				$html .= "Review your mysql path please: <br>MYSQL_BIN_PATH: ".MYSQL_BIN_PATH."<br>PHP_BIN_PATH: ".PHP_BIN_PATH ;
			}
	}
	#$html .= "<hr>$command";

	if($worked===1) {
		$html .= "<br><div class=\"error\"> Existen tablas en la base de datos </div>";
	}

	return $html;
	
}#if($action=='import') 



# PROCESS / PREVIEW
if ($process!=1) {

	# PREVIEW
	$html='';
	#$html .= css::build_tag('css/install.css');	

	$html .= " <div id=\"install_content\">";
	$html .= " <h2> DÉDALO INSTALL </h2><HR>";	
	
	$html .= "<div>Verifique que los datos de instalación son correctos. Si no lo son, configure la información relativa a la base de datos en las preferencias de Dédalo (config_db.php)</div>";
	
	$html .= "<br>";
	$html .= "<div class=\"db_info_line\">DEDALO_HOSTNAME_CONN : <strong>".DEDALO_HOSTNAME_CONN.'</strong></div>';
	$html .= "<div class=\"db_info_line\">DEDALO_SOCKET_CONN   : <strong>".DEDALO_SOCKET_CONN.'</strong></div>';
	$html .= "<div class=\"db_info_line\">DEDALO_DATABASE_CONN : <strong>".DEDALO_DATABASE_CONN.'</strong></div>';
	$html .= "<div class=\"db_info_line\">DEDALO_USERNAME_CONN : <strong>".DEDALO_USERNAME_CONN.'</strong></div>';
	#$html .= "<div class=\"db_info_line\">DEDALO_PASSWORD_CONN : <strong>".DEDALO_PASSWORD_CONN.'</strong></div>';
	$html .= "<div class=\"db_info_line\">DEDALO_PASSWORD_CONN : <strong>NOTSHOWN</strong></div>";

	$html .= "<form action=\"\" method=\"post\" style=\"padding:20px;\" >";
	$html .= "<input type=\"hidden\" name=\"process\" value=\"1\" >";
	$html .= "<input type=\"submit\" value=\"Install\" class=\"css_button_generic\">";
	#$html .= "<span class=\"warning\">Borrará los datos existentes en la base de datos seleccionada: <strong>".DEDALO_DATABASE_CONN."</strong> </span>";
	$html .= "<em>Si se trata de una reinstalación, debe borrar antes todas las tablas existentes en la base: <strong>".DEDALO_DATABASE_CONN."</strong> </em>";
	$html .= "</fom>";

	$html .= " </div>";
	
	echo html_page::get_html($html,true);
	exit();


}else{

	require_once(dirname(dirname(__FILE__)).'/config/dd_init_test.php');

	# PROCESS
	$html='';
	#$html .= css::build_tag('css/install.css');
	$html .= " <div id=\"install_content\">";
	$html .= " <h2> DÉDALO INSTALL PROCESS</h2><HR>";

	set_time_limit ( 24000 );
	

	# Disable log temporarily
	logger_backend_activity::$disable_log = true;
	# Force update on process
	ob_implicit_flush(true);

	$html .= "<div class=\"sql_result\">";

	$html .= import_install_db();
	$html .= "</div>";

	#if($_POST)	$html .= dump($_POST);

	$html .= " </div>";#install_content

	echo html_page::get_html($html,true);
	exit();
	

}#end if ($process!=1) {



?>   
